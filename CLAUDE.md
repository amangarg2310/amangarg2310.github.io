# BiteClimb - Monorepo Architecture Documentation

## Repository Structure

This is a monorepo hosted on GitHub Pages containing two projects:

```
├── biteclimb/                # Community-driven product tier ranking app
├── outlier-content-engine/   # AI-powered competitive intelligence platform (ScoutAI)
├── openclaw-mission-control/ # Project-centric founder OS on OpenClaw
└── render.yaml               # Render.com deployment config
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

## OpenClaw Mission Control

See `openclaw-mission-control/CLAUDE.md` for detailed documentation.

**What it is:** Project-centric founder operating system for managing multiple early-stage startup workstreams through 7 role lanes (Research, Strategy, Product & PMM, Content & Marketing, Performance Marketing, Consumer Insights, Advisor).

**Tech Stack:** Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion, Radix UI

### Key Commands

```bash
cd openclaw-mission-control
npm install
npm run dev       # Start dev server
npm run build     # Production build
npm run test      # Bridge layer tests
```

---

## Development Notes

- The BiteClimb frontend proxies API requests to `localhost:3001` in dev mode
- SQLite databases are file-based and gitignored
- Both projects deploy independently on Render.com
