"""
Dashboard — web UI for the Outlier Content Engine.

Provides a non-technical interface for:
  - Viewing outlier posts and reports
  - Managing competitors (add/remove)
  - Editing brand voice settings
  - Adjusting outlier detection thresholds
  - Running the engine pipeline
  - Switching between brand profiles

Usage:
    python dashboard.py                  # runs on http://localhost:5000
    python dashboard.py --port 8080      # custom port
"""

import argparse
import json
import logging
import os
import sqlite3
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml
from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, send_file, Response, session,
)
from markupsafe import Markup

import config
from auth import login_required, is_auth_enabled, get_current_user, build_google_auth_url, exchange_code_for_user, upsert_user, is_email_allowed
from profile_loader import load_profile

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY") or os.urandom(32).hex()

logger = logging.getLogger(__name__)


# ── Template Filters ──

@app.template_filter('timeago')
def timeago_filter(timestamp_str):
    """Convert timestamp to relative time (e.g., '3 days ago')."""
    if not timestamp_str:
        return ""

    try:
        # Parse timestamp (handles both ISO format and SQLite datetime format)
        if isinstance(timestamp_str, str):
            # Try parsing with timezone info first
            try:
                post_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                # Fallback to assuming UTC if no timezone
                post_time = datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)
        else:
            post_time = timestamp_str

        # Ensure post_time has timezone info
        if post_time.tzinfo is None:
            post_time = post_time.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        diff = now - post_time

        seconds = diff.total_seconds()

        if seconds < 60:
            return "just now"
        elif seconds < 3600:
            minutes = int(seconds / 60)
            return f"{minutes}m ago"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"{hours}h ago"
        elif seconds < 604800:  # 7 days
            days = int(seconds / 86400)
            return f"{days}d ago"
        elif seconds < 2592000:  # 30 days
            weeks = int(seconds / 604800)
            return f"{weeks}w ago"
        elif seconds < 31536000:  # 365 days
            months = int(seconds / 2592000)
            return f"{months}mo ago"
        else:
            years = int(seconds / 31536000)
            return f"{years}y ago"
    except Exception as e:
        logger.debug(f"Error parsing timestamp '{timestamp_str}': {e}")
        return ""


@app.template_filter('md_bold')
def md_bold_filter(text):
    """Convert **bold** markdown to <strong> tags for safe HTML rendering."""
    import re
    if not text or '**' not in str(text):
        return text
    return Markup(re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', str(text)))


# ── Helpers ──

def get_available_profiles():
    """List all available brand profile names."""
    profiles = []
    for f in config.PROFILES_DIR.glob("*.yaml"):
        if f.stem != "_template":
            profiles.append(f.stem)
    return sorted(profiles)


def get_available_verticals():
    """List all available vertical names."""
    from vertical_manager import VerticalManager
    vm = VerticalManager()
    return vm.list_verticals()


def get_active_vertical_name():
    """Get the active vertical name from session or first available.

    Uses Flask session for persistence across server restarts.
    Falls back to in-memory app state, then first available vertical.
    """
    # In-memory state (set by chat handler within this process)
    if hasattr(app, '_active_vertical') and app._active_vertical:
        session['active_vertical'] = app._active_vertical
        session.modified = True
        return app._active_vertical

    # Session state (survives server restarts via cookie)
    if session.get('active_vertical'):
        app._active_vertical = session['active_vertical']
        return session['active_vertical']

    # Fall back to first available vertical
    verticals = get_available_verticals()
    if verticals:
        app._active_vertical = verticals[0]
        session['active_vertical'] = verticals[0]
        session.modified = True
        return verticals[0]

    return None


def needs_setup():
    """Check if API keys are configured."""
    if not config.DB_PATH.exists():
        return True

    conn = None
    try:
        conn = get_db()
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM api_credentials WHERE service IN ('apify', 'openai') AND api_key IS NOT NULL AND api_key != ''"
        ).fetchone()
        return row['cnt'] < 2  # Need both keys
    except sqlite3.OperationalError:
        return True  # Table missing or DB not ready
    finally:
        if conn:
            conn.close()


def get_active_profile_name():
    """Get the active profile name from session or env."""
    return getattr(app, '_active_profile', config.ACTIVE_PROFILE)


def get_profile():
    """Load the active brand profile."""
    return load_profile(get_active_profile_name())


def get_profile_data():
    """Load raw YAML data for the active profile (for editing)."""
    profile_name = get_active_profile_name()
    yaml_path = config.PROFILES_DIR / f"{profile_name}.yaml"
    with open(yaml_path, "r") as f:
        return yaml.safe_load(f)


def save_profile_data(data):
    """Write updated profile data back to YAML."""
    profile_name = get_active_profile_name()
    yaml_path = config.PROFILES_DIR / f"{profile_name}.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True,
                  sort_keys=False)


def get_db():
    """Get a SQLite connection with WAL mode for concurrent read/write."""
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def get_dashboard_stats():
    """Get overview stats for the dashboard."""
    stats = {
        "total_posts": 0,
        "total_outliers": 0,
        "competitors": 0,
        "reports": 0,
    }

    profile_name = get_active_profile_name()

    try:
        profile = get_profile()
        stats["competitors"] = len(profile.competitors)
    except (FileNotFoundError, AttributeError):
        pass  # Profile not configured yet

    if config.DB_PATH.exists():
        try:
            conn = get_db()
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM competitor_posts WHERE brand_profile = ?",
                (profile_name,)
            ).fetchone()
            stats["total_posts"] = row["cnt"] if row else 0

            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM competitor_posts WHERE brand_profile = ? AND is_outlier = 1",
                (profile_name,)
            ).fetchone()
            stats["total_outliers"] = row["cnt"] if row else 0
            conn.close()
        except sqlite3.OperationalError:
            pass  # Tables may not exist yet

    # Count report files
    report_files = list(config.DATA_DIR.glob(f"report_{profile_name}_*.html"))
    stats["reports"] = len(report_files)

    return stats


def get_recent_runs(limit=10):
    """Get recent collection runs from the database."""
    if not config.DB_PATH.exists():
        return []

    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT run_timestamp, posts_collected, posts_new, errors, duration_seconds
            FROM collection_runs
            WHERE profile_name = ?
            ORDER BY run_timestamp DESC
            LIMIT ?
        """, (get_active_profile_name(), limit)).fetchall()
        conn.close()

        runs = []
        for row in rows:
            errors = row["errors"] or "[]"
            try:
                error_list = json.loads(errors)
                error_count = len(error_list)
            except (json.JSONDecodeError, TypeError):
                error_count = 0

            runs.append({
                "run_timestamp": row["run_timestamp"][:19].replace("T", " "),
                "posts_collected": row["posts_collected"],
                "posts_new": row["posts_new"],
                "errors": errors,
                "error_count": error_count,
                "duration_seconds": round(row["duration_seconds"] or 0, 1),
            })
        return runs
    except sqlite3.OperationalError:
        return []  # Table doesn't exist yet


def get_outlier_posts(competitor=None, platform=None, sort_by="score", vertical_name=None, timeframe=None, tag=None):
    """Fetch outlier posts from the database."""
    if not config.DB_PATH.exists():
        return []

    brand_profile = vertical_name or get_active_vertical_name()
    if not brand_profile:
        return []

    try:
        conn = get_db()

        query = """
            SELECT post_id, competitor_name, competitor_handle, platform,
                   caption, media_type, media_url, posted_at, likes, comments,
                   saves, shares, views, outlier_score, content_tags,
                   weighted_engagement_score, primary_engagement_driver,
                   audio_id, audio_name, ai_analysis
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1 AND COALESCE(archived, 0) = 0
        """
        params = [brand_profile]

        if competitor:
            query += " AND competitor_handle = ?"
            params.append(competitor)

        if platform:
            query += " AND platform = ?"
            params.append(platform)

        # Timeframe filter: use collected_at (when post was scraped) to match
        # the outlier detector's window logic (which also uses collected_at).
        # posted_at (Instagram publish date) is often NULL or months old,
        # which would filter out valid outliers that were just collected.
        if timeframe:
            timeframe_days_map = {
                "30d": 30,
                "3mo": 90,
            }
            if timeframe in timeframe_days_map:
                days = timeframe_days_map[timeframe]
                query += " AND collected_at >= datetime('now', ?)"
                params.append(f'-{days} days')

        if tag:
            query += " AND content_tags LIKE ?"
            params.append(f'%"{tag}"%')

        sort_map = {
            "score": "outlier_score DESC",
            "likes": "likes DESC",
            "comments": "comments DESC",
            "saves": "COALESCE(saves, 0) DESC",
            "shares": "COALESCE(shares, 0) DESC",
            "weighted": "COALESCE(weighted_engagement_score, 0) DESC",
            "date": "posted_at DESC",
        }
        query += f" ORDER BY {sort_map.get(sort_by, 'outlier_score DESC')}"
        query += " LIMIT 50"

        rows = conn.execute(query, params).fetchall()
        conn.close()

        outliers = []
        for row in rows:
            # Parse content tags
            tags = []
            if row["content_tags"]:
                try:
                    tags = json.loads(row["content_tags"])
                except (json.JSONDecodeError, TypeError):
                    pass

            score = row["outlier_score"] or 0
            weighted = row["weighted_engagement_score"] or 0
            # Treat -1 as missing data (Instagram hidden counts)
            likes = row["likes"] if row["likes"] and row["likes"] > 0 else 0
            comments = row["comments"] if row["comments"] and row["comments"] > 0 else 0
            saves = row["saves"] if row["saves"] and row["saves"] > 0 else 0
            shares = row["shares"] if row["shares"] and row["shares"] > 0 else 0
            views = row["views"] if row["views"] and row["views"] > 0 else 0
            total_eng = likes + comments + saves + shares

            # Compute engagement score as 0-100 for the circular widget
            # Map outlier_score (typically 1-20+) to 0-100 range
            engagement_score_pct = min(100, round(score * 10)) if score else 0

            platform = row["platform"] or "instagram"

            # Build correct post URL per platform
            if platform == "tiktok":
                post_url = f"https://www.tiktok.com/@{row['competitor_handle']}/video/{row['post_id']}"
            elif platform == "facebook":
                post_url = f"https://www.facebook.com/{row['competitor_handle']}/posts/{row['post_id']}"
            else:
                post_url = f"https://www.instagram.com/p/{row['post_id']}/"

            # Data quality: which metrics are actually populated
            has_saves = saves > 0 or row["saves"] is not None
            has_shares = shares > 0 or row["shares"] is not None
            has_views = views > 0 or row["views"] is not None

            # Parse AI analysis if available
            ai_analysis = None
            try:
                ai_raw = row["ai_analysis"]
                if ai_raw:
                    ai_analysis = json.loads(ai_raw)
            except (json.JSONDecodeError, TypeError, IndexError, KeyError):
                pass

            outliers.append({
                "post_id": row["post_id"],
                "competitor_name": row["competitor_name"],
                "competitor_handle": row["competitor_handle"],
                "platform": platform,
                "caption": row["caption"] or "",
                "media_type": row["media_type"] or "image",
                "media_url": row["media_url"] or "",
                "posted_at": row["posted_at"] or "",
                "likes": likes,
                "comments": comments,
                "saves": saves,
                "shares": shares,
                "views": views,
                "total_engagement": total_eng,
                "outlier_score": round(score, 2),
                "weighted_engagement": round(weighted, 0),
                "primary_driver": row["primary_engagement_driver"] or "",
                "engagement_score_pct": engagement_score_pct,
                "engagement_multiplier": round(score / 0.6, 1) if score else 0,
                "audio_name": row["audio_name"] or "",
                "content_tags": tags,
                "post_url": post_url,
                "has_saves": has_saves,
                "has_shares": has_shares,
                "has_views": has_views,
                "ai_analysis": ai_analysis,
            })

        return outliers
    except Exception as e:
        logger.error(f"Error fetching outliers: {e}")
        return []


def get_competitor_baselines(vertical_name=None, timeframe="30d"):
    """Compute per-brand baseline engagement metrics for the active vertical.

    Returns a list of dicts sorted by mean_engagement descending:
        [{handle, name, post_count, mean_likes, mean_comments,
          mean_engagement, outlier_count}]
    """
    if not config.DB_PATH.exists():
        return []

    brand_profile = vertical_name or get_active_vertical_name()
    if not brand_profile:
        return []

    # Map timeframe to lookback days
    days_map = {"30d": 30, "3mo": 90}
    lookback = days_map.get(timeframe, 30)

    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT competitor_handle,
                   competitor_name,
                   COUNT(*) as post_count,
                   ROUND(AVG(COALESCE(likes, 0))) as mean_likes,
                   ROUND(AVG(COALESCE(comments, 0))) as mean_comments,
                   ROUND(AVG(
                       COALESCE(likes, 0) + COALESCE(comments, 0) +
                       COALESCE(saves, 0) + COALESCE(shares, 0)
                   )) as mean_engagement,
                   SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) as outlier_count
            FROM competitor_posts
            WHERE brand_profile = ?
              AND COALESCE(is_own_channel, 0) = 0
              AND COALESCE(archived, 0) = 0
              AND collected_at >= datetime('now', ?)
            GROUP BY competitor_handle
            ORDER BY mean_engagement DESC
        """, (brand_profile, f'-{lookback} days')).fetchall()
        conn.close()

        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching baselines: {e}")
        return []


def get_analyzed_brands_with_data(vertical_name):
    """Get list of brands from vertical that have actual posts/outliers in database.

    This filters the vertical's brand list to show only brands that were analyzed
    (i.e., have posts in the database), which is useful when user analyzes a subset.

    Returns: List of Brand objects that have data in the database.
    """
    if not vertical_name:
        return []

    try:
        from vertical_manager import VerticalManager
        vm = VerticalManager()
        vertical = vm.get_vertical(vertical_name)

        if not vertical:
            return []

        # Query database to get handles that actually have posts
        conn = get_db()
        rows = conn.execute("""
            SELECT DISTINCT competitor_handle
            FROM competitor_posts
            WHERE brand_profile = ?
        """, (vertical_name,)).fetchall()
        conn.close()

        # Build set of handles with data
        handles_with_data = {row["competitor_handle"] for row in rows}

        # Filter vertical brands to only include those with data
        filtered_brands = [
            brand for brand in vertical.brands
            if (brand.instagram_handle in handles_with_data or
                brand.tiktok_handle in handles_with_data)
        ]

        return filtered_brands
    except Exception as e:
        logger.error(f"Error getting analyzed brands: {e}")
        # Fallback: return all brands from vertical
        from vertical_manager import VerticalManager
        vm = VerticalManager()
        vertical = vm.get_vertical(vertical_name)
        return vertical.brands if vertical else []


def build_pattern_clusters(outliers):
    """Group outlier posts by their AI-identified content_pattern.

    Returns a list of cluster dicts sorted by count descending:
        [{pattern_name, count, brands, post_ids, avg_score}]
    Only includes clusters with 2+ posts.
    """
    clusters = {}
    for post in outliers:
        ai = post.get("ai_analysis")
        if not ai or not isinstance(ai, dict):
            continue
        pattern = ai.get("content_pattern")
        if not pattern:
            continue

        if pattern not in clusters:
            clusters[pattern] = {
                "pattern_name": pattern,
                "count": 0,
                "brands": set(),
                "post_ids": [],
                "total_score": 0.0,
            }

        c = clusters[pattern]
        c["count"] += 1
        c["brands"].add(post.get("competitor_handle", ""))
        c["post_ids"].append(post.get("post_id", ""))
        c["total_score"] += post.get("outlier_score", 0)

    # Filter to clusters with 2+ posts, compute avg, convert brands to list
    result = []
    for c in clusters.values():
        if c["count"] >= 2:
            result.append({
                "pattern_name": c["pattern_name"],
                "count": c["count"],
                "brands": sorted(c["brands"]),
                "post_ids": c["post_ids"],
                "avg_score": round(c["total_score"] / c["count"], 2),
            })

    result.sort(key=lambda x: x["count"], reverse=True)
    return result


def get_voice_analysis():
    """Load voice analysis and top own posts for the dashboard."""
    if not config.DB_PATH.exists():
        return None, []

    profile_name = get_active_profile_name()

    try:
        conn = get_db()

        # Load voice analysis
        row = conn.execute("""
            SELECT voice_data, analyzed_at, source_post_count
            FROM voice_analysis
            WHERE brand_profile = ?
            ORDER BY analyzed_at DESC LIMIT 1
        """, (profile_name,)).fetchone()

        voice = None
        if row:
            voice = {
                "voice_data": json.loads(row["voice_data"]),
                "analyzed_at": row["analyzed_at"][:10],
                "source_post_count": row["source_post_count"],
            }

        # Load top own posts
        own_posts = conn.execute("""
            SELECT post_id, caption, likes, comments, saves, shares,
                   media_type, media_url, posted_at,
                   (COALESCE(likes,0) + COALESCE(comments,0) +
                    COALESCE(saves,0) + COALESCE(shares,0)) as total_engagement
            FROM competitor_posts
            WHERE brand_profile = ? AND is_own_channel = 1
                  AND caption IS NOT NULL AND caption != ''
            ORDER BY total_engagement DESC
            LIMIT 10
        """, (profile_name,)).fetchall()

        conn.close()
        return voice, [dict(row) for row in own_posts]
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        return None, []  # Tables not ready or DB error


def get_report_files():
    """Get list of generated HTML report files."""
    profile_name = get_active_profile_name()
    reports = []

    for f in sorted(config.DATA_DIR.glob("report_*.html"), reverse=True):
        stat = f.stat()
        reports.append({
            "filename": f.name,
            "name": f.stem.replace("_", " ").replace("report ", "Report "),
            "size_kb": round(stat.st_size / 1024, 1),
            "date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        })

    return reports


# ── Template Context ──

@app.context_processor
def inject_globals():
    """Make these available in all templates."""
    return {
        "active_profile": get_active_profile_name(),
        "available_profiles": get_available_profiles(),
        "active_vertical": get_active_vertical_name(),
        "available_verticals": get_available_verticals(),
        "current_user": get_current_user(),
        "auth_enabled": is_auth_enabled(),
    }


# ── Routes: Authentication ──

@app.route("/login")
def login_page():
    """Login page — shown when auth is enabled and user is not logged in."""
    if not is_auth_enabled() or get_current_user():
        return redirect(url_for('signal_page'))
    return render_template('login.html')


@app.route("/auth/google")
def auth_google():
    """Redirect to Google OAuth consent screen."""
    redirect_uri = url_for('auth_google_callback', _external=True)
    auth_url = build_google_auth_url(redirect_uri)
    if not auth_url:
        flash("Google OAuth is not configured. Add Client ID and Secret in Settings.", "danger")
        return redirect(url_for('setup_page'))
    return redirect(auth_url)


@app.route("/auth/google/callback")
def auth_google_callback():
    """Handle Google OAuth callback."""
    error = request.args.get("error")
    if error:
        flash(f"Google login failed: {error}", "danger")
        return redirect(url_for('login_page'))

    code = request.args.get("code")
    state = request.args.get("state")

    # Verify CSRF state
    expected_state = session.pop("oauth_state", None)
    if not state or state != expected_state:
        flash("Invalid OAuth state. Please try again.", "danger")
        return redirect(url_for('login_page'))

    # Exchange code for user info
    redirect_uri = url_for('auth_google_callback', _external=True)
    user_info = exchange_code_for_user(code, redirect_uri)
    if not user_info:
        flash("Failed to authenticate with Google. Please try again.", "danger")
        return redirect(url_for('login_page'))

    # Check if this email is authorized
    if not is_email_allowed(user_info.get("email", "")):
        flash("Access denied. Your email is not on the authorized list.", "danger")
        return redirect(url_for('login_page'))

    # Store user in DB and session
    upsert_user(user_info)
    session["user"] = user_info

    # Redirect to originally requested page
    next_url = session.pop("next_url", None) or url_for('signal_page')
    return redirect(next_url)


@app.route("/logout")
def logout():
    """Clear session and redirect to login."""
    session.clear()
    if is_auth_enabled():
        return redirect(url_for('login_page'))
    return redirect(url_for('signal_page'))


# ── Routes: Pages ──

@app.route("/")
def index():
    """Dashboard home page - always goes to Signal AI interface."""
    return redirect(url_for('signal_page'))


@app.route("/signal")
@login_required
def signal_page():
    """Signal AI - Conversational outlier viewer with insights."""
    from insight_generator import generate_insights_for_vertical
    from vertical_manager import VerticalManager

    profile = get_profile()
    competitor = request.args.get("competitor", "")
    platform = request.args.get("platform", "")
    sort_by = request.args.get("sort", "score")
    timeframe = request.args.get("timeframe", "") or "30d"  # Default to 30d window
    tag = request.args.get("tag", "")

    # Check if user wants empty state (after reset)
    empty_state = request.args.get("empty", "").lower() == "true"

    # Accept explicit vertical from URL (used by analysis completion redirect)
    requested_vertical = request.args.get("vertical", "").strip()
    if requested_vertical and not empty_state:
        verticals = get_available_verticals()
        if requested_vertical in verticals:
            app._active_vertical = requested_vertical
            session['active_vertical'] = requested_vertical

    # Clear active vertical when returning to empty state
    if empty_state and hasattr(app, '_active_vertical'):
        app._active_vertical = None
        session.pop('active_vertical', None)

    # Get vertical name for queries (unless empty state)
    vertical_name = None if empty_state else get_active_vertical_name()

    # Get outlier posts using vertical name (skip if empty state)
    if empty_state:
        outliers = []
        insights = None
        pattern_clusters = []
        brand_baselines = []
    else:
        outliers = get_outlier_posts(competitor=competitor or None,
                                     platform=platform or None,
                                     sort_by=sort_by,
                                     vertical_name=vertical_name,
                                     timeframe=timeframe,
                                     tag=tag or None)
        # Generate insights from pattern analyzer
        insights = generate_insights_for_vertical(vertical_name) if vertical_name else None
        # Build content pattern clusters from AI analysis
        pattern_clusters = build_pattern_clusters(outliers)
        # Compute per-brand baselines
        brand_baselines = get_competitor_baselines(vertical_name, timeframe)

    # Trend Radar: velocity-based sound/hashtag trends
    trend_radar_trends = []
    if vertical_name and not empty_state:
        try:
            from trend_radar.scorer import TrendRadarScorer
            trend_radar_trends = TrendRadarScorer(vertical_name).get_top_trends(limit=10)
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"Trend Radar scoring failed: {e}")

    # Get competitive set for context display (empty if empty state)
    # Only show brands that actually have data in the database
    competitive_set = []
    if vertical_name and not empty_state:
        competitive_set = get_analyzed_brands_with_data(vertical_name)

    # Get list of all saved verticals for dropdown (always show, even in empty state)
    vm = VerticalManager()
    saved_verticals = vm.list_verticals()

    # Get latest collection errors for error badges on brands
    collection_errors = []
    if vertical_name and not empty_state:
        recent = get_recent_runs(limit=1)
        if recent and recent[0].get("errors"):
            try:
                collection_errors = json.loads(recent[0]["errors"])
            except (json.JSONDecodeError, TypeError):
                collection_errors = []

    return render_template("signal.html",
                           profile=profile,
                           outliers=outliers,
                           insights=insights,
                           pattern_clusters=pattern_clusters,
                           brand_baselines=brand_baselines,
                           trend_radar_trends=trend_radar_trends,
                           competitive_set=competitive_set,
                           vertical_name=vertical_name,
                           saved_verticals=saved_verticals,
                           empty_state=empty_state,
                           needs_setup=needs_setup(),
                           selected_competitor=competitor,
                           selected_platform=platform,
                           selected_timeframe=timeframe,
                           sort_by=sort_by,
                           collection_errors=collection_errors)


@app.route("/api/outliers")
@login_required
def api_outliers():
    """JSON API for outlier posts — used by AJAX filter switching."""
    from flask import jsonify

    competitor = request.args.get("competitor", "")
    platform = request.args.get("platform", "")
    sort_by = request.args.get("sort", "score")
    timeframe = request.args.get("timeframe", "") or "30d"
    tag = request.args.get("tag", "")
    vertical_name = request.args.get("vertical", "").strip() or get_active_vertical_name()

    outliers = get_outlier_posts(
        competitor=competitor or None,
        platform=platform or None,
        sort_by=sort_by,
        vertical_name=vertical_name,
        timeframe=timeframe,
        tag=tag or None,
    )
    baselines = get_competitor_baselines(vertical_name, timeframe)
    pattern_clusters = build_pattern_clusters(outliers)

    return jsonify({
        "outliers": outliers,
        "baselines": baselines,
        "pattern_clusters": pattern_clusters,
        "count": len(outliers),
    })


@app.route("/api/export/csv")
@login_required
def export_csv():
    """Export current filtered outliers as CSV download."""
    import csv
    import io

    outliers = get_outlier_posts(
        competitor=request.args.get("competitor") or None,
        platform=request.args.get("platform") or None,
        sort_by=request.args.get("sort", "score"),
        vertical_name=get_active_vertical_name(),
        timeframe=request.args.get("timeframe", "30d"),
        tag=request.args.get("tag") or None,
    )

    output = io.StringIO()
    fieldnames = [
        "competitor_handle", "competitor_name", "platform", "post_url",
        "caption", "media_type", "likes", "comments", "saves", "shares",
        "views", "outlier_score", "posted_at", "content_tags",
        "engagement_multiplier", "primary_driver",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for o in outliers:
        row = dict(o)
        row["content_tags"] = ", ".join(o.get("content_tags", []))
        writer.writerow(row)

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=outliers_export.csv"},
    )


@app.route("/api/score-concept", methods=["POST"])
@login_required
def api_score_concept():
    """Score a content concept against learned outlier patterns."""
    from flask import jsonify
    from content_scorer import ContentScorer

    data = request.get_json() or {}
    caption = data.get("caption", "").strip()
    if not caption:
        return jsonify({"error": "Caption text is required."}), 400

    vertical_name = get_active_vertical_name()
    if not vertical_name:
        return jsonify({"error": "No active category. Create one first."}), 400

    concept = {
        "caption": caption,
        "hook_line": data.get("hook_line", "").strip(),
        "format": data.get("format", "reel"),
        "platform": data.get("platform", "instagram"),
    }

    try:
        scorer = ContentScorer(vertical_name)
        result = scorer.score_concept(concept)

        # Store the score
        parent_id = data.get("parent_score_id")
        score_id = scorer.store_score(concept, result, parent_score_id=parent_id)
        result["score_id"] = score_id

        return jsonify(result)
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        return jsonify({"error": f"Scoring failed: {e}"}), 500


@app.route("/api/optimize-concept", methods=["POST"])
@login_required
def api_optimize_concept():
    """Optimize a concept via LLM and auto-re-score the improved version."""
    from flask import jsonify
    from content_scorer import ContentScorer
    from content_optimizer import ContentOptimizer

    data = request.get_json() or {}
    caption = data.get("caption", "").strip()
    if not caption:
        return jsonify({"error": "Caption text is required."}), 400

    vertical_name = get_active_vertical_name()
    if not vertical_name:
        return jsonify({"error": "No active category."}), 400

    concept = {
        "caption": caption,
        "hook_line": data.get("hook_line", "").strip(),
        "format": data.get("format", "reel"),
        "platform": data.get("platform", "instagram"),
    }
    score_data = data.get("score_data", {})
    parent_score_id = data.get("score_id")

    try:
        optimizer = ContentOptimizer(vertical_name)
        optimized = optimizer.optimize(concept, score_data)

        # Auto-re-score the optimized version
        improved_concept = {
            "caption": optimized["improved_caption"],
            "hook_line": optimized["improved_hook"],
            "format": optimized.get("format_recommendation", concept["format"]),
            "platform": concept["platform"],
        }
        scorer = ContentScorer(vertical_name)
        new_score = scorer.score_concept(improved_concept)
        new_score_id = scorer.store_score(
            improved_concept, new_score, parent_score_id=parent_score_id
        )

        return jsonify({
            "optimized": optimized,
            "new_score": new_score,
            "new_score_id": new_score_id,
        })
    except Exception as e:
        logger.error(f"Optimization failed: {e}")
        return jsonify({"error": f"Optimization failed: {e}"}), 500


@app.route("/api/trends")
def api_trends():
    """Return rising/declining content pattern trends."""
    from flask import jsonify
    from trend_analyzer import TrendAnalyzer

    vertical_name = get_active_vertical_name()
    if not vertical_name:
        return jsonify({"error": "No active category."}), 400

    lookback = request.args.get("lookback_weeks", 4, type=int)

    try:
        ta = TrendAnalyzer(vertical_name)
        trends = ta.get_trends(lookback_weeks=lookback)
        return jsonify(trends)
    except Exception as e:
        logger.error(f"Trend analysis failed: {e}")
        return jsonify({"error": f"Trend analysis failed: {e}"}), 500


@app.route("/api/gap-analysis")
def api_gap_analysis():
    """Return own-brand gap analysis (what competitors do that brand hasn't tried)."""
    from flask import jsonify
    from gap_analyzer import GapAnalyzer

    vertical_name = get_active_vertical_name()
    if not vertical_name:
        return jsonify({"error": "No active category."}), 400

    try:
        ga = GapAnalyzer(vertical_name)
        gaps = ga.analyze_gaps()
        return jsonify(gaps)
    except Exception as e:
        logger.error(f"Gap analysis failed: {e}")
        return jsonify({"error": f"Gap analysis failed: {e}"}), 500


@app.route("/api/score-history")
def api_score_history():
    """Return recent content scoring history for the active vertical."""
    from flask import jsonify

    vertical_name = get_active_vertical_name()
    if not vertical_name:
        return jsonify({"scores": []}), 200

    limit = request.args.get("limit", 20, type=int)

    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT id, concept_text, hook_line, format_choice, platform,
                   overall_score, score_data, predicted_engagement_range,
                   version, parent_score_id, scored_at
            FROM content_scores
            WHERE brand_profile = ?
            ORDER BY scored_at DESC
            LIMIT ?
        """, (vertical_name, limit)).fetchall()
        conn.close()

        scores = []
        for row in rows:
            scores.append({
                "id": row["id"],
                "caption": row["concept_text"],
                "hook_line": row["hook_line"],
                "format": row["format_choice"],
                "platform": row["platform"],
                "overall_score": row["overall_score"],
                "breakdown": json.loads(row["score_data"]) if row["score_data"] else {},
                "predicted_engagement": json.loads(row["predicted_engagement_range"]) if row["predicted_engagement_range"] else None,
                "version": row["version"],
                "parent_score_id": row["parent_score_id"],
                "scored_at": row["scored_at"],
            })

        return jsonify({"scores": scores})
    except Exception as e:
        logger.error(f"Score history failed: {e}")
        return jsonify({"scores": [], "error": str(e)}), 200


@app.route("/api/budget")
def api_budget():
    """Return current monthly LLM spend and limit for budget visibility."""
    from flask import jsonify
    if not config.DB_PATH.exists():
        return jsonify({"spent": 0, "limit": config.MONTHLY_COST_LIMIT_USD, "remaining": config.MONTHLY_COST_LIMIT_USD, "runs_this_month": 0})

    try:
        conn = get_db()
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()

        row = conn.execute(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM token_usage WHERE timestamp >= ?",
            (month_start,)
        ).fetchone()
        spent = row["total"] if row else 0

        runs_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM collection_runs WHERE run_timestamp >= ?",
            (month_start,)
        ).fetchone()
        runs = runs_row["cnt"] if runs_row else 0

        conn.close()
        limit = config.MONTHLY_COST_LIMIT_USD
        return jsonify({
            "spent": round(spent, 4),
            "limit": limit,
            "remaining": round(limit - spent, 4),
            "percent_used": round((spent / limit) * 100, 1) if limit > 0 else 0,
            "runs_this_month": runs,
        })
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        return jsonify({"spent": 0, "limit": config.MONTHLY_COST_LIMIT_USD, "remaining": config.MONTHLY_COST_LIMIT_USD, "runs_this_month": 0})


@app.route("/api/validate_keys", methods=["POST"])
def api_validate_keys():
    """Live validation of API keys before saving."""
    from flask import jsonify
    import requests as http_requests

    data = request.get_json() or {}
    results = {}

    # Validate Apify token
    apify_token = data.get("apify_token", "").strip()
    if apify_token:
        try:
            resp = http_requests.get(
                "https://api.apify.com/v2/users/me",
                params={"token": apify_token},
                timeout=8,
            )
            if resp.status_code == 200:
                user_data = resp.json().get("data", {})
                results["apify"] = {"valid": True, "username": user_data.get("username", "")}
            else:
                results["apify"] = {"valid": False, "error": "Invalid token"}
        except Exception as e:
            results["apify"] = {"valid": False, "error": f"Connection error: {str(e)[:60]}"}
    else:
        results["apify"] = {"valid": False, "error": "Token required"}

    # Validate OpenAI key
    openai_key = data.get("openai_key", "").strip()
    if openai_key:
        try:
            resp = http_requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {openai_key}"},
                timeout=8,
            )
            if resp.status_code == 200:
                results["openai"] = {"valid": True}
            else:
                results["openai"] = {"valid": False, "error": "Invalid API key"}
        except Exception as e:
            results["openai"] = {"valid": False, "error": f"Connection error: {str(e)[:60]}"}
    else:
        results["openai"] = {"valid": False, "error": "Key required"}

    return jsonify(results)


@app.route("/api/load_vertical/<vertical_name>")
def load_vertical(vertical_name):
    """Load a competitive set (vertical) and redirect to signal page."""
    app._active_vertical = vertical_name
    session['active_vertical'] = vertical_name
    return redirect(url_for("signal_page"))


# ── Routes: Actions ──

@app.route("/switch-vertical", methods=["POST"])
@login_required
def switch_vertical():
    """Switch the active vertical."""
    vertical_name = request.form.get("vertical", "").strip()
    verticals = get_available_verticals()
    if vertical_name and vertical_name in verticals:
        app._active_vertical = vertical_name
        session['active_vertical'] = vertical_name
        flash(f"Switched to vertical: {vertical_name}", "success")
    else:
        flash(f"Vertical '{vertical_name}' not found.", "danger")
    return redirect(url_for("index"))


@app.route("/run", methods=["POST"])
@login_required
def run_engine():
    """Run the outlier detection pipeline in the background."""
    skip_collect = request.form.get("skip_collect", "0") == "1"
    vertical_name = request.form.get("vertical_name", "").strip()

    # Prefer vertical (new system) over profile (legacy)
    if vertical_name:
        cmd = [sys.executable, "main.py", "--vertical", vertical_name, "--no-email"]
    else:
        profile_name = get_active_profile_name()
        cmd = [sys.executable, "main.py", "--profile", profile_name, "--no-email"]

    if skip_collect:
        cmd.append("--skip-collect")

    def _run():
        try:
            subprocess.run(cmd, cwd=str(config.PROJECT_ROOT),
                           capture_output=True, text=True, timeout=900)
        except Exception as e:
            logger.error(f"Pipeline run failed: {e}")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    if skip_collect:
        flash("Analyzing existing data... Check back in a moment for results.", "info")
    else:
        flash("Pipeline started. Collecting data and detecting outliers... "
              "This may take a minute.", "info")

    return redirect(url_for("index"))


# ── Routes: Reports ──

@app.route("/reports/raw/<filename>")
def raw_report(filename):
    """Serve raw HTML report for iframe embed."""
    filepath = config.DATA_DIR / filename
    if filepath.exists() and filepath.suffix == ".html":
        return Response(filepath.read_text(encoding="utf-8"),
                        mimetype="text/html")
    return "Report not found", 404


@app.route("/reports/download/<filename>")
def download_report(filename):
    """Download a report file."""
    filepath = config.DATA_DIR / filename
    if filepath.exists() and filepath.suffix == ".html":
        return send_file(filepath, as_attachment=True)
    flash("Report file not found.", "danger")
    return redirect(url_for("signal_page"))


ALLOWED_IMAGE_DOMAINS = {
    "instagram.com", "cdninstagram.com", "fbcdn.net",
    "scontent.cdninstagram.com",
    "tiktokcdn.com", "tiktok.com",
    "p16-sign.tiktokcdn-us.com", "p16-sign-sg.tiktokcdn.com",
    "p16-sign-va.tiktokcdn.com", "p77-sign.tiktokcdn.com",
    "muscdn.com",
    "facebook.com", "scontent.xx.fbcdn.net",
    "external.xx.fbcdn.net", "lookaside.fbsbx.com",
}


def _is_allowed_image_url(url: str) -> bool:
    """Check if a URL's domain is in the allowlist (prevents SSRF)."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        if parsed.scheme not in ("http", "https"):
            return False
        for allowed in ALLOWED_IMAGE_DOMAINS:
            if hostname == allowed or hostname.endswith("." + allowed):
                return True
        return False
    except (ValueError, AttributeError):
        return False


@app.route("/proxy-image")
def proxy_image():
    """Proxy external images to bypass CORS restrictions.

    Only allows requests to known social media CDN domains to prevent SSRF.
    """
    image_url = request.args.get('url')
    if not image_url:
        return "No URL provided", 400

    if not _is_allowed_image_url(image_url):
        return "Domain not allowed", 403

    try:
        response = requests.get(image_url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }, allow_redirects=True)

        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            if not content_type.startswith(('image/', 'video/')):
                return "Not a media file", 400
            resp = Response(response.content, mimetype=content_type)
            resp.headers['Cache-Control'] = 'public, max-age=86400'
            return resp
        else:
            return "Failed to fetch image", response.status_code
    except Exception as e:
        logger.error(f"Error proxying image: {e}")
        return "Error fetching image", 500


# ── Vertical Management Routes ──

@app.route("/setup")
@login_required
def setup_page():
    """One-time setup page for API keys and team settings."""
    from database_migrations import run_vertical_migrations
    run_vertical_migrations()  # Ensure tables exist

    # Check if API keys already exist
    conn = get_db()
    apify_token = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'apify'"
    ).fetchone()
    openai_key = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'openai'"
    ).fetchone()
    tiktok_key = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'tiktok'"
    ).fetchone()
    google_client_id_row = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'google_client_id'"
    ).fetchone()
    google_client_secret_row = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'google_client_secret'"
    ).fetchone()

    # Get team emails
    emails = conn.execute(
        "SELECT email FROM email_subscriptions WHERE vertical_name IS NULL"
    ).fetchall()

    # Get own brand handles from config table
    own_brand_ig_row = conn.execute(
        "SELECT value FROM config WHERE key = 'own_brand_instagram'"
    ).fetchone()
    own_brand_tt_row = conn.execute(
        "SELECT value FROM config WHERE key = 'own_brand_tiktok'"
    ).fetchone()
    allowed_emails_row = conn.execute(
        "SELECT value FROM config WHERE key = 'allowed_emails'"
    ).fetchone()
    conn.close()

    team_emails = ', '.join([e['email'] for e in emails]) if emails else ''
    own_brand_instagram = own_brand_ig_row['value'] if own_brand_ig_row else ''
    own_brand_tiktok = own_brand_tt_row['value'] if own_brand_tt_row else ''
    allowed_emails = allowed_emails_row['value'] if allowed_emails_row else ''

    return render_template('setup.html',
                           apify_token=apify_token['api_key'] if apify_token else '',
                           openai_key=openai_key['api_key'] if openai_key else '',
                           tiktok_key=tiktok_key['api_key'] if tiktok_key else '',
                           google_client_id=google_client_id_row['api_key'] if google_client_id_row else '',
                           google_client_secret=google_client_secret_row['api_key'] if google_client_secret_row else '',
                           allowed_emails=allowed_emails,
                           team_emails=team_emails,
                           own_brand_instagram=own_brand_instagram,
                           own_brand_tiktok=own_brand_tiktok,
                           vertical_name=get_active_vertical_name())


@app.route("/setup/save", methods=["POST"])
@login_required
def save_setup():
    """Save API keys and team settings to database."""
    from datetime import datetime, timezone

    apify_token = request.form.get('apify_token', '').strip()
    openai_key = request.form.get('openai_key', '').strip()
    tiktok_key = request.form.get('tiktok_key', '').strip()
    team_emails = request.form.get('team_emails', '').strip()
    own_brand_instagram = request.form.get('own_brand_instagram', '').strip().lstrip('@')
    own_brand_tiktok = request.form.get('own_brand_tiktok', '').strip().lstrip('@')
    google_client_id = request.form.get('google_client_id', '').strip()
    google_client_secret = request.form.get('google_client_secret', '').strip()
    allowed_emails = request.form.get('allowed_emails', '').strip()

    if not apify_token or not openai_key:
        flash("Apify token and OpenAI key are required", "danger")
        return redirect(url_for('setup_page'))

    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    try:
        # Save API keys (upsert)
        for service, key in [('apify', apify_token), ('openai', openai_key)]:
            if key:
                conn.execute("""
                    INSERT INTO api_credentials (service, api_key, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(service) DO UPDATE SET api_key = ?, updated_at = ?
                """, (service, key, now, now, key, now))

        if tiktok_key:
            conn.execute("""
                INSERT INTO api_credentials (service, api_key, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(service) DO UPDATE SET api_key = ?, updated_at = ?
            """, ('tiktok', tiktok_key, now, now, tiktok_key, now))

        # Save Google OAuth credentials (upsert or delete if cleared)
        for service, key in [('google_client_id', google_client_id),
                              ('google_client_secret', google_client_secret)]:
            if key:
                conn.execute("""
                    INSERT INTO api_credentials (service, api_key, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(service) DO UPDATE SET api_key = ?, updated_at = ?
                """, (service, key, now, now, key, now))
            else:
                conn.execute("DELETE FROM api_credentials WHERE service = ?", (service,))

        # Save team emails (clear existing, then insert new)
        conn.execute("DELETE FROM email_subscriptions WHERE vertical_name IS NULL")
        if team_emails:
            for email in team_emails.split(','):
                email = email.strip()
                if email:
                    conn.execute("""
                        INSERT INTO email_subscriptions (vertical_name, email, created_at)
                        VALUES (NULL, ?, ?)
                    """, (email, now))

        # Save own-brand handles in config table (handle clearing too)
        for cfg_key, cfg_val in [('own_brand_instagram', own_brand_instagram),
                                  ('own_brand_tiktok', own_brand_tiktok)]:
            if cfg_val:
                conn.execute("""
                    INSERT INTO config (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = ?
                """, (cfg_key, cfg_val, cfg_val))
            else:
                # User cleared the field — remove the config entry
                conn.execute("DELETE FROM config WHERE key = ?", (cfg_key,))

        # Save allowed emails (authorization allowlist)
        if allowed_emails:
            conn.execute("""
                INSERT INTO config (key, value)
                VALUES ('allowed_emails', ?)
                ON CONFLICT(key) DO UPDATE SET value = ?
            """, (allowed_emails, allowed_emails))
        else:
            conn.execute("DELETE FROM config WHERE key = 'allowed_emails'")

        conn.commit()
        flash("Settings saved.", "success")
        return redirect(url_for('signal_page', create='1'))

    except Exception as e:
        conn.rollback()
        flash(f"Error saving setup: {e}", "danger")
        return redirect(url_for('setup_page'))
    finally:
        conn.close()


@app.route("/verticals")
def verticals_list():
    """Redirect to Signal page (verticals list is now archived)."""
    return redirect(url_for('signal_page'))


@app.route("/verticals/create")
def vertical_create_page():
    """Archived: redirect to Signal; category creation is done via modal on /signal."""
    return redirect(url_for('signal_page', create='1'))


@app.route("/verticals/create", methods=["POST"])
@login_required
def create_vertical():
    """Create a new vertical with brands."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name', '').strip()
    description = request.form.get('description', '').strip()
    bulk_handles = request.form.get('bulk_handles', '').strip()

    if not vertical_name:
        flash("Vertical name is required", "danger")
        return redirect(url_for('vertical_create_page'))

    vm = VerticalManager()

    # Create vertical
    if not vm.create_vertical(vertical_name, description):
        flash(f"Vertical '{vertical_name}' already exists", "warning")
        return redirect(url_for('vertical_edit_page', name=vertical_name))

    # Add brands
    result = {'added': 0, 'skipped': 0}
    if bulk_handles:
        result = vm.bulk_add_brands(vertical_name, bulk_handles)

    if result['added'] == 0:
        flash("Vertical created but no brands added. Add brands below.", "warning")
        return redirect(url_for('vertical_edit_page', name=vertical_name))

    flash(f"Created '{vertical_name}' with {result['added']} brands", "success")

    # Set as active vertical
    app._active_vertical = vertical_name
    session['active_vertical'] = vertical_name

    return redirect(url_for('index'))


@app.route("/verticals/<name>/edit")
def vertical_edit_page(name):
    """Show vertical edit form."""
    from vertical_manager import VerticalManager

    vm = VerticalManager()
    vertical = vm.get_vertical(name)

    if not vertical:
        flash(f"Vertical '{name}' not found", "danger")
        return redirect(url_for('index'))

    return render_template('vertical_edit.html', vertical=vertical)


@app.route("/verticals/brand/add", methods=["POST"])
@login_required
def add_brand_to_vertical():
    """Add a single brand to a vertical."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name')
    instagram_handle = request.form.get('instagram_handle', '').strip()
    tiktok_handle = request.form.get('tiktok_handle', '').strip()

    # Require at least one handle
    if not instagram_handle and not tiktok_handle:
        flash("At least one social media handle is required (Instagram or TikTok)", "danger")
        return redirect(url_for('vertical_edit_page', name=vertical_name))

    vm = VerticalManager()
    # Use Instagram handle as primary identifier, or TikTok if no Instagram
    primary_handle = instagram_handle or tiktok_handle
    if vm.add_brand(vertical_name, instagram_handle=instagram_handle or None, tiktok_handle=tiktok_handle or None):
        platforms = []
        if instagram_handle:
            platforms.append(f"IG: @{instagram_handle.lstrip('@')}")
        if tiktok_handle:
            platforms.append(f"TT: @{tiktok_handle.lstrip('@')}")
        flash(f"Added {' + '.join(platforms)}", "success")
    else:
        flash(f"Brand is already in this vertical", "warning")

    return redirect(url_for('vertical_edit_page', name=vertical_name))


@app.route("/verticals/brand/bulk-add", methods=["POST"])
def bulk_add_brands():
    """Add multiple brands to a vertical."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name')
    bulk_handles = request.form.get('bulk_handles', '').strip()

    if not bulk_handles:
        flash("No handles provided", "warning")
        return redirect(url_for('vertical_edit_page', name=vertical_name))

    vm = VerticalManager()
    result = vm.bulk_add_brands(vertical_name, bulk_handles)

    if result['added'] > 0:
        flash(f"Added {result['added']} brands", "success")
    if result['skipped'] > 0:
        flash(f"Skipped {result['skipped']} (already exist)", "warning")

    return redirect(url_for('vertical_edit_page', name=vertical_name))


@app.route("/verticals/brand/remove", methods=["POST"])
@login_required
def remove_brand_from_vertical():
    """Remove a brand from a vertical."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name')
    instagram_handle = request.form.get('instagram_handle')

    vm = VerticalManager()
    if vm.remove_brand(vertical_name, instagram_handle):
        flash(f"Removed @{instagram_handle.lstrip('@')}", "success")
    else:
        flash(f"Brand not found", "warning")

    return redirect(url_for('vertical_edit_page', name=vertical_name))


@app.route("/verticals/<vertical_name>/brands/remove", methods=["POST"])
def remove_brand_from_set(vertical_name):
    """Remove a brand from a vertical (called from Signal page)."""
    from vertical_manager import VerticalManager

    handle = request.form.get('handle', '').lstrip('@')

    vm = VerticalManager()
    vm.remove_brand(vertical_name, handle)

    return redirect(url_for('signal_page'))


@app.route("/verticals/delete", methods=["POST"])
@login_required
def delete_vertical():
    """Delete a vertical."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name')

    vm = VerticalManager()
    if vm.delete_vertical(vertical_name):
        # Clear active vertical if it was deleted
        if hasattr(app, '_active_vertical') and app._active_vertical == vertical_name:
            app._active_vertical = None
            session.pop('active_vertical', None)

    return redirect(url_for('signal_page', empty='true'))


# ── Chat Routes (Scout AI Assistant) ──

@app.route("/chat")
def chat_page():
    """Redirect to Signal page (chat is embedded in Signal)."""
    return redirect(url_for('signal_page'))


@app.route("/chat/message", methods=["POST"])
@login_required
def chat_message():
    """Process chat message from user and return Scout's response.

    Flow:
    1. Try ScoutAgent FIRST (GPT with function-calling for natural language).
    2. If ScoutAgent is unavailable (no API key), fall back to ChatHandler
       for structured command patterns.
    3. Last resort: keyword-based fallback responses.
    """
    from scout_agent import ScoutAgent
    from chat_handler import ChatHandler
    from flask import session, jsonify

    try:
        data = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({"error": "Empty message"}), 400

        current_vertical = get_active_vertical_name()

        # BYOK: prefer per-request key from header, fall back to DB/env
        byok_openai = request.headers.get('X-OpenAI-Key', '').strip() or None
        admin_mode = request.headers.get('X-Admin-Mode', '').strip() == '1'

        if 'chat_context' not in session:
            session['chat_context'] = {
                'active_vertical': current_vertical,
                'chat_history': [],
            }
            # Seed welcome message for new users so GPT has onboarding context.
            # Without this, GPT doesn't know the user was asked to "describe your niche"
            # and treats bare words like "streetwear" as brand names instead of category names.
            if not current_vertical:
                from vertical_manager import VerticalManager
                vm_check = VerticalManager()
                if not vm_check.list_verticals():
                    session['chat_context']['chat_history'] = [
                        {
                            "role": "assistant",
                            "content": (
                                "You're all set! Let's create your first competitive set. "
                                "Pick a template or describe your niche:"
                            ),
                        }
                    ]

        context = session['chat_context']
        context['active_vertical'] = current_vertical
        context['admin_mode'] = admin_mode

        # ── PRIMARY: ScoutAgent (GPT with function-calling) ──
        # GPT understands natural language, creates categories on the fly,
        # resolves brand names, and drives the full conversational flow.
        try:
            scout = ScoutAgent(openai_key=byok_openai)
            response, updated_context = scout.chat(message, context)

            if response:
                # Pop (not get) so flag is consumed once and cleared from persisted context
                analysis_started = updated_context.pop('analysis_started', False)
                selected_brands = updated_context.pop('selected_brands', None)

                # If Scout's tools changed the active vertical, sync the app state
                new_vertical = updated_context.get('active_vertical')
                if new_vertical and new_vertical != current_vertical:
                    app._active_vertical = new_vertical
                    session['active_vertical'] = new_vertical

                # Persist the full context (including chat_history) in session
                session['chat_context'] = updated_context
                session.modified = True

                result = {
                    "response": response,
                    "type": "text",
                    "analysis_started": analysis_started,
                    "selected_brands": selected_brands,
                    "context": {
                        "active_vertical": updated_context.get('active_vertical'),
                    },
                }

                # Pass filter actions from chatbot to frontend (Phase 4: bidirectional sync)
                if updated_context.get('filter_action'):
                    result["filter_action"] = True
                    result["filter_brands"] = updated_context.get('filter_brands', [])
                if updated_context.get('filter_platform'):
                    result["filter_platform"] = updated_context['filter_platform']
                if updated_context.get('filter_timeframe'):
                    result["filter_timeframe"] = updated_context['filter_timeframe']
                if updated_context.get('filter_sort'):
                    result["filter_sort"] = updated_context['filter_sort']

                return jsonify(result)

        except Exception as scout_err:
            logger.warning(f"Scout agent unavailable: {scout_err}")

        # ── FALLBACK: ChatHandler for structured commands ──
        # Used when ScoutAgent is unavailable (no OpenAI key).
        # Handles regex-based patterns like "add X to Y", "show categories", etc.
        chat_handler = ChatHandler()
        result = chat_handler.process_message(message, current_vertical)

        if result.get('_handled'):
            return jsonify(result)

        # ── LAST RESORT: keyword-based responses ──
        fallback = _get_fallback_response(message, current_vertical)
        return jsonify({
            "response": fallback,
            "type": "text"
        })

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return jsonify({
            "response": "Sorry, I hit an unexpected error. Try one of these instead:\n"
                        "• Type 'help' to see what I can do\n"
                        "• Type 'show categories' to see your collections\n"
                        "• Add brands with 'add @nike @adidas to streetwear'",
            "type": "error",
            "error": str(e)
        }), 500


def _get_fallback_response(message: str, current_vertical: str = None) -> str:
    """Generate a helpful response when the AI agent is unavailable.

    This is the LAST RESORT — only runs when both ScoutAgent (GPT)
    and ChatHandler (regex) failed to handle the message.
    """
    import re
    msg = message.lower().strip()

    # ── Detect @handles or brand names that look like the user wants to track ──
    # e.g. "saintwoods and stussy", "@nike @adidas", "Fear of God Essentials"
    has_handles = bool(re.search(r'@[\w.]+', message))
    words = re.split(r'\s+and\s+|\s*,\s*|\s*&\s*', msg)
    looks_like_brands = (
        has_handles
        or (len(words) >= 2 and all(len(w.split()) <= 4 for w in words)
            and not any(kw in msg for kw in ['help', 'how', 'what', 'show', 'list', 'yes', 'no']))
    )

    if looks_like_brands:
        return (
            f"Looks like you want to track some brands! "
            f"Just tell me which category to put them in, like:\n\n"
            f"**'add {message} to Streetwear'**\n\n"
            f"Or I can create a new category for you:\n"
            f"**'create Streetwear'** — then add brands to it."
        )

    # ── Confirmations: "yes", "yeah", "sure", "go", "do it" ──
    if msg in ('yes', 'yeah', 'sure', 'ok', 'go', 'do it', 'yep', 'go ahead', 'lets go', "let's go"):
        if current_vertical:
            return (
                f"Got it! What would you like to do with **{current_vertical}**?\n\n"
                f"• 'add @brand1 @brand2 to {current_vertical}' — add brands\n"
                f"• 'analyze' — find viral posts\n"
                f"• 'show {current_vertical}' — see current brands"
            )
        return (
            "Great! To get started, create a category and add brands:\n\n"
            "• 'create Streetwear' — create a new category\n"
            "• 'add @nike @adidas to Streetwear' — add brands directly\n"
            "• 'suggest streetwear brands' — get brand ideas"
        )

    # ── Brand suggestion / recommendation queries ──
    if any(word in msg for word in ['suggest', 'recommend', 'what brands', 'which brands', 'who should',
                                     'ideas for', 'examples', 'good brands']):
        category_hints = {
            'streetwear': (
                "Here are some streetwear brands to consider:\n\n"
                "**High tier:** @nike, @adidas, @jordan, @newbalance\n"
                "**Mid tier:** @stussy, @supremenewyork, @palaceskateboards, @bape_us\n"
                "**Up-and-coming:** @corteiz, @broken.planet, @trapstar, @represent\n\n"
                "Add them with: 'add @nike @stussy @corteiz to Streetwear'"
            ),
            'sneaker': (
                "Here are some sneaker brands worth tracking:\n\n"
                "**Major:** @nike, @adidas, @newbalance, @jordan\n"
                "**Mid tier:** @asics, @puma, @reebok, @saucony\n"
                "**Boutique:** @salaboratory, @hokaoneone, @onrunning\n\n"
                "Add them with: 'add @nike @newbalance to Sneakers'"
            ),
            'beauty': (
                "Here are some beauty brands to track:\n\n"
                "**Major:** @fentybeauty, @maccosmetics, @nyxcosmetics\n"
                "**DTC/Indie:** @glossier, @milkmakeup, @kosas\n"
                "**Skincare:** @theordinary, @cerave, @drunk_elephant\n\n"
                "Add them with: 'add @glossier @fentybeauty to Beauty'"
            ),
            'fitness': (
                "Here are some fitness brands to track:\n\n"
                "**Apparel:** @gymshark, @lululemon, @niketraining\n"
                "**Supplements:** @gorilla.mind, @transparentlabs\n"
                "**Equipment:** @roguefitness, @hyperice, @whoop\n\n"
                "Add them with: 'add @gymshark @lululemon to Fitness'"
            ),
            'food': (
                "Here are some food & beverage brands to track:\n\n"
                "**Fast food:** @chipotle, @mcdonalds, @wendys\n"
                "**Beverage:** @redbull, @liquid_death, @poppi, @olipop\n\n"
                "Add them with: 'add @chipotle @liquid_death to Food & Bev'"
            ),
        }

        for keyword, response in category_hints.items():
            if keyword in msg:
                return response

        return (
            "I can suggest brands for you! Tell me the category:\n\n"
            "• 'suggest streetwear brands'\n"
            "• 'suggest beauty brands'\n"
            "• 'suggest fitness brands'\n\n"
            "Or just add brands directly:\n"
            "'add @brand1 @brand2 to [category name]'"
        )

    # ── Analysis / insights ──
    if any(word in msg for word in ['analyze', 'analysis', 'scan', 'find outliers', 'viral']):
        if current_vertical:
            return (
                f"To analyze **{current_vertical}**:\n\n"
                f"1. Make sure you have brands added\n"
                f"2. Say 'analyze' or 'run analysis'\n\n"
                f"Want me to run analysis on {current_vertical} now?"
            )
        return (
            "To run analysis, first create a category with brands:\n\n"
            "1. 'create Streetwear' — make a category\n"
            "2. 'add @nike @adidas to Streetwear' — add brands\n"
            "3. 'analyze' — find viral content!"
        )

    # ── How-to / getting started ──
    if any(word in msg for word in ['how', 'what do', 'what can', 'get started', 'tutorial', 'guide']):
        return (
            "Here's how to get started:\n\n"
            "**1. Create a category** — 'create Streetwear'\n"
            "**2. Add brands** — 'add @nike @stussy to Streetwear'\n"
            "**3. Analyze** — 'analyze' to find viral content\n\n"
            "Or use a template from the cards above!"
        )

    # ── Help ──
    if any(word in msg for word in ['help', 'commands']):
        return (
            "Here's what I can do:\n\n"
            "**Collections:**\n"
            "• 'create Streetwear' — create a category\n"
            "• 'add @nike @adidas to Streetwear' — add brands\n"
            "• 'show categories' — view collections\n\n"
            "**Analysis:**\n"
            "• 'analyze' — find viral posts\n"
            "• 'suggest streetwear brands' — get ideas\n\n"
            "What would you like to do?"
        )

    # ── Default — be more helpful than just showing commands ──
    vertical_hint = f" You're viewing **{current_vertical}**." if current_vertical else ""
    return (
        f"I'm here to help you find viral content!{vertical_hint}\n\n"
        "Try something like:\n"
        "• **'create Streetwear'** — start a new category\n"
        "• **'add @nike @stussy to Streetwear'** — track brands\n"
        "• **'suggest streetwear brands'** — get ideas\n"
        "• **'analyze'** — find outlier posts\n\n"
        "Or just type brand names and I'll help you set them up!"
    )


@app.route("/chat/context", methods=["POST"])
def update_chat_context():
    """Update chat context when user changes filters via the UI.

    This keeps the ScoutAgent aware of the user's current filter state
    so it can provide contextually relevant responses.
    """
    from flask import session, jsonify

    data = request.get_json()
    if not data:
        return jsonify({"ok": False}), 400

    if "chat_context" not in session:
        session["chat_context"] = {}

    key = data.get("filter_key", "")
    value = data.get("filter_value", "")

    if key == "competitor":
        session["chat_context"]["active_brand_filter"] = value
    elif key == "platform":
        session["chat_context"]["active_platform_filter"] = value
    elif key == "timeframe":
        session["chat_context"]["active_timeframe_filter"] = value
    elif key == "sort":
        session["chat_context"]["active_sort_filter"] = value

    session.modified = True
    return jsonify({"ok": True})


@app.route("/analysis/stream")
def analysis_stream():
    """Server-Sent Events stream for real-time analysis progress."""
    import time as _time

    def generate():
        progress_file = config.DATA_DIR / "analysis_progress.json"
        last_data = None
        for _ in range(600):  # Max 10 minutes
            if progress_file.exists():
                try:
                    with open(progress_file) as f:
                        data = json.load(f)
                    if data != last_data:
                        yield f"data: {json.dumps(data)}\n\n"
                        last_data = data
                        if data.get("status") in ("completed", "error"):
                            break
                except (json.JSONDecodeError, IOError):
                    pass
            _time.sleep(1)

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/analysis/cancel", methods=["POST"])
def cancel_analysis():
    """Cancel the currently running analysis."""
    import psutil
    import signal
    from pathlib import Path

    try:
        pid_file = config.DATA_DIR / "analysis.pid"
        progress_file = config.DATA_DIR / "analysis_progress.json"

        # Check if PID file exists
        if not pid_file.exists():
            logger.warning("Cancel requested but no PID file found")
            return jsonify({"success": False, "error": "No running analysis found"})

        # Read PID from file
        try:
            with open(pid_file, 'r') as f:
                pid = int(f.read().strip())
        except Exception as e:
            logger.error(f"Error reading PID file: {e}")
            return jsonify({"success": False, "error": "Could not read process ID"})

        # Try to kill the process
        try:
            proc = psutil.Process(pid)
            proc.send_signal(signal.SIGTERM)
            logger.info(f"Cancelled analysis process (PID: {pid})")

            # Clean up files
            try:
                pid_file.unlink()
            except OSError:
                pass

            try:
                if progress_file.exists():
                    progress_file.unlink()
            except OSError:
                pass

            return jsonify({"success": True, "message": "Analysis cancelled"})

        except psutil.NoSuchProcess:
            # Process already ended, just clean up files
            logger.info("Process already ended, cleaning up files")
            try:
                pid_file.unlink()
            except OSError:
                pass
            return jsonify({"success": True, "message": "Analysis already stopped"})

    except Exception as e:
        logger.error(f"Error cancelling analysis: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/analysis/status")
def analysis_status():
    """Check if analysis is currently running and return detailed progress."""
    from flask import jsonify, session
    import json
    import time
    import sqlite3
    from pathlib import Path

    # Define progress file paths
    progress_file = config.DATA_DIR / "analysis_progress.json"
    pid_file = config.DATA_DIR / "analysis.pid"

    response = {
        "is_running": False,
        "completed": False,
        "error": None,
        "progress": 0,
        "message": "No analysis running.",
        "time_elapsed": None,
        "time_remaining": None,
    }

    # Check if PID file exists (more reliable than process scanning)
    if pid_file.exists():
        try:
            with open(pid_file, 'r') as f:
                pid = int(f.read().strip())

            # Verify the process is still running
            import psutil
            try:
                proc = psutil.Process(pid)
                if proc.is_running():
                    response["is_running"] = True
                    session['analysis_was_running'] = True
                    session.modified = True
                else:
                    # Process ended but PID file wasn't cleaned up
                    pid_file.unlink()
            except psutil.NoSuchProcess:
                # Process ended, clean up PID file
                pid_file.unlink()
        except Exception as e:
            logger.warning(f"Error reading PID file: {e}")

    # Read progress data from JSON file
    if progress_file.exists():
        try:
            with open(progress_file, 'r') as f:
                progress_data = json.load(f)

            status = progress_data.get("status", "unknown")
            start_time = progress_data.get("start_time")

            if status == "running":
                # Check if process is actually still alive
                if response["is_running"]:
                    # Process is alive — show real progress
                    elapsed = time.time() - start_time if start_time else 0
                    response["time_elapsed"] = f"{int(elapsed // 60)}m {int(elapsed % 60)}s"
                    response["progress"] = progress_data.get("progress_percent", 0)
                    response["message"] = progress_data.get("message", "Running analysis...")

                    # Calculate time remaining based on actual progress
                    progress_pct = progress_data.get("progress_percent", 0)
                    if progress_pct >= 65:
                        # Post-collection phase — analysis/detection is fast
                        # Give a proportional estimate for the remaining 35%
                        remaining_pct = 100 - progress_pct
                        remaining = max(0, int(remaining_pct * 1.5))
                        response["time_remaining"] = f"{int(remaining // 60)}m {int(remaining % 60)}s"
                    elif progress_pct > 5:
                        # Collection phase — estimate from elapsed time and progress rate
                        estimated_total = (elapsed / progress_pct) * 100
                        remaining = max(0, estimated_total - elapsed)
                        remaining = min(remaining, 600)  # Cap at 10 minutes
                        response["time_remaining"] = f"{int(remaining // 60)}m {int(remaining % 60)}s"
                    elif progress_pct > 0:
                        # Early phase - show estimate based on brand count
                        is_cached = progress_data.get("is_cached", False)
                        if is_cached:
                            response["time_remaining"] = "~1 minute"
                        else:
                            total_brands = progress_data.get("total_brands_ig", 0) + progress_data.get("total_brands_tt", 0)
                            est_minutes = max(1, int((total_brands / 6) * 1.5 + 2))
                            response["time_remaining"] = f"~{est_minutes} minutes"
                    else:
                        # No progress yet
                        response["time_remaining"] = "Starting..."
                else:
                    # Process died but progress file still says "running"
                    # This is the stuck-screen scenario — treat as completed
                    response["completed"] = True
                    response["progress"] = 100
                    elapsed = time.time() - start_time if start_time else 0
                    response["time_elapsed"] = f"{int(elapsed // 60)}m {int(elapsed % 60)}s"

                    # Check DB for outliers to give a meaningful message
                    try:
                        v_name = get_active_vertical_name()
                        conn2 = sqlite3.connect(str(config.DB_PATH))
                        row2 = conn2.execute(
                            "SELECT COUNT(*) as cnt FROM competitor_posts WHERE is_outlier = 1 AND brand_profile = ?",
                            (v_name or "",)
                        ).fetchone()
                        conn2.close()
                        cnt = row2[0] if row2 else 0
                        response["message"] = f"Analysis complete! Found {cnt} outlier posts." if cnt else "Analysis complete."
                    except (sqlite3.OperationalError, sqlite3.DatabaseError):
                        response["message"] = "Analysis complete!"

                    # Clean up stale progress file
                    try:
                        progress_file.unlink()
                    except OSError:
                        pass

            elif status == "completed":
                response["completed"] = True
                response["progress"] = 100
                response["message"] = progress_data.get("message", "Analysis complete!")

                if start_time:
                    end_time = progress_data.get("end_time", time.time())
                    duration = end_time - start_time
                    response["time_elapsed"] = f"{int(duration // 60)}m {int(duration % 60)}s"

                # Clean up completed progress file
                try:
                    progress_file.unlink()
                except OSError:
                    pass

            elif status == "error":
                response["completed"] = True
                response["error"] = progress_data.get("error", "Unknown error occurred")
                response["message"] = "Analysis failed"

                # Clean up error progress file
                try:
                    progress_file.unlink()
                except OSError:
                    pass

        except Exception as e:
            logger.error(f"Error reading progress file: {e}")

    return jsonify(response)


# ── Entry Point ──

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    # Run database migrations to ensure all tables exist
    try:
        from collectors.instagram import migrate_database
        migrate_database()
    except (ImportError, sqlite3.Error) as e:
        logging.warning(f"Migration check (posts): {e}")

    try:
        from database_migrations import run_vertical_migrations, add_facebook_handle_column, fix_post_unique_constraint, fix_vertical_brands_nullable, add_scoring_tables, add_users_table, add_trend_radar_tables, add_vertical_brands_unique_index, consolidate_vertical_name_casing
        run_vertical_migrations()
        add_facebook_handle_column()
        fix_post_unique_constraint()
        fix_vertical_brands_nullable()
        add_scoring_tables()
        add_users_table()
        add_trend_radar_tables()
        add_vertical_brands_unique_index()
        consolidate_vertical_name_casing()
    except (ImportError, sqlite3.Error) as e:
        logging.warning(f"Migration check (verticals): {e}")

    print(f"\n  Outlier Content Engine Dashboard")
    print(f"  Running at: http://localhost:{args.port}")
    print(f"  Active profile: {config.ACTIVE_PROFILE}\n")

    app.run(host="0.0.0.0", port=args.port, debug=args.debug)
