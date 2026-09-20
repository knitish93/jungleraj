#!/usr/bin/env python3
"""
crawler.py — Jungle Raj Development Data Engine
================================================
Main orchestrator and CLI entry point.

Usage:
    python crawler.py [COMMAND] [OPTIONS]

Commands:
    all           Run all collectors (news + statistics + politicians)
    news          Run news collector only
    stats         Run statistics collector only
    politicians   Run politicians collector only
    health        Check health of all configured sources
    validate      Validate existing JSON files without fetching
    clear-cache   Clear the HTTP response cache

Options:
    --no-cache    Bypass cache for this run
    --dry-run     Collect data but don't write JSON files
    --verbose     Set logging level to DEBUG
    --source ID   Only collect from a specific source ID

Examples:
    python crawler.py all
    python crawler.py news --no-cache
    python crawler.py stats --verbose
    python crawler.py health
    python crawler.py validate
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Ensure tools/ is on sys.path when called from project root
sys.path.insert(0, str(Path(__file__).parent))

from config import CACHE_TTL, OUTPUT_FILES, SOURCES
from news import run_news_collector
from politicians import run_politicians_collector
from sources import health_check_all
from statistics import run_statistics_collector
from utils import (
    DATA_DIR,
    DiskCache,
    RunStats,
    build_session,
    ensure_data_dir,
    find_duplicate_ids,
    iso_now,
    load_json,
    save_json,
    setup_logger,
    validate_schema,
)

log = setup_logger("crawler")

# ─────────────────────────────────────────────────────────
#  ARGUMENT PARSER
# ─────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawler.py",
        description="Jungle Raj — Development Data Collection Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage:")[0].strip(),
    )
    sub = parser.add_subparsers(dest="command", help="Collector to run")

    # Sub-commands
    sub.add_parser("all",          help="Run all collectors")
    sub.add_parser("news",         help="Run news collector only")
    sub.add_parser("stats",        help="Run statistics collector only")
    sub.add_parser("politicians",  help="Run politicians collector only")
    sub.add_parser("health",       help="Check health of all sources")
    sub.add_parser("validate",     help="Validate existing JSON files")
    sub.add_parser("clear-cache",  help="Clear HTTP response cache")

    # Shared options
    for name in ("all", "news", "stats", "politicians"):
        p = sub.choices.get(name)
        if p:
            p.add_argument("--no-cache",  action="store_true", help="Bypass cache")
            p.add_argument("--dry-run",   action="store_true", help="Don't write files")
            p.add_argument("--verbose",   action="store_true", help="Debug logging")
            p.add_argument("--source",    default=None, metavar="ID",
                           help="Only use this source ID")

    return parser


# ─────────────────────────────────────────────────────────
#  COMMANDS
# ─────────────────────────────────────────────────────────

def cmd_all(args: argparse.Namespace) -> None:
    """Run every collector in sequence."""
    session = build_session()
    cache   = DiskCache(ttl=0 if args.no_cache else CACHE_TTL["rss"])
    stats   = RunStats()

    log.info("══════════════════════════════════")
    log.info("  Jungle Raj Data Engine — ALL RUN")
    log.info("  Started: %s", iso_now())
    log.info("══════════════════════════════════")

    ensure_data_dir()

    collectors = [
        ("News",        run_news_collector),
        ("Statistics",  run_statistics_collector),
        ("Politicians", run_politicians_collector),
    ]

    for name, runner in collectors:
        log.info("── %s ──", name)
        t0 = time.time()
        try:
            added = runner(session, cache, stats)
            log.info("%s: %d records in %.1fs", name, added, time.time() - t0)
        except Exception as e:
            log.error("%s collector failed: %s", name, e, exc_info=True)
            stats.bump("errors")

    stats.log(log)
    _print_summary(stats)


def cmd_news(args: argparse.Namespace) -> None:
    session = build_session()
    cache   = DiskCache(ttl=0 if args.no_cache else CACHE_TTL["news"])
    stats   = RunStats()
    ensure_data_dir()
    try:
        added = run_news_collector(session, cache, stats)
        log.info("News: %d records added", added)
    except Exception as e:
        log.error("News collector failed: %s", e, exc_info=True)
    stats.log(log)


def cmd_stats(args: argparse.Namespace) -> None:
    session = build_session()
    cache   = DiskCache(ttl=0 if args.no_cache else CACHE_TTL["worldbank"])
    stats   = RunStats()
    ensure_data_dir()
    try:
        added = run_statistics_collector(session, cache, stats)
        log.info("Statistics: %d records added/updated", added)
    except Exception as e:
        log.error("Statistics collector failed: %s", e, exc_info=True)
    stats.log(log)


def cmd_politicians(args: argparse.Namespace) -> None:
    session = build_session()
    cache   = DiskCache(ttl=0 if args.no_cache else CACHE_TTL["government"])
    stats   = RunStats()
    ensure_data_dir()
    try:
        added = run_politicians_collector(session, cache, stats)
        log.info("Politicians: %d records processed", added)
    except Exception as e:
        log.error("Politicians collector failed: %s", e, exc_info=True)
    stats.log(log)


def cmd_health(_args: argparse.Namespace) -> None:
    """Check reachability of every configured source."""
    session = build_session()
    log.info("Running health check on %d sources...", len(SOURCES))
    results = health_check_all(session)

    ok_count   = sum(1 for r in results if r["ok"])
    fail_count = len(results) - ok_count

    print(f"\n{'Source':<30}  {'Status':>6}  {'Latency':>10}  {'OK'}")
    print("─" * 60)
    for r in sorted(results, key=lambda x: (not x["ok"], x["id"])):
        status = str(r["status"] or "ERR")
        lat    = f"{r['latency_ms']}ms" if r["latency_ms"] else "—"
        ok     = "✅" if r["ok"] else "❌"
        print(f"{r['name']:<30}  {status:>6}  {lat:>10}  {ok}")

    print(f"\n✅ {ok_count} reachable   ❌ {fail_count} unreachable\n")


def cmd_validate(_args: argparse.Namespace) -> None:
    """Validate all JSON data files for schema and duplicate IDs."""
    schemas: dict[str, tuple[set[str], str]] = {
        "news": (
            # Phase 4 news.json uses "date" field; crawler generates "published_date"
            # — accept either via a union check
            {"id", "title", "source", "category"},
            "news.json",
        ),
        "statistics": (
            {"id", "title", "category", "value", "year", "source", "description", "trend"},
            "statistics.json",
        ),
        "politicians": (
            {"id", "name", "state", "party", "position", "official_source"},
            "politicians.json",
        ),
    }

    all_ok = True
    for key, (required, filename) in schemas.items():
        path = OUTPUT_FILES[key]
        if not path.exists():
            log.warning("Missing file: %s", path)
            continue

        data = load_json(path)
        log.info("Validating %s (%d records)...", filename, len(data))

        dupes = find_duplicate_ids(data)
        if dupes:
            log.error("❌ %s — duplicate IDs: %s", filename, dupes[:5])
            all_ok = False
        else:
            log.info("✅ %s — no duplicate IDs", filename)

        valid = validate_schema(data, required)
        dropped = len(data) - len(valid)
        if dropped:
            log.error("❌ %s — %d records failed schema validation", filename, dropped)
            all_ok = False
        else:
            log.info("✅ %s — all records pass schema validation", filename)

        # JSON re-parse sanity
        try:
            raw = path.read_text(encoding="utf-8")
            json.loads(raw)
            log.info("✅ %s — valid JSON", filename)
        except json.JSONDecodeError as e:
            log.error("❌ %s — JSON parse error: %s", filename, e)
            all_ok = False

    if all_ok:
        print("\n✅ All files passed validation.\n")
    else:
        print("\n❌ Some files have issues — see log above.\n")
        sys.exit(1)


def cmd_clear_cache(_args: argparse.Namespace) -> None:
    from config import CACHE_DIR
    from utils import DiskCache
    cache = DiskCache()
    count = cache.clear()
    log.info("Cleared %d cached files from %s", count, CACHE_DIR)
    print(f"Cleared {count} cached files.")


# ─────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────

COMMAND_MAP = {
    "all":          cmd_all,
    "news":         cmd_news,
    "stats":        cmd_stats,
    "politicians":  cmd_politicians,
    "health":       cmd_health,
    "validate":     cmd_validate,
    "clear-cache":  cmd_clear_cache,
}


def main() -> None:
    parser = build_parser()
    args   = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    # Verbose flag (set before first log call)
    if getattr(args, "verbose", False):
        import logging
        logging.getLogger().setLevel(logging.DEBUG)
        for handler in logging.getLogger("crawler").handlers:
            handler.setLevel(logging.DEBUG)

    log.info("Jungle Raj Data Engine — command: %s", args.command)

    fn = COMMAND_MAP.get(args.command)
    if fn:
        fn(args)
    else:
        parser.print_help()
        sys.exit(1)


def _print_summary(stats: RunStats) -> None:
    s = stats.summary()
    print("\n" + "═" * 50)
    print("  Jungle Raj Data Engine — Run Complete")
    print("═" * 50)
    print(f"  ✅  Downloaded : {s['downloaded']}")
    print(f"  ⏭   Skipped    : {s['skipped']}")
    print(f"  ❌  Errors     : {s['errors']}")
    print(f"  ⚠   Warnings   : {s['warnings']}")
    print(f"  ⏱   Elapsed    : {s['elapsed_s']}s")
    print("═" * 50 + "\n")


if __name__ == "__main__":
    main()
