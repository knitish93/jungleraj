# Jungle Raj — Development Data Engine

> **This engine is not part of the deployed website.**
> It is a development-time tool that generates the JSON files
> the static website reads. The website itself makes no API calls.

---

## Overview

```
tools/                    ← You are here
├── crawler.py            ← CLI orchestrator (main entry point)
├── config.py             ← All constants, paths, source URLs
├── sources.py            ← Source registry + RSS feed parser
├── news.py               ← News collection pipeline
├── statistics.py         ← Statistics collection pipeline
├── politicians.py        ← Politicians data pipeline (architecture)
├── utils.py              ← Logging, HTTP, JSON I/O, dedup, caching
├── requirements.txt      ← Python dependencies
├── logs/                 ← Per-run log files (auto-created)
└── .cache/               ← HTTP response cache (auto-created)
```

**Generated output** → `/data/` (read by the frontend):
```
data/
├── news.json             ← Latest news items (≤200)
├── statistics.json       ← 100+ national statistics
├── politicians.json      ← Politician records (manual + scraped)
├── stories.json          ← Story metadata (manual)
└── timeline.json         ← Timeline events (manual)
```

---

## Quick Start

### 1. Prerequisites

- Python 3.11 or newer
- Internet access (for World Bank API, RSS feeds)

### 2. Setup

```bash
# Clone / navigate to the project
cd JungleRaj/tools

# Create and activate a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate       # macOS / Linux
# or: .venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Run a collection

```bash
# From the tools/ directory:

# Run everything
python crawler.py all

# News only
python crawler.py news

# Statistics only (World Bank API)
python crawler.py stats

# Politicians (validates/seeds existing data)
python crawler.py politicians

# Check all source URLs are reachable
python crawler.py health

# Validate existing JSON files (no network calls)
python crawler.py validate

# Clear the HTTP cache
python crawler.py clear-cache
```

### 4. Flags

| Flag | Effect |
|---|---|
| `--no-cache` | Bypass disk cache; always fetch fresh |
| `--dry-run` | Collect data but don't write JSON files |
| `--verbose` | Set log level to DEBUG |
| `--source ID` | Limit to a specific source ID (e.g. `rbi`) |

---

## How JSON is generated

### news.json

1. `crawler.py news` is called
2. `news.py` calls `sources.py` to get all RSS-enabled sources
3. Each RSS feed URL is fetched (with cache + retry)
4. `sources.py:parse_rss()` converts XML → normalised dicts
5. Category is auto-detected from keywords (`config.py:CATEGORY_KEYWORDS`)
6. A deterministic hash ID is assigned per item (based on URL)
7. New items are merged into existing `news.json` (dedup by ID)
8. Result is sorted newest-first, trimmed to 200 records
9. `utils.py:save_json()` writes atomically (`.tmp` → rename)

**To add a news item manually:**
```python
from news import add_manual_news
add_manual_news({
    "title":          "GST संग्रह ₹2.10 लाख करोड़",
    "summary":        "अप्रैल 2024 में रिकॉर्ड संग्रह।",
    "source":         "Ministry of Finance",
    "url":            "https://pib.gov.in/...",
    "published_date": "2024-05-01",
    "category":       "Tax",
})
```

---

### statistics.json

1. `crawler.py stats` is called
2. `statistics.py` queries the World Bank Open Data API
   - Free, no API key required
   - Endpoint: `https://api.worldbank.org/v2/country/IN/indicator/{CODE}`
   - Configured indicators: see `config.py:WORLDBANK_INDICATORS`
3. Each indicator's history (last 10 years) is fetched
4. Trend is calculated from most-recent vs previous value
5. Records are **merged / updated** (values change each year)
6. Result is sorted by category → title

**To add a statistic manually:**
```python
from statistics import add_manual_statistic
add_manual_statistic({
    "title":        "पेट्रोल मूल्य (दिल्ली)",
    "title_en":     "Petrol Price (Delhi)",
    "category":     "Fuel",
    "value":        "₹94.72/लीटर",
    "unit":         "₹/लीटर",
    "year":         2024,
    "trend":        "stable",
    "source":       "PPAC",
    "description":  "दिल्ली में पेट्रोल का खुदरा मूल्य।",
})
```

**To get an empty template:**
```python
from statistics import empty_statistic_template
template = empty_statistic_template()
print(template)   # fill in and pass to add_manual_statistic()
```

---

### politicians.json

**Current status: Architecture only. Live scraping not yet enabled.**

The schema is fully defined. Two pathways for data entry:

**Manual entry** (recommended until scraping is reviewed):
```python
from politicians import add_manual_politician
add_manual_politician({
    "name":           "Rajesh Kumar",
    "state":          "Uttar Pradesh",
    "party":          "Party A",
    "position":       "MP (Lok Sabha)",
    "criminal_cases": 2,
    "assets_cr":      12.4,
    "affidavit_url":  "https://affidavit.eci.gov.in/...",
    "official_source":"ECI",
    "election_year":  2024,
})
```

**Future scraping** (when legally reviewed):
- ADR / myneta.info data (CC BY-SA 4.0)
- ECI affidavit PDFs → extract table data with `pdfplumber`
- Lok Sabha / Rajya Sabha member lists

See `politicians.py:_scrape_adr_stub()` for the intended architecture.

---

## How the frontend consumes JSON

The frontend is a **pure static website** that reads JSON files
via `fetch()` from the same origin. No API calls are made to
external services during runtime.

```
Browser loads index.html
  → js/api.js: jrLoadData('statistics.json')
      → fetch('./data/statistics.json')   (same-origin, no CORS needed)
      → returns JavaScript array
  → js/statistics.js: renders cards
```

The JSON files act as the "database". To update the website's data:
1. Run the crawler (`python crawler.py all`)
2. Copy the `/data/*.json` files to your web server
3. Users see fresh data on next page load

No server-side code, no database, no API keys at runtime.

---

## Source Configuration

All sources are defined in `config.py:SOURCES`. Each entry:

```python
{
    "id":         "rbi",               # unique identifier
    "name":       "Reserve Bank of India",
    "base_url":   "https://rbi.org.in",
    "rss_url":    "https://rbi.org.in/...", # or None
    "api_url":    None,                # REST endpoint or None
    "category":   "Economy",          # default category
    "language":   "en",               # "en" | "hi" | "both"
    "trust_tier": 1,                  # 1=government, 2=news, 3=research
    "scrape_ok":  True,               # respects robots.txt/ToS?
    "notes":      "...",
}
```

To add a new source:
1. Add an entry to `SOURCES` in `config.py`
2. If it's RSS: the news collector will pick it up automatically
3. If it's an API: add a collection function in the relevant module
4. Run `python crawler.py health` to verify it's reachable

---

## Adding a new data category

1. Add category name to `NEWS_CATEGORIES` / `STAT_CATEGORIES` in `config.py`
2. Add keywords to `CATEGORY_KEYWORDS` so auto-detection works
3. Add category icon to `_ICONS` in `news.py` and `sources.py`
4. Run the collector — new items will be auto-categorised

---

## Logging

Every run produces a log file in `tools/logs/`:
```
tools/logs/
├── news_2024-06-15.log
├── statistics_2024-06-15.log
├── politicians_2024-06-15.log
└── crawler_2024-06-15.log
```

Log levels: `DEBUG` (verbose) → `INFO` → `WARNING` → `ERROR`

Log format:
```
2024-06-15 10:23:41  INFO      news                 Fetching RSS: The Hindu ...
2024-06-15 10:23:42  INFO      news                 Parsed 28 items from thehindu
2024-06-15 10:23:43  INFO      news                 Added 12 new records (total now 145)
```

---

## Scheduling (automated refresh)

To run the crawler automatically (e.g. daily), use OS-level scheduling:

**Linux / macOS (cron):**
```bash
# Run at 6:00 AM every day
0 6 * * * cd /path/to/JungleRaj/tools && .venv/bin/python crawler.py all >> logs/cron.log 2>&1
```

**Windows (Task Scheduler):**
```
Program:   C:\...\JungleRaj\tools\.venv\Scripts\python.exe
Arguments: C:\...\JungleRaj\tools\crawler.py all
```

**Python schedule library** (cross-platform, runs inside a process):
```python
import schedule, time, subprocess

def run_all():
    subprocess.run(["python", "crawler.py", "all"])

schedule.every().day.at("06:00").do(run_all)
while True:
    schedule.run_pending()
    time.sleep(60)
```

---

## Legal & Ethics

- Always verify a source's `robots.txt` before scraping
- Respect rate limits — the engine uses a 1.5s delay between requests
- Prefer official APIs and RSS feeds over scraping HTML
- Public domain / CC-licensed data only
- Never store or publish personal data without legal basis
- NCRB, ECI, PIB, World Bank — all publish open/public data
- ADR data: CC BY-SA 4.0 (attribution required)

---

## Module Reference

| Module | Purpose |
|---|---|
| `crawler.py` | CLI entry point, orchestrator |
| `config.py`  | All constants (edit to add sources) |
| `sources.py` | Source registry, RSS parser, health check |
| `news.py`    | News pipeline + `add_manual_news()` |
| `statistics.py` | Statistics pipeline + `add_manual_statistic()` |
| `politicians.py` | Politicians schema + `add_manual_politician()` |
| `utils.py`   | Logging, HTTP, JSON I/O, dedup, cache, helpers |

---

*Jungle Raj — जनता की, जनता द्वारा, जनता के लिए*
