# Distylme — Domain Intelligence Engine

A knowledge platform that ingests expert content from multiple sources, processes it through an LLM pipeline, and builds a compounding knowledge base with hierarchical domain taxonomy. Deployed at [distylme.com](https://distylme.com).

## Tech Stack

Python 3.11, Flask, Flask-Login, SQLite (FTS5 + vector embeddings + WAL mode), OpenAI GPT-4o-mini, Anthropic Claude (visuals), Supadata (transcript fallback)

## Quick Start

```bash
pip install -r requirements.txt
python migrations.py    # Create database tables
python app.py           # Run at http://localhost:5002
python backfill.py --all  # Optional: upgrade existing data to enriched pipeline
```

## Architecture

```
app.py                  # Flask web server, REST API, background thread spawning
pipeline.py             # Core pipeline: ingest → chunk → extract → classify → embed → synthesize
youtube_ingest.py       # YouTube transcripts (Supadata) + playlist support (RSS + HTML scraping)
article_ingest.py       # Web article extraction (trafilatura)
file_ingest.py          # PDF, DOCX, PPTX text extraction
image_ingest.py         # Image/screenshot analysis (OpenAI Vision)
domain_detector.py      # 3-level hierarchical domain classification + taxonomy evolution
domain_synthesizer.py   # LLM-powered knowledge synthesis with temporal awareness + convergence
insight_extractor.py    # Structured claim extraction (evidence, confidence, topics)
intel_query.py          # Hybrid RAG search (vector + FTS5) → source-grounded answer synthesis
embeddings.py           # Contextual vector embedding generation and storage
auth.py                 # Flask-Login session auth, multi-user data isolation
migrations.py           # Database schema creation and migrations
config.py               # Environment config, API keys, paths
backfill.py             # One-time upgrade script for existing data (--insights/--embeddings/--synthesis/--all)
templates/intel.html    # Single-page frontend (Jinja2 template)
static/intel.css        # NotebookLM-inspired scholarly design system
```

## Database

SQLite with WAL mode and `busy_timeout=5000` for concurrent access. All connections go through `_get_conn()` in `pipeline.py` (never raw `sqlite3.connect`).

**Tables:** users, domains (hierarchical with parent_id), sources (all source types + ingestion_impact), insights (with vector embeddings + evidence/confidence/topics), syntheses (with convergence_data + synthesis_level), synthesis_versions, taxonomy_changes, domain_references, usage_logs

## Pipeline Flow

1. Source submitted via API → `app.py` computes content-based tracking ID → spawns background thread
2. Type-specific ingestor extracts text
3. Topic-aware chunking: sentence-boundary detection with vocabulary shift scoring (Jaccard distance)
4. `insight_extractor.py` → structured claim extraction: title, content, evidence, source_context, confidence, topics
5. `domain_detector.py` classifies into 3-level hierarchy (category → domain → sub-topics)
6. `embeddings.py` generates contextual vector embeddings (prepends source title + channel + domain path)
7. `domain_synthesizer.py` merges insights into synthesis with convergence analysis + version snapshots
8. Cascade synthesis: sub-topic → parent domain overview → grandparent category briefing
9. Taxonomy evolution: proposes new sub-topics or splits based on new insights
10. Ingestion impact: generates brief summary of what the source added to the knowledge base
11. Frontend polls `/api/status/<video_id>` every 1s for progress updates

## Deduplication

All source types use **content-based deterministic IDs** to prevent duplicate processing:

| Source | ID Method |
|--------|-----------|
| YouTube | `extract_video_id(url)` — from URL |
| Article | `SHA256(url)[:12]` |
| File/Image | `SHA256(file_bytes)[:12]` |
| Text | `SHA256(text_content)[:12]` |

Each pipeline calls `check_already_ingested()` before processing. Duplicates return `already_exists` status. The tracking ID in `app.py` must match the pipeline's ID — both use the same content hash passed via `tracking_id` parameter.

## Progress Tracking

In-memory `_pipeline_status` dict with `threading.Lock()`. Frontend polls `/api/status/<video_id>` every 1s. Status entries have 10-minute TTL. Critical: the tracking ID returned to the frontend by `app.py` must be the same ID the pipeline writes status updates to.

## Playlist Support

YouTube playlists use two strategies (in order):
1. RSS feed (`/feeds/videos.xml`) — fast, works for channel upload playlists
2. HTML scraping with `ytInitialData` JSON parsing — fallback for user-created playlists
3. Regex `videoId` extraction — last resort fallback

Private playlists are detected and the user is told to change to Unlisted. Max 15 videos per playlist. Each video runs through `run_pipeline()` individually with per-video error handling.

## Page Structure

**Homepage** (`/`): Ingestion hub — URL input, file upload, text paste tabs + domain card grid for navigation. No synthesis content on homepage; it's purely for adding content and browsing domains.

**Domain Detail** (`/domain/<name>`): Two-panel layout — sidebar (taxonomy tree + sources with ingestion impact) and main content (AI search → convergence indicators → synthesis brief). This is where the user reads and queries their knowledge.

**Knowledge Graph** (overlay via nav button): Force-graph visualization with breathing nodes, flowing particles, conceptual edges (amber dotted) between domains sharing topics, click-to-detail panels.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest` | POST | Submit URL (YouTube/playlist/article) for processing |
| `/api/upload` | POST | Upload file (PDF/DOCX/PPTX/image) |
| `/api/ingest-text` | POST | Submit pasted text |
| `/api/status/<video_id>` | GET | Poll processing progress |
| `/api/query` | POST | Ask a question against a domain's knowledge |
| `/api/knowledge-graph` | GET | Get nodes + edges for graph visualization |
| `/api/taxonomy-changes` | GET | Recent taxonomy evolution notifications |
| `/api/taxonomy-changes/<id>/dismiss` | POST | Dismiss a notification |
| `/api/threshold-concepts` | GET | Cross-domain foundational topics (3+ domain spread) |

## Design System

NotebookLM-inspired scholarly aesthetic (not flashy SaaS):

- **Palette:** Warm neutrals (`#fafaf8` bg, `#e4e0da` borders), muted indigo accent (`#4f6ef7`), amber for TLDR/synthesis/convergence borders (`#c4a757`/`#d4a757`)
- **Typography:** Inter font, max weight 600 on headings, 1.75 line-height for synthesis body text
- **Surfaces:** Warm shadow tints (`rgba(30,25,15,...)`), no harsh black shadows
- **Interactions:** No scale transforms on hover, background-shift only, consistent focus rings (`box-shadow`) on all inputs
- **Graph:** Force-graph with breathing pulse, flowing particles, conceptual edges (amber dotted for shared topics), reference edges (violet dashed), hierarchy edges (solid), click-to-detail panels
- **Coverage Depth:** Domain cards show thin (dashed border, 1-2 sources), moderate (solid, 3-5), deep (amber border + dot, 6+)
- **Convergence:** Compact side-by-side cards — green for agreements, amber for disagreements — shown on domain detail page above synthesis
- **Ingestion Impact:** Italic 2-line summary per source in sidebar, clamped with CSS

## Key Patterns

- **DB connections:** Always use `_get_conn(db_path)` — never raw `sqlite3.connect()`. This sets WAL mode + busy_timeout.
- **Background processing:** `app.py` spawns `threading.Thread(daemon=True)`, passes `tracking_id` to pipeline functions.
- **Status updates:** `_update_status(video_id, status, step, progress, **extra)` — thread-safe via `_status_lock`.
- **INSERT OR REPLACE:** Used for YouTube, Article, File, Image, Text sources to handle re-processing of failed entries.
- **Error boundaries:** Each video in a playlist has its own `try/except` so one failure doesn't stop the rest.

## Learning Science Principles

- **Bloom's Taxonomy:** Synthesis prompts target different cognitive levels per domain level. Sub-topic = factual/procedural (knowledge & comprehension). Domain = analytical/comparative (analysis & application). Category = evaluative/strategic (evaluation & synthesis).
- **Schema Theory:** Taxonomy evolution is framed as the user's understanding evolving, not mechanical reorganization. "Your understanding expanded" not "New sub-topic created."
- **Connectivism:** Knowledge graph shows topic-based conceptual edges between domains that share concepts, not just structural hierarchy.
- **Progressive Summarization:** Each synthesis level references the level below by name, so the user knows where to drill deeper.
- **Cognitive Load Theory:** Every UI element must reduce the steps between the user and the knowledge, not add navigation overhead. No features that increase clicks without increasing understanding.
- **Threshold Concepts:** Cross-domain foundational topics are identified via topic frequency analysis and surfaced as annotations — concepts that appear across 3+ domains are likely foundational.

## Environment Variables

```
OPENAI_API_KEY          # Required — GPT-4o-mini for insights/synthesis
ANTHROPIC_API_KEY       # Optional — Claude for image analysis
SUPADATA_API_KEY        # Optional — transcript fallback when YouTube blocks server IPs
WEBSHARE_PROXY_USERNAME # Optional — proxy for YouTube transcript fetching
WEBSHARE_PROXY_PASSWORD # Optional
SECRET_KEY              # Flask session secret
```
