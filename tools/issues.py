"""
issues.py — Jungle Raj Development Data Engine
===============================================
Issue Intelligence Portal data builder — Phase 7.

Responsibilities:
  • Generate and validate issues.json
  • Ensure cross-references to statistics, news, surveys, stories, politicians are valid
  • Assign stable slugs and IDs (no duplicates)
  • Schema validation with required fields
  • Manual entry API for adding / updating issues

Schema per issue:
  id, title, title_hi, category, slug,
  summary, summary_hi, status, priority, severity,
  featured, trending, icon, color, last_updated,
  timeline[], related_statistics[], related_news[],
  related_surveys[], related_stories[], related_politicians[],
  official_documents[], faq[], related_issues[], keywords[]

Usage:
    python crawler.py issues
    from issues import add_manual_issue, validate_issues, audit_issues
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from config import OUTPUT_FILES
from utils import (
    DiskCache,
    RunStats,
    clean_text,
    deduplicate,
    find_duplicate_ids,
    iso_date,
    load_json,
    save_json,
    setup_logger,
    validate_schema,
)

log = setup_logger("issues")

# ─────────────────────────────────────────────────────────
#  REQUIRED FIELDS
# ─────────────────────────────────────────────────────────

REQUIRED_FIELDS = {
    "id", "title", "title_hi", "category", "slug",
    "summary", "status", "priority", "last_updated",
}

VALID_STATUSES   = {"Active", "Resolved", "Under Review", "Dormant"}
VALID_PRIORITIES = {"Critical", "High", "Medium", "Low"}
VALID_SEVERITIES = {"Critical", "High", "Medium", "Low"}


# ─────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────

def run_issues_collector(
    session: Any,
    cache: "DiskCache",
    stats: "RunStats",
) -> int:
    """
    Issues collection pipeline.
    Currently: validates existing issues.json, cross-checks references,
    and saves cleaned output.

    Issues are primarily manually curated — use add_manual_issue()
    to add new records, or edit issues.json directly and run validate.

    Returns count of validated records.
    """
    log.info("━━━ Issues collector starting ━━━")

    out_path = OUTPUT_FILES.get("issues")
    if not out_path:
        log.error("'issues' key not in OUTPUT_FILES — add to config.py")
        return 0

    existing = load_json(out_path, logger=log)
    log.info("Loaded %d issue records", len(existing))

    if not existing:
        log.warning("No issues.json found — nothing to process")
        return 0

    # Validate
    validated = validate_issues(existing, repair=True)

    # Dedup by slug
    seen_slugs: set[str] = set()
    deduped: list[dict] = []
    for iss in validated:
        slug = iss.get("slug", "")
        if slug in seen_slugs:
            log.warning("Duplicate slug '%s' — skipping", slug)
        else:
            deduped.append(iss)
            seen_slugs.add(slug)

    # Cross-reference check
    ref_report = cross_reference_check(deduped)
    if ref_report["broken"]:
        log.warning("Broken cross-references: %s", ref_report["broken"][:10])

    # Sort: featured first, then trending, then by priority
    deduped.sort(key=lambda i: (
        0 if i.get("featured") else 1,
        0 if i.get("trending") else 1,
        {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}.get(i.get("priority", "Low"), 4),
    ))

    ok = save_json(out_path, deduped, logger=log)
    if ok:
        log.info("━━━ Issues: %d records saved ━━━", len(deduped))
    else:
        log.error("Failed to save issues.json")
        stats.bump("errors")

    stats.bump("downloaded")
    return len(deduped)


# ─────────────────────────────────────────────────────────
#  MANUAL ENTRY API
# ─────────────────────────────────────────────────────────

def add_manual_issue(item: dict) -> bool:
    """
    Add or update an issue record.

    TRANSPARENCY NOTE: Never make political claims. Do NOT assign
    blame or responsibility to any individual, party or institution.
    Present issues using publicly available data only.

    Required: title, title_hi, category, slug, summary, status, priority
    Optional: all other fields

    Example:
        add_manual_issue({
            "title":       "Flood Management & Disaster Relief",
            "title_hi":    "बाढ़ प्रबंधन और आपदा राहत",
            "category":    "Infrastructure",
            "slug":        "flood-management",
            "summary":     "India faces severe floods annually...",
            "summary_hi":  "भारत में प्रतिवर्ष गंभीर बाढ़ आती है...",
            "status":      "Active",
            "priority":    "High",
            "severity":    "High",
            "icon":        "🌊",
            "color":       "#2255a4",
            "featured":    False,
            "trending":    False,
            "last_updated":"2024-06-01",
            "timeline": [
                {"year": 2023, "month": "Jul",
                 "event": "Himachal Pradesh floods",
                 "description": "Cloudbursts caused severe flooding...",
                 "reference": "NDMA Report 2023"},
            ],
            "related_statistics": ["if001", "if004"],
            "related_news":       [],
            "related_surveys":    ["s010"],
            "related_stories":    [],
            "related_politicians":["pol_009"],
            "official_documents": [
                {"type": "Government Report",
                 "title": "NDMA Annual Report 2023",
                 "url":   "https://ndma.gov.in/",
                 "date":  "2023-12"}
            ],
            "faq": [
                {"q":    "What is NDMA?",
                 "q_hi": "NDMA क्या है?",
                 "a":    "National Disaster Management Authority...",
                 "a_hi": "राष्ट्रीय आपदा प्रबंधन प्राधिकरण..."}
            ],
            "related_issues": ["iss_017", "iss_006"],
            "keywords":       ["flood", "disaster", "ndma", "relief"],
        })
    """
    out_path = OUTPUT_FILES.get("issues")
    if not out_path:
        log.error("'issues' key missing in OUTPUT_FILES")
        return False

    existing = load_json(out_path, logger=log)

    normalised = _normalise_issue(item, existing)
    if not normalised:
        return False

    missing = REQUIRED_FIELDS - normalised.keys()
    if missing:
        log.error("Issue record missing required fields: %s", missing)
        return False

    # Check duplicate slug
    existing_slugs = {r.get("slug"): r.get("id") for r in existing}
    slug = normalised["slug"]
    if slug in existing_slugs and existing_slugs[slug] != normalised["id"]:
        log.error("Slug '%s' already used by issue %s", slug, existing_slugs[slug])
        return False

    # Update or insert
    idx = next((i for i, r in enumerate(existing) if r["id"] == normalised["id"]), None)
    if idx is not None:
        existing[idx] = normalised
        log.info("Updated issue: %s (%s)", normalised["title"], normalised["id"])
    else:
        existing.append(normalised)
        log.info("Added issue: %s (%s)", normalised["title"], normalised["id"])

    return save_json(out_path, existing, logger=log)


def empty_issue_template() -> dict:
    """
    Return a blank issue template with all fields.
    Fill in and pass to add_manual_issue().

    IMPORTANT EDITORIAL POLICY:
    - Never assign blame or responsibility
    - Never call any group/person corrupt/criminal/guilty
    - Present only publicly documented facts with sources
    - All political connections must be office-based, not editorial
    """
    return {
        # Core identity
        "id":         "",             # auto-generated if blank
        "title":      "",             # English title
        "title_hi":   "",             # Hindi title (Devanagari)
        "category":   "",             # see ISSUE_CATEGORIES below
        "slug":       "",             # URL-safe, unique e.g. "paper-leak"
        # Summary (factual, no blame)
        "summary":    "",             # English summary (200–400 chars)
        "summary_hi": "",             # Hindi summary
        # Status
        "status":     "Active",       # Active | Resolved | Under Review | Dormant
        "priority":   "Medium",       # Critical | High | Medium | Low
        "severity":   "Medium",       # Critical | High | Medium | Low
        "featured":   False,
        "trending":   False,
        # Display
        "icon":       "📌",
        "color":      "#c1272d",
        "last_updated": iso_date(),
        # Timeline: list of {year, month, event, description, reference}
        "timeline": [],
        # Cross-references (use IDs from respective JSON files)
        "related_statistics":  [],    # stat IDs from statistics.json
        "related_news":        [],    # news IDs from news.json
        "related_surveys":     [],    # survey IDs from surveys.json
        "related_stories":     [],    # story IDs from stories.json
        "related_politicians": [],    # politician IDs from politicians.json
        # Official documents: list of {type, title, url, date}
        "official_documents": [],
        # FAQ: list of {q, q_hi, a, a_hi}
        "faq": [],
        # Related issues: list of issue IDs
        "related_issues": [],
        # Search keywords
        "keywords": [],
    }


# ─────────────────────────────────────────────────────────
#  VALIDATION
# ─────────────────────────────────────────────────────────

def validate_issues(
    records: list[dict],
    repair: bool = False,
) -> list[dict]:
    """
    Validate all issue records against schema.
    If repair=True, auto-fix recoverable issues (missing defaults).
    Returns list of valid records.
    """
    valid: list[dict] = []

    for r in records:
        issues_found: list[str] = []

        # Required fields
        missing = REQUIRED_FIELDS - r.keys()
        if missing:
            issues_found.append(f"missing fields: {missing}")
            if not repair:
                log.warning("Issue %s: %s", r.get("id", "?"), issues_found)
                continue

        # Status validation
        if r.get("status") not in VALID_STATUSES:
            issues_found.append(f"invalid status: {r.get('status')}")
            if repair:
                r["status"] = "Active"

        # Priority validation
        if r.get("priority") not in VALID_PRIORITIES:
            issues_found.append(f"invalid priority: {r.get('priority')}")
            if repair:
                r["priority"] = "Medium"

        # Severity validation
        if r.get("severity") not in VALID_SEVERITIES:
            if repair:
                r["severity"] = r.get("priority", "Medium")

        # Slug format
        slug = r.get("slug", "")
        if not re.match(r"^[a-z0-9-]+$", slug):
            issues_found.append(f"invalid slug format: '{slug}'")
            if repair:
                r["slug"] = _slugify(r.get("title", r.get("id", "issue")))

        # Auto-generate ID if missing
        if not r.get("id") and repair:
            r["id"] = _make_issue_id(r.get("slug", r.get("title", "issue")))

        # Defaults for optional list fields
        if repair:
            for field in ["timeline", "related_statistics", "related_news",
                          "related_surveys", "related_stories", "related_politicians",
                          "official_documents", "faq", "related_issues", "keywords"]:
                r.setdefault(field, [])
            r.setdefault("featured", False)
            r.setdefault("trending", False)
            r.setdefault("icon", "📌")
            r.setdefault("color", "#c1272d")
            r.setdefault("last_updated", iso_date())
            r.setdefault("severity", r.get("priority", "Medium"))

        if issues_found:
            log.warning("Issue %s repaired: %s", r.get("id"), issues_found)

        valid.append(r)

    log.info("Validation: %d/%d records valid", len(valid), len(records))
    return valid


# ─────────────────────────────────────────────────────────
#  CROSS-REFERENCE CHECK
# ─────────────────────────────────────────────────────────

def cross_reference_check(issues: list[dict]) -> dict:
    """
    Check that cross-references (related_statistics, related_surveys, etc.)
    point to IDs that exist in the corresponding data files.
    Returns report with counts and list of broken references.
    """
    from config import OUTPUT_FILES

    # Load sibling data files
    stat_ids  = set(r.get("id") for r in load_json(OUTPUT_FILES.get("statistics", ""), logger=log) if r.get("id"))
    news_ids  = set(r.get("id") for r in load_json(OUTPUT_FILES.get("news", ""), logger=log) if r.get("id"))
    sur_ids   = set(r.get("id") for r in _load_surveys() if r.get("id"))
    story_ids = set(r.get("id") for r in _load_stories() if r.get("id"))
    pol_ids   = set(r.get("id") for r in load_json(OUTPUT_FILES.get("politicians", ""), logger=log) if r.get("id"))
    iss_ids   = set(r.get("id") for r in issues if r.get("id"))

    checklist = [
        ("related_statistics",  stat_ids),
        ("related_news",        news_ids),
        ("related_surveys",     sur_ids),
        ("related_stories",     story_ids),
        ("related_politicians", pol_ids),
        ("related_issues",      iss_ids),
    ]

    broken: list[str] = []
    ok_count = 0

    for iss in issues:
        for field, valid_ids in checklist:
            for ref_id in iss.get(field, []):
                if valid_ids and ref_id not in valid_ids:
                    broken.append(f"{iss['id']}.{field}: '{ref_id}' not found")
                else:
                    ok_count += 1

    log.info("Cross-references: %d OK, %d broken", ok_count, len(broken))
    if broken:
        for b in broken[:10]:
            log.warning("  Broken: %s", b)

    return {"ok": ok_count, "broken": broken}


# ─────────────────────────────────────────────────────────
#  AUDIT
# ─────────────────────────────────────────────────────────

def audit_issues() -> dict:
    """
    Run a full data quality audit on issues.json.
    Returns a report dict.
    """
    out_path = OUTPUT_FILES.get("issues")
    if not out_path:
        return {"error": "'issues' key missing in OUTPUT_FILES"}

    records = load_json(out_path, logger=log)
    report: dict = {
        "total":         len(records),
        "featured":      sum(1 for r in records if r.get("featured")),
        "trending":      sum(1 for r in records if r.get("trending")),
        "by_category":   {},
        "by_status":     {},
        "by_severity":   {},
        "avg_connections": 0,
        "no_timeline":   [],
        "no_faq":        [],
        "duplicate_ids": find_duplicate_ids(records),
        "duplicate_slugs": _find_dup_slugs(records),
    }

    total_conn = 0
    for r in records:
        cat = r.get("category", "Unknown")
        report["by_category"][cat] = report["by_category"].get(cat, 0) + 1
        status = r.get("status", "Unknown")
        report["by_status"][status] = report["by_status"].get(status, 0) + 1
        sev = r.get("severity", "Unknown")
        report["by_severity"][sev] = report["by_severity"].get(sev, 0) + 1

        conn = sum(len(r.get(f, [])) for f in
                   ["related_statistics","related_news","related_surveys",
                    "related_stories","related_politicians"])
        total_conn += conn

        if not r.get("timeline"):
            report["no_timeline"].append(r.get("id"))
        if not r.get("faq"):
            report["no_faq"].append(r.get("id"))

    report["avg_connections"] = round(total_conn / max(len(records), 1), 1)

    log.info("Audit: %d issues, %d featured, %d trending, %.1f avg connections",
             report["total"], report["featured"], report["trending"],
             report["avg_connections"])

    return report


# ─────────────────────────────────────────────────────────
#  ISSUE CATEGORIES
# ─────────────────────────────────────────────────────────

ISSUE_CATEGORIES = [
    "Education", "Employment", "Economy", "Tax", "Fuel",
    "Agriculture", "Healthcare", "Infrastructure", "Railways",
    "Women's Safety", "Crime", "Corruption", "Judiciary", "Police",
    "Digital India", "Cyber Crime", "Environment", "Migration",
    "Poverty", "Children", "Politics", "Population", "National",
]


# ─────────────────────────────────────────────────────────
#  PRIVATE HELPERS
# ─────────────────────────────────────────────────────────

def _normalise_issue(item: dict, existing: list[dict]) -> dict | None:
    """Normalise and fill defaults for an issue record."""
    title = clean_text(item.get("title", ""))
    if not title:
        log.warning("Issue has no title — skipping")
        return None

    slug = item.get("slug") or _slugify(title)
    id_  = item.get("id")  or _make_issue_id(slug)

    return {
        "id":                 id_,
        "title":              title,
        "title_hi":           clean_text(item.get("title_hi", "")),
        "category":           clean_text(item.get("category", "")),
        "slug":               slug,
        "summary":            clean_text(item.get("summary", "")),
        "summary_hi":         clean_text(item.get("summary_hi", "")),
        "status":             item.get("status", "Active"),
        "priority":           item.get("priority", "Medium"),
        "severity":           item.get("severity", item.get("priority", "Medium")),
        "featured":           bool(item.get("featured", False)),
        "trending":           bool(item.get("trending", False)),
        "icon":               item.get("icon", "📌"),
        "color":              item.get("color", "#c1272d"),
        "last_updated":       item.get("last_updated", iso_date()),
        "timeline":           item.get("timeline", []),
        "related_statistics": item.get("related_statistics", []),
        "related_news":       item.get("related_news", []),
        "related_surveys":    item.get("related_surveys", []),
        "related_stories":    item.get("related_stories", []),
        "related_politicians":item.get("related_politicians", []),
        "official_documents": item.get("official_documents", []),
        "faq":                item.get("faq", []),
        "related_issues":     item.get("related_issues", []),
        "keywords":           item.get("keywords", []),
    }


def _slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text.strip())
    return text[:60].strip("-")


def _make_issue_id(slug_or_title: str) -> str:
    h = hashlib.sha256(clean_text(slug_or_title).encode()).hexdigest()[:6]
    return f"iss_{h}"


def _find_dup_slugs(records: list[dict]) -> list[str]:
    seen: dict[str, int] = {}
    for r in records:
        s = r.get("slug", "")
        seen[s] = seen.get(s, 0) + 1
    return [s for s, c in seen.items() if c > 1]


def _load_surveys() -> list[dict]:
    """Load surveys.json — path not in config, construct manually."""
    from pathlib import Path
    from config import DATA_DIR
    path = DATA_DIR / "surveys.json"
    try:
        import json
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    except Exception:
        return []


def _load_stories() -> list[dict]:
    """Load stories.json."""
    from pathlib import Path
    from config import DATA_DIR
    path = DATA_DIR / "stories.json"
    try:
        import json
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    except Exception:
        return []
