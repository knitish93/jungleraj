"""
sources.py — Jungle Raj Development Data Engine
================================================
Trusted source registry with helpers for:
  • Listing sources by type, tier, or category
  • Health-checking sources (HEAD request)
  • Parsing RSS / Atom feeds into normalised dicts
  • Filtering to only scrape-permitted sources
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any

import requests

from config import SOURCES, SOURCES_BY_ID, REQUEST_TIMEOUT
from utils import (
    DiskCache,
    RunStats,
    build_session,
    clean_text,
    detect_category,
    domain_of,
    fetch,
    iso_date,
    setup_logger,
    truncate,
)

log = setup_logger("sources")

# RSS / Atom XML namespaces
_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}


# ─────────────────────────────────────────────────────────
#  SOURCE QUERIES
# ─────────────────────────────────────────────────────────

def all_sources() -> list[dict]:
    return list(SOURCES)


def sources_with_rss() -> list[dict]:
    """Return sources that have an RSS/Atom feed URL."""
    return [s for s in SOURCES if s.get("rss_url")]


def sources_with_api() -> list[dict]:
    """Return sources that have a REST API URL."""
    return [s for s in SOURCES if s.get("api_url")]


def scrape_permitted_sources() -> list[dict]:
    """Return sources where scrape_ok is True."""
    return [s for s in SOURCES if s.get("scrape_ok", False)]


def sources_by_tier(tier: int) -> list[dict]:
    """Return sources filtered to trust_tier == tier."""
    return [s for s in SOURCES if s.get("trust_tier") == tier]


def sources_by_category(category: str) -> list[dict]:
    """Return sources whose default category matches."""
    return [s for s in SOURCES if s.get("category") == category]


def get_source(source_id: str) -> dict | None:
    """Look up a source by its id."""
    return SOURCES_BY_ID.get(source_id)


def source_display_name(source_id: str) -> str:
    """Return human-readable name, or the raw id if not found."""
    s = SOURCES_BY_ID.get(source_id)
    return s["name"] if s else source_id


# ─────────────────────────────────────────────────────────
#  HEALTH CHECKS
# ─────────────────────────────────────────────────────────

def check_source_health(
    source: dict,
    session: requests.Session,
) -> dict:
    """
    Perform a HEAD request against the source's base_url.
    Returns a result dict with status, latency_ms, error.
    """
    url = source.get("rss_url") or source.get("base_url", "")
    result: dict[str, Any] = {
        "id":         source["id"],
        "name":       source["name"],
        "url":        url,
        "status":     None,
        "latency_ms": None,
        "ok":         False,
        "error":      None,
    }
    if not url:
        result["error"] = "No URL configured"
        return result

    t0 = _time_ms()
    try:
        resp = session.head(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        result["status"]     = resp.status_code
        result["latency_ms"] = _time_ms() - t0
        result["ok"]         = resp.status_code < 400
    except Exception as e:
        result["error"]      = str(e)
        result["latency_ms"] = _time_ms() - t0
    return result


def health_check_all(session: requests.Session | None = None) -> list[dict]:
    """
    Run health checks on every configured source.
    Logs results and returns list of result dicts.
    """
    sess   = session or build_session()
    results = []
    for source in SOURCES:
        r = check_source_health(source, sess)
        status = "✅" if r["ok"] else "❌"
        log.info(
            "%s [%s] %s — HTTP %s  %sms  %s",
            status,
            source["id"],
            source["name"],
            r["status"],
            r["latency_ms"],
            r.get("error") or "",
        )
        results.append(r)
    return results


# ─────────────────────────────────────────────────────────
#  RSS / ATOM FEED PARSING
# ─────────────────────────────────────────────────────────

def parse_rss(
    source: dict,
    raw_xml: bytes,
    max_items: int = 50,
) -> list[dict]:
    """
    Parse raw RSS or Atom XML bytes into a list of normalised news dicts.
    Returns up to max_items items.

    Output schema per item:
        id, title, summary, source, source_id, url,
        published_date, category, icon, featured, tags
    """
    items: list[dict] = []

    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as e:
        log.error("XML parse error for source %s — %s", source["id"], e)
        return items

    # Detect format: RSS 2.0 vs Atom
    is_atom = root.tag.startswith("{http://www.w3.org/2005/Atom}")
    entries = root.findall(".//atom:entry", _NS) if is_atom else root.findall(".//item")

    log.debug(
        "Parsing %s %s — found %d entries",
        "Atom" if is_atom else "RSS",
        source["id"],
        len(entries),
    )

    for entry in entries[:max_items]:
        item = _parse_entry(entry, source, is_atom)
        if item:
            items.append(item)

    log.info(
        "Parsed %d items from %s (%s)",
        len(items),
        source["name"],
        source["id"],
    )
    return items


def _parse_entry(entry: ET.Element, source: dict, is_atom: bool) -> dict | None:
    """Parse a single RSS item or Atom entry into a normalised dict."""

    if is_atom:
        title_el   = entry.find("atom:title", _NS)
        summary_el = entry.find("atom:summary", _NS) or entry.find("atom:content", _NS)
        link_el    = entry.find("atom:link", _NS)
        date_el    = entry.find("atom:published", _NS) or entry.find("atom:updated", _NS)

        title   = clean_text(title_el.text if title_el is not None else "")
        summary = clean_text(summary_el.text if summary_el is not None else "")
        url     = link_el.get("href", "") if link_el is not None else ""
        pub_raw = date_el.text if date_el is not None else ""
    else:
        title_el   = entry.find("title")
        desc_el    = (entry.find("description") or
                      entry.find("content:encoded", _NS) or
                      entry.find("{http://purl.org/rss/1.0/modules/content/}encoded"))
        link_el    = entry.find("link")
        date_el    = entry.find("pubDate") or entry.find("dc:date", _NS)

        title   = clean_text(title_el.text if title_el is not None else "")
        summary = clean_text(_strip_html(desc_el.text if desc_el is not None else ""))
        url     = clean_text(link_el.text if link_el is not None else "")
        pub_raw = clean_text(date_el.text if date_el is not None else "")

    if not title:
        return None

    pub_date = _parse_date(pub_raw)
    combined = f"{title} {summary}"

    return {
        "title":          title,
        "title_en":       title,  # filled by translator if needed
        "summary":        truncate(summary, 280),
        "summary_en":     truncate(summary, 280),
        "source":         source["name"],
        "source_id":      source["id"],
        "url":            url,
        "published_date": pub_date,
        "category":       detect_category(combined, fallback=source.get("category", "National")),
        "icon":           _category_icon(detect_category(combined, fallback=source.get("category", "National"))),
        "featured":       False,
        "tags":           _extract_tags(combined),
    }


# ─────────────────────────────────────────────────────────
#  HELPER: scrape a source's RSS and return parsed items
# ─────────────────────────────────────────────────────────

def fetch_and_parse_rss(
    source: dict,
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> list[dict]:
    """
    High-level: fetch the RSS URL for a source, parse it, return items.
    Handles errors, stats, logging.
    """
    rss_url = source.get("rss_url")
    if not rss_url:
        log.debug("No RSS for %s", source["id"])
        return []

    if not source.get("scrape_ok", True):
        log.warning("scrape_ok=False for %s — skipping", source["id"])
        stats.bump("skipped")
        return []

    log.info("Fetching RSS: %s (%s)", source["name"], rss_url)
    raw = fetch(rss_url, session, cache=cache, logger=log)

    if not raw:
        log.warning("No data from RSS: %s", rss_url)
        stats.bump("errors")
        return []

    items = parse_rss(source, raw)
    stats.bump("downloaded")
    return items


# ─────────────────────────────────────────────────────────
#  PRIVATE HELPERS
# ─────────────────────────────────────────────────────────

def _parse_date(raw: str) -> str:
    """
    Try to parse a date string (RFC 2822, ISO-8601, etc.).
    Returns YYYY-MM-DD, or today's date on failure.
    """
    if not raw:
        return iso_date()
    for parser in (_rfc2822, _iso8601, _simple_date):
        result = parser(raw)
        if result:
            return result
    return iso_date()


def _rfc2822(raw: str) -> str | None:
    try:
        dt = parsedate_to_datetime(raw)
        return iso_date(dt)
    except Exception:
        return None


def _iso8601(raw: str) -> str | None:
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            return iso_date(datetime.strptime(raw[:19], fmt))
        except ValueError:
            continue
    return None


def _simple_date(raw: str) -> str | None:
    import re
    m = re.search(r"(\d{4}-\d{2}-\d{2})", raw)
    if m:
        return m.group(1)
    return None


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE       = re.compile(r"\s+")


def _strip_html(text: str) -> str:
    if not text:
        return ""
    text = _HTML_TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


_TAG_WORDS = re.compile(r"\b(\w{4,})\b")

def _extract_tags(text: str, max_tags: int = 5) -> list[str]:
    """Naive tag extraction — top frequent content words."""
    STOPWORDS = {
        "that", "this", "with", "have", "from", "will", "been",
        "were", "said", "says", "also", "more", "than", "about",
        "its", "over", "into", "after", "india", "भारत",
    }
    words = [w.lower() for w in _TAG_WORDS.findall(text) if w.lower() not in STOPWORDS]
    freq: dict[str, int] = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    top = sorted(freq, key=lambda w: freq[w], reverse=True)[:max_tags]
    return top


_ICONS: dict[str, str] = {
    "Economy":       "📈",
    "Tax":           "📋",
    "Education":     "📚",
    "Healthcare":    "🏥",
    "Employment":    "🧑‍💼",
    "Agriculture":   "🌾",
    "Crime":         "⚠️",
    "Judiciary":     "⚖️",
    "Infrastructure":"🛣️",
    "Technology":    "📱",
    "Environment":   "🌳",
    "Women Safety":  "👩",
    "Children":      "👶",
    "Politics":      "🗳️",
    "Fuel":          "⛽",
    "National":      "🌏",
    "Migration":     "✈️",
    "Population":    "👥",
}

def _category_icon(category: str) -> str:
    return _ICONS.get(category, "📰")


def _time_ms() -> int:
    import time
    return int(time.time() * 1000)
