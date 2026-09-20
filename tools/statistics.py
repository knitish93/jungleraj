"""
statistics.py — Jungle Raj Development Data Engine
====================================================
Statistics collection module.

Data sources:
  • World Bank Open Data API (free, no key required)
      https://api.worldbank.org/v2/country/IN/indicator/{CODE}?format=json
  • Manual records (high-quality human-curated entries)
  • PIB press releases (parsed by news.py, cross-referenced here)

Architecture is designed for future addition of:
  • data.gov.in API
  • MOSPI statistical releases
  • NCRB PDF table extraction
  • RBI data warehouse

Usage (called by crawler.py):
    from statistics import run_statistics_collector
    run_statistics_collector(session, cache, stats)
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

from config import (
    ID_PREFIXES,
    OUTPUT_FILES,
    STAT_CATEGORIES,
    TREND_DOWN_THRESHOLD,
    TREND_UP_THRESHOLD,
    WORLDBANK_INDICATORS,
)
from utils import (
    DiskCache,
    RunStats,
    clean_text,
    deduplicate,
    fetch_json,
    find_duplicate_ids,
    iso_date,
    iso_now,
    load_json,
    make_hash_id,
    save_json,
    setup_logger,
    validate_schema,
)

log = setup_logger("statistics")

# World Bank API
WB_API_BASE = "https://api.worldbank.org/v2/country/IN/indicator"
WB_PARAMS = {
    "format":    "json",
    "per_page":  10,       # fetch 10 years of history
    "mrv":       10,       # most recent values
    "date":      "2014:2024",
}
WB_SOURCE_NAME = "World Bank Open Data"

# Required fields every statistics record must have
REQUIRED_FIELDS = {
    "id",
    "title",
    "category",
    "value",
    "unit",
    "year",
    "source",
    "last_updated",
    "description",
    "trend",
}


# ─────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────

def run_statistics_collector(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> int:
    """
    Full statistics collection pipeline.
    Returns count of new or updated records.
    """
    log.info("━━━ Statistics collector starting ━━━")

    out_path = OUTPUT_FILES["statistics"]
    existing = load_json(out_path, logger=log)
    log.info("Loaded %d existing statistics records", len(existing))

    new_records: list[dict] = []

    # ── 1. World Bank API ─────────────────────────────────
    wb_records = _collect_worldbank(session, cache, stats)
    new_records.extend(wb_records)
    log.info("World Bank: collected %d indicator records", len(wb_records))

    if not new_records:
        log.warning("No new records from any source — nothing to merge")
        return 0

    # ── 2. Validate schema ────────────────────────────────
    new_records = validate_schema(new_records, REQUIRED_FIELDS, logger=log)

    # ── 3. Merge: for statistics we UPDATE existing records
    #       rather than just deduplicating, because values change yearly
    merged, added = _merge_statistics(existing, new_records)
    log.info("Merged: %d total records (%d added/updated)", len(merged), added)

    # ── 4. Check for duplicate IDs ────────────────────────
    dupes = find_duplicate_ids(merged, key="id")
    if dupes:
        log.warning("Duplicate stat IDs: %s", dupes[:10])
        merged = _dedup_keep_first(merged)

    # ── 5. Sort by category then title ───────────────────
    merged.sort(key=lambda r: (r.get("category", ""), r.get("title", "")))

    # ── 6. Save ───────────────────────────────────────────
    ok = save_json(out_path, merged, logger=log)
    if ok:
        log.info("━━━ Statistics collector done — %d records saved ━━━", len(merged))
    else:
        log.error("Failed to save statistics.json")
        stats.bump("errors")

    return added


# ─────────────────────────────────────────────────────────
#  WORLD BANK COLLECTION
# ─────────────────────────────────────────────────────────

def _collect_worldbank(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> list[dict]:
    """
    Fetch each configured World Bank indicator for India.
    Returns list of normalised statistics records.
    """
    records: list[dict] = []

    for code, meta in WORLDBANK_INDICATORS.items():
        url = f"{WB_API_BASE}/{code}"
        log.info("Fetching WB indicator %s (%s)", code, meta["title_en"])

        data = fetch_json(url, session, cache=cache, logger=log, params=WB_PARAMS)

        if not data or len(data) < 2:
            log.warning("No data from World Bank for indicator %s", code)
            stats.bump("errors")
            continue

        wb_entries = data[1]  # World Bank API: [metadata, [entries...]]
        if not wb_entries:
            log.warning("Empty entries for indicator %s", code)
            stats.bump("skipped")
            continue

        record = _worldbank_to_stat(code, meta, wb_entries)
        if record:
            records.append(record)
            stats.bump("downloaded")

        time.sleep(0.8)  # polite delay per indicator

    return records


def _worldbank_to_stat(
    code: str,
    meta: dict,
    entries: list[dict],
) -> dict | None:
    """
    Convert World Bank API response entries for one indicator into
    a statistics record matching the Jungle Raj schema.
    """
    # Filter to non-null values, newest first
    valid = [
        e for e in entries
        if e.get("value") is not None and e.get("date")
    ]
    valid.sort(key=lambda e: e["date"], reverse=True)

    if not valid:
        return None

    latest  = valid[0]
    prev    = valid[1] if len(valid) > 1 else None

    value_raw  = latest["value"]
    year       = int(latest["date"]) if latest["date"].isdigit() else 0

    # Format value for display
    formatted_value = _format_wb_value(value_raw, meta.get("unit", ""))
    prev_value      = _format_wb_value(prev["value"], meta.get("unit", "")) if prev else None

    # Calculate trend
    trend, trend_pct = _calc_trend(
        value_raw,
        prev["value"] if prev else None,
    )

    # Build history array (last 6 data points)
    history = [
        {"year": int(e["date"]), "value": round(float(e["value"]), 2)}
        for e in valid[:6]
        if e.get("date", "").isdigit()
    ]
    history.sort(key=lambda h: h["year"])

    stat_id = f"{ID_PREFIXES['statistics']}{code.replace('.', '_').lower()}"

    return {
        "id":              stat_id,
        "title":           meta["title"],
        "title_en":        meta["title_en"],
        "category":        meta["category"],
        "value":           formatted_value,
        "unit":            meta.get("unit", ""),
        "year":            year,
        "trend":           trend,
        "trendPct":        trend_pct,
        "prevValue":       prev_value,
        "description":     f"World Bank Open Data — {meta['title_en']} for India ({year}).",
        "description_en":  f"World Bank Open Data — {meta['title_en']} for India ({year}).",
        "source":          WB_SOURCE_NAME,
        "source_url":      f"https://data.worldbank.org/indicator/{code}?locations=IN",
        "last_updated":    iso_date(),
        "related_story":   None,
        "related_survey":  None,
        "history":         history,
        "icon":            meta.get("icon", "📊"),
        "color":           _cat_color(meta["category"]),
        "wb_indicator":    code,   # preserve for future re-fetch
    }


# ─────────────────────────────────────────────────────────
#  MANUAL ENTRY API
# ─────────────────────────────────────────────────────────

def add_manual_statistic(item: dict) -> bool:
    """
    Add or update a single manually-curated statistic in statistics.json.

    Required keys: title, category, value, unit, year, source,
                   description, trend
    Optional:      id, title_en, trendPct, prevValue, history,
                   related_story, related_survey, icon, color,
                   description_en, last_updated

    Example:
        add_manual_statistic({
            "title":        "पेट्रोल मूल्य (दिल्ली)",
            "title_en":     "Petrol Price (Delhi)",
            "category":     "Fuel",
            "value":        "₹94.72/लीटर",
            "unit":         "₹/लीटर",
            "year":         2024,
            "trend":        "stable",
            "trendPct":     0,
            "prevValue":    "₹96.72/लीटर",
            "description":  "दिल्ली में प्रति लीटर पेट्रोल का खुदरा मूल्य।",
            "description_en": "Retail petrol price per litre in Delhi.",
            "source":       "PPAC",
            "history":      [{"year": 2022, "value": 96.72}, {"year": 2024, "value": 94.72}],
            "icon":         "⛽",
            "color":        "#f59e0b",
        })
    """
    out_path = OUTPUT_FILES["statistics"]
    existing = load_json(out_path, logger=log)

    # Assign ID if missing
    if not item.get("id"):
        slug = item.get("title_en") or item.get("title") or "unknown"
        item["id"] = make_hash_id(ID_PREFIXES["statistics"], slug)

    # Defaults
    item.setdefault("title_en",        item.get("title", ""))
    item.setdefault("description_en",  item.get("description", ""))
    item.setdefault("last_updated",    iso_date())
    item.setdefault("related_story",   None)
    item.setdefault("related_survey",  None)
    item.setdefault("history",         [])
    item.setdefault("icon",            "📊")
    item.setdefault("color",           _cat_color(item.get("category", "National")))
    item.setdefault("trendPct",        None)
    item.setdefault("prevValue",       None)

    # Validate required fields
    missing = REQUIRED_FIELDS - item.keys()
    if missing:
        log.error("Manual stat item missing fields: %s", missing)
        return False

    if item.get("trend") not in ("up", "down", "stable"):
        log.error("Invalid trend '%s' — must be up/down/stable", item.get("trend"))
        return False

    # Merge / update
    merged, added = _merge_statistics(existing, [item])
    return save_json(out_path, merged, logger=log)


# ─────────────────────────────────────────────────────────
#  STATISTICS SCHEMA TEMPLATE
# ─────────────────────────────────────────────────────────

def empty_statistic_template() -> dict:
    """
    Return an empty statistics record with all fields filled with defaults.
    Useful for manual data entry — fill in the values and call add_manual_statistic().
    """
    return {
        "id":             "",         # auto-generated if empty
        "title":          "",         # Hindi title
        "title_en":       "",
        "category":       "",         # see STAT_CATEGORIES in config.py
        "value":          "",         # display string, e.g. "8.2%"
        "unit":           "",         # e.g. "%" or "₹/लीटर"
        "year":           0,
        "trend":          "stable",   # "up" | "down" | "stable"
        "trendPct":       None,       # float or None
        "prevValue":      None,       # display string or None
        "description":    "",         # Hindi description
        "description_en": "",
        "source":         "",
        "source_url":     "",
        "last_updated":   iso_date(),
        "related_story":  None,       # story id from stories.json
        "related_survey": None,       # survey id from surveys.json
        "history":        [],         # [{"year": 2020, "value": 7.3}, ...]
        "icon":           "📊",
        "color":          "#c1272d",
    }


# ─────────────────────────────────────────────────────────
#  PRIVATE HELPERS
# ─────────────────────────────────────────────────────────

def _merge_statistics(
    existing: list[dict],
    new: list[dict],
) -> tuple[list[dict], int]:
    """
    Merge new statistics into existing.
    If an ID already exists, UPDATE the record (values change each year).
    Returns (merged_list, count_changed).
    """
    existing_by_id = {r["id"]: r for r in existing}
    changed = 0

    for rec in new:
        id_ = rec.get("id")
        if not id_:
            continue
        if id_ in existing_by_id:
            old_val = existing_by_id[id_].get("value")
            if old_val != rec.get("value"):
                existing_by_id[id_].update(rec)
                changed += 1
                log.debug("Updated stat %s: %s → %s", id_, old_val, rec.get("value"))
        else:
            existing_by_id[id_] = rec
            changed += 1
            log.debug("Added new stat %s", id_)

    return list(existing_by_id.values()), changed


def _calc_trend(current: Any, previous: Any) -> tuple[str, float | None]:
    """
    Calculate trend direction and percentage change.
    Returns ("up"|"down"|"stable", pct_change | None)
    """
    try:
        c = float(current)
        p = float(previous)
        if p == 0:
            return ("stable", None)
        pct = round(((c - p) / abs(p)) * 100, 1)
        if pct > TREND_UP_THRESHOLD:
            return ("up", pct)
        if pct < TREND_DOWN_THRESHOLD:
            return ("down", pct)
        return ("stable", pct)
    except (TypeError, ValueError):
        return ("stable", None)


def _format_wb_value(value: Any, unit: str = "") -> str:
    """Format a raw World Bank numeric value for display."""
    if value is None:
        return "—"
    try:
        f = float(value)
        # Percentage indicators
        if unit in ("%", "per 1,000", "% of land", "% population"):
            return f"{f:.1f}%"
        # Large absolute numbers (population, GDP in USD)
        if f >= 1_000_000_000:
            return f"{f / 1_000_000_000:.2f}B"
        if f >= 1_000_000:
            return f"{f / 1_000_000:.2f}M"
        return f"{f:,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _cat_color(category: str) -> str:
    _COLORS: dict[str, str] = {
        "Population":    "#c1272d",
        "Economy":       "#ff9933",
        "Employment":    "#c1272d",
        "Education":     "#ff9933",
        "Healthcare":    "#0d9488",
        "Agriculture":   "#128807",
        "Crime":         "#c1272d",
        "Judiciary":     "#2255a4",
        "Tax":           "#2255a4",
        "Fuel":          "#f59e0b",
        "Infrastructure":"#2255a4",
        "Technology":    "#0d9488",
        "Environment":   "#128807",
        "Women Safety":  "#a855f7",
        "Children":      "#f59e0b",
        "Migration":     "#2255a4",
        "Politics":      "#c1272d",
        "National":      "#ff9933",
    }
    return _COLORS.get(category, "#c1272d")


def _dedup_keep_first(records: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result: list[dict] = []
    for r in records:
        id_ = r.get("id", "")
        if id_ not in seen:
            result.append(r)
            seen.add(id_)
    return result
