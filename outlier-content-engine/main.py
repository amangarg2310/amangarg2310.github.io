"""
Outlier Content Engine — Main Orchestrator

Loads the active brand profile and runs the full pipeline:
  1. Collect competitor posts (Instagram + TikTok)
  2. Collect own-channel posts (for voice learning)
  3. Detect outlier posts (weighted engagement scoring)
  4. Track trending audio across outliers
  5. Detect content series (recurring formats)
  6. Analyze own-channel voice patterns
  7. Analyze outliers + rewrite in brand voice (LLM)
  8. Generate and send/save report (HTML email)

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
from collectors.instagram import (
    init_database, migrate_database, create_collector,
    store_posts, store_own_posts,
)
from outlier_detector import OutlierDetector
from analyzer import ContentAnalyzer
from reporter import ReportGenerator
from voice_analyzer import VoiceAnalyzer


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


def run_pipeline(profile_name=None, skip_collect=False, no_email=False):
    """
    Run the full outlier detection pipeline.

    Can be called from CLI (main()) or from the dashboard.
    Returns a dict with pipeline results.
    """
    logger = logging.getLogger("engine")
    start_time = time.time()

    # ── 1. Load Brand Profile ──
    profile_name = profile_name or config.ACTIVE_PROFILE
    logger.info("=" * 60)
    logger.info("OUTLIER CONTENT ENGINE")
    logger.info("=" * 60)

    try:
        profile = load_profile(profile_name)
    except (FileNotFoundError, ProfileValidationError) as e:
        logger.error(f"Failed to load profile: {e}")
        return {"error": str(e)}

    logger.info(f"Running for: {profile.name} ({profile.vertical})")
    ig_competitors = profile.get_competitor_handles("instagram")
    tt_competitors = profile.get_competitor_handles("tiktok")
    logger.info(
        f"Monitoring {len(ig_competitors)} Instagram + "
        f"{len(tt_competitors)} TikTok competitors"
    )

    # ── 2. Initialize Database ──
    init_database()
    migrate_database()

    # ── 3. Collection Phase ──
    run_stats = {
        "posts_collected": 0,
        "posts_new": 0,
        "errors": [],
        "competitors_collected": 0,
        "duration_seconds": 0,
    }

    collector = None
    if not skip_collect:
        logger.info("")
        logger.info("--- INSTAGRAM COLLECTION PHASE ---")

        try:
            collector = create_collector()
        except ValueError as e:
            logger.error(f"Cannot create collector: {e}")
            logger.info("Tip: Set RAPIDAPI_KEY or APIFY_API_TOKEN in .env")
            logger.info("Continuing with existing data (if any)...")
            skip_collect = True

        if not skip_collect:
            # Health check
            if collector.health_check():
                logger.info("API connection verified.")
            else:
                logger.warning(
                    "API health check failed. Will attempt collection anyway."
                )

            for comp in ig_competitors:
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
                f"Instagram collection: {run_stats['posts_collected']} posts "
                f"({run_stats['posts_new']} new) from "
                f"{run_stats['competitors_collected']} competitors"
            )

            # ── 3b. TikTok Collection ──
            if tt_competitors:
                logger.info("")
                logger.info("--- TIKTOK COLLECTION PHASE ---")
                try:
                    from collectors.tiktok import create_tiktok_collector
                    tt_collector = create_tiktok_collector()
                    for comp in tt_competitors:
                        handle = comp["handle"]
                        name = comp["name"]
                        try:
                            posts = tt_collector.collect_posts(
                                handle=handle,
                                competitor_name=name,
                                count=config.DEFAULT_POSTS_PER_COMPETITOR,
                            )
                            new_count = store_posts(posts, profile.profile_name)
                            run_stats["posts_collected"] += len(posts)
                            run_stats["posts_new"] += new_count
                            logger.info(
                                f"  @{handle}: {len(posts)} TikTok posts "
                                f"({new_count} new)"
                            )
                        except Exception as e:
                            run_stats["errors"].append(
                                f"tiktok/@{handle}: {str(e)}"
                            )
                            logger.error(
                                f"  Failed TikTok @{handle}: {e}"
                            )
                except ImportError:
                    logger.info(
                        "TikTok collector not available. Skipping."
                    )
                except Exception as e:
                    logger.error(f"TikTok collection failed: {e}")

            # ── 3c. Own-Channel Collection ──
            own_handle = profile.get_own_handle("instagram")
            if own_handle:
                logger.info("")
                logger.info("--- OWN CHANNEL COLLECTION ---")
                try:
                    # Prefer Graph API for own-channel (returns saves/shares)
                    graph_collector = None
                    try:
                        from collectors.instagram_graph import create_graph_collector
                        graph_collector = create_graph_collector()
                    except ImportError:
                        pass

                    if graph_collector and graph_collector.health_check():
                        logger.info(
                            "  Using Instagram Graph API "
                            "(saves + shares available)"
                        )
                        own_posts = graph_collector.collect_posts(
                            handle=own_handle,
                            competitor_name=profile.name,
                            count=config.DEFAULT_POSTS_PER_COMPETITOR,
                        )
                    else:
                        if config.IG_GRAPH_ACCESS_TOKEN:
                            logger.warning(
                                "  Graph API token set but health check "
                                "failed. Falling back to scraper."
                            )
                        else:
                            logger.info(
                                "  Tip: Set IG_GRAPH_ACCESS_TOKEN for "
                                "saves/shares on your own posts"
                            )
                        own_posts = collector.collect_posts(
                            handle=own_handle,
                            competitor_name=profile.name,
                            count=config.DEFAULT_POSTS_PER_COMPETITOR,
                        )

                    own_new = store_own_posts(
                        own_posts, profile.profile_name
                    )
                    logger.info(
                        f"  @{own_handle}: {len(own_posts)} posts "
                        f"({own_new} new)"
                    )
                except Exception as e:
                    logger.error(f"  Own channel collection failed: {e}")

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

    # ── 5. Audio Tracking Phase ──
    audio_insights = None
    try:
        from engine.audio_tracker import AudioTracker
        logger.info("")
        logger.info("--- AUDIO TRACKING PHASE ---")
        audio_tracker = AudioTracker(profile)
        audio_insights = audio_tracker.detect_trending_audio(outliers)
        trending_count = len(audio_insights.get("trending_audio", []))
        logger.info(f"Trending audio detected: {trending_count}")
    except ImportError:
        pass
    except Exception as e:
        logger.error(f"Audio tracking failed: {e}")

    # ── 6. Series Detection Phase ──
    series_data = None
    try:
        from engine.series_detector import SeriesDetector
        logger.info("")
        logger.info("--- SERIES DETECTION PHASE ---")
        series_detector = SeriesDetector(profile)
        series_data = series_detector.detect_series()
        logger.info(f"Content series detected: {len(series_data)}")
    except ImportError:
        pass
    except Exception as e:
        logger.error(f"Series detection failed: {e}")

    # ── 7. Voice Analysis Phase ──
    logger.info("")
    logger.info("--- VOICE ANALYSIS PHASE ---")

    voice_data = None
    own_top_captions = []
    own_handle = profile.get_own_handle("instagram")

    if own_handle:
        va = VoiceAnalyzer(profile)

        # Only re-analyze if we collected new own posts or no analysis exists
        existing = va.load_voice_analysis()
        if not existing or not skip_collect:
            voice_result = va.analyze_voice()
            if voice_result:
                voice_data = voice_result
        else:
            voice_data = existing["voice_data"]
            logger.info(
                f"Using existing voice analysis from "
                f"{existing['analyzed_at'][:10]} "
                f"({existing['source_post_count']} posts)"
            )

        # Get top captions for prompt injection
        top_posts = va.get_top_own_posts(limit=8)
        own_top_captions = [
            p["caption"] for p in top_posts if p.get("caption")
        ]
    else:
        logger.info(
            "No own-channel handle configured. Skipping voice analysis."
        )
        logger.info(
            "Tip: Add own_channel.instagram to your profile YAML."
        )

    # ── 8. Analysis Phase ──
    logger.info("")
    logger.info("--- ANALYSIS PHASE ---")

    analyzer = ContentAnalyzer(
        profile,
        voice_data=voice_data,
        own_top_captions=own_top_captions,
        audio_insights=audio_insights,
        series_data=series_data,
    )
    analysis = analyzer.analyze(outliers, baselines)

    outlier_analyses = analysis.get("outlier_analysis", [])
    adaptations = analysis.get("brand_adaptations", [])
    logger.info(
        f"Analysis complete: {len(outlier_analyses)} analyses, "
        f"{len(adaptations)} brand adaptations"
    )

    # ── 9. Report Phase ──
    logger.info("")
    logger.info("--- REPORT PHASE ---")

    run_stats["duration_seconds"] = round(time.time() - start_time, 1)

    reporter = ReportGenerator(profile)
    html = reporter.generate_report(
        analysis, outliers, baselines, run_stats,
        audio_insights=audio_insights,
        series_data=series_data,
    )

    # Always save a local copy
    local_path = reporter.save_local(html)

    # Send email unless --no-email
    if not no_email:
        sent = reporter.send_email(html)
        if not sent:
            logger.info(f"Email not sent. Report available at: {local_path}")
    else:
        logger.info(f"Email skipped. Report at: {local_path}")

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

    return {
        "profile": profile.profile_name,
        "outliers_count": len(outliers),
        "adaptations_count": len(adaptations),
        "posts_collected": run_stats["posts_collected"],
        "posts_new": run_stats["posts_new"],
        "errors": run_stats["errors"],
        "duration": duration,
        "report_path": str(local_path),
        "voice_active": voice_data is not None,
        "audio_insights": audio_insights,
        "series_count": len(series_data) if series_data else 0,
    }


def main():
    setup_logging()
    args = parse_args()
    result = run_pipeline(
        profile_name=args.profile,
        skip_collect=args.skip_collect,
        no_email=args.no_email,
    )
    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
