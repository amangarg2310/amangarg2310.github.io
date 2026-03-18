"""
Domain Intelligence Engine — standalone Flask application.

Paste a YouTube URL, web article, upload a file, or paste text → everything is automated.
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
from werkzeug.utils import secure_filename

import config
from migrations import run_migrations

# Run migrations at import time so they execute under gunicorn too
run_migrations()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32).hex())
app.config['MAX_CONTENT_LENGTH'] = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024

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


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in config.ALLOWED_EXTENSIONS


def get_source_type_from_ext(filename: str) -> str:
    """Determine source type from file extension."""
    ext = Path(filename).suffix.lower()
    if ext == '.pdf':
        return 'pdf'
    elif ext == '.docx':
        return 'docx'
    elif ext == '.pptx':
        return 'pptx'
    elif ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
        return 'image'
    return 'unknown'


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
        suggested_questions = []
        if synthesis and md:
            try:
                synthesis_html = md.markdown(
                    synthesis['content'],
                    extensions=['extra', 'nl2br', 'fenced_code']
                )
            except Exception:
                synthesis_html = f"<p>{synthesis['content']}</p>"
        elif synthesis:
            synthesis_html = f"<p>{synthesis['content']}</p>"

        if synthesis and synthesis.get('suggested_questions'):
            import json
            try:
                suggested_questions = json.loads(synthesis['suggested_questions'])
            except (json.JSONDecodeError, TypeError):
                suggested_questions = []

        # Sources with insight counts and source_type
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
                           suggested_questions=suggested_questions,
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
    """Accept a URL (YouTube or article) and start background processing."""
    from pipeline import (
        run_pipeline, run_article_pipeline, check_already_ingested,
        _update_status, detect_source_type,
    )
    from youtube_ingest import extract_video_id
    from article_ingest import generate_article_id

    data = request.get_json()
    url = (data or {}).get('url', '').strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    source_type = detect_source_type(url)

    if source_type == 'youtube':
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400

        existing = check_already_ingested(video_id)
        if existing and existing['status'] == 'processed':
            # Include source_id so frontend can offer re-process
            domain_name = None
            if existing.get('domain_id'):
                conn = get_db()
                d = conn.execute("SELECT name FROM domains WHERE id = ?", (existing['domain_id'],)).fetchone()
                if d:
                    domain_name = d[0]
                conn.close()
            return jsonify({
                "status": "already_exists",
                "video_id": video_id,
                "title": existing.get('title', ''),
                "source_id": existing.get('id'),
                "domain_name": domain_name,
            })

        _update_status(video_id, 'processing', 'Starting...', 5)

        def _run():
            try:
                run_pipeline(url)
            except Exception as e:
                _update_status(video_id, 'error', 'Failed', 0, error=str(e))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return jsonify({"status": "started", "video_id": video_id})

    else:
        # Article
        source_vid = generate_article_id(url)

        existing = check_already_ingested(source_vid)
        if existing and existing['status'] == 'processed':
            domain_name = None
            if existing.get('domain_id'):
                conn = get_db()
                d = conn.execute("SELECT name FROM domains WHERE id = ?", (existing['domain_id'],)).fetchone()
                if d:
                    domain_name = d[0]
                conn.close()
            return jsonify({
                "status": "already_exists",
                "video_id": source_vid,
                "title": existing.get('title', ''),
                "source_id": existing.get('id'),
                "domain_name": domain_name,
            })

        _update_status(source_vid, 'processing', 'Starting...', 5)

        def _run():
            try:
                run_article_pipeline(url)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return jsonify({"status": "started", "video_id": source_vid})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """Accept a file upload and start background processing."""
    from pipeline import (
        run_file_pipeline, run_image_pipeline, _update_status, _generate_source_id,
    )

    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not supported. Allowed: {', '.join(sorted(config.ALLOWED_EXTENSIONS))}"}), 400

    original_filename = secure_filename(file.filename)
    source_type = get_source_type_from_ext(original_filename)

    # Generate a unique filename to avoid collisions
    import uuid
    unique_name = f"{uuid.uuid4().hex[:8]}_{original_filename}"
    file_path = str(config.UPLOADS_DIR / unique_name)
    file.save(file_path)

    # Generate a tracking ID
    source_vid = _generate_source_id("file" if source_type != 'image' else "img")
    _update_status(source_vid, 'processing', f'Uploading {original_filename}...', 5,
                   title=original_filename)

    if source_type == 'image':
        def _run():
            try:
                run_image_pipeline(file_path, original_filename)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
    else:
        def _run():
            try:
                run_file_pipeline(file_path, original_filename, source_type)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

    return jsonify({"status": "started", "video_id": source_vid})


@app.route("/api/ingest-text", methods=["POST"])
def api_ingest_text():
    """Accept pasted text and start background processing."""
    from pipeline import run_text_pipeline, _update_status, _generate_source_id

    data = request.get_json()
    title = (data or {}).get('title', '').strip()
    content = (data or {}).get('content', '').strip()

    if not content:
        return jsonify({"error": "No text content provided"}), 400

    if not title:
        title = content[:60] + ("..." if len(content) > 60 else "")

    source_vid = _generate_source_id("text")
    _update_status(source_vid, 'processing', 'Processing text...', 5, title=title)

    def _run():
        try:
            run_text_pipeline(title, content)
        except Exception as e:
            _update_status(source_vid, 'error', 'Failed', 0, error=str(e))

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({"status": "started", "video_id": source_vid})


@app.route("/api/status/<video_id>")
def api_status(video_id):
    """Poll processing status for a source."""
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


@app.route("/api/source/<int:source_id>", methods=["DELETE"])
def api_delete_source(source_id):
    """Delete a source and re-synthesize the domain."""
    from pipeline import _update_status
    from domain_synthesizer import resynthesize_domain_full

    conn = None
    try:
        conn = get_db()
        source = conn.execute(
            "SELECT id, video_id, domain_id, file_path FROM sources WHERE id = ?",
            (source_id,),
        ).fetchone()

        if not source:
            return jsonify({"error": "Source not found"}), 404

        source = dict(source)
        domain_id = source['domain_id']
        video_id = source['video_id']
        file_path = source.get('file_path')

        # Manually delete insights then source (don't rely on PRAGMA foreign_keys)
        conn.execute("DELETE FROM insights WHERE source_id = ?", (source_id,))
        conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        conn.commit()

        # Delete uploaded file from disk if it exists
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

        # Check if domain has remaining sources
        remaining = conn.execute(
            "SELECT COUNT(*) FROM sources WHERE domain_id = ? AND status = 'processed'",
            (domain_id,),
        ).fetchone()[0]

        if remaining > 0 and domain_id:
            # Re-synthesize in background
            _update_status(video_id, 'processing', 'Re-synthesizing...', 50)

            def _resynthesize():
                try:
                    resynthesize_domain_full(domain_id)
                    _update_status(video_id, 'complete', 'Done', 100)
                except Exception as e:
                    _update_status(video_id, 'error', 'Re-synthesis failed', 0, error=str(e))

            thread = threading.Thread(target=_resynthesize, daemon=True)
            thread.start()

            # Get domain name
            domain_row = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
            domain_name = domain_row[0] if domain_row else None

            return jsonify({
                "status": "resynthesizing",
                "video_id": video_id,
                "domain_name": domain_name,
            })

        elif domain_id:
            # No sources remain — clear synthesis, keep domain
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("DELETE FROM syntheses WHERE domain_id = ?", (domain_id,))
            conn.execute(
                "UPDATE domains SET source_count = 0, insight_count = 0, updated_at = ? WHERE id = ?",
                (now, domain_id),
            )
            conn.commit()

            domain_row = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
            domain_name = domain_row[0] if domain_row else None

            return jsonify({
                "status": "cleared",
                "domain_name": domain_name,
            })

        return jsonify({"status": "deleted"})

    except Exception as e:
        logger.error(f"Delete source failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/reprocess/<int:source_id>", methods=["POST"])
def api_reprocess(source_id):
    """Re-process an existing source with current extraction prompts."""
    from pipeline import reprocess_pipeline, _update_status

    conn = None
    try:
        conn = get_db()
        source = conn.execute(
            "SELECT id, video_id, title FROM sources WHERE id = ?",
            (source_id,),
        ).fetchone()
        conn.close()
        conn = None

        if not source:
            return jsonify({"error": "Source not found"}), 404

        source = dict(source)
        video_id = source['video_id']

        _update_status(video_id, 'processing', 'Starting re-process...', 5,
                       title=source.get('title', ''))

        def _run():
            try:
                reprocess_pipeline(source_id)
            except Exception as e:
                _update_status(video_id, 'error', 'Failed', 0, error=str(e))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        return jsonify({"status": "started", "video_id": video_id})

    except Exception as e:
        logger.error(f"Reprocess failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
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

    try:
        result = query_domain(int(domain_id), question)
    except (ValueError, TypeError):
        return jsonify({"answer": "Invalid domain.", "sources_used": 0})
    return jsonify(result)


@app.route("/api/backfill-embeddings", methods=["POST"])
def api_backfill_embeddings():
    """Generate embeddings for all insights missing them."""
    from embeddings import batch_generate_embeddings, serialize_embedding

    conn = None
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT id, title, content FROM insights WHERE embedding IS NULL"
        ).fetchall()

        if not rows:
            return jsonify({"status": "ok", "message": "All insights already have embeddings", "count": 0})

        total = 0
        batch_size = 10
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            texts = [f"{r['title']} {r['content']}" for r in batch]
            embeddings = batch_generate_embeddings(texts)

            for row, emb in zip(batch, embeddings):
                if emb:
                    conn.execute(
                        "UPDATE insights SET embedding = ? WHERE id = ?",
                        (serialize_embedding(emb), row['id']),
                    )
                    total += 1
            conn.commit()

        return jsonify({"status": "ok", "message": f"Generated {total} embeddings", "count": total})

    except Exception as e:
        logger.error(f"Backfill embeddings failed: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/generate-visual/<int:domain_id>", methods=["POST"])
def api_generate_visual(domain_id):
    """Generate an interactive HTML/SVG visual from domain synthesis using Claude."""
    from visual_generator import generate_visual

    conn = None
    try:
        conn = get_db()

        # Get latest synthesis
        synthesis_row = conn.execute(
            "SELECT id, content FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
            (domain_id,),
        ).fetchone()

        if not synthesis_row:
            return jsonify({"error": "No synthesis found for this domain"}), 404

        synthesis = dict(synthesis_row)

        # Generate visual via Claude
        html = generate_visual(synthesis['content'])
        if not html:
            return jsonify({"error": "Visual generation failed. Check that ANTHROPIC_API_KEY is configured."}), 500

        # Cache in database
        conn.execute(
            "UPDATE syntheses SET visual_html = ? WHERE id = ?",
            (html, synthesis['id']),
        )
        conn.commit()

        return jsonify({"status": "ok", "html": html})

    except Exception as e:
        logger.error(f"Visual generation failed: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/visual/<int:domain_id>")
def api_visual(domain_id):
    """Return cached visual HTML for a domain."""
    conn = None
    try:
        conn = get_db()
        row = conn.execute(
            "SELECT visual_html FROM syntheses WHERE domain_id = ? AND visual_html IS NOT NULL ORDER BY version DESC LIMIT 1",
            (domain_id,),
        ).fetchone()

        if not row or not row['visual_html']:
            return jsonify({"html": None})

        return jsonify({"html": row['visual_html']})

    except Exception as e:
        return jsonify({"html": None})
    finally:
        if conn:
            conn.close()


# ── Entry Point ──

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5002)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    print(f"\n  Domain Intelligence Engine")
    print(f"  Running at: http://localhost:{args.port}\n")

    app.run(host="0.0.0.0", port=args.port, debug=args.debug)
