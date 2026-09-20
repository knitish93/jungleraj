"""
utils.py — Jungle Raj Development Data Engine
==============================================
Shared utilities used by every crawler module:
  • Structured logging with per-run log files
  • Polite HTTP with retry, caching, timeout
  • JSON read / write with validation
  • Duplicate ID detection
  • Slug / ID generation
  • Category auto-detection from keywords
  • Run statistics tracker
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import (
    CACHE_DIR,
    CACHE_TTL,
    CATEGORY_KEYWORDS,
    DATA_DIR,
    HEADERS,
    LOG_DATEFMT,
    LOG_FORMAT,
    LOG_LEVEL,
    LOGS_DIR,
    REQUEST_DELAY,
    REQUEST_MAX_RETRY,
    REQUEST_TIMEOUT,
)

# ─────────────────────────────────────────────────────────
#  LOGGING
# ─────────────────────────────────────────────────────────

def setup_logger(name: str, also_file: bool = True) -> logging.Logger:
    """
    Return a configured logger for `name`.
    Writes to console (INFO) and optionally to a timestamped log file.
    """
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    logger.propagate = False

    if logger.handlers:
        return logger  # already configured

    fmt = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # File handler (one file per run-day)
    if also_file:
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = LOGS_DIR / f"{name}_{today}.log"
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        logger.addHandler(fh)

    return logger


# ─────────────────────────────────────────────────────────
#  RUN STATISTICS (counters per module)
# ─────────────────────────────────────────────────────────

class RunStats:
    """Lightweight counters to summarise a crawler run."""

    def __init__(self) -> None:
        self.downloaded = 0
        self.skipped    = 0
        self.errors     = 0
        self.warnings   = 0
        self._t0        = time.time()

    def bump(self, counter: str) -> None:
        setattr(self, counter, getattr(self, counter) + 1)

    def elapsed(self) -> str:
        s = time.time() - self._t0
        return f"{s:.1f}s"

    def summary(self) -> dict:
        return {
            "downloaded": self.downloaded,
            "skipped":    self.skipped,
            "errors":     self.errors,
            "warnings":   self.warnings,
            "elapsed_s":  f"{time.time() - self._t0:.1f}",
        }

    def log(self, logger: logging.Logger) -> None:
        s = self.summary()
        logger.info(
            "Run complete — "
            "✅ downloaded=%(downloaded)s  "
            "⏭ skipped=%(skipped)s  "
            "❌ errors=%(errors)s  "
            "⚠ warnings=%(warnings)s  "
            "⏱ %(elapsed_s)ss",
            s,
        )


# ─────────────────────────────────────────────────────────
#  CACHE (disk-based, per URL)
# ─────────────────────────────────────────────────────────

class DiskCache:
    """
    Simple content-addressed disk cache keyed by URL.
    Respects TTL in seconds; expired entries are re-fetched.
    """

    def __init__(self, ttl: int = CACHE_TTL["rss"]) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl

    def _key(self, url: str) -> Path:
        h = hashlib.sha1(url.encode()).hexdigest()[:16]
        return CACHE_DIR / f"{h}.cache"

    def get(self, url: str) -> bytes | None:
        path = self._key(url)
        if not path.exists():
            return None
        age = time.time() - path.stat().st_mtime
        if age > self.ttl:
            path.unlink(missing_ok=True)
            return None
        return path.read_bytes()

    def set(self, url: str, data: bytes) -> None:
        self._key(url).write_bytes(data)

    def clear(self) -> int:
        count = 0
        for f in CACHE_DIR.glob("*.cache"):
            f.unlink()
            count += 1
        return count


# ─────────────────────────────────────────────────────────
#  HTTP SESSION
# ─────────────────────────────────────────────────────────

def build_session() -> requests.Session:
    """Return a requests.Session with retry logic and custom headers."""
    session = requests.Session()
    session.headers.update(HEADERS)

    retry = Retry(
        total=REQUEST_MAX_RETRY,
        backoff_factor=1.2,
        status_forcelist={429, 500, 502, 503, 504},
        allowed_methods={"GET", "HEAD"},
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def fetch(
    url: str,
    session: requests.Session,
    cache: DiskCache | None = None,
    logger: logging.Logger | None = None,
    delay: float = REQUEST_DELAY,
) -> bytes | None:
    """
    Fetch URL with optional caching.
    Returns raw bytes or None on failure.
    Adds a polite delay before each live request.
    """
    log = logger or logging.getLogger("fetch")

    if cache:
        cached = cache.get(url)
        if cached:
            log.debug("Cache hit: %s", url)
            return cached

    time.sleep(delay)
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.content
        if cache:
            cache.set(url, data)
        log.debug("Fetched %s bytes from %s", len(data), url)
        return data
    except requests.exceptions.Timeout:
        log.warning("Timeout fetching: %s", url)
    except requests.exceptions.HTTPError as e:
        log.warning("HTTP %s for %s", e.response.status_code, url)
    except requests.exceptions.ConnectionError:
        log.warning("Connection error: %s", url)
    except Exception as e:
        log.error("Unexpected error fetching %s — %s", url, e)
    return None


def fetch_json(
    url: str,
    session: requests.Session,
    cache: DiskCache | None = None,
    logger: logging.Logger | None = None,
    params: dict | None = None,
) -> Any:
    """Fetch a URL and parse as JSON. Returns None on failure."""
    log = logger or logging.getLogger("fetch_json")
    time.sleep(REQUEST_DELAY)
    try:
        resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except json.JSONDecodeError as e:
        log.warning("Invalid JSON from %s — %s", url, e)
    except Exception as e:
        log.warning("fetch_json error %s — %s", url, e)
    return None


# ─────────────────────────────────────────────────────────
#  JSON I/O + VALIDATION
# ─────────────────────────────────────────────────────────

def load_json(path: Path, logger: logging.Logger | None = None) -> list[dict]:
    """
    Load a JSON array from disk.
    Returns empty list if file missing or invalid.
    """
    log = logger or logging.getLogger("json_io")
    if not path.exists():
        log.debug("File not found, starting fresh: %s", path)
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            log.warning("Expected JSON array in %s, got %s", path, type(data).__name__)
            return []
        return data
    except json.JSONDecodeError as e:
        log.error("Corrupt JSON in %s — %s", path, e)
        return []


def save_json(
    path: Path,
    data: list[dict],
    logger: logging.Logger | None = None,
    indent: int = 2,
) -> bool:
    """
    Validate and save a JSON array to disk.
    Creates parent directories as needed.
    Returns True on success.
    """
    log = logger or logging.getLogger("json_io")
    path.parent.mkdir(parents=True, exist_ok=True)

    # Validate: must be a non-empty list of dicts
    if not isinstance(data, list):
        log.error("Cannot save — data is not a list (%s)", type(data).__name__)
        return False
    if not data:
        log.warning("Saving empty list to %s", path)

    invalid = [i for i, item in enumerate(data) if not isinstance(item, dict)]
    if invalid:
        log.error("Items at indices %s are not dicts — aborting save", invalid[:5])
        return False

    # Write atomically (write to .tmp, then rename)
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
        tmp.replace(path)
        log.info("Saved %d records → %s", len(data), path)
        return True
    except Exception as e:
        log.error("Failed to write %s — %s", path, e)
        tmp.unlink(missing_ok=True)
        return False


def validate_schema(
    records: list[dict],
    required_fields: set[str],
    logger: logging.Logger | None = None,
) -> list[dict]:
    """
    Remove records missing required fields.
    Returns the cleaned list and logs warnings.
    """
    log = logger or logging.getLogger("validation")
    good, bad = [], []
    for rec in records:
        missing = required_fields - rec.keys()
        if missing:
            bad.append((rec.get("id", "?"), missing))
        else:
            good.append(rec)
    if bad:
        log.warning(
            "Dropped %d records with missing fields: %s",
            len(bad),
            [(id_, list(m)) for id_, m in bad[:5]],
        )
    return good


# ─────────────────────────────────────────────────────────
#  DEDUPLICATION
# ─────────────────────────────────────────────────────────

def deduplicate(
    existing: list[dict],
    new: list[dict],
    key: str = "id",
    logger: logging.Logger | None = None,
) -> tuple[list[dict], int]:
    """
    Merge `new` into `existing`, skipping items whose `key` already exists.
    Returns (merged_list, count_added).
    """
    log = logger or logging.getLogger("dedup")
    seen = {item[key] for item in existing if key in item}
    added = 0
    result = list(existing)
    for item in new:
        val = item.get(key)
        if val is None:
            log.warning("Item has no '%s' field — skipping: %s", key, str(item)[:80])
            continue
        if val in seen:
            log.debug("Duplicate %s=%s — skipping", key, val)
        else:
            result.append(item)
            seen.add(val)
            added += 1
    if added:
        log.info("Added %d new records (total now %d)", added, len(result))
    else:
        log.info("No new records to add (total unchanged: %d)", len(result))
    return result, added


def find_duplicate_ids(records: list[dict], key: str = "id") -> list[str]:
    """Return list of duplicate key values."""
    seen: dict[str, int] = {}
    for r in records:
        v = r.get(key, "")
        seen[v] = seen.get(v, 0) + 1
    return [k for k, c in seen.items() if c > 1]


# ─────────────────────────────────────────────────────────
#  ID GENERATION
# ─────────────────────────────────────────────────────────

def make_id(prefix: str, text: str, max_len: int = 12) -> str:
    """
    Deterministic ID from prefix + slug of `text`.
    e.g. make_id("n", "India GDP grows") → "n_india_gdp_"
    """
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower().strip())[:max_len].strip("_")
    return f"{prefix}_{slug}"


def make_hash_id(prefix: str, text: str) -> str:
    """
    Short hash-based ID for dedup-safe unique identity.
    e.g. make_hash_id("n", url) → "n_3f9a2b1c"
    """
    h = hashlib.sha256(text.encode()).hexdigest()[:8]
    return f"{prefix}_{h}"


def next_sequential_id(prefix: str, existing: list[dict], key: str = "id") -> str:
    """
    Generate next numeric ID, e.g. "n042".
    Looks at existing records to find the current max.
    """
    nums = []
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    for r in existing:
        m = pattern.match(str(r.get(key, "")))
        if m:
            nums.append(int(m.group(1)))
    n = (max(nums) + 1) if nums else 1
    return f"{prefix}{n:03d}"


# ─────────────────────────────────────────────────────────
#  CATEGORY AUTO-DETECTION
# ─────────────────────────────────────────────────────────

def detect_category(text: str, fallback: str = "National") -> str:
    """
    Score every category by keyword matches in `text`.
    Returns the category with the highest score, or `fallback`.
    """
    text_lower = text.lower()
    scores: dict[str, int] = {}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[cat] = score
    if not scores:
        return fallback
    return max(scores, key=lambda c: scores[c])


# ─────────────────────────────────────────────────────────
#  TEXT HELPERS
# ─────────────────────────────────────────────────────────

def clean_text(text: str | None) -> str:
    """Strip whitespace, collapse internal spaces, remove zero-width chars."""
    if not text:
        return ""
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def truncate(text: str, max_chars: int = 300) -> str:
    """Truncate at sentence boundary if possible, else hard cut."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_sentence = max(cut.rfind("."), cut.rfind("।"))
    if last_sentence > max_chars // 2:
        return cut[: last_sentence + 1].strip()
    return cut.rstrip() + "…"


def iso_now() -> str:
    """Return current UTC datetime as ISO-8601 string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_date(dt: datetime | None = None) -> str:
    """Return date portion of a datetime as YYYY-MM-DD."""
    d = dt or datetime.now(timezone.utc)
    return d.strftime("%Y-%m-%d")


def domain_of(url: str) -> str:
    """Extract bare domain from URL, e.g. 'www.thehindu.com' → 'thehindu.com'."""
    try:
        host = urlparse(url).netloc
        return re.sub(r"^www\.", "", host)
    except Exception:
        return url


def estimate_reading_time(text: str, wpm: int = 200) -> int:
    """Estimate reading time in minutes for `text`."""
    words = len(text.split())
    return max(1, round(words / wpm))


# ─────────────────────────────────────────────────────────
#  DATA DIR BOOTSTRAP
# ─────────────────────────────────────────────────────────

def ensure_data_dir() -> None:
    """Create /data and /tools/logs directories if they don't exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
