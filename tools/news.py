"""
news.py — Jungle Raj Development Data Engine
============================================
News collection module.

Responsibilities:
  1. Iterate over all configured RSS sources
  2. Fetch & parse each feed into normalised news dicts
  3. Assign deterministic IDs
  4. Deduplicate against existing news.json
  5. Validate schema
  6. Save updated news.json → /data/news.json

Usage (called by crawler.py):
    from news import run_news_collector
    run_news_collector(session, cache, stats)
"""

from __future__ import annotations

import logging
from typing import Any

import requests

from config import (
    ID_PREFIXES,
    NEWS_CATEGORIES,
    OUTPUT_FILES,
)
from sources import (
    fetch_and_parse_rss,
    sources_with_rss,
)
from utils import (
    DiskCache,
    RunStats,
    clean_text,
    deduplicate,
    detect_category,
    find_duplicate_ids,
    iso_now,
    load_json,
    make_hash_id,
    next_sequential_id,
    save_json,
    setup_logger,
    validate_schema,
)

log = setup_logger("news")

# Fields every news record must have
REQUIRED_FIELDS = {
    "id",
    "title",
    "summary",
    "source",
    "published_date",
    "category",
    "url",
}

# Maximum news items to keep in news.json (oldest removed first)
MAX_RECORDS = 200

# ─────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────

def run_news_collector(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> int:
    """
    Full news collection pipeline.
    Returns count of new records added.
    """
    log.info("━━━ News collector starting ━━━")

    out_path = OUTPUT_FILES["news"]
    existing = load_json(out_path, logger=log)
    log.info("Loaded %d existing news records", len(existing))

    # ── 1. Collect from all RSS sources ──────────────────
    raw_items: list[dict] = []
    for source in sources_with_rss():
        items = fetch_and_parse_rss(source, session, cache, stats)
        raw_items.extend(items)

    log.info("Collected %d raw items from %d sources", len(raw_items), len(sources_with_rss()))

    if not raw_items:
        log.warning("No raw items collected — nothing to save")
        return 0

    # ── 2. Normalise & assign IDs ─────────────────────────
    normalised = [_normalise(item, existing) for item in raw_items]
    normalised = [n for n in normalised if n is not None]

    # ── 3. Validate schema ────────────────────────────────
    normalised = validate_schema(normalised, REQUIRED_FIELDS, logger=log)

    # ── 4. Dedup against existing ─────────────────────────
    merged, added = deduplicate(existing, normalised, key="id", logger=log)

    # ── 5. Check for internal duplicates ─────────────────
    dupes = find_duplicate_ids(merged, key="id")
    if dupes:
        log.warning("Duplicate IDs found (will keep first): %s", dupes[:10])
        merged = _dedup_keep_first(merged)

    # ── 6. Sort newest-first, trim to MAX_RECORDS ─────────
    merged.sort(key=lambda r: r.get("published_date", ""), reverse=True)
    if len(merged) > MAX_RECORDS:
        trimmed = len(merged) - MAX_RECORDS
        merged  = merged[:MAX_RECORDS]
        log.info("Trimmed %d oldest records (kept %d)", trimmed, MAX_RECORDS)

    # ── 7. Save ───────────────────────────────────────────
    ok = save_json(out_path, merged, logger=log)
    if ok:
        log.info("━━━ News collector done — added %d new records ━━━", added)
    else:
        log.error("Failed to save news.json")
        stats.bump("errors")

    return added


# ─────────────────────────────────────────────────────────
#  MANUAL ENTRY (for adding a single item by hand)
# ─────────────────────────────────────────────────────────

def add_manual_news(item: dict) -> bool:
    """
    Add a single manually-crafted news item to news.json.
    Validates required fields, assigns an ID if missing, deduplicates.

    Example:
        add_manual_news({
            "title":          "GST संग्रह ₹2.10 लाख करोड़ — नया रिकॉर्ड",
            "title_en":       "GST collection new record at ₹2.10 lakh crore",
            "summary":        "अप्रैल 2024 में GST संग्रह ऐतिहासिक उच्च स्तर पर।",
            "summary_en":     "GST collection hits historic high in April 2024.",
            "source":         "Ministry of Finance",
            "source_id":      "indiabudget",
            "url":            "https://pib.gov.in/...",
            "published_date": "2024-05-01",
            "category":       "Tax",
            "icon":           "📋",
            "featured":       True,
            "tags":           ["gst", "tax", "economy"],
        })
    """
    out_path = OUTPUT_FILES["news"]
    existing = load_json(out_path, logger=log)

    # Assign ID if missing
    if not item.get("id"):
        url_or_title = item.get("url") or item.get("title", "unknown")
        item["id"] = make_hash_id(ID_PREFIXES["news"], url_or_title)

    # Auto-detect category if not provided
    if not item.get("category"):
        text = f"{item.get('title', '')} {item.get('summary', '')}"
        item["category"] = detect_category(text)

    # Defaults
    item.setdefault("icon",     _ICONS.get(item.get("category", ""), "📰"))
    item.setdefault("featured", False)
    item.setdefault("tags",     [])
    item.setdefault("title_en", item.get("title", ""))
    item.setdefault("summary_en", item.get("summary", ""))

    # Validate
    missing = REQUIRED_FIELDS - item.keys()
    if missing:
        log.error("Manual news item missing fields: %s", missing)
        return False

    # Dedup & save
    merged, added = deduplicate(existing, [item], key="id", logger=log)
    if added == 0:
        log.warning("Item already exists with id=%s", item["id"])
        return False

    return save_json(out_path, merged, logger=log)


# ─────────────────────────────────────────────────────────
#  PRIVATE HELPERS
# ─────────────────────────────────────────────────────────

def _normalise(item: dict, existing: list[dict]) -> dict | None:
    """
    Ensure all required and optional fields are present.
    Assigns a deterministic ID based on URL (hash-based for stability).
    Returns None if item is unusable.
    """
    title = clean_text(item.get("title", ""))
    if not title:
        return None

    url   = item.get("url", "")
    id_   = item.get("id") or make_hash_id(ID_PREFIXES["news"], url or title)

    category = item.get("category") or detect_category(
        f"{title} {item.get('summary', '')}",
        fallback="National",
    )

    return {
        "id":             id_,
        "title":          title,
        "title_en":       clean_text(item.get("title_en") or title),
        "summary":        clean_text(item.get("summary", "")),
        "summary_en":     clean_text(item.get("summary_en") or item.get("summary", "")),
        "source":         item.get("source", ""),
        "source_id":      item.get("source_id", ""),
        "url":            url,
        "published_date": item.get("published_date", ""),
        "category":       category,
        "icon":           item.get("icon") or _ICONS.get(category, "📰"),
        "featured":       bool(item.get("featured", False)),
        "tags":           item.get("tags") or [],
    }


def _dedup_keep_first(records: list[dict]) -> list[dict]:
    """Remove records with duplicate IDs, keeping the first occurrence."""
    seen: set[str] = set()
    result: list[dict] = []
    for r in records:
        id_ = r.get("id", "")
        if id_ not in seen:
            result.append(r)
            seen.add(id_)
    return result


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
