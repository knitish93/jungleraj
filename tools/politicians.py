"""
politicians.py — Jungle Raj Development Data Engine
====================================================
Politicians data collection module — Phase 6 full architecture.

Data collection pipeline:
  1. ECI affidavit data (official, public domain)
  2. ADR / myneta.info structured data (CC BY-SA 4.0)
  3. Lok Sabha / Rajya Sabha member directories
  4. State Assembly portals
  5. Manual curation / corrections

Current status:
  • Full schema (all Phase 6 fields) ✅
  • Validation pipeline ✅
  • Manual entry API ✅
  • ECI URL builder ✅
  • Dedup + stable ID generation ✅
  • Live scrapers: ARCHITECTURE DEFINED, not enabled pending legal review

IMPORTANT — DATA ETHICS:
  • Never label any politician as good/bad/corrupt/criminal
  • Display only declared data (criminal_cases = pending cases, NOT convictions)
  • Always cite official source (ECI affidavit URL where available)
  • Include transparency disclaimer in every output

Usage:
    python crawler.py politicians
    python crawler.py politicians --verbose

Or import directly:
    from politicians import add_manual_politician, empty_politician_template
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from typing import Any

import requests

from config import (
    ID_PREFIXES,
    OUTPUT_FILES,
    POLITICIAN_SCHEMA,
    SOURCES_BY_ID,
    REQUEST_DELAY,
)
from utils import (
    DiskCache,
    RunStats,
    build_session,
    clean_text,
    deduplicate,
    fetch,
    fetch_json,
    find_duplicate_ids,
    iso_date,
    load_json,
    make_hash_id,
    next_sequential_id,
    save_json,
    setup_logger,
    validate_schema,
)

log = setup_logger("politicians")

# ─────────────────────────────────────────────────────────
#  SCHEMA — all Phase 6 fields
# ─────────────────────────────────────────────────────────

REQUIRED_FIELDS = {
    "id", "name", "name_hi", "name_en",
    "state", "party", "position",
    "official_source", "last_updated",
}

FULL_SCHEMA_FIELDS = {
    # Identity
    "id", "name", "name_hi", "name_en", "gender", "dob", "age",
    # Location
    "state", "district", "constituency",
    # Political
    "party", "position", "house", "cabinet", "ministry",
    # Education / Profession
    "education", "qualification", "profession",
    # Finance (self-declared, ECI affidavit)
    "assets_cr", "movable_cr", "immovable_cr", "liabilities_cr",
    # Criminal (declared pending cases — NOT convictions)
    "criminal_cases", "criminal_serious",
    # Election data
    "election_year", "votes_received", "vote_share_pct",
    # Links
    "affidavit_url", "official_url", "wikipedia_url", "parliament_url",
    # Source
    "official_source", "last_updated",
    # Career
    "prev_positions", "tags",
}

# Transparency note appended to every record
TRANSPARENCY_NOTE = (
    "Data based on self-declared ECI affidavit. "
    "criminal_cases = pending/registered cases, not convictions. "
    "Jungle Raj makes no editorial judgments."
)


# ─────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────

def run_politicians_collector(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> int:
    """
    Politicians collection pipeline.
    Phase 6: validates existing records, seeds demo data if empty,
    runs any enabled scrapers, deduplicates, saves.

    Returns count of records in final output.
    """
    log.info("━━━ Politicians collector starting (Phase 6) ━━━")
    log.info(
        "TRANSPARENCY: displaying only declared data from ECI affidavits. "
        "No editorial judgments made."
    )

    out_path = OUTPUT_FILES["politicians"]
    existing = load_json(out_path, logger=log)
    log.info("Loaded %d existing records", len(existing))

    new_records: list[dict] = []

    # ── 1. ECI affidavit scraper (stub — see _scrape_eci_affidavits) ──
    # eci_records = _scrape_eci_affidavits(session, cache, stats)
    # new_records.extend(eci_records)

    # ── 2. ADR / myneta.info (stub — see _scrape_adr) ─────────────────
    # adr_records = _scrape_adr(session, cache, stats)
    # new_records.extend(adr_records)

    # ── 3. Lok Sabha member directory (stub) ───────────────────────────
    # ls_records = _scrape_lok_sabha_members(session, cache, stats)
    # new_records.extend(ls_records)

    # ── 4. Seed demo data if nothing exists ───────────────────────────
    if not existing and not new_records:
        log.warning("No existing records and no live scrapers enabled.")
        log.info("Seeding with demo placeholder records (replace with real data).")
        new_records = _demo_seed_records()

    # ── 5. Normalise, validate, dedup ─────────────────────────────────
    if new_records:
        normalised = [r for r in (_normalise(r, existing) for r in new_records) if r]
        normalised = validate_schema(normalised, REQUIRED_FIELDS, logger=log)
        existing, added = deduplicate(existing, normalised, key="id", logger=log)
        log.info("Added/updated %d records", added)
        stats.bump("downloaded")

    # ── 6. Dedup check ────────────────────────────────────────────────
    dupes = find_duplicate_ids(existing, key="id")
    if dupes:
        log.warning("Duplicate IDs found: %s — keeping first", dupes[:10])
        existing = _dedup_first(existing)

    # ── 7. Sort by position → state → name ────────────────────────────
    pos_rank = _position_rank()
    existing.sort(key=lambda p: (
        pos_rank.get(p.get("position", ""), 99),
        p.get("state", ""),
        p.get("name", ""),
    ))

    # ── 8. Save ───────────────────────────────────────────────────────
    ok = save_json(out_path, existing, logger=log)
    if ok:
        log.info("━━━ Politicians: %d records saved ━━━", len(existing))
    else:
        log.error("Failed to save politicians.json")
        stats.bump("errors")

    return len(existing)


# ─────────────────────────────────────────────────────────
#  MANUAL ENTRY API
# ─────────────────────────────────────────────────────────

def add_manual_politician(item: dict) -> bool:
    """
    Add or update a single politician record.

    Mandatory: name, state, party, position, official_source
    All other fields optional but recommended.

    IMPORTANT: criminal_cases = declared pending cases, NOT convictions.
    Always set official_source to the actual source (e.g. "ECI Affidavit 2024").

    Example:
        add_manual_politician({
            "name":             "Rajesh Kumar Singh",
            "name_hi":          "राजेश कुमार सिंह",
            "name_en":          "Rajesh Kumar Singh",
            "gender":           "Male",
            "dob":              "1968-04-15",
            "state":            "Uttar Pradesh",
            "district":         "Lucknow",
            "constituency":     "Lucknow",
            "party":            "Example Party",
            "position":         "MP (Lok Sabha)",
            "house":            "Lok Sabha",
            "cabinet":          "—",
            "ministry":         "—",
            "education":        "BA, LL.B",
            "qualification":    "Graduate",
            "profession":       "Lawyer",
            "assets_cr":        18.4,
            "movable_cr":       8.2,
            "immovable_cr":     10.2,
            "liabilities_cr":   2.1,
            "criminal_cases":   1,          # declared pending cases only
            "criminal_serious": 0,
            "affidavit_url":    "https://affidavit.eci.gov.in/...",
            "official_url":     "",
            "wikipedia_url":    "https://en.wikipedia.org/wiki/...",
            "parliament_url":   "https://sansad.in/...",
            "official_source":  "ECI Affidavit 2024",
            "election_year":    2024,
            "votes_received":   380000,
            "vote_share_pct":   47.8,
            "prev_positions":   ["MLA Lucknow 2012–2017"],
            "tags":             ["UP", "Lawyer"],
        })
    """
    out_path = OUTPUT_FILES["politicians"]
    existing = load_json(out_path, logger=log)

    normalised = _normalise(item, existing)
    if not normalised:
        log.error("Failed to normalise politician record")
        return False

    missing = REQUIRED_FIELDS - normalised.keys()
    if missing:
        log.error("Missing required fields: %s", missing)
        return False

    # Check if updating or inserting
    exists_idx = next((i for i, r in enumerate(existing) if r["id"] == normalised["id"]), None)
    if exists_idx is not None:
        existing[exists_idx] = normalised
        log.info("Updated politician: %s (%s)", normalised["name"], normalised["id"])
    else:
        existing.append(normalised)
        log.info("Added politician: %s (%s)", normalised["name"], normalised["id"])

    return save_json(out_path, existing, logger=log)


def empty_politician_template() -> dict:
    """
    Return a fully-populated empty template.
    Fill in and pass to add_manual_politician().
    criminal_cases = declared pending cases, NOT convictions.
    """
    return {
        "id":               "",           # auto-generated if empty
        # Identity
        "name":             "",           # e.g. "Rajesh Kumar Singh"
        "name_hi":          "",           # Hindi script name
        "name_en":          "",           # English name (if different)
        "gender":           "",           # "Male" | "Female" | "Other"
        "dob":              "",           # "YYYY-MM-DD"
        "age":              None,
        # Location
        "state":            "",
        "district":         "",
        "constituency":     "",
        # Political
        "party":            "",
        "position":         "",           # "PM" | "Cabinet Minister" | "MP (Lok Sabha)" | etc.
        "house":            "",           # "Lok Sabha" | "Rajya Sabha" | "State Assembly"
        "cabinet":          "",           # "Cabinet" | "State Cabinet" | "Constitutional" | "—"
        "ministry":         "",           # Ministry name or "—"
        # Education
        "education":        "",           # Degrees listed
        "qualification":    "",           # "Doctorate" | "Postgraduate" | "Graduate" | "Below Graduate"
        "profession":       "",
        # Finance (self-declared ECI affidavit)
        "assets_cr":        None,         # total in crores
        "movable_cr":       None,
        "immovable_cr":     None,
        "liabilities_cr":   None,
        # Criminal (DECLARED PENDING CASES — NOT CONVICTIONS)
        "criminal_cases":   0,
        "criminal_serious": 0,            # cases with 5+ year sentence possible
        # Election
        "election_year":    None,
        "votes_received":   None,
        "vote_share_pct":   None,
        # Links
        "affidavit_url":    "",           # ECI affidavit PDF URL
        "official_url":     "",           # Minister/MP official page
        "wikipedia_url":    "",
        "parliament_url":   "",           # sansad.in or rajyasabha.nic.in
        # Source
        "official_source":  "ECI",        # "ECI Affidavit 2024" | "ADR" | "Lok Sabha"
        "last_updated":     iso_date(),
        # Career
        "prev_positions":   [],           # ["CM Gujarat 2001–2014", "MP Vadodara 2014–2019"]
        "tags":             [],
        "_demo":            False,        # set True for placeholder data
    }


# ─────────────────────────────────────────────────────────
#  ECI AFFIDAVIT URL BUILDER
# ─────────────────────────────────────────────────────────

def eci_affidavit_url(
    candidate_name: str,
    state: str,
    year: int = 2024,
    phase: int | None = None,
) -> str:
    """
    Build best-guess ECI affidavit search URL.
    Must be manually verified at affidavit.eci.gov.in.

    States and constituency spellings must match ECI portal exactly.
    The search result page will list matching candidates.
    """
    name_slug  = re.sub(r'[^a-z0-9]+', '+', clean_text(candidate_name).lower())
    state_slug = re.sub(r'[^a-z0-9]+', '+', clean_text(state).lower())
    base = "https://affidavit.eci.gov.in/candidate-list"
    query = f"electionType=GE&year={year}&stateName={state_slug}&candidateName={name_slug}"
    if phase:
        query += f"&phase={phase}"
    return f"{base}?{query}"


def parliament_profile_url(
    house: str,
    name: str,
    member_id: str = "",
) -> str:
    """
    Build Sansad / Rajya Sabha profile URL.
    house: "Lok Sabha" | "Rajya Sabha"
    member_id: optional — if known, use it for direct link.
    """
    if house == "Rajya Sabha":
        if member_id:
            return f"https://rajyasabha.nic.in/rsnew/member_details/memberdetails.aspx?member_id={member_id}"
        return "https://rajyasabha.nic.in/rsnew/member_home.aspx"
    # Lok Sabha
    if member_id:
        return f"https://sansad.in/loksabha/members/{member_id}"
    return "https://sansad.in/ls/members/list-of-members"


# ─────────────────────────────────────────────────────────
#  SCRAPING STUBS — ARCHITECTURE REFERENCE
#  Enable each stub after:
#    1. Legal review of source's ToS / robots.txt
#    2. Rate limit agreement
#    3. Setting scrape_ok=True in config.py
# ─────────────────────────────────────────────────────────

def _scrape_eci_affidavits(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
    year: int = 2024,
    election_type: str = "GE",   # "GE" = General, "SA" = State Assembly
) -> list[dict]:
    """
    STUB — ECI affidavit data collection.

    ECI publishes all candidate affidavits at affidavit.eci.gov.in.
    The portal has a search API that returns structured JSON.

    Endpoint (unofficial, subject to change):
        GET https://affidavit.eci.gov.in/candidate-list/getDataBySearch
        Params: electionType, year, stateName, phase, pageNo

    Response per candidate:
        {
          "cand_name":      "RAJESH KUMAR SINGH",
          "party":          "INC",
          "state":          "UTTAR PRADESH",
          "constituency":   "LUCKNOW",
          "phase":          2,
          "affidavit_url":  "https://affidavit.eci.gov.in/...",
          "total_assets":   "Rs 1,84,00,000",
          "total_liab":     "Rs 21,00,000",
          "criminal_cases": 1,
        }

    Steps to enable:
        1. Inspect affidavit.eci.gov.in network requests in browser devtools
        2. Note actual API endpoint, params, and headers
        3. Implement pagination loop (typically 20–50 records per page)
        4. Parse currency strings → float crore values
        5. Set source["scrape_ok"] = True for "eci" in config.py
    """
    source = SOURCES_BY_ID.get("eci")
    if not source or not source.get("scrape_ok"):
        log.debug("ECI affidavit scraper disabled — set scrape_ok=True in config.py")
        return []

    log.info("Fetching ECI affidavit data for %s %d", election_type, year)
    # TODO: implement when API is confirmed
    return []


def _scrape_adr(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
    year: int = 2024,
    election_type: str = "LS",   # "LS" | "RS" | "STATE"
    states: list[str] | None = None,
) -> list[dict]:
    """
    STUB — ADR / myneta.info data collection.

    ADR (Association for Democratic Reforms) aggregates ECI affidavit data
    and publishes it under CC BY-SA 4.0 at:
        https://myneta.info/

    API endpoints (verify current — these may change):
        GET https://myneta.info/candidate/search?q={name}&election={year}
        GET https://myneta.info/ls2024/candidates?state={state}&party={party}

    Response per candidate (schema approximate):
        {
          "name":         "RAJESH KUMAR SINGH",
          "party":        "INC",
          "state":        "Uttar Pradesh",
          "constituency": "Lucknow",
          "total_assets": 18400000,           # in rupees
          "total_liab":   2100000,
          "criminal":     1,
          "serious":      0,
          "education":    "Graduate",
          "age":          56,
        }

    Steps to enable:
        1. Visit https://myneta.info and check robots.txt + Terms
        2. Inspect network requests to find actual API
        3. Verify CC BY-SA 4.0 licence allows automated download
        4. Implement with 1.5s delay per request (respect rate limits)
        5. Set scrape_ok=True for "adr" in config.py

    Attribution required: "Data sourced from ADR / myneta.info (CC BY-SA 4.0)"
    """
    source = SOURCES_BY_ID.get("adr")
    if not source or not source.get("scrape_ok"):
        log.debug("ADR scraper disabled — set scrape_ok=True in config.py after legal review")
        return []

    log.info("Fetching ADR data: %s %d", election_type, year)
    # TODO: implement when API endpoint confirmed and legal review done
    return []


def _scrape_lok_sabha_members(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> list[dict]:
    """
    STUB — Lok Sabha member directory.

    Lok Sabha publishes a member list at:
        https://sansad.in/ls/members/list-of-members

    The page offers a downloadable Excel file with:
        - Name, Constituency, State, Party, Gender, DOB
        - Education, Profession, Contact, Photo URL

    It does NOT include assets/criminal cases — those come from ECI.

    Steps to enable:
        1. Visit https://sansad.in/ls/members/list-of-members
        2. Download the Excel file (monthly update available)
        3. Parse with openpyxl or pandas
        4. Cross-reference with ECI data using name + state
        5. Merge to build complete records

    Note: robots.txt at sansad.in allows well-behaved bots.
    """
    log.debug("Lok Sabha member scraper: stub — implement when Excel parsing added")
    return []


def _scrape_rajya_sabha_members(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
) -> list[dict]:
    """
    STUB — Rajya Sabha member directory.

    Rajya Sabha member list at:
        https://rajyasabha.nic.in/rsnew/member_home.aspx

    Provides: Name, State, Party, Term, Committee membership.
    Export available as HTML table (parseable with BS4).
    """
    log.debug("Rajya Sabha member scraper: stub")
    return []


def _scrape_state_assembly(
    session: requests.Session,
    cache: DiskCache,
    stats: RunStats,
    state: str,
    year: int = 2024,
) -> list[dict]:
    """
    STUB — State assembly member scraper.

    Each state has its own assembly portal:
        Uttar Pradesh: https://upvidhansabha.nic.in/
        Maharashtra:   https://mls.org.in/
        Karnataka:     https://kla.kar.nic.in/
        Bihar:         https://vidhansabha.bih.nic.in/
        Tamil Nadu:    https://www.tnlegislature.gov.in/

    Steps to enable per state:
        1. Verify robots.txt for each state portal
        2. Locate member list / MLA directory page
        3. Parse HTML table using BS4 + lxml
        4. Map to politician schema
        5. Cross-reference with ECI for assets/criminal data

    Consider writing one scraper per state once ECI integration is stable.
    """
    log.debug("State assembly scraper stub: %s %d", state, year)
    return []


# ─────────────────────────────────────────────────────────
#  PRIVATE HELPERS
# ─────────────────────────────────────────────────────────

def _normalise(item: dict, existing: list[dict]) -> dict | None:
    """
    Normalise a raw politician dict to full Phase 6 schema.
    Assigns stable ID, fills all defaults.
    """
    name = clean_text(item.get("name", ""))
    if not name:
        log.warning("Politician record has no name — skipping")
        return None

    state        = clean_text(item.get("state", ""))
    election_yr  = _safe_int(item.get("election_year"))
    id_seed      = f"{name}_{state}_{election_yr or ''}"
    id_          = item.get("id") or make_hash_id(ID_PREFIXES["politician"], id_seed)

    # Calculate age from dob if not provided
    dob = clean_text(item.get("dob", ""))
    age = item.get("age") or _calc_age(dob)

    return {
        "id":               id_,
        "name":             name,
        "name_hi":          clean_text(item.get("name_hi", "")),
        "name_en":          clean_text(item.get("name_en") or name),
        "gender":           clean_text(item.get("gender", "")),
        "dob":              dob,
        "age":              age,
        "state":            state,
        "district":         clean_text(item.get("district", "")),
        "constituency":     clean_text(item.get("constituency", "")),
        "party":            clean_text(item.get("party", "")),
        "position":         clean_text(item.get("position", "")),
        "house":            clean_text(item.get("house", "")),
        "cabinet":          clean_text(item.get("cabinet", "")),
        "ministry":         clean_text(item.get("ministry", "")),
        "education":        clean_text(item.get("education", "")),
        "qualification":    clean_text(item.get("qualification", "")) or _infer_qualification(item.get("education", "")),
        "profession":       clean_text(item.get("profession", "")),
        "assets_cr":        _safe_float(item.get("assets_cr")),
        "movable_cr":       _safe_float(item.get("movable_cr")),
        "immovable_cr":     _safe_float(item.get("immovable_cr")),
        "liabilities_cr":   _safe_float(item.get("liabilities_cr")),
        "criminal_cases":   _safe_int(item.get("criminal_cases"), default=0),
        "criminal_serious": _safe_int(item.get("criminal_serious"), default=0),
        "election_year":    election_yr,
        "votes_received":   _safe_int(item.get("votes_received")),
        "vote_share_pct":   _safe_float(item.get("vote_share_pct")),
        "affidavit_url":    clean_text(item.get("affidavit_url", "")) or eci_affidavit_url(name, state),
        "official_url":     clean_text(item.get("official_url", "")),
        "wikipedia_url":    clean_text(item.get("wikipedia_url", "")),
        "parliament_url":   clean_text(item.get("parliament_url", "")),
        "official_source":  clean_text(item.get("official_source", "ECI")),
        "last_updated":     item.get("last_updated", iso_date()),
        "prev_positions":   item.get("prev_positions", []),
        "tags":             item.get("tags", []),
        "_demo":            bool(item.get("_demo", False)),
    }


def _infer_qualification(edu: str) -> str:
    """Infer qualification tier from education string."""
    if not edu:
        return ""
    edu_l = edu.lower()
    if any(kw in edu_l for kw in ["phd", "d.phil", "doctorate", "d.sc"]):
        return "Doctorate"
    if any(kw in edu_l for kw in ["m.a", "m.sc", "mba", "m.b", "m.tech", "ll.m", "m.s.", "m.phil", "postgraduate", "pg"]):
        return "Postgraduate"
    if any(kw in edu_l for kw in ["b.a", "b.sc", "b.com", "b.tech", "ll.b", "b.ed", "b.e", "graduate", "degree"]):
        return "Graduate"
    if any(kw in edu_l for kw in ["12th", "intermediate", "hsc", "diploma", "certificate", "10th", "matriculation"]):
        return "Below Graduate"
    return ""


def _calc_age(dob: str) -> int | None:
    """Calculate age from dob string (YYYY-MM-DD)."""
    if not dob or len(dob) < 4:
        return None
    try:
        from datetime import date
        birth = date.fromisoformat(dob)
        today = date.today()
        return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
    except Exception:
        return None


def _position_rank() -> dict[str, int]:
    """Rank positions for sort order (lower = higher priority)."""
    return {
        "Prime Minister": 1,
        "President of India": 2,
        "Vice President of India": 3,
        "Cabinet Minister": 4,
        "Minister of State": 5,
        "Chief Minister": 6,
        "Deputy Chief Minister": 7,
        "Member of Parliament": 8,
        "MP (Lok Sabha)": 8,
        "MP (Rajya Sabha)": 8,
        "Leader of Opposition": 9,
        "State Minister": 10,
        "MLA": 11,
        "Party President": 12,
    }


def _dedup_first(records: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result: list[dict] = []
    for r in records:
        id_ = r.get("id", "")
        if id_ not in seen:
            result.append(r)
            seen.add(id_)
    return result


def _safe_int(val: Any, default: int | None = None) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _safe_float(val: Any, default: float | None = None) -> float | None:
    try:
        return round(float(str(val).replace(",", "")), 2)
    except (TypeError, ValueError):
        return default


def _demo_seed_records() -> list[dict]:
    """
    Return 2 minimal demo records to bootstrap politicians.json.
    These show the schema structure.
    Replace immediately with real ECI / ADR data.
    """
    log.warning(
        "DEMO ONLY — seeding 2 placeholder records. "
        "Add real data using add_manual_politician() or enable scrapers."
    )
    demos = [
        {
            "name": "Demo Politician One",
            "name_hi": "डेमो नेता एक",
            "name_en": "Demo Politician One",
            "gender": "Male",
            "dob": "1960-01-01",
            "state": "Uttar Pradesh",
            "district": "Lucknow",
            "constituency": "Lucknow",
            "party": "Example Party A",
            "position": "MP (Lok Sabha)",
            "house": "Lok Sabha",
            "cabinet": "—", "ministry": "—",
            "education": "B.A., LL.B",
            "qualification": "Graduate",
            "profession": "Lawyer",
            "assets_cr": 10.5,
            "movable_cr": 4.2, "immovable_cr": 6.3,
            "liabilities_cr": 1.1,
            "criminal_cases": 0, "criminal_serious": 0,
            "election_year": 2024,
            "votes_received": 300000, "vote_share_pct": 45.0,
            "affidavit_url": "https://affidavit.eci.gov.in/",
            "official_url": "", "wikipedia_url": "", "parliament_url": "",
            "official_source": "ECI (Demo)", "last_updated": iso_date(),
            "prev_positions": [], "tags": ["Demo"],
            "_demo": True,
        },
        {
            "name": "Demo Politician Two",
            "name_hi": "डेमो नेता दो",
            "name_en": "Demo Politician Two",
            "gender": "Female",
            "dob": "1970-06-15",
            "state": "Maharashtra",
            "district": "Mumbai",
            "constituency": "Mumbai North",
            "party": "Example Party B",
            "position": "Cabinet Minister",
            "house": "Rajya Sabha",
            "cabinet": "Cabinet", "ministry": "Ministry of Health",
            "education": "M.B.B.S., MD",
            "qualification": "Postgraduate",
            "profession": "Doctor",
            "assets_cr": 22.8,
            "movable_cr": 12.0, "immovable_cr": 10.8,
            "liabilities_cr": 2.4,
            "criminal_cases": 0, "criminal_serious": 0,
            "election_year": 2022,
            "votes_received": 0, "vote_share_pct": 0.0,
            "affidavit_url": "https://affidavit.eci.gov.in/",
            "official_url": "", "wikipedia_url": "", "parliament_url": "",
            "official_source": "ECI (Demo)", "last_updated": iso_date(),
            "prev_positions": [], "tags": ["Demo", "Female", "Doctor"],
            "_demo": True,
        }
    ]
    return [_normalise(d, []) for d in demos if _normalise(d, [])]


# ─────────────────────────────────────────────────────────
#  DATA QUALITY CHECKS
# ─────────────────────────────────────────────────────────

def audit_politicians_json() -> dict:
    """
    Run a full data quality audit on politicians.json.
    Returns a report dict with counts, warnings, issues.

    Useful before publishing to production.
    """
    path     = OUTPUT_FILES["politicians"]
    records  = load_json(path, logger=log)
    report: dict = {
        "total":            len(records),
        "demo_records":     0,
        "missing_affidavit":0,
        "missing_assets":   0,
        "negative_assets":  0,
        "duplicate_ids":    [],
        "missing_fields":   {},
        "by_position":      {},
        "by_state":         {},
        "by_party":         {},
        "with_cases":       0,
        "warnings":         [],
    }

    seen_ids: dict[str, int] = {}
    for r in records:
        # Duplicates
        id_ = r.get("id", "")
        seen_ids[id_] = seen_ids.get(id_, 0) + 1

        if r.get("_demo"):
            report["demo_records"] += 1
            report["warnings"].append(f"Demo record: {r.get('name')} — replace with real data")

        if not r.get("affidavit_url"):
            report["missing_affidavit"] += 1

        if r.get("assets_cr") is None:
            report["missing_assets"] += 1

        if (r.get("assets_cr") or 0) < 0:
            report["negative_assets"] += 1

        if (r.get("criminal_cases") or 0) > 0:
            report["with_cases"] += 1

        pos = r.get("position", "Unknown")
        report["by_position"][pos] = report["by_position"].get(pos, 0) + 1

        state = r.get("state", "Unknown")
        report["by_state"][state] = report["by_state"].get(state, 0) + 1

        party = r.get("party", "Unknown")
        report["by_party"][party] = report["by_party"].get(party, 0) + 1

    report["duplicate_ids"] = [k for k, v in seen_ids.items() if v > 1]

    log.info("Audit complete: %d records, %d demo, %d with cases, %d dupes",
             report["total"], report["demo_records"], report["with_cases"],
             len(report["duplicate_ids"]))

    return report
