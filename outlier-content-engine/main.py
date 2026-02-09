"""
Outlier Content Engine — Main Orchestrator

Loads the active brand profile and runs the full pipeline:
  1. Collect competitor posts (Instagram)
  2. Detect outlier posts (statistical analysis)
  3. Analyze outliers + rewrite in brand voice (LLM)
  4. Generate and send/save report (HTML email)

Usage:
  python main.py                    # uses ACTIVE_PROFILE from .env
  python main.py --profile heritage # override profile from CLI
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone

import config
from profile_loader import load_profile, ProfileValidationError
from collectors.instagram import init_database, create_collector, store_posts
from outlier_detector import OutlierDetector
from analyzer import ContentAnalyzer
from reporter import ReportGenerator


def setup_logging():
    """Configure console logging with timestamps."""
    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_args():
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(
        description="Outlier Content Engine — Competitor Intelligence Platform"
    )
    parser.add_argument(
        "--profile", "-p",
        default=None,
        help="Brand profile name (overrides ACTIVE_PROFILE in .env)",
    )
    parser.add_argument(
        "--skip-collect",
        action="store_true",
        help="Skip data collection, run analysis on existing data",
    )
    parser.add_argument(
        "--no-email",
        action="store_true",
        help="Don't send email, save report locally instead",
    )
    return parser.parse_args()


def main():
    setup_logging()
    logger = logging.getLogger("engine")
    args = parse_args()
    start_time = time.time()

    # ── 1. Load Brand Profile ──
    profile_name = args.profile or config.ACTIVE_PROFILE
    logger.info("=" * 60)
    logger.info("OUTLIER CONTENT ENGINE")
    logger.info("=" * 60)

    try:
        profile = load_profile(profile_name)
    except (FileNotFoundError, ProfileValidationError) as e:
        logger.error(f"Failed to load profile: {e}")
        sys.exit(1)

    logger.info(
        f"Running for: {profile.name} ({profile.vertical})"
    )
    competitors = profile.get_competitor_handles("instagram")
    logger.info(
        f"Monitoring {len(competitors)} competitors: "
        + ", ".join(c["name"] for c in competitors)
    )

    # ── 2. Initialize Database ──
    init_database()

    # ── 3. Collection Phase ──
    run_stats = {
        "posts_collected": 0,
        "posts_new": 0,
        "errors": [],
        "competitors_collected": 0,
        "duration_seconds": 0,
    }

    if not args.skip_collect:
        logger.info("")
        logger.info("--- COLLECTION PHASE ---")

        try:
            collector = create_collector()
        except ValueError as e:
            logger.error(f"Cannot create collector: {e}")
            logger.info("Tip: Set RAPIDAPI_KEY or APIFY_API_TOKEN in .env")
            logger.info("Continuing with existing data (if any)...")
            args.skip_collect = True

        if not args.skip_collect:
            # Health check
            if collector.health_check():
                logger.info("API connection verified.")
            else:
                logger.warning(
                    "API health check failed. Will attempt collection anyway."
                )

            for comp in competitors:
                handle = comp["handle"]
                name = comp["name"]

                try:
                    posts = collector.collect_posts(
                        handle=handle,
                        competitor_name=name,
                        count=config.DEFAULT_POSTS_PER_COMPETITOR,
                    )
                    new_count = store_posts(posts, profile.profile_name)
                    run_stats["posts_collected"] += len(posts)
                    run_stats["posts_new"] += new_count
                    run_stats["competitors_collected"] += 1

                    logger.info(
                        f"  @{handle}: {len(posts)} posts "
                        f"({new_count} new)"
                    )
                except Exception as e:
                    error_msg = f"@{handle}: {str(e)}"
                    run_stats["errors"].append(error_msg)
                    logger.error(f"  Failed collecting {error_msg}")

            logger.info(
                f"Collection complete: {run_stats['posts_collected']} posts "
                f"({run_stats['posts_new']} new) from "
                f"{run_stats['competitors_collected']} competitors"
            )
    else:
        logger.info("Skipping collection (--skip-collect)")

    # ── 4. Detection Phase ──
    logger.info("")
    logger.info("--- DETECTION PHASE ---")

    detector = OutlierDetector(profile)
    outliers, baselines = detector.detect()

    if not outliers:
        logger.info(
            "No outliers detected. This is normal if:\n"
            "  - This is the first run (still building baselines)\n"
            "  - No posts exceeded the configured thresholds\n"
            "  - Not enough data points yet (need 3+ posts per competitor)"
        )

    # ── 5. Analysis Phase ──
    logger.info("")
    logger.info("--- ANALYSIS PHASE ---")

    analyzer = ContentAnalyzer(profile)
    analysis = analyzer.analyze(outliers, baselines)

    outlier_analyses = analysis.get("outlier_analysis", [])
    adaptations = analysis.get("brand_adaptations", [])
    logger.info(
        f"Analysis complete: {len(outlier_analyses)} analyses, "
        f"{len(adaptations)} brand adaptations"
    )

    # ── 6. Report Phase ──
    logger.info("")
    logger.info("--- REPORT PHASE ---")

    run_stats["duration_seconds"] = round(time.time() - start_time, 1)

    reporter = ReportGenerator(profile)
    html = reporter.generate_report(analysis, outliers, baselines, run_stats)

    # Always save a local copy
    local_path = reporter.save_local(html)

    # Send email unless --no-email
    if not args.no_email:
        sent = reporter.send_email(html)
        if not sent:
            logger.info(f"Email not sent. Report available at: {local_path}")
    else:
        logger.info(f"Email skipped (--no-email). Report at: {local_path}")

    # ── Done ──
    duration = time.time() - start_time
    logger.info("")
    logger.info("=" * 60)
    logger.info(
        f"Pipeline complete in {duration:.1f}s | "
        f"Profile: {profile.profile_name} | "
        f"Outliers: {len(outliers)} | "
        f"Errors: {len(run_stats['errors'])}"
    )
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
