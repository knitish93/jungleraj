# जंगल राज — भारत की आवाज़
### India's Civic Transparency Platform

[![RC1](https://img.shields.io/badge/Release-Candidate_1-c1272d)](https://jungleraj.in)
[![Static](https://img.shields.io/badge/Type-Static_Website-128807)](https://jungleraj.in)
[![PWA](https://img.shields.io/badge/PWA-Ready-ff9933)](https://jungleraj.in)

Jungle Raj is a **100% static, client-side civic transparency portal** for India. It presents publicly available data — on politicians, public issues, government statistics, surveys, news and civic stories — in an accessible, bilingual (Hindi + English) interface.

**No backend. No database. No server-side code. No ads.**

---

## Features

| Module | Description |
|---|---|
| 🏛️ **Politician Transparency Portal** | Declared assets, education, criminal cases from ECI affidavits |
| 🔍 **Issue Intelligence Portal** | 25 issues with timeline, statistics, FAQ, official docs |
| 📊 **Statistics Dashboard** | 100 national indicators from MoSPI, World Bank, RBI |
| 🗳️ **Public Surveys** | 50 surveys on major civic topics |
| 📖 **Storybook** | Civic awareness stories |
| 📰 **News** | Categorised national news |
| 🔎 **Global Search** | Ctrl+K, bilingual, voice, 255 records indexed |

---

## Quick Start

```bash
# Clone or download
git clone https://github.com/your-org/jungleraj.git
cd jungleraj

# Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step required. Open `index.html` in any browser.

---

## Project Structure

```
JungleRaj/
├── index.html              # Homepage
├── favicon.svg             # SVG favicon
├── manifest.json           # PWA manifest
├── service-worker.js       # PWA offline support
├── robots.txt              # SEO crawl rules
├── sitemap.xml             # SEO sitemap
├── offline.html            # Offline fallback page
│
├── css/                    # Stylesheets (14 files)
│   ├── variables.css       # Design tokens
│   ├── base.css            # Reset + utilities
│   ├── components.css      # Shared UI components
│   ├── navbar.css          # Navigation
│   ├── footer.css          # Footer
│   ├── animations.css      # Motion
│   ├── home.css            # Homepage sections
│   ├── politicians.css     # Politician portal
│   ├── issues.css          # Issue portal
│   ├── statistics.css      # Statistics dashboard
│   ├── surveys.css         # Survey module
│   ├── storybook.css       # Storybook reader
│   ├── news.css            # News module
│   ├── search.css          # Global search
│   └── responsive.css      # Breakpoints
│
├── js/                     # JavaScript (12 files, no frameworks)
│   ├── i18n.js             # Hindi/English dictionary
│   ├── api.js              # JSON data loading
│   ├── components.js       # Shared render helpers
│   ├── main.js             # Bootstrap, nav, SW
│   ├── home.js             # Homepage sections
│   ├── politicians.js      # Politician portal engine
│   ├── issues.js           # Issues list engine
│   ├── issue-details.js    # Issue details engine
│   ├── statistics.js       # Statistics dashboard
│   ├── surveys.js          # Survey module
│   ├── storybook.js        # Story reader
│   ├── news.js             # News module
│   └── search.js           # Global search engine
│
├── pages/                  # Inner pages (13 HTML files)
│   ├── issues.html
│   ├── issue-details.html
│   ├── politicians.html
│   ├── statistics.html
│   ├── surveys.html
│   ├── storybook.html
│   ├── news.html
│   ├── search.html
│   ├── about.html
│   ├── contact.html
│   ├── privacy.html
│   ├── disclaimer.html
│   └── 404.html
│
├── data/                   # JSON data files (255 records total)
│   ├── surveys.json        # 50 surveys
│   ├── statistics.json     # 100 statistics
│   ├── stories.json        # 10 stories
│   ├── news.json           # 20 news items
│   ├── politicians.json    # 50 politician records
│   └── issues.json         # 25 issues
│
└── tools/                  # Python data collection engine
    ├── crawler.py          # CLI entry point
    ├── config.py           # Configuration
    ├── news.py             # News collector
    ├── statistics.py       # Statistics collector
    ├── politicians.py      # Politician data builder
    ├── issues.py           # Issues data builder
    ├── sources.py          # Source registry
    └── utils.py            # Shared utilities
```

---

## Updating Data

The website reads from `/data/*.json`. To update:

```bash
cd tools
pip install -r requirements.txt

# Collect fresh news from RSS feeds
python crawler.py news

# Update World Bank statistics
python crawler.py stats

# Validate all JSON files
python crawler.py validate

# Check source health
python crawler.py health
```

See `tools/README.md` for full documentation.

---

## Deployment

See `DEPLOYMENT.md` for GitHub Pages, Netlify and Vercel guides.

---

## Editorial Policy

Jungle Raj presents **only factual, publicly available data**:
- All politician data is from ECI affidavits (self-declared)
- Criminal cases = declared pending cases, NOT convictions
- No political claims or editorial judgments made
- No blame assigned to any individual, party or institution
- Data sourced from official government portals and open datasets

---

## Tech Stack

| Layer | Technology |
|---|---|
| HTML | Semantic HTML5 |
| CSS | Custom properties (no framework) |
| JS | Vanilla ES6+ (no framework) |
| Charts | Chart.js 4.4.4 (CDN) |
| Fonts | Google Fonts (Space Grotesk, Baloo 2, Inter, Hind, JetBrains Mono) |
| Data | Static JSON files |
| Crawler | Python 3.11+ |

---

## License

MIT © Jungle Raj. Data from public government sources.
