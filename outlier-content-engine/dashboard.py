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

import yaml
from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, send_file, Response,
)

import config
from profile_loader import load_profile

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "outlier-engine-dev-key")

logger = logging.getLogger(__name__)


# ── Helpers ──

def get_available_profiles():
    """List all available brand profile names."""
    profiles = []
    for f in config.PROFILES_DIR.glob("*.yaml"):
        if f.stem != "_template":
            profiles.append(f.stem)
    return sorted(profiles)


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


def get_outlier_posts(competitor=None, sort_by="score"):
    """Fetch outlier posts from the database."""
    if not config.DB_PATH.exists():
        return []

    profile_name = get_active_profile_name()

    try:
        conn = get_db()

        query = """
            SELECT post_id, competitor_name, competitor_handle, platform,
                   caption, media_type, media_url, posted_at, likes, comments,
                   saves, shares, views, outlier_score, content_tags,
                   estimated_engagement_rate
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1
        """
        params = [profile_name]

        if competitor:
            query += " AND competitor_handle = ?"
            params.append(competitor)

        sort_map = {
            "score": "outlier_score DESC",
            "likes": "likes DESC",
            "comments": "comments DESC",
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

            # Calculate engagement multiplier from outlier_score
            # (outlier_score = 0.6 * multiplier + 0.4 * std_devs)
            score = row["outlier_score"] or 0

            outliers.append({
                "post_id": row["post_id"],
                "competitor_name": row["competitor_name"],
                "competitor_handle": row["competitor_handle"],
                "platform": row["platform"],
                "caption": row["caption"] or "",
                "media_type": row["media_type"] or "image",
                "media_url": row["media_url"] or "",
                "posted_at": row["posted_at"] or "",
                "likes": row["likes"] or 0,
                "comments": row["comments"] or 0,
                "saves": row["saves"],
                "shares": row["shares"],
                "views": row["views"],
                "outlier_score": round(score, 2),
                "engagement_multiplier": round(score / 0.6, 1) if score else 0,
                "content_tags": tags,
                "post_url": f"https://www.instagram.com/p/{row['post_id']}/",
            })

        return outliers
    except Exception as e:
        logger.error(f"Error fetching outliers: {e}")
        return []


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
    }


# ── Routes: Pages ──

@app.route("/")
def index():
    """Dashboard home page."""
    try:
        profile = get_profile()
    except Exception as e:
        flash(f"Could not load profile: {e}", "danger")
        profile = None

    return render_template("index.html",
                           active_page="home",
                           profile=profile,
                           stats=get_dashboard_stats(),
                           recent_runs=get_recent_runs())


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
    return render_template("voice.html",
                           active_page="voice",
                           profile=profile)


@app.route("/outliers")
def outliers_page():
    """Outlier posts viewer."""
    profile = get_profile()
    competitor = request.args.get("competitor", "")
    sort_by = request.args.get("sort", "score")

    outliers = get_outlier_posts(competitor=competitor or None, sort_by=sort_by)

    return render_template("outliers.html",
                           active_page="outliers",
                           profile=profile,
                           outliers=outliers,
                           selected_competitor=competitor,
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
