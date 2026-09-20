"""
config.py — Jungle Raj Development Data Engine
===============================================
Central configuration for all crawlers and collectors.
Edit this file to add sources, change paths, or adjust
behaviour — never hardcode values elsewhere.
"""

from pathlib import Path

# ─────────────────────────────────────────────────────────
#  Project root & output paths
# ─────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent  # JungleRaj/
DATA_DIR     = PROJECT_ROOT / "data"
LOGS_DIR     = PROJECT_ROOT / "tools" / "logs"
CACHE_DIR    = PROJECT_ROOT / "tools" / ".cache"

# JSON output filenames
OUTPUT_FILES = {
    "news":        DATA_DIR / "news.json",
    "statistics":  DATA_DIR / "statistics.json",
    "politicians": DATA_DIR / "politicians.json",
    "stories":     DATA_DIR / "stories.json",
    "timeline":    DATA_DIR / "timeline.json",
    "issues":      DATA_DIR / "issues.json",
}

# ─────────────────────────────────────────────────────────
#  HTTP settings
# ─────────────────────────────────────────────────────────

REQUEST_TIMEOUT    = 15          # seconds per request
REQUEST_DELAY      = 1.5         # polite delay between requests (seconds)
REQUEST_MAX_RETRY  = 3           # retry attempts on transient errors
USER_AGENT = (
    "JungleRaj-DataEngine/1.0 "
    "(Civic data research; non-commercial; "
    "contact: dev@jungleraj.example)"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}

# ─────────────────────────────────────────────────────────
#  News categories and keywords
# ─────────────────────────────────────────────────────────

NEWS_CATEGORIES = [
    "Economy",
    "Tax",
    "Education",
    "Healthcare",
    "Employment",
    "Agriculture",
    "Crime",
    "Judiciary",
    "Infrastructure",
    "Technology",
    "Environment",
    "Women Safety",
    "Children",
    "Politics",
    "Fuel",
    "National",
    "Migration",
    "Population",
]

# Maps keywords in headline/body → category
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Economy":       ["gdp", "economy", "inflation", "rupee", "rbi", "fiscal", "budget",
                      "trade", "export", "import", "sensex", "nifty", "market", "recession"],
    "Tax":           ["gst", "income tax", "tax", "tds", "cbdt", "revenue", "cess",
                      "customs duty", "itr", "direct tax", "indirect tax"],
    "Education":     ["school", "university", "student", "education", "exam", "upsc",
                      "paper leak", "neet", "cbse", "syllabus", "teacher", "dropout",
                      "literacy", "college", "ugc", "iit", "coaching"],
    "Healthcare":    ["hospital", "health", "doctor", "medicine", "vaccine", "ayushman",
                      "covid", "disease", "nha", "aiims", "drug", "pharma", "malaria",
                      "tb", "tuberculosis", "cancer", "mortality", "maternal"],
    "Employment":    ["unemployment", "job", "employment", "labour", "worker", "mgnrega",
                      "salary", "layoff", "startup", "skill india", "apprentice", "plfs"],
    "Agriculture":   ["farmer", "crop", "msp", "agriculture", "irrigation", "rainfall",
                      "kisan", "drought", "flood", "rural", "fci", "grain", "wheat",
                      "rice", "pulses", "fertiliser", "pm-kisan"],
    "Crime":         ["crime", "murder", "rape", "assault", "theft", "fraud", "cyber",
                      "ncrb", "police", "arrest", "fir", "conviction", "drug", "terror"],
    "Judiciary":     ["court", "supreme court", "high court", "judge", "verdict", "bail",
                      "pending case", "njdg", "justice", "rti", "contempt", "rera"],
    "Infrastructure":["highway", "railway", "airport", "metro", "bridge", "road", "port",
                      "nhai", "construction", "power", "electricity", "grid"],
    "Technology":    ["upi", "5g", "digital", "internet", "ai", "startup", "app",
                      "npci", "cyber", "data", "broadband", "isro", "space"],
    "Environment":   ["pollution", "air quality", "water", "forest", "climate",
                      "emission", "renewable", "solar", "wind", "cpcb", "carbon",
                      "aqi", "plastic"],
    "Women Safety":  ["women", "gender", "nirbhaya", "dowry", "pocso", "rape",
                      "domestic violence", "maternity", "girl child", "acid attack"],
    "Children":      ["child", "anganwadi", "malnutrition", "icds", "vaccination",
                      "polio", "child labour", "juvenile"],
    "Politics":      ["election", "parliament", "lok sabha", "rajya sabha", "mp",
                      "minister", "party", "vote", "evm", "eci", "policy", "cabinet"],
    "Fuel":          ["petrol", "diesel", "lpg", "cng", "crude oil", "fuel price",
                      "ppac", "ioc", "bpcl", "hpcl"],
    "National":      ["india", "pm modi", "government", "union", "bharat", "niti aayog",
                      "pib", "gazette"],
    "Migration":     ["migration", "migrant", "remittance", "diaspora", "nri",
                      "labour migration", "urban migration"],
    "Population":    ["population", "census", "birth rate", "death rate", "fertility",
                      "demographic", "nfhs"],
}

# ─────────────────────────────────────────────────────────
#  Statistics categories
# ─────────────────────────────────────────────────────────

STAT_CATEGORIES = NEWS_CATEGORIES  # shared list

# Trend thresholds: if pct change > X, call it "up"/"down"
TREND_UP_THRESHOLD   = 0.5    # %
TREND_DOWN_THRESHOLD = -0.5   # %

# ─────────────────────────────────────────────────────────
#  Trusted sources registry
#  Each entry:
#    name        — display name
#    base_url    — canonical base
#    rss_url     — RSS/Atom feed (or None)
#    api_url     — REST API endpoint (or None)
#    category    — default category if auto-detect fails
#    language    — "en" | "hi" | "both"
#    trust_tier  — 1 (government official) | 2 (major news) | 3 (research)
#    scrape_ok   — True if robots.txt / TOS permits scraping
# ─────────────────────────────────────────────────────────

SOURCES: list[dict] = [
    # ── Government / Official ─────────────────────────────
    {
        "id":         "pib",
        "name":       "Press Information Bureau",
        "base_url":   "https://pib.gov.in",
        "rss_url":    "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
        "api_url":    None,
        "category":   "National",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Official GoI press releases",
    },
    {
        "id":         "mospi",
        "name":       "MoSPI (Ministry of Statistics)",
        "base_url":   "https://mospi.gov.in",
        "rss_url":    None,
        "api_url":    "https://mospi.gov.in/web/mospi/reports-notes",
        "category":   "Economy",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Official GDP, CPI, IIP data releases",
    },
    {
        "id":         "rbi",
        "name":       "Reserve Bank of India",
        "base_url":   "https://rbi.org.in",
        "rss_url":    "https://www.rbi.org.in/Scripts/RSSFeed.aspx?Id=2",
        "api_url":    None,
        "category":   "Economy",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Monetary policy, forex, banking data",
    },
    {
        "id":         "eci",
        "name":       "Election Commission of India",
        "base_url":   "https://eci.gov.in",
        "rss_url":    None,
        "api_url":    "https://results.eci.gov.in",
        "category":   "Politics",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Voter data, candidate affidavits, results",
    },
    {
        "id":         "ncrb",
        "name":       "National Crime Records Bureau",
        "base_url":   "https://ncrb.gov.in",
        "rss_url":    None,
        "api_url":    None,
        "category":   "Crime",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Annual Crime in India report PDFs",
    },
    {
        "id":         "njdg",
        "name":       "National Judicial Data Grid",
        "base_url":   "https://njdg.ecourts.gov.in",
        "rss_url":    None,
        "api_url":    "https://njdg.ecourts.gov.in/njdgnew/index.php",
        "category":   "Judiciary",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Live pending cases data",
    },
    {
        "id":         "ppac",
        "name":       "Petroleum Planning & Analysis Cell",
        "base_url":   "https://ppac.gov.in",
        "rss_url":    None,
        "api_url":    "https://ppac.gov.in/content/212_1_PricesPetroleum.aspx",
        "category":   "Fuel",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Retail fuel prices",
    },
    {
        "id":         "udise",
        "name":       "UDISE+ (Ministry of Education)",
        "base_url":   "https://udiseplus.gov.in",
        "rss_url":    None,
        "api_url":    None,
        "category":   "Education",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "School enrollment, dropout, teacher data",
    },
    {
        "id":         "nhp",
        "name":       "National Health Profile",
        "base_url":   "https://nhp.gov.in",
        "rss_url":    None,
        "api_url":    None,
        "category":   "Healthcare",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Hospitals, doctors, health infra data",
    },
    {
        "id":         "adr",
        "name":       "Association for Democratic Reforms",
        "base_url":   "https://adrindia.org",
        "rss_url":    None,
        "api_url":    "https://myneta.info/api",
        "category":   "Politics",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "Politician criminal cases, assets from affidavits",
    },
    # ── News RSS ──────────────────────────────────────────
    {
        "id":         "thehindu",
        "name":       "The Hindu",
        "base_url":   "https://www.thehindu.com",
        "rss_url":    "https://www.thehindu.com/news/national/feeder/default.rss",
        "api_url":    None,
        "category":   "National",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "National, politics, economy sections",
    },
    {
        "id":         "indianexpress",
        "name":       "Indian Express",
        "base_url":   "https://indianexpress.com",
        "rss_url":    "https://indianexpress.com/feed/",
        "api_url":    None,
        "category":   "National",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "National, politics, economy",
    },
    {
        "id":         "livemint",
        "name":       "Livemint",
        "base_url":   "https://www.livemint.com",
        "rss_url":    "https://www.livemint.com/rss/news",
        "api_url":    None,
        "category":   "Economy",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "Economy, budget, tax, market news",
    },
    {
        "id":         "theprint",
        "name":       "The Print",
        "base_url":   "https://theprint.in",
        "rss_url":    "https://theprint.in/feed/",
        "api_url":    None,
        "category":   "National",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "Policy, governance, politics",
    },
    {
        "id":         "scroll",
        "name":       "Scroll.in",
        "base_url":   "https://scroll.in",
        "rss_url":    "https://scroll.in/feed",
        "api_url":    None,
        "category":   "National",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  True,
        "notes":      "Policy analysis, civic issues",
    },
    # ── Research / Data sources ───────────────────────────
    {
        "id":         "worldbank",
        "name":       "World Bank Open Data",
        "base_url":   "https://api.worldbank.org",
        "rss_url":    None,
        "api_url":    "https://api.worldbank.org/v2/country/IN/indicator",
        "category":   "Economy",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Open data API — GDP, poverty, education indicators",
    },
    {
        "id":         "indiabudget",
        "name":       "India Budget Portal",
        "base_url":   "https://indiabudget.gov.in",
        "rss_url":    None,
        "api_url":    None,
        "category":   "Economy",
        "language":   "en",
        "trust_tier": 1,
        "scrape_ok":  True,
        "notes":      "Union Budget documents and annexures",
    },
    {
        "id":         "cmie",
        "name":       "CMIE (Centre for Monitoring Indian Economy)",
        "base_url":   "https://unemploymentinindia.cmie.com",
        "rss_url":    None,
        "api_url":    None,
        "category":   "Employment",
        "language":   "en",
        "trust_tier": 2,
        "scrape_ok":  False,   # subscription required — manual export only
        "notes":      "Unemployment data — subscription needed for API",
    },
]

# Build a lookup dict for quick access
SOURCES_BY_ID: dict[str, dict] = {s["id"]: s for s in SOURCES}

# ─────────────────────────────────────────────────────────
#  World Bank indicator codes for statistics.py
# ─────────────────────────────────────────────────────────

WORLDBANK_INDICATORS: dict[str, dict] = {
    "SP.POP.TOTL":    {"title": "Total Population",       "title_en": "Total Population",         "category": "Population", "unit": "persons",    "icon": "👥"},
    "NY.GDP.MKTP.CD": {"title": "GDP (Current USD)",      "title_en": "GDP (Current USD)",         "category": "Economy",    "unit": "USD",        "icon": "📈"},
    "NY.GDP.MKTP.KD.ZG":{"title":"GDP Growth Rate",       "title_en": "GDP Growth Rate",           "category": "Economy",    "unit": "%",          "icon": "📊"},
    "FP.CPI.TOTL.ZG": {"title": "Inflation (CPI)",        "title_en": "Inflation (CPI)",           "category": "Economy",    "unit": "%",          "icon": "💸"},
    "SL.UEM.TOTL.ZS": {"title": "Unemployment Rate",      "title_en": "Unemployment Rate",         "category": "Employment", "unit": "%",          "icon": "🧑‍💼"},
    "SE.ADT.LITR.ZS": {"title": "Literacy Rate",          "title_en": "Literacy Rate",             "category": "Education",  "unit": "%",          "icon": "📚"},
    "SP.DYN.IMRT.IN": {"title": "Infant Mortality Rate",  "title_en": "Infant Mortality Rate",     "category": "Healthcare", "unit": "per 1,000",  "icon": "👶"},
    "SP.DYN.LE00.IN": {"title": "Life Expectancy",        "title_en": "Life Expectancy at Birth",  "category": "Healthcare", "unit": "years",      "icon": "❤️"},
    "AG.LND.FRST.ZS": {"title": "Forest Area",            "title_en": "Forest Area",               "category": "Environment","unit": "% of land",  "icon": "🌳"},
    "IT.NET.USER.ZS": {"title": "Internet Users",         "title_en": "Internet Users",            "category": "Technology", "unit": "% population","icon": "🌐"},
    "SI.POV.NAHC":    {"title": "Poverty Rate (National)","title_en": "Poverty Headcount Ratio",   "category": "Economy",    "unit": "%",          "icon": "📉"},
    "SH.DYN.MORT":    {"title": "Under-5 Mortality",      "title_en": "Under-5 Mortality Rate",    "category": "Children",   "unit": "per 1,000",  "icon": "🍼"},
}

# ─────────────────────────────────────────────────────────
#  Politician data schema reference
# ─────────────────────────────────────────────────────────

POLITICIAN_SCHEMA: dict = {
    "id":               str,    # e.g. "pol_001"
    "name":             str,
    "name_hi":          str,    # Hindi name
    "state":            str,
    "constituency":     str,
    "party":            str,
    "position":         str,    # "MP (Lok Sabha)", "MP (Rajya Sabha)", "CM", "MLA"
    "house":            str,    # "Lok Sabha" | "Rajya Sabha" | "Legislative Assembly"
    "education":        str,
    "age":              int,
    "assets_cr":        float,  # total declared assets in crores
    "liabilities_cr":   float,
    "criminal_cases":   int,
    "criminal_serious": int,    # cases with 5+ year sentences
    "affidavit_url":    str,    # direct link to ECI affidavit PDF
    "official_source":  str,    # "ECI" | "ADR" | "Lok Sabha"
    "last_updated":     str,    # ISO date string
    "election_year":    int,
    "votes_received":   int,
    "vote_share_pct":   float,
}

# ─────────────────────────────────────────────────────────
#  Logging config
# ─────────────────────────────────────────────────────────

LOG_FORMAT  = "%(asctime)s  %(levelname)-8s  %(name)-20s  %(message)s"
LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"
LOG_LEVEL   = "INFO"   # DEBUG | INFO | WARNING | ERROR

# ─────────────────────────────────────────────────────────
#  Cache TTL (seconds)
# ─────────────────────────────────────────────────────────

CACHE_TTL = {
    "rss":         3600,      # 1 hour
    "worldbank":   86400,     # 24 hours (data updates monthly)
    "government":  3600 * 6,  # 6 hours
    "news":        3600,      # 1 hour
}

# ─────────────────────────────────────────────────────────
#  ID prefixes
# ─────────────────────────────────────────────────────────

ID_PREFIXES = {
    "news":       "n",
    "statistics": "st_wb_",
    "politician": "pol_",
    "story":      "s",
    "timeline":   "tl_",
}
