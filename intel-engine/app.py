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
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.utils import secure_filename

import config
from migrations import run_migrations
from auth import User

# Run migrations at import time so they execute under gunicorn too
run_migrations()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32).hex())
app.config['MAX_CONTENT_LENGTH'] = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Flask-Login setup
login_manager = LoginManager(app)
login_manager.login_view = 'login_page'

@login_manager.user_loader
def load_user(user_id):
    return User.get(int(user_id))

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
# Authentication
# ══════════════════════════════════════════════════════════════

@app.route("/login", methods=["GET", "POST"])
def login_page():
    """Login page."""
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == "POST":
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = User.get_by_email(email)
        if user and user.check_password(password):
            login_user(user, remember=True)
            return redirect(request.args.get('next') or url_for('index'))
        return render_template("login.html", error="Invalid email or password.")

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register_page():
    """Registration page."""
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == "POST":
        display_name = request.form.get('display_name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        if not email or not password:
            return render_template("register.html", error="Email and password are required.")
        if len(password) < 6:
            return render_template("register.html", error="Password must be at least 6 characters.")

        existing = User.get_by_email(email)
        if existing:
            return render_template("register.html", error="An account with this email already exists.")

        user = User.create(email, password, display_name or None)
        login_user(user, remember=True)
        return redirect(url_for('index'))

    return render_template("register.html")


@app.route("/logout")
def logout():
    """Log out and redirect to login."""
    logout_user()
    return redirect(url_for('login_page'))


# ══════════════════════════════════════════════════════════════
# Pages
# ══════════════════════════════════════════════════════════════

@app.route("/")
@login_required
def index():
    """Main page — ingestion hub + domain grid. Homepage is for adding content."""
    if needs_setup():
        return redirect(url_for('setup_page'))

    uid = current_user.id
    conn = None
    domains = []
    try:
        conn = get_db()
        domains = [dict(r) for r in conn.execute(
            """SELECT d.*, p.name as parent_name
               FROM domains d
               LEFT JOIN domains p ON d.parent_id = p.id
               WHERE (d.user_id = ? OR d.user_id IS NULL) AND d.level = 1
               ORDER BY d.updated_at DESC""",
            (uid,),
        ).fetchall()]
    except sqlite3.OperationalError:
        pass
    finally:
        if conn:
            conn.close()

    return render_template("intel.html", domains=domains, domain=None, synthesis=None)


def _extract_tldr_from_synthesis(content: str) -> str:
    """Extract the TLDR section from a synthesis markdown string."""
    if not content:
        return ""
    lines = content.split('\n')
    in_tldr = False
    tldr_lines = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith('## ') and 'tldr' in stripped:
            in_tldr = True
            continue
        if in_tldr and line.strip().startswith('## '):
            break
        if in_tldr:
            tldr_lines.append(line)
    return '\n'.join(tldr_lines).strip()


@app.route("/domain/<domain_name>")
@login_required
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

        uid = current_user.id
        domain = conn.execute(
            "SELECT * FROM domains WHERE name = ? COLLATE NOCASE AND (user_id = ? OR user_id IS NULL)",
            (domain_name, uid),
        ).fetchone()
        if not domain:
            return redirect(url_for('index'))
        domain = dict(domain)

        # Level-2 sub-topics: render using parent's data, scoped to sub-topic
        subtopic_scope = None
        child_ids = []
        if domain.get('level') == 2 and domain.get('parent_id'):
            subtopic_scope = domain['name']
            parent = conn.execute("SELECT * FROM domains WHERE id = ?", (domain['parent_id'],)).fetchone()
            if parent:
                parent = dict(parent)
                # Use parent's domain ID for content, but keep the sub-topic domain object for display
                content_domain_ids = [parent['id']]
            else:
                content_domain_ids = [domain['id']]
        # Determine content source based on hierarchy level
        elif domain.get('level') == 0:
            content_domain_ids = [domain['id']]
            # Parent category: aggregate all child domains
            child_ids = [r[0] for r in conn.execute(
                "SELECT id FROM domains WHERE parent_id = ? AND level = 1", (domain['id'],)
            ).fetchall()]
            if child_ids:
                content_domain_ids = child_ids
        else:
            content_domain_ids = [domain['id']]

        # Latest synthesis
        synthesis_row = None
        synthesis = None
        synthesis_html = ""
        suggested_questions = []

        if domain.get('level') == 0 and child_ids:
            # Level-0: build aggregated TLDR from all children
            child_tldrs = []
            for cid in child_ids:
                row = conn.execute(
                    "SELECT content FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
                    (cid,),
                ).fetchone()
                cname = conn.execute("SELECT name FROM domains WHERE id = ?", (cid,)).fetchone()
                if row and cname:
                    tldr = _extract_tldr_from_synthesis(row["content"])
                    child_tldrs.append({"name": cname["name"], "tldr_md": tldr})

            if child_tldrs:
                parts = []
                for ct in child_tldrs:
                    section = f"## {ct['name']}\n\n{ct['tldr_md']}" if ct['tldr_md'] else f"## {ct['name']}\n\n*No summary yet.*"
                    parts.append(section)
                aggregated_md = '\n\n---\n\n'.join(parts)
                if md:
                    synthesis_html = md.markdown(aggregated_md, extensions=['extra', 'nl2br', 'fenced_code'])
                else:
                    synthesis_html = f"<p>{aggregated_md}</p>"
                synthesis = {
                    "content": aggregated_md, "version": 1, "suggested_questions": "[]",
                    "source_count": domain.get("source_count", 0),
                    "insight_count": domain.get("insight_count", 0),
                }
        else:
            # Level 1 or level 2 (scoped): use the domain's own synthesis
            target_id = content_domain_ids[0] if content_domain_ids else domain['id']
            synthesis_row = conn.execute(
                "SELECT * FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
                (target_id,),
            ).fetchone()
            synthesis = dict(synthesis_row) if synthesis_row else None
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

        # Sources with insight counts — aggregate from all content domains
        placeholders = ','.join('?' * len(content_domain_ids))
        sources = [dict(r) for r in conn.execute(f"""
            SELECT s.*, COUNT(i.id) as insight_count
            FROM sources s
            LEFT JOIN insights i ON i.source_id = s.id
            WHERE s.domain_id IN ({placeholders}) AND s.status = 'processed'
            GROUP BY s.id
            ORDER BY s.created_at DESC
        """, content_domain_ids).fetchall()]

        domains = [dict(r) for r in conn.execute(
            """SELECT d.*, p.name as parent_name
               FROM domains d
               LEFT JOIN domains p ON d.parent_id = p.id
               WHERE (d.user_id = ? OR d.user_id IS NULL) AND d.level = 1
               ORDER BY d.updated_at DESC""",
            (uid,),
        ).fetchall()]

        # Build domain tree for sidebar
        tree_rows = [dict(r) for r in conn.execute(
            "SELECT id, name, description, icon, parent_id, level, path, source_count, insight_count FROM domains WHERE (user_id = ? OR user_id IS NULL) ORDER BY level ASC, name ASC",
            (uid,),
        ).fetchall()]
        by_id = {r['id']: {**r, 'children': []} for r in tree_rows}
        domain_tree = []
        for r in tree_rows:
            node = by_id[r['id']]
            pid = r.get('parent_id')
            if pid and pid in by_id:
                by_id[pid]['children'].append(node)
            elif r.get('level', 0) == 0 or not pid:
                domain_tree.append(node)

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
                           domains=domains,
                           domain_tree=domain_tree,
                           subtopic_scope=subtopic_scope)


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
@login_required
def api_ingest():
    """Accept a URL (YouTube or article) and start background processing."""
    from pipeline import (
        run_pipeline, run_article_pipeline, run_playlist_pipeline,
        check_already_ingested, _update_status, detect_source_type,
        _generate_source_id,
    )
    from youtube_ingest import extract_video_id
    from article_ingest import generate_article_id

    data = request.get_json()
    url = (data or {}).get('url', '').strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    uid = current_user.id
    source_type = detect_source_type(url)

    if source_type == 'playlist':
        playlist_vid = _generate_source_id("playlist")
        _update_status(playlist_vid, 'processing', 'Extracting playlist...', 5)

        def _run():
            try:
                run_playlist_pipeline(url, user_id=uid, tracking_id=playlist_vid)
            except Exception as e:
                _update_status(playlist_vid, 'error', 'Failed', 0, error=str(e))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return jsonify({"status": "started", "video_id": playlist_vid, "is_playlist": True})

    elif source_type == 'youtube':
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
                run_pipeline(url, user_id=uid)
            except Exception as e:
                logger.error(f"Pipeline thread failed for {video_id}: {e}", exc_info=True)
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
                run_article_pipeline(url, user_id=uid)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return jsonify({"status": "started", "video_id": source_vid})


@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    """Accept a file upload and start background processing."""
    from pipeline import (
        run_file_pipeline, run_image_pipeline, _update_status, _hash_file_id,
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

    # Content-based tracking ID (deterministic — same file = same ID for dedup)
    prefix = "img" if source_type == 'image' else "file"
    source_vid = _hash_file_id(file_path, prefix)
    _update_status(source_vid, 'processing', f'Uploading {original_filename}...', 5,
                   title=original_filename)

    uid = current_user.id
    if source_type == 'image':
        def _run():
            try:
                run_image_pipeline(file_path, original_filename, user_id=uid, tracking_id=source_vid)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
    else:
        def _run():
            try:
                run_file_pipeline(file_path, original_filename, source_type, user_id=uid, tracking_id=source_vid)
            except Exception as e:
                _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

    return jsonify({"status": "started", "video_id": source_vid})


@app.route("/api/ingest-text", methods=["POST"])
@login_required
def api_ingest_text():
    """Accept pasted text and start background processing."""
    from pipeline import run_text_pipeline, _update_status, _hash_text_id

    data = request.get_json()
    title = (data or {}).get('title', '').strip()
    content = (data or {}).get('content', '').strip()

    if not content:
        return jsonify({"error": "No text content provided"}), 400

    if not title:
        title = content[:60] + ("..." if len(content) > 60 else "")

    uid = current_user.id
    source_vid = _hash_text_id(content)
    _update_status(source_vid, 'processing', 'Processing text...', 5, title=title)

    def _run():
        try:
            run_text_pipeline(title, content, user_id=uid, tracking_id=source_vid)
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
@login_required
def api_domains():
    """List all knowledge domains for current user."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        domains = [dict(r) for r in conn.execute(
            "SELECT * FROM domains WHERE (user_id = ? OR user_id IS NULL) ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()]
        return jsonify({"domains": domains})
    except sqlite3.OperationalError:
        return jsonify({"domains": []})
    finally:
        if conn:
            conn.close()


@app.route("/api/domain-tree")
@login_required
def api_domain_tree():
    """Return the full domain hierarchy as nested JSON for the current user."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        rows = [dict(r) for r in conn.execute(
            "SELECT id, name, description, icon, parent_id, level, path, source_count, insight_count FROM domains WHERE (user_id = ? OR user_id IS NULL) ORDER BY level ASC, name ASC",
            (uid,),
        ).fetchall()]

        # Build tree structure
        by_id = {r['id']: {**r, 'children': []} for r in rows}
        roots = []
        for r in rows:
            node = by_id[r['id']]
            parent_id = r.get('parent_id')
            if parent_id and parent_id in by_id:
                by_id[parent_id]['children'].append(node)
            elif r.get('level', 0) == 0 or not parent_id:
                roots.append(node)

        return jsonify({"tree": roots})
    except sqlite3.OperationalError:
        return jsonify({"tree": []})
    finally:
        if conn:
            conn.close()


@app.route("/api/domains/merge", methods=["POST"])
@login_required
def api_merge_domains():
    """Merge source domain into target domain. Moves sources + insights, re-synthesizes."""
    from domain_synthesizer import resynthesize_domain_full

    data = request.get_json() or {}
    source_id = data.get('source_id')
    target_id = data.get('target_id')
    if not source_id or not target_id or source_id == target_id:
        return jsonify({"error": "Invalid source_id or target_id"}), 400

    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        # Verify both domains belong to current user
        src = conn.execute("SELECT id, name, level FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (source_id, uid)).fetchone()
        tgt = conn.execute("SELECT id, name, level FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (target_id, uid)).fetchone()
        if not src or not tgt:
            return jsonify({"error": "Domain not found"}), 404

        # Move sources and insights to target
        conn.execute("UPDATE sources SET domain_id = ? WHERE domain_id = ?", (target_id, source_id))
        conn.execute("UPDATE insights SET domain_id = ? WHERE domain_id = ?", (target_id, source_id))

        # Move sub-topics (children) to target
        conn.execute("UPDATE domains SET parent_id = ? WHERE parent_id = ? AND level = 2", (target_id, source_id))

        # Update counts on target
        src_count = conn.execute("SELECT COUNT(*) FROM sources WHERE domain_id = ? AND status = 'processed'", (target_id,)).fetchone()[0]
        ins_count = conn.execute("SELECT COUNT(*) FROM insights WHERE domain_id = ?", (target_id,)).fetchone()[0]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("UPDATE domains SET source_count = ?, insight_count = ?, updated_at = ? WHERE id = ?",
                      (src_count, ins_count, now, target_id))

        # Delete source domain
        conn.execute("DELETE FROM domains WHERE id = ?", (source_id,))
        conn.commit()

        # Re-synthesize target in background
        def _resynthesize():
            try:
                resynthesize_domain_full(target_id)
            except Exception as e:
                logger.error(f"Re-synthesis after merge failed: {e}")

        thread = threading.Thread(target=_resynthesize, daemon=True)
        thread.start()

        return jsonify({"status": "ok", "message": f"Merged '{src['name']}' into '{tgt['name']}'", "target_name": tgt['name']})
    except Exception as e:
        logger.error(f"Domain merge failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/domains/move", methods=["POST"])
@login_required
def api_move_domain():
    """Move a domain under a different parent."""
    data = request.get_json() or {}
    domain_id = data.get('domain_id')
    new_parent_id = data.get('new_parent_id')
    if not domain_id:
        return jsonify({"error": "domain_id required"}), 400

    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        domain = conn.execute("SELECT id, name, level FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (domain_id, uid)).fetchone()
        if not domain:
            return jsonify({"error": "Domain not found"}), 404

        if new_parent_id:
            parent = conn.execute("SELECT id, name, path FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (new_parent_id, uid)).fetchone()
            if not parent:
                return jsonify({"error": "Parent not found"}), 404
            new_path = f"{parent['path']}/{domain['name']}"
            conn.execute("UPDATE domains SET parent_id = ?, path = ?, updated_at = ? WHERE id = ?",
                          (new_parent_id, new_path, datetime.now(timezone.utc).isoformat(), domain_id))
        else:
            # Move to root (make it a parent category)
            conn.execute("UPDATE domains SET parent_id = NULL, level = 0, path = ?, updated_at = ? WHERE id = ?",
                          (f"/{domain['name']}", datetime.now(timezone.utc).isoformat(), domain_id))

        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        logger.error(f"Domain move failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/domains/rename", methods=["POST"])
@login_required
def api_rename_domain():
    """Rename a domain."""
    data = request.get_json() or {}
    domain_id = data.get('domain_id')
    new_name = (data.get('new_name') or '').strip()
    if not domain_id or not new_name:
        return jsonify({"error": "domain_id and new_name required"}), 400

    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        domain = conn.execute("SELECT id, name, path FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (domain_id, uid)).fetchone()
        if not domain:
            return jsonify({"error": "Domain not found"}), 404

        old_name = domain['name']
        old_path = domain['path'] or ''
        new_path = old_path.replace(f"/{old_name}", f"/{new_name}") if old_path else f"/{new_name}"

        now = datetime.now(timezone.utc).isoformat()
        conn.execute("UPDATE domains SET name = ?, path = ?, updated_at = ? WHERE id = ?",
                      (new_name, new_path, now, domain_id))

        # Update children paths too
        children = conn.execute("SELECT id, path FROM domains WHERE parent_id = ?", (domain_id,)).fetchall()
        for child in children:
            if child['path']:
                child_new_path = child['path'].replace(f"/{old_name}/", f"/{new_name}/")
                conn.execute("UPDATE domains SET path = ?, updated_at = ? WHERE id = ?",
                              (child_new_path, now, child['id']))

        conn.commit()
        return jsonify({"status": "ok", "new_name": new_name})
    except Exception as e:
        logger.error(f"Domain rename failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/domains/<int:domain_id>", methods=["DELETE"])
@login_required
def api_delete_domain(domain_id):
    """Delete a domain and all its sources/insights."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        domain = conn.execute("SELECT id, name FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (domain_id, uid)).fetchone()
        if not domain:
            return jsonify({"error": "Domain not found"}), 404

        # Delete insights, sources, syntheses, sub-topics, then domain
        conn.execute("DELETE FROM insights WHERE domain_id = ?", (domain_id,))
        conn.execute("DELETE FROM sources WHERE domain_id = ?", (domain_id,))
        conn.execute("DELETE FROM syntheses WHERE domain_id = ?", (domain_id,))
        # Delete sub-topics (level 2 children)
        conn.execute("DELETE FROM domains WHERE parent_id = ? AND level = 2", (domain_id,))
        conn.execute("DELETE FROM domains WHERE id = ?", (domain_id,))
        conn.commit()

        return jsonify({"status": "ok", "message": f"Deleted '{domain['name']}'"})
    except Exception as e:
        logger.error(f"Domain delete failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/source/<int:source_id>", methods=["DELETE"])
@login_required
def api_delete_source(source_id):
    """Delete a source and re-synthesize the domain."""
    from pipeline import _update_status
    from domain_synthesizer import resynthesize_domain_full

    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        source = conn.execute(
            "SELECT id, video_id, domain_id, file_path FROM sources WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
            (source_id, uid),
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
@login_required
def api_reprocess(source_id):
    """Re-process an existing source with current extraction prompts."""
    from pipeline import reprocess_pipeline, _update_status

    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        source = conn.execute(
            "SELECT id, video_id, title FROM sources WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
            (source_id, uid),
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
@login_required
def api_query():
    """Ask a question against a domain's knowledge."""
    from intel_query import query_domain

    data = request.get_json()
    domain_id = (data or {}).get('domain_id')
    question = (data or {}).get('question', '').strip()

    if not domain_id or not question:
        return jsonify({"answer": "Please provide a question.", "sources_used": 0})

    # Verify domain belongs to current user
    uid = current_user.id
    conn = get_db()
    domain = conn.execute("SELECT id FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (int(domain_id), uid)).fetchone()
    conn.close()
    if not domain:
        return jsonify({"answer": "Domain not found.", "sources_used": 0})

    try:
        result = query_domain(int(domain_id), question)
    except (ValueError, TypeError):
        return jsonify({"answer": "Invalid domain.", "sources_used": 0})
    return jsonify(result)


@app.route("/api/backfill-embeddings", methods=["POST"])
@login_required
def api_backfill_embeddings():
    """Generate embeddings for all insights missing them."""
    from embeddings import batch_generate_embeddings, serialize_embedding

    conn = None
    try:
        conn = get_db()
        uid = current_user.id
        rows = conn.execute(
            """SELECT i.id, i.title, i.content FROM insights i
               JOIN domains d ON i.domain_id = d.id
               WHERE i.embedding IS NULL AND (d.user_id = ? OR d.user_id IS NULL)""",
            (uid,),
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
@login_required
def api_generate_visual(domain_id):
    """Generate an interactive HTML/SVG visual from domain synthesis using Claude."""
    from visual_generator import generate_visual

    uid = current_user.id
    conn = None
    try:
        conn = get_db()

        # Verify domain belongs to user
        domain = conn.execute("SELECT id FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (domain_id, uid)).fetchone()
        if not domain:
            return jsonify({"error": "Domain not found"}), 404

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
@login_required
def api_visual(domain_id):
    """Return cached visual HTML for a domain."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        # Verify domain belongs to user
        domain = conn.execute("SELECT id FROM domains WHERE id = ? AND (user_id = ? OR user_id IS NULL)", (domain_id, uid)).fetchone()
        if not domain:
            return jsonify({"error": "Domain not found"}), 404
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


@app.route("/api/taxonomy-changes")
@login_required
def api_taxonomy_changes():
    """Return recent taxonomy changes for notification display (Tier 3B)."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        changes = conn.execute("""
            SELECT tc.id, tc.domain_id, tc.change_type, tc.description, tc.created_at,
                   d.name as domain_name
            FROM taxonomy_changes tc
            JOIN domains d ON tc.domain_id = d.id
            WHERE (tc.user_id = ? OR tc.user_id IS NULL) AND tc.dismissed = 0
            ORDER BY tc.created_at DESC LIMIT 10
        """, (uid,)).fetchall()
        return jsonify([dict(c) for c in changes])
    except Exception:
        return jsonify([])
    finally:
        if conn:
            conn.close()


@app.route("/api/taxonomy-changes/<int:change_id>/dismiss", methods=["POST"])
@login_required
def api_dismiss_taxonomy_change(change_id):
    """Dismiss a taxonomy change notification."""
    conn = None
    try:
        conn = get_db()
        conn.execute("UPDATE taxonomy_changes SET dismissed = 1 WHERE id = ?", (change_id,))
        conn.commit()
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"ok": False}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/threshold-concepts")
@login_required
def api_threshold_concepts():
    """Identify foundational concepts that appear across 3+ domains (Threshold Concepts).

    Queries the topics JSON field across all insights, finds topics with high
    cross-domain spread — these are the foundational concepts that connect
    different areas of understanding.
    """
    import json as _json
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT i.domain_id, i.topics, d.name as domain_name
            FROM insights i
            JOIN domains d ON i.domain_id = d.id
            WHERE d.user_id = ? AND i.topics IS NOT NULL AND i.topics != '' AND i.topics != '[]'
        """, (uid,)).fetchall()

        # topic → set of domain names
        topic_domains = {}
        for r in rows:
            try:
                topics = _json.loads(r['topics']) if isinstance(r['topics'], str) else r['topics']
                if isinstance(topics, list):
                    for t in topics:
                        if isinstance(t, str):
                            t = t.lower().strip()
                            if t and len(t) > 2:
                                if t not in topic_domains:
                                    topic_domains[t] = set()
                                topic_domains[t].add(r['domain_name'])
            except (ValueError, TypeError):
                continue

        # Filter to topics appearing in 3+ domains
        threshold = [
            {"topic": topic, "domains": sorted(domains), "spread": len(domains)}
            for topic, domains in topic_domains.items()
            if len(domains) >= 3
        ]
        threshold.sort(key=lambda x: x['spread'], reverse=True)

        return jsonify(threshold[:15])
    except Exception:
        return jsonify([])
    finally:
        if conn:
            conn.close()


def _build_conceptual_edges(conn, user_id):
    """Build topic-based conceptual edges between domains (Connectivism).

    Finds domains that share 2+ topics in their insights, creating organic
    cross-domain connections based on actual content overlap.
    """
    import json as _json
    try:
        rows = conn.execute("""
            SELECT i.domain_id, i.topics
            FROM insights i
            JOIN domains d ON i.domain_id = d.id
            WHERE d.user_id = ? AND i.topics IS NOT NULL AND i.topics != '' AND i.topics != '[]'
        """, (user_id,)).fetchall()
    except Exception:
        return []

    # Build domain → topic set mapping
    domain_topics = {}
    for r in rows:
        did = r['domain_id']
        try:
            topics = _json.loads(r['topics']) if isinstance(r['topics'], str) else r['topics']
            if isinstance(topics, list):
                if did not in domain_topics:
                    domain_topics[did] = set()
                domain_topics[did].update(t.lower().strip() for t in topics if isinstance(t, str))
        except (ValueError, TypeError):
            continue

    # Find domain pairs sharing 2+ topics
    edges = []
    seen = set()
    domain_ids = list(domain_topics.keys())
    for i, d1 in enumerate(domain_ids):
        for d2 in domain_ids[i + 1:]:
            shared = domain_topics[d1] & domain_topics[d2]
            if len(shared) >= 2:
                pair = (min(d1, d2), max(d1, d2))
                if pair not in seen:
                    seen.add(pair)
                    edges.append({
                        "source": d1, "target": d2,
                        "type": "conceptual",
                        "label": ", ".join(sorted(shared)[:3]),
                        "weight": len(shared),
                    })
    return edges


@app.route("/api/knowledge-graph")
@login_required
def api_knowledge_graph():
    """Return domain nodes + edges for the knowledge graph visualization."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()

        # Domain nodes
        domains = conn.execute("""
            SELECT id, name, level, parent_id, source_count, insight_count
            FROM domains WHERE user_id = ?
            ORDER BY level ASC, insight_count DESC
        """, (uid,)).fetchall()

        # Source nodes (processed only)
        sources = conn.execute("""
            SELECT id, title, url, domain_id, source_type
            FROM sources WHERE user_id = ? AND status = 'processed'
            ORDER BY created_at DESC
        """, (uid,)).fetchall()

        # Cross-domain reference edges
        refs = conn.execute("""
            SELECT source_domain_id, target_domain_id, relationship
            FROM domain_references
            WHERE source_domain_id IN (SELECT id FROM domains WHERE user_id = ?)
        """, (uid,)).fetchall()

        # Build domain nodes (integer IDs)
        domain_nodes = [
            {"id": r["id"], "name": r["name"], "level": r["level"],
             "parentId": r["parent_id"], "sources": r["source_count"],
             "insights": r["insight_count"], "type": "domain"}
            for r in domains
        ]

        # Build source nodes (string IDs to avoid collision with domain IDs)
        source_nodes = [
            {"id": "s-" + str(r["id"]), "name": r["title"] or "Untitled",
             "type": "source", "sourceType": r["source_type"],
             "url": r["url"], "domainId": r["domain_id"]}
            for r in sources
        ]

        # Edges: hierarchy + source-to-domain + cross-references
        hierarchy_edges = [
            {"source": r["parent_id"], "target": r["id"], "type": "hierarchy"}
            for r in domains if r["parent_id"]
        ]
        source_edges = [
            {"source": "s-" + str(r["id"]), "target": r["domain_id"], "type": "source"}
            for r in sources if r["domain_id"]
        ]
        ref_edges = [
            {"source": r["source_domain_id"], "target": r["target_domain_id"],
             "type": "reference", "label": r["relationship"]}
            for r in refs
        ]

        # Conceptual edges: domains sharing topics (Connectivism)
        conceptual_edges = _build_conceptual_edges(conn, uid)

        return jsonify({
            "nodes": domain_nodes + source_nodes,
            "edges": hierarchy_edges + source_edges + ref_edges + conceptual_edges,
        })

    except Exception as e:
        logger.error(f"Knowledge graph failed: {e}")
        return jsonify({"nodes": [], "edges": []}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/reset-all", methods=["POST"])
@login_required
def api_reset_all():
    """Delete ALL domains, sources, insights, syntheses for the current user."""
    uid = current_user.id
    conn = None
    try:
        conn = get_db()
        # Delete in dependency order: refs → insights → sources → syntheses → domains
        # Handle both user-owned and legacy (user_id IS NULL) data
        conn.execute("""DELETE FROM domain_references WHERE source_domain_id IN (
            SELECT id FROM domains WHERE user_id = ? OR user_id IS NULL)""", (uid,))
        conn.execute("""DELETE FROM insights WHERE domain_id IN (
            SELECT id FROM domains WHERE user_id = ? OR user_id IS NULL)""", (uid,))
        conn.execute("DELETE FROM sources WHERE user_id = ? OR user_id IS NULL", (uid,))
        conn.execute("""DELETE FROM syntheses WHERE domain_id IN (
            SELECT id FROM domains WHERE user_id = ? OR user_id IS NULL)""", (uid,))
        conn.execute("DELETE FROM domains WHERE user_id = ? OR user_id IS NULL", (uid,))
        conn.commit()

        # Clean up uploaded files
        import glob
        for f in glob.glob(str(config.UPLOADS_DIR / "*")):
            try:
                os.remove(f)
            except Exception:
                pass

        return jsonify({"status": "ok", "message": "All data cleared"})
    except Exception as e:
        logger.error(f"Reset all failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
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
