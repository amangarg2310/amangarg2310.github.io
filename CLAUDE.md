# BiteClimb - Monorepo Architecture Documentation

## Repository Structure

This is a monorepo hosted on GitHub Pages containing three projects:

```
├── biteclimb/               # Community-driven product tier ranking app
├── outlier-content-engine/  # AI-powered competitive intelligence platform (ScoutAI)
├── intel-engine/            # Domain Intelligence Engine — YouTube knowledge platform
└── render.yaml              # Render.com deployment config
```

---

## BiteClimb

**What it is:** A community-driven food/beverage rating and ranking platform where users create tier lists, rate products, and engage in Elo-style matchup comparisons.

**Tech Stack:** React 19, TypeScript, Vite 7, TailwindCSS 4, Zustand, React Query, Express 5, SQLite (better-sqlite3), JWT auth

### Key Commands

```bash
cd biteclimb
npm install
npm run dev:full    # Run frontend + backend concurrently
npm run dev         # Frontend only (Vite)
npm run dev:server  # Backend only (tsx watch)
npm run build       # TypeScript check + Vite build
npm run lint        # ESLint
npm run seed        # Seed the SQLite database
```

### Architecture

- **Frontend** (`src/`): React SPA with React Router. Pages in `src/pages/`, components in `src/components/`, API layer in `src/api/`, state in `src/stores/` (Zustand).
- **Backend** (`server/`): Express.js REST API on port 3001. Routes in `server/routes/`, database in `server/db.ts`, JWT auth in `server/auth.ts`.
- **Database:** SQLite via better-sqlite3. 18 tables covering users, products, brands, ratings, reviews, tier lists, follows, activity, Elo rankings, and FTS indexes.

### Key Features

- Tier list builder (S/A/B/C/D/F rankings)
- Product ratings and reviews with photos
- Elo-based head-to-head matchups
- Social features (follow users, activity feeds)
- "Tries" diary for tracking products
- Category-based discovery and search

---

## Outlier Content Engine (ScoutAI)

See `outlier-content-engine/CLAUDE.md` for detailed documentation.

**Tech Stack:** Python 3.11, Flask, SQLite, OpenAI GPT-4o-mini, Apify collectors

---

## Distylme (intel-engine/)

**What it is:** A domain intelligence engine that ingests expert content from multiple sources (YouTube videos, YouTube playlists, articles, PDFs, images, text), processes it through an LLM pipeline, and builds a compounding knowledge base with hierarchical domain taxonomy. Deployed at [distylme.com](https://distylme.com).

**Tech Stack:** Python 3.11, Flask, Flask-Login, SQLite (FTS5 + vector embeddings + WAL mode), OpenAI GPT-4o-mini (extraction + synthesis), Anthropic Claude Sonnet (image analysis only), Supadata (transcript fallback)

### Key Commands

```bash
cd intel-engine
pip install -r requirements.txt
python migrations.py    # Create database tables
python app.py           # Run at http://localhost:5002
```

### Architecture

- **Pipeline** (`pipeline.py`): Source → topic-aware chunk → structured claim extraction → domain classification → contextual embedding → synthesis with convergence analysis → cascade to parent levels → taxonomy evolution check → ingestion impact summary. All DB connections use `_get_conn()` helper with WAL mode + `busy_timeout=5000`.
- **Multi-source ingestors**: `youtube_ingest.py` (transcripts via Supadata, playlist support via RSS + HTML scraping fallback), `article_ingest.py` (trafilatura + requests/cookies fallback + BeautifulSoup, HTTP 403 handling), `file_ingest.py` (PDF/DOCX/PPTX), `image_ingest.py` (OpenAI Vision)
- **Domain taxonomy** (`domain_detector.py`): Hierarchical 3-level — parent category → specific domain → sub-topics. Taxonomy evolution proposes new sub-topics or splits as understanding deepens. Domain creation serialized via `_domain_create_lock` to prevent duplicates during parallel playlist ingestion. Deduplication migration in `migrations.py` cleans up any existing duplicates on startup.
- **RAG query** (`intel_query.py`): Hybrid search (vector + FTS5) → source-grounded answers with `[Source: title]` citations. Cross-domain retrieval for parent-level queries.
- **Domain name collisions**: Same name can exist at different hierarchy levels (e.g. "AI Tools" at level-0 and level-1). `domain_page()` accepts `?level=N` query param to disambiguate; defaults to level-1. Knowledge tree passes `?level=0` for category nodes.
- **Auth** (`auth.py`): Flask-Login session-based, multi-user with per-user data isolation
- **Backend** (`app.py`): Flask web server with REST API. Background processing via threading. Endpoints for ingestion, status polling, knowledge graph, taxonomy changes, threshold concepts.
- **Frontend** (`templates/intel.html`, `static/intel.css`): NotebookLM-inspired scholarly design. Homepage = ingestion hub + domain cards. Domain detail = AI search + convergence indicators + synthesis brief (sub-topic pages show parent's content with matching counts). Knowledge Base page = horizontal mind-map (color-coded: amber categories, indigo domains, emerald sub-topics) with CSS connectors. Knowledge graph overlay with conceptual edges.
- **Database:** SQLite with tables: users, domains (hierarchical), sources (+ ingestion_impact), insights (+ evidence/confidence/topics), syntheses (+ convergence_data/synthesis_level), synthesis_versions, taxonomy_changes, domain_references, usage_logs

### Deduplication

All source types use content-based deterministic IDs to prevent duplicate processing:
- **YouTube**: Video ID from URL (deterministic)
- **Article**: `SHA256(url)[:12]` (deterministic)
- **File/Image**: `SHA256(file_bytes)[:12]` (deterministic)
- **Text**: `SHA256(text_content)[:12]` (deterministic)

Each pipeline calls `check_already_ingested()` before processing. Duplicates return `already_exists` status shown as "Already in your knowledge base" in the UI.

### Progress Tracking

Background processing uses in-memory status dict (`_pipeline_status`) with thread-safe locking. Frontend polls `/api/status/<video_id>` every 1s. Status entries have 10-minute TTL. The tracking ID must be consistent between `app.py` (which returns it to the frontend) and the pipeline function (which updates it) — both use the same content-based ID passed via `tracking_id` parameter.

### Playlist Support (Two-Phase Pipeline)

YouTube playlists are fetched using two strategies:
1. RSS feed (fast, works for channel upload playlists)
2. HTML scraping with `ytInitialData` JSON parsing (fallback for user-created playlists)

Private playlists are detected and the user is told to change to Unlisted. Max 50 videos per playlist (soft cap via `config.MAX_PLAYLIST_VIDEOS`).

**Two-phase processing** (`run_playlist_pipeline`):
- **Phase 1 — Parallel ingestion** (3 workers): transcript + chunk + extract insights + embed + store. Synthesis is SKIPPED (`skip_synthesis=True`) to avoid redundant API calls and rate limiting.
- **Phase 2 — Batch synthesis**: After all videos complete, `resynthesize_domain_full()` runs once per affected domain, then `_cascade_synthesis()` once per domain for parent/grandparent levels.
- This is 3x faster than sequential and eliminates the 10x redundant synthesis calls that occurred when each video synthesized individually.

### Batch Reprocessing

Multiple source reprocesses are debounced on the frontend (600ms) and dispatched to `POST /api/reprocess-batch`. Backend uses the same two-phase pattern as playlists:
- Phase 1: Parallel re-extraction (3 workers) — delete old insights, re-chunk, re-extract, store, embed
- Phase 2: `resynthesize_domain_full()` once per affected domain
- Single source reprocess falls through to existing `POST /api/reprocess/<id>` endpoint unchanged.

### Extraction Diagnostics

When insight extraction fails (0 insights from a chunk), per-chunk error details are stored on the source's `error_message` field:
- "Chunk 0: API error after 3 attempts: RateLimitError"
- "Chunk 1: JSON parse failed (response was TRUNCATED by max_tokens)"

Click the ⚠ icon on any 0-insight source to see a diagnostic popup with transcript preview, chunk count/sizes, and error details. Debug endpoint: `GET /api/source/<id>/debug`.

**Truncation recovery**: If the LLM response is cut off by `max_tokens`, the JSON parser finds the last complete object and salvages all complete insights (Strategy 4 in `_parse_insights_json`).

### Synthesis Prompts

Both `SYNTHESIS_PROMPT` and `FULL_RESYNTHESIS_PROMPT` use a "teacher layer" TLDR format:
- **Context-setting opener**: One sentence framing what the domain IS and why it matters
- **Bullets lead with "why"**: Each bullet explains significance before the specific detail
- Detailed sections below TLDR organized by workflow/task, not abstract categories

Suggested questions are generated as simple one-liner questions (under 15 words, beginner-friendly) via `_generate_suggested_question()`. Generated in background threads for both sub-topic and parent/category syntheses.

### Design System

The UI follows a scholarly, NotebookLM-inspired aesthetic:
- **Color palette**: Warm neutrals (`#fafaf8` bg, `#e4e0da` borders), muted indigo accent (`#4f6ef7`)
- **Typography**: Inter font, weight 600 max on headings, 1.75 line-height for body
- **Surfaces**: Warm amber left borders on synthesis/TLDR/blockquote cards, soft diffuse shadows
- **Interactions**: No scale transforms on hover (too bouncy), background-shift only, consistent focus rings on all inputs
- **Knowledge graph**: Force-graph with breathing pulse, flowing particles, perpetual drift, canvas-based rendering

### How It Works

1. User registers/logs in, then adds a source (YouTube URL/playlist, article URL, file upload, or paste text)
2. Source ingested → text extracted (type-specific ingestor)
3. Topic-aware chunking splits text at natural boundaries (sentence + vocabulary shift detection)
4. `insight_extractor.py` extracts structured claims: title, content, evidence, source_context, confidence, topics
5. `domain_detector.py` classifies into hierarchical domain; proposes taxonomy evolution if understanding is deepening
6. `embeddings.py` generates contextual embeddings (prepends source metadata for domain-aware vectors)
7. `domain_synthesizer.py` merges insights with convergence analysis (agreements/disagreements across sources), snapshots previous version, cascades synthesis to parent levels (Bloom's cognitive targeting per level)
8. Ingestion impact summary generated: what this source added to the knowledge base
9. User queries via AI search → source-grounded answers with `[Source: title]` citations, cross-domain retrieval for parent-level queries
10. Knowledge graph shows structural hierarchy + conceptual topic edges + cross-domain references

---

## Development Notes

- The BiteClimb frontend proxies API requests to `localhost:3001` in dev mode
- SQLite databases are file-based and gitignored
- All three projects deploy independently on Render.com
