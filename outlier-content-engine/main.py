"""
Outlier Content Engine — Main Orchestrator

Loads the active vertical and runs the full pipeline:
  1. Collect competitor posts (Instagram + TikTok)
  2. Collect own-channel posts (for voice learning)
  3. Detect outlier posts (weighted engagement scoring)
  4. Track trending audio across outliers
  5. Detect content series (recurring formats)
  6. Analyze own-channel voice patterns
  7. Analyze outliers + rewrite in brand voice (LLM)
  8. Generate and send/save report (HTML email)

Usage:
  python main.py                          # uses ACTIVE_VERTICAL from .env
  python main.py --vertical Streetwear    # override vertical from CLI
"""

import argparse
import json
import logging
import sqlite3
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import config
from vertical_manager import VerticalManager
from collectors.instagram import (
    init_database, migrate_database, create_collector,
    store_posts, store_own_posts,
)
from collectors.tiktok import create_tiktok_collector
from outlier_detector import OutlierDetector
from analyzer import ContentAnalyzer
from reporter import ReportGenerator
from voice_analyzer import VoiceAnalyzer
from progress_tracker import ProgressTracker


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
        "--vertical", "-v",
        default=None,
        help="Vertical name from database (e.g., Streetwear, Beauty)",
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
    parser.add_argument(
        "--brands",
        default=None,
        help="Comma-separated list of brand handles to collect (subset of vertical)",
    )
    return parser.parse_args()


def with_progress_tracking(func):
    """
    Decorator that wraps run_pipeline with complete progress tracking and error handling.

    Ensures:
    - Progress tracker is initialized
    - progress.start() is called at the right time
    - progress.complete() is called on success
    - progress.error() is called on failure
    - PID file cleanup is guaranteed in all scenarios
    """
    import functools

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger = logging.getLogger("engine")
        progress = ProgressTracker()

        try:
            # Call the original function
            result = func(*args, **kwargs, _progress=progress)

            # If we got here without exception and result doesn't have an error, mark complete
            if not result.get("error"):
                progress.complete()
            else:
                # Function returned an error dict
                progress.error(result["error"])

            return result

        except Exception as e:
            # Unexpected exception occurred
            logger.error(f"Pipeline failed with exception: {e}")
            progress.error(str(e))
            return {"error": str(e)}

        finally:
            # GUARANTEED cleanup: remove PID file no matter what
            if progress.pid_file.exists():
                try:
                    progress.pid_file.unlink()
                except Exception:
                    pass  # Ignore cleanup errors

    return wrapper


def _check_credentials(logger):
    """
    Run a diagnostic check on API credentials at startup.
    Logs clear warnings if credentials are missing so failures aren't silent.
    """
    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        rows = conn.execute("SELECT service, api_key FROM api_credentials").fetchall()
        conn.close()
    except Exception:
        rows = []

    if not rows:
        logger.warning(
            "CREDENTIAL DIAGNOSTIC: api_credentials table is EMPTY. "
            "No API keys stored in database."
        )
    else:
        services = [r[0] for r in rows]
        logger.info(f"Credentials in database: {', '.join(services)}")

    # Check Apify token
    key = config.get_api_key('apify')
    if not key:
        logger.error(
            "CREDENTIAL DIAGNOSTIC: APIFY_API_TOKEN is not set in "
            "database or environment. Collection WILL fail with 0 posts."
        )

    openai_key = config.get_api_key('openai')
    if not openai_key:
        logger.warning(
            "CREDENTIAL DIAGNOSTIC: OPENAI_API_KEY not found. "
            "AI analysis phase will fail."
        )


@with_progress_tracking
def run_pipeline(vertical_name=None, skip_collect=False, no_email=False, brands=None, _progress=None):
    """
    Run the full outlier detection pipeline.

    Can be called from CLI (main()) or from the dashboard.
    Args:
        vertical_name: Database vertical name (e.g., "Streetwear")
        skip_collect: Skip data collection phase
        no_email: Save report locally instead of emailing
        brands: Comma-separated brand handles to collect (subset of vertical)
    Returns a dict with pipeline results.
    """
    logger = logging.getLogger("engine")
    start_time = time.time()

    logger.info("=" * 60)
    logger.info("OUTLIER CONTENT ENGINE")
    logger.info("=" * 60)

    # ── 1. Load Competitors from Database Vertical ──
    ig_competitors = []
    tt_competitors = []
    vertical_display_name = ""
    profile_id = None  # Used for storing posts in database
    profile = None  # Profile object (mock for downstream compatibility)

    if not vertical_name:
        # Fall back to ACTIVE_VERTICAL env var
        vertical_name = config.ACTIVE_VERTICAL
    if not vertical_name:
        logger.error("No vertical specified. Use --vertical <name> or set ACTIVE_VERTICAL env var.")
        return {"error": "No vertical specified"}

    vm = VerticalManager()
    vertical = vm.get_vertical(vertical_name)

    if not vertical:
        logger.error(f"Vertical '{vertical_name}' not found in database")
        return {"error": f"Vertical '{vertical_name}' not found"}

    logger.info(f"Running for vertical: {vertical.name}")
    vertical_display_name = vertical.name
    profile_id = vertical.name  # Use vertical name as profile_id

    # Build competitor lists from vertical brands
    for brand in vertical.brands:
        if brand.instagram_handle:
            ig_competitors.append({
                "name": brand.brand_name or brand.instagram_handle,
                "handle": brand.instagram_handle
            })
        if brand.tiktok_handle:
            tt_competitors.append({
                "name": brand.brand_name or brand.tiktok_handle,
                "handle": brand.tiktok_handle
            })

    logger.info(
        f"Monitoring {len(ig_competitors)} Instagram + "
        f"{len(tt_competitors)} TikTok brands"
    )

    # Create a minimal mock profile for compatibility with downstream code
    from profile_loader import OutlierSettings, ContentTags

    class MockProfile:
        def __init__(self, name, vertical, profile_name):
            self.name = name
            self.vertical = vertical
            self.profile_name = profile_name
            self._vm = VerticalManager()
            self.outlier_settings = OutlierSettings()
            self.follower_count = None
            self.description = None
            self._brand_profile = self._load_brand_profile()

        def _load_brand_profile(self):
            """Load brand profile fields from the config table."""
            bp = {}
            try:
                conn = sqlite3.connect(str(config.DB_PATH))
                for key in ['brand_name', 'brand_category', 'brand_audience',
                            'brand_description', 'brand_tone', 'brand_values',
                            'brand_avoids']:
                    row = conn.execute(
                        "SELECT value FROM config WHERE key = ?", (key,)
                    ).fetchone()
                    bp[key] = row[0] if row and row[0] else ''
                conn.close()
            except Exception:
                pass
            # Use brand_name from profile if set, otherwise fall back to vertical name
            if bp.get('brand_name'):
                self.name = bp['brand_name']
            if bp.get('brand_description'):
                self.description = bp['brand_description']
            return bp

        def get_own_handle(self, platform="instagram"):
            """Read own-brand handle from the config table."""
            try:
                conn = sqlite3.connect(str(config.DB_PATH))
                row = conn.execute(
                    "SELECT value FROM config WHERE key = ?",
                    (f"own_brand_{platform}",)
                ).fetchone()
                conn.close()
                return row[0] if row and row[0] else None
            except Exception:
                return None

        def get_outlier_thresholds(self):
            return self.outlier_settings

        def get_content_tags(self):
            return ContentTags(themes=[], hook_types=[], formats=[])

        def get_competitor_handles(self, platform="instagram"):
            """Load competitors from database vertical."""
            vertical_obj = self._vm.get_vertical(self.vertical)
            if not vertical_obj:
                return []

            results = []
            for brand in vertical_obj.brands:
                if platform == "instagram" and brand.instagram_handle:
                    results.append({
                        "name": brand.brand_name or brand.instagram_handle,
                        "handle": brand.instagram_handle
                    })
                elif platform == "tiktok" and brand.tiktok_handle:
                    results.append({
                        "name": brand.brand_name or brand.tiktok_handle,
                        "handle": brand.tiktok_handle
                    })
                elif platform == "facebook" and getattr(brand, 'facebook_handle', None):
                    results.append({
                        "name": brand.brand_name or brand.facebook_handle,
                        "handle": brand.facebook_handle
                    })
            return results

        def get_voice_prompt(self):
            """Build a rich brand context prompt from the brand profile fields.

            If the user has filled in brand profile fields in Settings, those
            are injected into the system prompt so the AI knows who the brand
            is, its audience, tone, values, and what to avoid.  If social
            handles are set and posts exist, VoiceAnalyzer supplements this
            with patterns learned from real content (injected separately by
            ContentAnalyzer).
            """
            bp = self._brand_profile
            own_handle = self.get_own_handle("instagram")
            parts = []

            # Brand identity header
            brand_label = bp.get('brand_name') or self.vertical
            if own_handle:
                parts.append(f"Brand: {brand_label} (@{own_handle})")
            else:
                parts.append(f"Brand: {brand_label}")

            if bp.get('brand_category'):
                parts.append(f"Category: {bp['brand_category']}")
            else:
                parts.append(f"Vertical: {self.vertical}")

            if bp.get('brand_description'):
                parts.append(f"Description: {bp['brand_description']}")

            if bp.get('brand_audience'):
                parts.append(f"Target audience: {bp['brand_audience']}")

            if bp.get('brand_tone'):
                parts.append(f"Tone & voice: {bp['brand_tone']}")

            if bp.get('brand_values'):
                parts.append(f"Core values: {bp['brand_values']}")

            if bp.get('brand_avoids'):
                parts.append(f"Avoids: {bp['brand_avoids']}")

            # If no brand profile fields are filled, return a minimal prompt
            if not any(bp.get(k) for k in ['brand_name', 'brand_category',
                                            'brand_description', 'brand_audience',
                                            'brand_tone', 'brand_values']):
                if own_handle:
                    return f"You are a content strategist for @{own_handle}, analyzing the {self.vertical} competitive landscape."
                return f"Analyzing content for the {self.vertical} vertical."

            return "\n".join(parts)

    profile = MockProfile(
        name=vertical.name,
        vertical=vertical.name,
        profile_name=vertical.name
    )
    # ── 1b. Filter to specific brands (if --brands was provided) ──
    if brands:
        brand_set = {b.strip().lstrip('@').lower() for b in brands.split(',')}
        ig_competitors = [c for c in ig_competitors if c["handle"].lower() in brand_set]
        tt_competitors = [c for c in tt_competitors if c["handle"].lower() in brand_set]
        logger.info(
            f"Filtered to {len(ig_competitors)} IG + {len(tt_competitors)} TT brands "
            f"(requested: {', '.join(brand_set)})"
        )

    # ── 2. Initialize Database ──
    init_database()
    migrate_database()

    # ── 2a. Credential Diagnostic Check ──
    if not skip_collect:
        _check_credentials(logger)

    # ── 2b. Data Lifecycle Management ──
    if vertical_name:
        from data_lifecycle import DataLifecycleManager
        lifecycle = DataLifecycleManager()

        # Check if we should clear data (new set or >3 days old)
        if lifecycle.should_clear_data(vertical_name):
            lifecycle.clear_vertical_data(vertical_name)
            logger.info("Cleared old data - starting with blank canvas")
        else:
            logger.info("Keeping existing data - will add new outliers incrementally")

        # Always cleanup data older than 3 days
        lifecycle.cleanup_old_data(days=3)

    # Start progress tracking
    total_brands = len(ig_competitors) + len(tt_competitors)
    if _progress:
        _progress.start(
            total_brands_ig=len(ig_competitors),
            total_brands_tt=len(tt_competitors),
            is_cached=skip_collect
        )
        _progress.update(2, "Initializing pipeline...")

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
            logger.error(
                "CREDENTIAL CHECK FAILED: No Apify API token found in database "
                "(api_credentials table) or environment variables."
            )
            logger.info("Tip: Set APIFY_API_TOKEN in .env, "
                         "or add credentials via the dashboard Setup page.")
            logger.info("Continuing with existing data (if any)...")
            run_stats["errors"].append(f"Missing API credentials: {e}")
            skip_collect = True

        if not skip_collect:
            # Health check
            if collector.health_check():
                logger.info("API connection verified.")
            else:
                logger.warning(
                    "API health check failed. Will attempt collection anyway."
                )

            # Thread-safe write lock for SQLite
            _db_write_lock = threading.Lock()
            _completed_count = [0]  # mutable counter for threads

            def _collect_brand(comp_data, coll, prof_id, post_count):
                """Collect posts for a single brand (thread-safe)."""
                handle = comp_data["handle"]
                name = comp_data["name"]
                try:
                    posts = coll.collect_posts(
                        handle=handle,
                        competitor_name=name,
                        count=post_count,
                    )
                    with _db_write_lock:
                        new_count = store_posts(posts, prof_id)
                    return {"handle": handle, "posts": len(posts), "new": new_count, "error": None}
                except Exception as e:
                    return {"handle": handle, "posts": 0, "new": 0, "error": str(e)}

            # Parallel collection with ThreadPoolExecutor (up to 8 concurrent)
            max_workers = min(8, len(ig_competitors)) if ig_competitors else 1
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(
                        _collect_brand, comp, collector, profile_id,
                        config.DEFAULT_POSTS_PER_COMPETITOR,
                    ): comp
                    for comp in ig_competitors
                }

                for future in as_completed(futures):
                    comp = futures[future]
                    result = future.result()
                    _completed_count[0] += 1

                    if result["error"]:
                        run_stats["errors"].append(f"@{result['handle']}: {result['error']}")
                        logger.error(f"  Failed collecting @{result['handle']}: {result['error']}")
                    else:
                        run_stats["posts_collected"] += result["posts"]
                        run_stats["posts_new"] += result["new"]
                        run_stats["competitors_collected"] += 1
                        if result["posts"] == 0:
                            logger.warning(
                                f"  @{result['handle']}: 0 posts returned. "
                                f"Possible causes: handle not found, API error, "
                                f"empty profile, or rate limit."
                            )
                        else:
                            logger.info(
                                f"  @{result['handle']}: {result['posts']} posts "
                                f"({result['new']} new)"
                            )

                    if _progress and total_brands > 0:
                        pct = 5 + int((_completed_count[0] / total_brands) * 60)
                        _progress.update(pct, f"Collected @{result['handle']} ({_completed_count[0]}/{len(ig_competitors)} IG)")

            logger.info(
                f"Instagram collection: {run_stats['posts_collected']} posts "
                f"({run_stats['posts_new']} new) from "
                f"{run_stats['competitors_collected']} competitors"
            )

            if run_stats["posts_collected"] == 0 and ig_competitors:
                logger.error(
                    "ALL Instagram brands returned 0 posts. "
                    "This usually means API credentials are missing or invalid. "
                    "Check: 1) api_credentials table  2) APIFY_API_TOKEN env var  "
                    "3) Test a manual API call to verify your key works."
                )

            # ── 3b. TikTok Collection (parallel) ──
            if tt_competitors:
                logger.info("")
                logger.info("--- TIKTOK COLLECTION PHASE ---")
                try:
                    from collectors.tiktok import create_tiktok_collector
                    tt_collector = create_tiktok_collector()

                    def _collect_tt_brand(comp_data):
                        h, n = comp_data["handle"], comp_data["name"]
                        try:
                            posts = tt_collector.collect_posts(
                                handle=h, competitor_name=n,
                                count=config.DEFAULT_POSTS_PER_COMPETITOR,
                            )
                            with _db_write_lock:
                                nc = store_posts(posts, profile.profile_name)
                            return {"handle": h, "posts": len(posts), "new": nc, "error": None}
                        except Exception as e:
                            return {"handle": h, "posts": 0, "new": 0, "error": str(e)}

                    tt_workers = min(4, len(tt_competitors))
                    with ThreadPoolExecutor(max_workers=tt_workers) as executor:
                        tt_futures = {executor.submit(_collect_tt_brand, c): c for c in tt_competitors}
                        for tt_idx, future in enumerate(as_completed(tt_futures)):
                            result = future.result()
                            _completed_count[0] += 1
                            if result["error"]:
                                run_stats["errors"].append(f"tiktok/@{result['handle']}: {result['error']}")
                                logger.error(f"  Failed TikTok @{result['handle']}: {result['error']}")
                            else:
                                run_stats["posts_collected"] += result["posts"]
                                run_stats["posts_new"] += result["new"]
                                if result["posts"] == 0:
                                    logger.warning(f"  TikTok @{result['handle']}: 0 posts returned (handle not found, API error, or rate limit)")
                                else:
                                    logger.info(f"  @{result['handle']}: {result['posts']} TikTok posts ({result['new']} new)")
                            if _progress and total_brands > 0:
                                pct = 5 + int((_completed_count[0] / total_brands) * 60)
                                _progress.update(pct, f"Collected @{result['handle']} ({tt_idx+1}/{len(tt_competitors)} TT)")
                except ImportError:
                    logger.info(
                        "TikTok collector not available. Skipping."
                    )
                except ValueError as e:
                    logger.error(f"TikTok credentials missing: {e}")
                    run_stats["errors"].append(f"TikTok credentials missing: {e}")
                except Exception as e:
                    logger.error(f"TikTok collection failed: {e}")
                    run_stats["errors"].append(f"TikTok collection failed: {e}")

            # ── 3c. Facebook Collection (parallel) ──
            fb_competitors = profile.get_competitor_handles("facebook") if hasattr(profile, 'get_competitor_handles') else []
            if fb_competitors:
                logger.info("")
                logger.info("--- FACEBOOK COLLECTION PHASE ---")
                try:
                    from collectors.facebook import create_facebook_collector
                    fb_collector = create_facebook_collector()

                    def _collect_fb_brand(comp_data):
                        h, n = comp_data["handle"], comp_data["name"]
                        try:
                            posts = fb_collector.collect_posts(
                                handle=h, competitor_name=n,
                                count=config.DEFAULT_POSTS_PER_COMPETITOR,
                            )
                            with _db_write_lock:
                                nc = store_posts(posts, profile_id)
                            return {"handle": h, "posts": len(posts), "new": nc, "error": None}
                        except Exception as e:
                            return {"handle": h, "posts": 0, "new": 0, "error": str(e)}

                    fb_workers = min(4, len(fb_competitors))
                    with ThreadPoolExecutor(max_workers=fb_workers) as executor:
                        fb_futures = {executor.submit(_collect_fb_brand, c): c for c in fb_competitors}
                        for fb_idx, future in enumerate(as_completed(fb_futures)):
                            result = future.result()
                            _completed_count[0] += 1
                            if result["error"]:
                                run_stats["errors"].append(f"facebook/@{result['handle']}: {result['error']}")
                                logger.error(f"  Failed Facebook @{result['handle']}: {result['error']}")
                            else:
                                run_stats["posts_collected"] += result["posts"]
                                run_stats["posts_new"] += result["new"]
                                logger.info(f"  @{result['handle']}: {result['posts']} Facebook posts ({result['new']} new)")
                            if _progress and total_brands > 0:
                                pct = 5 + int((_completed_count[0] / total_brands) * 60)
                                _progress.update(pct, f"Collected @{result['handle']} ({fb_idx+1}/{len(fb_competitors)} FB)")
                except ImportError:
                    logger.info(
                        "Facebook collector not available. Skipping."
                    )
                except ValueError as e:
                    logger.error(f"Facebook credentials missing: {e}")
                    run_stats["errors"].append(f"Facebook credentials missing: {e}")
                except Exception as e:
                    logger.error(f"Facebook collection failed: {e}")
                    run_stats["errors"].append(f"Facebook collection failed: {e}")

            # ── 3d. Own-Channel Collection ──
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
        if _progress:
            _progress.update(65, "Using cached data, skipping collection...")

    # (Content tagging is now consolidated into the Analysis phase via analyzer.py)

    # ── 4. Detection Phase ──
    logger.info("")
    logger.info("--- DETECTION PHASE ---")
    if _progress:
        _progress.update(68, "Detecting outlier posts...")

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

    # ── 5b. Trend Radar Snapshot ──
    try:
        from trend_radar.collector import TrendRadarCollector
        logger.info("")
        logger.info("--- TREND RADAR SNAPSHOT ---")
        radar_collector = TrendRadarCollector(profile.profile_name)
        radar_result = radar_collector.capture_snapshot()
        logger.info(
            f"Trend Radar: {radar_result['sounds_tracked']} sounds, "
            f"{radar_result['hashtags_tracked']} hashtags tracked"
        )
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"Trend Radar snapshot failed: {e}")

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
    if _progress:
        _progress.update(75, f"Analyzing brand voice ({len(outliers)} outliers found)...")

    voice_data = None
    own_top_captions = []
    own_handle = profile.get_own_handle("instagram")

    if own_handle:
        # Auto-collect own-brand posts if not skipping collection
        if not skip_collect:
            try:
                logger.info(f"  Collecting own-brand posts for @{own_handle}...")
                collector = create_collector()
                own_posts = collector.collect_posts(handle=own_handle, competitor_name=profile.name)
                if own_posts:
                    new_own = store_own_posts(own_posts, profile.profile_name)
                    logger.info(f"  Stored {new_own} new own-brand posts for @{own_handle}")
                else:
                    logger.info(f"  No new own-brand posts found for @{own_handle}")
            except Exception as e:
                logger.warning(f"  Own-brand collection failed: {e}")

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
            "Tip: Set your brand handle in Setup > Your Brand Instagram Handle."
        )

    # ── 7b. Trend Radar Scoring ──
    trend_radar_data = None
    try:
        from trend_radar.scorer import TrendRadarScorer
        trend_radar_data = TrendRadarScorer(profile.profile_name).get_top_trends(limit=10)
        if trend_radar_data:
            logger.info(f"Trend Radar: {len(trend_radar_data)} active trends scored")
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"Trend Radar scoring failed: {e}")

    # ── 8. Analysis Phase ──
    logger.info("")
    logger.info("--- ANALYSIS PHASE ---")
    if _progress:
        _progress.update(82, f"Running AI analysis on {len(outliers)} outliers...")

    analyzer = ContentAnalyzer(
        profile,
        voice_data=voice_data,
        own_top_captions=own_top_captions,
        audio_insights=audio_insights,
        series_data=series_data,
        trend_radar_data=trend_radar_data,
    )
    analysis = analyzer.analyze(outliers, baselines)

    outlier_analyses = analysis.get("outlier_analysis", [])
    adaptations = analysis.get("brand_adaptations", [])
    logger.info(
        f"Analysis complete: {len(outlier_analyses)} analyses, "
        f"{len(adaptations)} brand adaptations"
    )

    # Store per-post AI analysis in database
    if outlier_analyses:
        try:
            conn = sqlite3.connect(str(config.DB_PATH))
            stored_count = 0
            for post_analysis in outlier_analyses:
                post_id = post_analysis.get("post_id")
                if not post_id:
                    continue
                ai_json = json.dumps(post_analysis)
                # Also store content_tags from the AI analysis
                tags_json = json.dumps(post_analysis.get("content_tags", []))
                conn.execute("""
                    UPDATE competitor_posts
                    SET ai_analysis = ?, content_tags = ?
                    WHERE post_id = ? AND brand_profile = ?
                """, (ai_json, tags_json, post_id, profile.profile_name))
                stored_count += 1
            conn.commit()
            conn.close()
            logger.info(f"  Stored AI analysis for {stored_count} posts")
        except Exception as e:
            logger.warning(f"  Failed to store AI analysis: {e}")

    # ── 8b. Trend Snapshot ──
    try:
        from trend_analyzer import TrendAnalyzer
        ta = TrendAnalyzer(profile.profile_name)
        ta.capture_snapshot()
    except Exception as e:
        logger.warning(f"  Trend snapshot failed: {e}")

    # ── 9. Report Phase ──
    logger.info("")
    logger.info("--- REPORT PHASE ---")
    if _progress:
        _progress.update(92, "Generating report...")

    run_stats["duration_seconds"] = round(time.time() - start_time, 1)

    # ── Persist run stats to collection_runs table ──
    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.execute("""
            INSERT INTO collection_runs
                (run_timestamp, profile_name, competitors_collected,
                 posts_collected, posts_new, errors, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now(timezone.utc).isoformat(),
            vertical_name or profile.profile_name,
            run_stats["competitors_collected"],
            run_stats["posts_collected"],
            run_stats["posts_new"],
            json.dumps(run_stats["errors"]),
            run_stats["duration_seconds"],
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to save collection run stats: {e}")

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

    if _progress:
        _progress.update(98, f"Done! {len(outliers)} outliers found.")

    # ── Save Lifecycle Info ──
    if vertical_name:
        from data_lifecycle import DataLifecycleManager
        lifecycle = DataLifecycleManager()
        current_signature = lifecycle.get_competitive_set_signature(vertical_name)
        if current_signature:
            lifecycle.save_analysis_info(
                vertical_name,
                current_signature,
                posts_analyzed=len(outliers)
            )
            logger.info(f"Saved analysis signature for future runs")

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
        vertical_name=args.vertical,
        skip_collect=args.skip_collect,
        no_email=args.no_email,
        brands=args.brands,
    )
    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
