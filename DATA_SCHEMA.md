# Data Schema — Jungle Raj

All website data lives in `/data/*.json`. The Python tools in `/tools/` generate and validate these files. The website reads them via `fetch()` — no backend required.

---

## surveys.json (50 records)

```jsonc
{
  "id":           "s001",           // Unique, sequential (s001–s050)
  "type":         "binary",         // binary | rating | multiple | mcq | ranking | slider
  "category":     "Fuel",           // See CATEGORIES below
  "title":        "क्या पेट्रोल…",  // Hindi question
  "title_en":     "Should petrol…", // English question
  "description":  "…",
  "description_en":"…",
  "options":      [{ "id": "yes", "text": "हाँ", "text_en": "Yes" }],
  "totalResponses": 45241,          // Seed + live votes
  "results":      { "yes": 38452, "no": 6789 },
  "tags":         ["petrol", "fuel"],
  "featured":     false,
  "createdAt":    "2024-01-01"
}
```

## statistics.json (100 records)

```jsonc
{
  "id":           "ec001",          // Category prefix + seq number
  "title":        "GDP वृद्धि दर",
  "title_en":     "GDP Growth Rate",
  "category":     "Economy",
  "value":        "8.2%",           // Display string
  "unit":         "%",
  "year":         2024,
  "trend":        "up",             // up | down | stable
  "trendPct":     1.2,
  "prevValue":    "7.0%",
  "description":  "…",
  "description_en":"…",
  "source":       "World Bank",
  "source_url":   "https://…",
  "last_updated": "2024-06-01",
  "history":      [{ "year": 2020, "value": 7.1 }],
  "icon":         "📈",
  "color":        "#ff9933",
  "related_story":   null,
  "related_survey":  "s003"
}
```

## politicians.json (50 records)

```jsonc
{
  "id":               "pol_001",
  "name":             "Vikram Pratap (Demo)",
  "name_hi":          "विक्रम प्रताप (डेमो)",
  "name_en":          "Vikram Pratap (Demo)",
  "gender":           "Male",        // Male | Female | Other
  "dob":              "1950-09-17",  // YYYY-MM-DD
  "age":              74,
  "state":            "Gujarat",
  "district":         "Vadodara",
  "constituency":     "Vadodara",
  "party":            "Bharatiya Jan Party",
  "position":         "Prime Minister",
  "house":            "Lok Sabha",
  "cabinet":          "Cabinet",
  "ministry":         "Prime Minister's Office",
  "education":        "B.A., M.A., LL.B",
  "qualification":    "Postgraduate", // Doctorate|Postgraduate|Graduate|Below Graduate
  "profession":       "Lawyer / Politician",
  "assets_cr":        42.8,          // ₹ crore, self-declared ECI affidavit
  "movable_cr":       18.4,
  "immovable_cr":     24.4,
  "liabilities_cr":   0.0,
  "criminal_cases":   0,             // DECLARED PENDING CASES — NOT convictions
  "criminal_serious": 0,
  "affidavit_url":    "https://affidavit.eci.gov.in/",
  "official_url":     "https://pmo.gov.in",
  "wikipedia_url":    "https://en.wikipedia.org/",
  "parliament_url":   "https://sansad.in/",
  "official_source":  "ECI (Demo)",
  "election_year":    2024,
  "votes_received":   720000,
  "vote_share_pct":   52.4,
  "prev_positions":   ["Chief Minister of Gujarat (2001–2014)"],
  "tags":             ["PM", "Gujarat"],
  "last_updated":     "2024-06-15",
  "_demo":            true           // Remove when replacing with real data
}
```

## issues.json (25 records)

```jsonc
{
  "id":           "iss_001",
  "title":        "Government Exam Paper Leaks",
  "title_hi":     "सरकारी परीक्षाओं में पेपर लीक",
  "category":     "Education",
  "slug":         "paper-leak",      // URL-safe, unique
  "summary":      "…",              // English (200–400 chars)
  "summary_hi":   "…",              // Hindi
  "status":       "Active",          // Active|Resolved|Under Review|Dormant
  "priority":     "High",            // Critical|High|Medium|Low
  "severity":     "Critical",
  "featured":     true,
  "trending":     true,
  "icon":         "📝",
  "color":        "#c1272d",
  "last_updated": "2024-06-25",
  "timeline": [
    { "year": 2024, "month": "Jun", "event": "…", "description": "…", "reference": "…" }
  ],
  "related_statistics":  ["ed004", "ed001"],  // IDs from statistics.json
  "related_news":        ["n003"],             // IDs from news.json
  "related_surveys":     ["s005", "s006"],     // IDs from surveys.json
  "related_stories":     ["st006"],            // IDs from stories.json
  "related_politicians": ["pol_010"],          // IDs from politicians.json
  "official_documents": [
    { "type": "Parliament Act", "title": "…", "url": "https://…", "date": "2024-06" }
  ],
  "faq": [
    { "q": "…", "q_hi": "…", "a": "…", "a_hi": "…" }
  ],
  "related_issues": ["iss_002", "iss_003"],   // IDs from issues.json
  "keywords": ["paper leak", "neet", "exam"]
}
```

## news.json (20 records)

```jsonc
{
  "id":           "n001",
  "title":        "GDP वृद्धि…",
  "title_en":     "GDP Growth…",
  "category":     "Economy",
  "source":       "PIB",
  "date":         "2024-05-31",
  "summary":      "…",
  "summary_en":   "…",
  "url":          "https://…",
  "icon":         "📈",
  "featured":     false,
  "tags":         ["gdp", "economy"]
}
```

## stories.json (10 records)

```jsonc
{
  "id":           "st001",
  "title":        "सपनों का शहर",
  "title_en":     "City of Dreams",
  "subtitle":     "…",
  "subtitle_en":  "…",
  "author":       "जंगल राज लेखक समूह",
  "readingTime":  5,               // minutes
  "coverEmoji":   "🏙️",
  "theme":        "Migration",
  "pages": [{ "title": "…", "content": "…", "image": "🏢" }]
}
```

---

## Category Reference

All modules share these categories:
`Economy` · `Tax` · `Education` · `Healthcare` · `Employment` · `Agriculture` · `Crime` · `Judiciary` · `Infrastructure` · `Technology` · `Environment` · `Women's Safety` · `Children` · `Politics` · `Fuel` · `National` · `Migration` · `Population`

---

## Document Types (official_documents)

`Parliament Act` · `Supreme Court` · `Government Report` · `Policy Document` · `Parliament Questions` · `Committee Report` · `White Paper`
