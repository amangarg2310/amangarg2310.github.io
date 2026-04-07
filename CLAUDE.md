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

**Tech Stack:** Python 3.11, Flask, Flask-Login, SQLite (FTS5 + vector embeddings + WAL mode), OpenAI GPT-4o-mini, Anthropic Claude (visuals), Supadata (transcript fallback)

### Key Commands

```bash
cd intel-engine
pip install -r requirements.txt
python migrations.py    # Create database tables
python app.py           # Run at http://localhost:5002
```

### Architecture

- **Pipeline** (`pipeline.py`): Source → ingest → chunk → extract insights → detect domain hierarchy → embed → synthesize. All DB connections use `_get_conn()` helper with WAL mode + `busy_timeout=5000` for concurrent access.
- **Multi-source ingestors**: `youtube_ingest.py` (transcripts via Supadata, playlist support via RSS + HTML scraping fallback), `article_ingest.py` (trafilatura), `file_ingest.py` (PDF/DOCX/PPTX), `image_ingest.py` (OpenAI Vision)
- **Domain taxonomy** (`domain_detector.py`): Hierarchical 3-level — parent category → specific domain → sub-topics
- **RAG query** (`intel_query.py`): Hybrid search (vector embeddings + FTS5 keyword) → GPT answer synthesis
- **Auth** (`auth.py`): Flask-Login session-based, multi-user with per-user data isolation
- **Backend** (`app.py`): Flask web server with REST API. Background processing via threading with in-memory status tracking for UI polling.
- **Frontend** (`templates/intel.html`, `static/intel.css`): NotebookLM-inspired scholarly design with warm color palette, Inter font, two-panel layout with taxonomy sidebar, force-graph knowledge visualization
- **Database:** SQLite with tables: users, domains (hierarchical), sources, insights (with embeddings), syntheses, usage_logs

### Deduplication

All source types use content-based deterministic IDs to prevent duplicate processing:
- **YouTube**: Video ID from URL (deterministic)
- **Article**: `SHA256(url)[:12]` (deterministic)
- **File/Image**: `SHA256(file_bytes)[:12]` (deterministic)
- **Text**: `SHA256(text_content)[:12]` (deterministic)

Each pipeline calls `check_already_ingested()` before processing. Duplicates return `already_exists` status shown as "Already in your knowledge base" in the UI.

### Progress Tracking

Background processing uses in-memory status dict (`_pipeline_status`) with thread-safe locking. Frontend polls `/api/status/<video_id>` every 1s. Status entries have 10-minute TTL. The tracking ID must be consistent between `app.py` (which returns it to the frontend) and the pipeline function (which updates it) — both use the same content-based ID passed via `tracking_id` parameter.

### Playlist Support

YouTube playlists are fetched using two strategies:
1. RSS feed (fast, works for channel upload playlists)
2. HTML scraping with `ytInitialData` JSON parsing (fallback for user-created playlists)

Private playlists are detected and the user is told to change to Unlisted. Max 15 videos per playlist.

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
3. `insight_extractor.py` chunks text → GPT extracts granular, actionable insights
4. `domain_detector.py` classifies into specific hierarchical domain (e.g., AI Tools → OpenClaw → Setup)
5. `embeddings.py` generates vector embeddings for semantic search
6. `domain_synthesizer.py` merges new insights with existing synthesis (temporal awareness — newer info supersedes old)
7. User can search within any domain via the AI search bar (hybrid RAG) or browse the synthesized knowledge brief
8. Each new source compounds the domain's knowledge

---

## Development Notes

- The BiteClimb frontend proxies API requests to `localhost:3001` in dev mode
- SQLite databases are file-based and gitignored
- All three projects deploy independently on Render.com
