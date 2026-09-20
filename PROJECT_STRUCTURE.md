# Project Structure — Jungle Raj

## Architecture: Pure Static Website

```
                    Browser
                       │
                  index.html
                       │
           ┌──────────┼──────────┐
           │          │          │
         CSS         JS        JSON
     (14 files)  (12 files)  (6 files)
           │          │          │
        Styles    Fetch +      Data
                  Render       Files
```

There is **no server-side rendering**, **no API**, and **no build pipeline**.
The browser fetches JSON from `./data/*.json` and renders everything client-side.

---

## CSS Architecture

Layer order (cascade):
1. `variables.css` — design tokens (imported first everywhere)
2. `base.css` — reset, typography, utilities, scroll-top, skip-link
3. `components.css` — shared UI: card, badge, chip, btn, modal, toast
4. `navbar.css` — navigation bar
5. `footer.css` — footer
6. `animations.css` — keyframes, scroll-reveal
7. `[page].css` — page-specific: home, politicians, issues, statistics, surveys, storybook, news, search
8. `responsive.css` — breakpoints (320px → 1920px), focus-visible ring, print

Naming: BEM-lite (`block-element`, `--modifier`), with CSS custom property scoping.

---

## JavaScript Architecture

No frameworks. Each module is an IIFE or standalone function set.

Global utilities (all `js/` functions prefixed with `jr*`):
- `jrLoadData(file)` — fetch JSON, path-aware for root vs /pages/
- `jrMinDelay(promise, ms)` — UX minimum load time
- `jrEscape(str)` — XSS-safe HTML encoding
- `jrToast(msg)` — notification
- `jrT(key)` — i18n translation
- `jrGetLang()` — current language ('hi' | 'en')
- `jrIcon(name, size)` — SVG icon
- `jrSkeletonCards(count)` — loading skeleton HTML
- `jrEmptyState({})` — empty/no-results HTML

Module pattern: `const ModuleName = (() => { /* ... */ return { init }; })();`

---

## Data Flow

```
Python tools (dev time)          Browser (runtime)
        │                              │
        ▼                              │
  crawler.py                     jrLoadData()
        │                              │
        ├── news.py    → news.json ────┤
        ├── statistics.py → stats.json ┤
        ├── politicians.py → pol.json ─┤─→ JS renders UI
        ├── issues.py  → issues.json ──┤
        └── (manual)  → surveys.json ──┘
                       → stories.json
```

---

## URL Structure

| URL | Page |
|---|---|
| `/` | Homepage (index.html) |
| `/pages/issues.html` | Issues list |
| `/pages/issue-details.html?id=iss_001` | Single issue |
| `/pages/politicians.html` | Politician directory |
| `/pages/statistics.html` | Statistics dashboard |
| `/pages/surveys.html` | Surveys |
| `/pages/storybook.html` | Story reader |
| `/pages/news.html` | News |
| `/pages/search.html?q=education` | Search (shareable) |
| `/pages/about.html` | About |
| `/pages/404.html` | 404 error |

---

## PWA Architecture

```
Service Worker (service-worker.js)
       │
       ├── Shell cache (CSS, JS, HTML) → Cache-first strategy
       ├── Data cache (data/*.json)    → Network-first strategy
       └── CDN assets (fonts, Chart)   → Cache-first strategy

Offline page: /offline.html (always cached on install)
```
