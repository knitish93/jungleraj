# Changelog — Jungle Raj

All significant changes documented here.

## [1.0.0-rc1] — 2026-07-25 — Release Candidate 1

### Added (Phase 1–8 + RC1 polish)

**Phase 1 — Foundation**
- Site architecture, design tokens, navbar, footer, loader, i18n (Hindi + English)

**Phase 2 — Surveys**
- 50 surveys across 17 categories, vote/bookmark/share, Chart.js visualisation

**Phase 3 — Storybook**
- 10 civic stories, page-flip reader, Web Speech API narration, 4 themes, ambient audio

**Phase 4 — Statistics Dashboard**
- 100 national indicators, 18 categories, Chart.js modals, Reality Check section

**Phase 5 — Data Collection Engine**
- Python toolchain: crawler.py, news.py, statistics.py, politicians.py, issues.py, utils.py

**Phase 6 — Politician Transparency Portal**
- 50 politician records, profile modal (6 tabs), compare, charts, Top-20 richest strip

**Phase 7 — Issue Intelligence Portal**
- 25 issues, 68 timeline events, 29 FAQs, 37 official docs, 277 cross-refs
- 10-section details page: timeline, stats, news, surveys, stories, politicians, docs, FAQ

**Phase 8 — Global Search**
- Ctrl+K overlay, 255-record index, bilingual, typo-tolerant, voice (Web Speech API)
- Recent searches (localStorage), trending terms, dedicated search.html

**RC1 — Production Polish**
- PWA: manifest.json, service-worker.js, offline.html
- SEO: canonical, OG, Twitter Cards, JSON-LD structured data, sitemap.xml, robots.txt
- favicon.svg (Ashoka Chakra design)
- Accessibility: skip-to-content, :focus-visible ring, ARIA improvements, noopener links
- Navigation: Issues link added to all navbars
- Responsive: 375px, 1920px breakpoints added
- Scroll-to-top button (all pages)
- i18n: nav.issues added to dictionary
- CSS: --sp-10 added, :focus-visible ring system

### Technical
- 14 HTML pages, 14 CSS files (4,000+ lines), 12 JS files (4,700+ lines), 8 Python tools
- Zero external JS frameworks (Chart.js CDN only)
- All data from public government sources and open datasets

### Editorial commitments
- No political claims anywhere in codebase
- Criminal cases = declared pending cases, NOT convictions
- Politicians linked to issues by office only, never editorial
- All assets marked as self-declared from ECI affidavits
