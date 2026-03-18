"""
Domain Intelligence Engine — standalone Flask application.

Paste a YouTube URL → everything is automated.
Knowledge compounds over time per domain.
"""

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from flask import (
    Flask, render_template, request, redirect, url_for, jsonify, session,
)

import config
from migrations import run_migrations

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32).hex())

logger = logging.getLogger(__name__)


# ── Helpers ──

def get_db():
    """Get a database connection with WAL mode."""
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def needs_setup() -> bool:
    """Check if OpenAI API key is configured."""
    return not config.get_api_key('openai')


# ── Security Headers ──

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


# ══════════════════════════════════════════════════════════════
# Pages
# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Main page — URL input + domain grid."""
    if needs_setup():
        return redirect(url_for('setup_page'))

    conn = None
    domains = []
    try:
        conn = get_db()
        domains = [dict(r) for r in conn.execute(
            "SELECT * FROM domains ORDER BY updated_at DESC"
        ).fetchall()]
    except sqlite3.OperationalError:
        pass
    finally:
        if conn:
            conn.close()

    return render_template("intel.html", domains=domains, domain=None, synthesis=None)


@app.route("/domain/<domain_name>")
def domain_page(domain_name):
    """Domain detail — synthesis + chat + sources."""
    if needs_setup():
        return redirect(url_for('setup_page'))

    try:
        import markdown as md
    except ImportError:
        md = None

    conn = None
    try:
        conn = get_db()

        domain = conn.execute(
            "SELECT * FROM domains WHERE name = ? COLLATE NOCASE", (domain_name,)
        ).fetchone()
        if not domain:
            return redirect(url_for('index'))
        domain = dict(domain)

        # Latest synthesis
        synthesis_row = conn.execute(
            "SELECT * FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
            (domain['id'],),
        ).fetchone()
        synthesis = dict(synthesis_row) if synthesis_row else None
        synthesis_html = ""
        if synthesis and md:
            try:
                synthesis_html = md.markdown(
                    synthesis['content'],
                    extensions=['extra', 'nl2br']
                )
            except Exception:
                synthesis_html = f"<p>{synthesis['content']}</p>"
        elif synthesis:
            synthesis_html = f"<p>{synthesis['content']}</p>"

        # Sources with insight counts
        sources = [dict(r) for r in conn.execute("""
            SELECT s.*, COUNT(i.id) as insight_count
            FROM sources s
            LEFT JOIN insights i ON i.source_id = s.id
            WHERE s.domain_id = ? AND s.status = 'processed'
            GROUP BY s.id
            ORDER BY s.created_at DESC
        """, (domain['id'],)).fetchall()]

        domains = [dict(r) for r in conn.execute(
            "SELECT * FROM domains ORDER BY updated_at DESC"
        ).fetchall()]

    except sqlite3.OperationalError:
        return redirect(url_for('index'))
    finally:
        if conn:
            conn.close()

    return render_template("intel.html",
                           domain=domain,
                           synthesis=synthesis,
                           synthesis_html=synthesis_html,
                           sources=sources,
                           domains=domains)


@app.route("/setup")
def setup_page():
    """API key setup page."""
    return render_template("setup.html")


@app.route("/setup/save", methods=["POST"])
def save_setup():
    """Save API key."""
    openai_key = request.form.get('openai_key', '').strip()
    if not openai_key:
        return render_template("setup.html", error="OpenAI API key is required.")

    conn = None
    try:
        conn = get_db()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("""
            INSERT OR REPLACE INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('openai', ?, ?, ?)
        """, (openai_key, now, now))
        conn.commit()
    finally:
        if conn:
            conn.close()

    return redirect(url_for('index'))


# ══════════════════════════════════════════════════════════════
# API Endpoints
# ══════════════════════════════════════════════════════════════

@app.route("/api/ingest", methods=["POST"])
def api_ingest():
    """Accept a YouTube URL and start background processing."""
    from pipeline import run_pipeline, check_already_ingested, _update_status
    from youtube_ingest import extract_video_id

    data = request.get_json()
    url = (data or {}).get('url', '').strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    existing = check_already_ingested(video_id)
    if existing and existing['status'] == 'processed':
        return jsonify({"status": "already_exists", "video_id": video_id, "title": existing.get('title', '')})

    _update_status(video_id, 'processing', 'Starting...', 5)

    def _run():
        try:
            run_pipeline(url)
        except Exception as e:
            _update_status(video_id, 'error', 'Failed', 0, error=str(e))

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({"status": "started", "video_id": video_id})


@app.route("/api/status/<video_id>")
def api_status(video_id):
    """Poll processing status for a video."""
    from pipeline import get_pipeline_status
    return jsonify(get_pipeline_status(video_id))


@app.route("/api/domains")
def api_domains():
    """List all knowledge domains."""
    conn = None
    try:
        conn = get_db()
        domains = [dict(r) for r in conn.execute(
            "SELECT * FROM domains ORDER BY updated_at DESC"
        ).fetchall()]
        return jsonify({"domains": domains})
    except sqlite3.OperationalError:
        return jsonify({"domains": []})
    finally:
        if conn:
            conn.close()


@app.route("/api/query", methods=["POST"])
def api_query():
    """Ask a question against a domain's knowledge."""
    from intel_query import query_domain

    data = request.get_json()
    domain_id = (data or {}).get('domain_id')
    question = (data or {}).get('question', '').strip()

    if not domain_id or not question:
        return jsonify({"answer": "Please provide a question.", "sources_used": 0})

    result = query_domain(int(domain_id), question)
    return jsonify(result)


# ── Entry Point ──

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5002)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    # Run migrations
    run_migrations()

    print(f"\n  Domain Intelligence Engine")
    print(f"  Running at: http://localhost:{args.port}\n")

    app.run(host="0.0.0.0", port=args.port, debug=args.debug)
