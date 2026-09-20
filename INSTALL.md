# Installation & Local Development

## Prerequisites
- Any static file server (no Node.js, no build tools required)
- Python 3.11+ (only needed for the data collection tools in `tools/`)

## 1. Serve the website locally

```bash
# Option A: Python built-in
python3 -m http.server 8000
# → http://localhost:8000

# Option B: Node.js serve
npx serve .
# → http://localhost:3000

# Option C: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

The website fetches JSON from `./data/*.json` via `fetch()`.
It must be served over HTTP (not opened as a local file) so `fetch()` works.

## 2. Set up the Python data tools (optional)

```bash
cd tools
python3 -m venv .venv
source .venv/bin/activate       # macOS/Linux
# .venv\Scripts\activate        # Windows

pip install -r requirements.txt

# Run health check on all sources
python crawler.py health

# Collect fresh news from RSS feeds
python crawler.py news

# Update World Bank statistics
python crawler.py stats

# Validate all JSON
python crawler.py validate
```

## 3. Edit data manually

JSON files live in `data/`. Edit them directly with any text editor.
After saving, reload the browser — the website reads JSON fresh on each page load.

The Python `add_manual_*()` functions in each tool module provide a programmatic API for additions.

## Browser requirements

Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+).
No IE support. Uses: CSS custom properties, ES2020, Intersection Observer, optional Web Speech API.
