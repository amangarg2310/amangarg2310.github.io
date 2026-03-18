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

## Domain Intelligence Engine

**What it is:** Paste a YouTube URL → automatically extracts insights, detects the knowledge domain, and builds a compounding knowledge base. Each new video enriches existing domain synthesis.

**Tech Stack:** Python 3.11, Flask, SQLite, OpenAI GPT-4o-mini, yt-dlp, youtube-transcript-api

### Key Commands

```bash
cd intel-engine
pip install -r requirements.txt
python migrations.py    # Create database tables
python app.py           # Run at http://localhost:5002
```

### Architecture

- **Pipeline** (`pipeline.py`): URL → ingest → chunk → extract insights → detect domain → synthesize
- **Backend** (`app.py`): Flask web server with API endpoints
- **Frontend** (`templates/intel.html`, `static/intel.css`): Apple-inspired minimal UI
- **Database:** SQLite with tables: domains, sources, insights, syntheses

### How It Works

1. User pastes a YouTube URL
2. `youtube_ingest.py` fetches metadata + transcript via yt-dlp
3. `insight_extractor.py` sends chunks to GPT → structured insights
4. `domain_detector.py` auto-classifies into existing or new domain
5. `domain_synthesizer.py` merges new insights with existing synthesis
6. Knowledge compounds — each video makes the domain smarter

---

## Development Notes

- The BiteClimb frontend proxies API requests to `localhost:3001` in dev mode
- SQLite databases are file-based and gitignored
- All three projects deploy independently on Render.com
