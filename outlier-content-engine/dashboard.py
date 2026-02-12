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
    flash, send_file, Response,
)

import config
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
            except:
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
    """Get the active vertical name from session or first available."""
    if hasattr(app, '_active_vertical') and app._active_vertical:
        return app._active_vertical

    # Get first vertical if exists
    verticals = get_available_verticals()
    if verticals:
        app._active_vertical = verticals[0]
        return verticals[0]

    return None


def needs_setup():
    """Check if API keys are configured."""
    if not config.DB_PATH.exists():
        return True

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM api_credentials WHERE service IN ('rapidapi', 'openai')"
        ).fetchone()
        conn.close()
        return row['cnt'] < 2  # Need both keys
    except Exception:
        return True  # Database not ready


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
    """Get a SQLite connection."""
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
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
    except Exception:
        pass

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
        except Exception:
            pass

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
    except Exception:
        return []


def get_outlier_posts(competitor=None, platform=None, sort_by="score", vertical_name=None, timeframe=None, tag=None):
    """Fetch outlier posts from the database."""
    if not config.DB_PATH.exists():
        return []

    # CRITICAL FIX: Use vertical_name if provided, otherwise fall back to profile_name
    # The database stores data by vertical (e.g., 'Streetwear'), not by profile (e.g., 'heritage')
    brand_profile = vertical_name or get_active_vertical_name() or get_active_profile_name()

    try:
        conn = get_db()

        query = """
            SELECT post_id, competitor_name, competitor_handle, platform,
                   caption, media_type, media_url, post_url, posted_at, likes, comments,
                   saves, shares, views, outlier_score, content_tags,
                   weighted_engagement_score, primary_engagement_driver,
                   audio_id, audio_name
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1
        """
        params = [brand_profile]

        if competitor:
            query += " AND competitor_handle = ?"
            params.append(competitor)

        if platform:
            query += " AND platform = ?"
            params.append(platform)

        # Timeframe filter using SQL datetime functions
        if timeframe:
            timeframe_map = {
                "30d": "datetime('now', '-30 days')",
                "90d": "datetime('now', '-90 days')",
                "180d": "datetime('now', '-180 days')",
                "365d": "datetime('now', '-365 days')",
            }
            if timeframe in timeframe_map:
                query += f" AND posted_at >= {timeframe_map[timeframe]}"

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
            likes = row["likes"] or 0
            comments = row["comments"] or 0
            saves = row["saves"] or 0
            shares = row["shares"] or 0
            views = row["views"] or 0
            total_eng = likes + comments + saves + shares

            # Compute engagement score as 0-100 for the circular widget
            # Map outlier_score (typically 1-20+) to 0-100 range
            engagement_score_pct = min(100, round(score * 10)) if score else 0

            platform = row["platform"] or "instagram"

            # Build correct post URL per platform
            if platform == "tiktok":
                post_url = f"https://www.tiktok.com/@{row['competitor_handle']}/video/{row['post_id']}"
            else:
                post_url = f"https://www.instagram.com/p/{row['post_id']}/"

            # Data quality: which metrics are actually populated
            has_saves = saves > 0 or row["saves"] is not None
            has_shares = shares > 0 or row["shares"] is not None
            has_views = views > 0 or row["views"] is not None

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
            })

        return outliers
    except Exception as e:
        logger.error(f"Error fetching outliers: {e}")
        return []


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
    except Exception:
        return None, []


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
    }


# ── Routes: Pages ──

@app.route("/")
def index():
    """Dashboard home page - redirects to Signal AI interface."""
    # Check if setup is needed
    if needs_setup():
        return redirect(url_for('setup_page'))

    # Check if we have any verticals
    verticals = get_available_verticals()
    if not verticals:
        return redirect(url_for('vertical_create_page'))

    # Redirect to the new Signal AI interface
    return redirect(url_for('signal_page'))


@app.route("/competitors")
def competitors_page():
    """Competitor management page."""
    profile = get_profile()
    return render_template("competitors.html",
                           active_page="competitors",
                           profile=profile)


@app.route("/voice")
def voice_page():
    """Brand voice editor page."""
    profile = get_profile()
    voice_analysis, own_top_posts = get_voice_analysis()
    return render_template("voice.html",
                           active_page="voice",
                           profile=profile,
                           voice_analysis=voice_analysis,
                           own_top_posts=own_top_posts)


@app.route("/outliers")
def outliers_page():
    """Outlier posts viewer."""
    profile = get_profile()
    vertical_name = get_active_vertical_name()
    competitor = request.args.get("competitor", "")
    platform = request.args.get("platform", "")
    sort_by = request.args.get("sort", "score")
    timeframe = request.args.get("timeframe", "")

    outliers = get_outlier_posts(competitor=competitor or None,
                                 platform=platform or None,
                                 sort_by=sort_by,
                                 vertical_name=vertical_name,
                                 timeframe=timeframe or None)

    return render_template("outliers.html",
                           active_page="outliers",
                           profile=profile,
                           outliers=outliers,
                           selected_competitor=competitor,
                           selected_platform=platform,
                           selected_timeframe=timeframe,
                           sort_by=sort_by)


@app.route("/signal")
def signal_page():
    """Signal AI - Conversational outlier viewer with insights."""
    from insight_generator import generate_insights_for_vertical
    from vertical_manager import VerticalManager

    profile = get_profile()
    competitor = request.args.get("competitor", "")
    platform = request.args.get("platform", "")
    sort_by = request.args.get("sort", "score")
    timeframe = request.args.get("timeframe", "")
    tag = request.args.get("tag", "")

    # Get vertical name for queries
    vertical_name = get_active_vertical_name()

    # Get outlier posts using vertical name
    outliers = get_outlier_posts(competitor=competitor or None,
                                 platform=platform or None,
                                 sort_by=sort_by,
                                 vertical_name=vertical_name,
                                 timeframe=timeframe or None,
                                 tag=tag or None)

    # Generate insights from pattern analyzer
    insights = generate_insights_for_vertical(vertical_name) if vertical_name else None

    # Get competitive set for context display
    competitive_set = []
    if vertical_name:
        vm = VerticalManager()
        vertical = vm.get_vertical(vertical_name)
        if vertical:
            competitive_set = vertical.brands

    return render_template("signal.html",
                           profile=profile,
                           outliers=outliers,
                           insights=insights,
                           competitive_set=competitive_set,
                           vertical_name=vertical_name,
                           selected_competitor=competitor,
                           selected_platform=platform,
                           selected_timeframe=timeframe,
                           sort_by=sort_by)


@app.route("/reports")
def reports_page():
    """Reports viewer page."""
    viewing = request.args.get("view")
    return render_template("reports.html",
                           active_page="reports",
                           reports=get_report_files(),
                           viewing_report=viewing)


@app.route("/settings")
def settings_page():
    """Settings page — thresholds, content tags."""
    profile = get_profile()
    return render_template("settings.html",
                           active_page="settings",
                           profile=profile,
                           settings=profile.outlier_settings,
                           content_tags=profile.content_tags,
                           posts_per_competitor=config.DEFAULT_POSTS_PER_COMPETITOR)


# ── Routes: Actions ──

@app.route("/switch-profile", methods=["POST"])
def switch_profile():
    """Switch the active brand profile."""
    profile_name = request.form.get("profile", "").strip()
    if profile_name and profile_name in get_available_profiles():
        app._active_profile = profile_name
        flash(f"Switched to profile: {profile_name}", "success")
    else:
        flash(f"Profile '{profile_name}' not found.", "danger")
    return redirect(url_for("index"))


@app.route("/switch-vertical", methods=["POST"])
def switch_vertical():
    """Switch the active vertical."""
    vertical_name = request.form.get("vertical", "").strip()
    verticals = get_available_verticals()
    if vertical_name and vertical_name in verticals:
        app._active_vertical = vertical_name
        flash(f"Switched to vertical: {vertical_name}", "success")
    else:
        flash(f"Vertical '{vertical_name}' not found.", "danger")
    return redirect(url_for("index"))


@app.route("/competitors/add", methods=["POST"])
def add_competitor():
    """Add a new competitor to the active profile."""
    name = request.form.get("name", "").strip()
    instagram = request.form.get("instagram", "").strip().lstrip("@")
    tiktok = request.form.get("tiktok", "").strip().lstrip("@")
    facebook = request.form.get("facebook", "").strip().lstrip("@")

    if not name:
        flash("Please enter a brand name.", "warning")
        return redirect(url_for("competitors_page"))

    if not instagram and not tiktok and not facebook:
        flash("Please enter at least one social media handle.", "warning")
        return redirect(url_for("competitors_page"))

    data = get_profile_data()

    # Check for duplicate
    existing_names = [c["name"].lower() for c in data.get("competitors", [])]
    if name.lower() in existing_names:
        flash(f"'{name}' is already in your competitor list.", "warning")
        return redirect(url_for("competitors_page"))

    handles = {}
    if instagram:
        handles["instagram"] = instagram
    if tiktok:
        handles["tiktok"] = tiktok
    if facebook:
        handles["facebook"] = facebook

    data.setdefault("competitors", []).append({
        "name": name,
        "handles": handles,
    })

    save_profile_data(data)
    flash(f"Added {name} to your competitor list.", "success")
    return redirect(url_for("competitors_page"))


@app.route("/competitors/remove", methods=["POST"])
def remove_competitor():
    """Remove a competitor from the active profile."""
    name = request.form.get("name", "").strip()
    data = get_profile_data()

    original_count = len(data.get("competitors", []))
    data["competitors"] = [
        c for c in data.get("competitors", [])
        if c["name"] != name
    ]

    if len(data["competitors"]) < original_count:
        save_profile_data(data)
        flash(f"Removed {name} from your competitor list.", "success")
    else:
        flash(f"Could not find '{name}' in competitor list.", "warning")

    return redirect(url_for("competitors_page"))


@app.route("/voice/save", methods=["POST"])
def save_voice():
    """Save brand voice settings."""
    data = get_profile_data()

    # Update brand info
    data["brand"]["name"] = request.form.get("brand_name", "").strip()
    data["brand"]["vertical"] = request.form.get("vertical", "").strip()
    data["brand"]["tagline"] = request.form.get("tagline", "").strip()
    data["brand"]["description"] = request.form.get("description", "").strip()

    # Update voice
    data["voice"]["tone"] = request.form.get("tone", "").strip()
    data["voice"]["language_style"] = request.form.get("language_style", "").strip()

    # Update themes (multi-value)
    themes = request.form.getlist("themes")
    data["voice"]["themes"] = [t for t in themes if t.strip()]

    # Update avoids
    avoids = request.form.getlist("avoids")
    data["voice"]["avoids"] = [a for a in avoids if a.strip()]

    # Update example captions
    captions = request.form.getlist("example_captions")
    data["voice"]["example_captions"] = [c for c in captions if c.strip()]

    # Update own channel handle
    own_ig = request.form.get("own_instagram", "").strip().lstrip("@")
    if own_ig:
        data.setdefault("brand", {}).setdefault("own_channel", {})
        data["brand"]["own_channel"]["instagram"] = own_ig
    elif "own_channel" in data.get("brand", {}):
        data["brand"]["own_channel"]["instagram"] = ""

    save_profile_data(data)
    flash("Brand voice updated successfully.", "success")
    return redirect(url_for("voice_page"))


@app.route("/settings/save", methods=["POST"])
def save_settings():
    """Save outlier detection and content tag settings."""
    data = get_profile_data()

    # Outlier settings
    data.setdefault("outlier_settings", {})
    data["outlier_settings"]["engagement_multiplier"] = float(
        request.form.get("engagement_multiplier", 2.0))
    data["outlier_settings"]["std_dev_threshold"] = float(
        request.form.get("std_dev_threshold", 1.5))
    data["outlier_settings"]["lookback_days"] = int(
        request.form.get("lookback_days", 30))
    data["outlier_settings"]["top_outliers_to_analyze"] = int(
        request.form.get("top_outliers_to_analyze", 10))
    data["outlier_settings"]["top_outliers_to_rewrite"] = int(
        request.form.get("top_outliers_to_rewrite", 5))

    # Content tags
    data.setdefault("content_tags", {})
    themes = request.form.getlist("themes")
    data["content_tags"]["themes"] = [t for t in themes if t.strip()]

    hook_types = request.form.getlist("hook_types")
    data["content_tags"]["hook_types"] = [h for h in hook_types if h.strip()]

    formats = request.form.getlist("formats")
    data["content_tags"]["formats"] = [f for f in formats if f.strip()]

    save_profile_data(data)
    flash("Settings saved successfully.", "success")
    return redirect(url_for("settings_page"))


@app.route("/run", methods=["POST"])
def run_engine():
    """Run the outlier detection pipeline in the background."""
    skip_collect = request.form.get("skip_collect", "0") == "1"
    profile_name = get_active_profile_name()

    cmd = [sys.executable, "main.py", "--profile", profile_name, "--no-email"]
    if skip_collect:
        cmd.append("--skip-collect")

    def _run():
        try:
            subprocess.run(cmd, cwd=str(config.PROJECT_ROOT),
                           capture_output=True, text=True, timeout=300)
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

@app.route("/reports/view/<filename>")
def view_report(filename):
    """View a report (redirect to reports page with preview)."""
    return redirect(url_for("reports_page", view=filename))


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
    return redirect(url_for("reports_page"))


ALLOWED_IMAGE_DOMAINS = {
    "instagram.com", "cdninstagram.com", "fbcdn.net",
    "scontent.cdninstagram.com",
    "tiktokcdn.com", "tiktok.com",
    "p16-sign.tiktokcdn-us.com", "p16-sign-sg.tiktokcdn.com",
    "p16-sign-va.tiktokcdn.com", "p77-sign.tiktokcdn.com",
    "muscdn.com",
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
    except Exception:
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
def setup_page():
    """One-time setup page for API keys and team settings."""
    from database_migrations import run_vertical_migrations
    run_vertical_migrations()  # Ensure tables exist

    # Check if API keys already exist
    conn = get_db()
    rapidapi_key = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'rapidapi'"
    ).fetchone()
    openai_key = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'openai'"
    ).fetchone()
    tiktok_key = conn.execute(
        "SELECT api_key FROM api_credentials WHERE service = 'tiktok'"
    ).fetchone()

    # Get team emails
    emails = conn.execute(
        "SELECT email FROM email_subscriptions WHERE vertical_name IS NULL"
    ).fetchall()
    conn.close()

    team_emails = ', '.join([e['email'] for e in emails]) if emails else ''

    return render_template('setup.html',
                           rapidapi_key=rapidapi_key['api_key'] if rapidapi_key else '',
                           openai_key=openai_key['api_key'] if openai_key else '',
                           tiktok_key=tiktok_key['api_key'] if tiktok_key else '',
                           team_emails=team_emails)


@app.route("/setup/save", methods=["POST"])
def save_setup():
    """Save API keys and team settings to database."""
    from datetime import datetime, timezone

    rapidapi_key = request.form.get('rapidapi_key', '').strip()
    openai_key = request.form.get('openai_key', '').strip()
    tiktok_key = request.form.get('tiktok_key', '').strip()
    team_emails = request.form.get('team_emails', '').strip()

    if not rapidapi_key or not openai_key:
        flash("RapidAPI and OpenAI keys are required", "danger")
        return redirect(url_for('setup_page'))

    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    try:
        # Save API keys (upsert)
        for service, key in [('rapidapi', rapidapi_key), ('openai', openai_key)]:
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

        conn.commit()
        flash("Setup complete! Now create your first vertical.", "success")
        return redirect(url_for('vertical_create_page'))

    except Exception as e:
        conn.rollback()
        flash(f"Error saving setup: {e}", "danger")
        return redirect(url_for('setup_page'))
    finally:
        conn.close()


@app.route("/verticals")
def verticals_list():
    """Show all verticals with brand counts."""
    from vertical_manager import VerticalManager

    vm = VerticalManager()
    verticals = []

    for name in vm.list_verticals():
        vertical = vm.get_vertical(name)
        if vertical:
            verticals.append({
                'name': name,
                'description': vertical.description,
                'brand_count': len(vertical.brands),
                'brands': vertical.brands,
                'updated_at': vertical.updated_at
            })

    return render_template('verticals_list.html',
                         verticals=verticals,
                         active_page='categories',
                         available_verticals=get_available_verticals(),
                         active_vertical=get_active_vertical_name())


@app.route("/verticals/create")
def vertical_create_page():
    """Show vertical creation form."""
    return render_template('vertical_create.html')


@app.route("/verticals/create", methods=["POST"])
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


@app.route("/verticals/delete", methods=["POST"])
def delete_vertical():
    """Delete a vertical."""
    from vertical_manager import VerticalManager

    vertical_name = request.form.get('vertical_name')

    vm = VerticalManager()
    if vm.delete_vertical(vertical_name):
        flash(f"Deleted vertical '{vertical_name}'", "success")
        # Clear active vertical if it was deleted
        if hasattr(app, '_active_vertical') and app._active_vertical == vertical_name:
            app._active_vertical = None
    else:
        flash(f"Vertical not found", "warning")

    return redirect(url_for('index'))


# ── Chat Routes (Scout AI Assistant) ──

@app.route("/chat")
def chat_page():
    """Chat interface with Scout AI assistant."""
    return render_template("chat.html", active_page="chat")


@app.route("/chat/message", methods=["POST"])
def chat_message():
    """Process chat message from user and return Scout's response."""
    from scout_agent import ScoutAgent
    from chat_handler import ChatHandler
    from flask import session, jsonify

    try:
        data = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({"error": "Empty message"}), 400

        # Try ChatHandler first for category management commands
        chat_handler = ChatHandler()
        current_vertical = get_active_vertical_name()
        result = chat_handler.process_message(message, current_vertical)

        # If ChatHandler handled it (not default text response), use that
        if result.get('type') != 'text' or 'categories' in message.lower() or 'show' in message.lower() or 'add' in message.lower() or 'remove' in message.lower():
            return jsonify(result)

        # Otherwise, fall back to Scout agent for analysis/insights
        scout = ScoutAgent()

        # Get conversation context from session
        if 'chat_context' not in session:
            session['chat_context'] = {
                'active_vertical': current_vertical,
                'chat_history': []
            }

        context = session['chat_context']

        # Process message with Scout
        response, updated_context = scout.chat(message, context)

        # Check if this triggered an analysis
        analysis_started = updated_context.get('analysis_started', False)

        # Update session context
        session['chat_context'] = updated_context
        session.modified = True

        return jsonify({
            "response": response,
            "type": "text",
            "analysis_started": analysis_started,
            "context": {
                "active_vertical": updated_context.get('active_vertical'),
                "pending_vertical": updated_context.get('pending_vertical')
            }
        })

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return jsonify({
            "response": f"Oops, something went wrong: {str(e)}",
            "type": "error",
            "error": str(e)
        }), 500


@app.route("/analysis/status")
def analysis_status():
    """Check if analysis is currently running and return recent results."""
    from flask import jsonify
    import psutil
    import sqlite3

    # Check if main.py process is running
    running = False
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info.get('cmdline', [])
            if cmdline and 'main.py' in ' '.join(cmdline):
                running = True
                break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    # Get count of recent outliers found (last hour)
    outliers_count = 0
    last_analysis_time = None
    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row

        # Count outliers from the last analysis
        result = conn.execute("""
            SELECT COUNT(*) as count, MAX(collected_at) as last_time
            FROM competitor_posts
            WHERE is_outlier = 1
        """).fetchone()

        if result:
            outliers_count = result['count']
            last_analysis_time = result['last_time']

        conn.close()
    except Exception as e:
        logger.error(f"Error getting analysis status from database: {e}")

    return jsonify({
        "running": running,
        "outliers_count": outliers_count,
        "last_analysis_time": last_analysis_time
    })


# ── Entry Point ──

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    print(f"\n  Outlier Content Engine Dashboard")
    print(f"  Running at: http://localhost:{args.port}")
    print(f"  Active profile: {config.ACTIVE_PROFILE}\n")

    app.run(host="0.0.0.0", port=args.port, debug=args.debug)
