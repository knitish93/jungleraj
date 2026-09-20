# Contributing to Jungle Raj

Thank you for your interest. Jungle Raj is an open civic project.

## What we welcome

- **Data accuracy corrections** — if you spot incorrect data, open an issue with the correct source
- **New issue records** — add to `data/issues.json` following the schema in `DATA_SCHEMA.md`
- **Translation improvements** — improve Hindi translations in `js/i18n.js`
- **Accessibility fixes** — ARIA labels, keyboard navigation, contrast
- **Bug reports** — clear description + browser + steps to reproduce

## What we do NOT accept

- New features (the feature set is intentionally complete)
- UI redesigns
- Opinionated editorial content
- Any content that assigns blame or makes political claims

## Editorial policy (mandatory)

All contributions must follow:
- Display only publicly documented, sourced facts
- No political claims or editorial judgments
- No labels of "corrupt", "criminal", "responsible" for individuals
- All criminal cases = declared pending cases from ECI affidavits, NOT convictions
- Politicians linked to issues only via office/portfolio, never editorial

## How to contribute data

1. Fork the repository
2. Edit the relevant `data/*.json` file
3. Run `cd tools && python crawler.py validate` to check for errors
4. Open a pull request with source citations for any new data

## Code style

- Vanilla HTML5, CSS3, ES6+
- No external frameworks (Chart.js is the single exception)
- CSS custom properties for all design tokens (never magic numbers)
- All JS in IIFE or module pattern — no global pollution except `jr*` utilities
- Comments in English; user-facing text in Hindi (with English i18n)
