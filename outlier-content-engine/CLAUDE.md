# ScoutAI (Outlier Content Engine) - Architecture Documentation

## Project Overview

ScoutAI is an AI-powered competitive intelligence platform that identifies high-performing "outlier" social media posts from competitor brands on Instagram, TikTok, and Facebook. It uses statistical analysis to detect posts that significantly outperform each brand's baseline engagement, then leverages GPT-4 to analyze patterns and rewrite concepts in your brand's voice.

**Tech Stack:** Python 3.11, Flask, SQLite, OpenAI GPT-4o-mini, Apify collectors, Jinja2 templates, vanilla JS
**Deployment:** Render.com (gunicorn, 1GB persistent disk for SQLite)
**Total Codebase:** ~35,300 lines (Python, HTML, CSS, JS, JSON)
**Live App:** scoutaiapp.com

---

## Core Concepts

### 1. **Verticals (Competitive Sets)**
- A "vertical" is a named collection of competitor brands to monitor (e.g., "Streetwear" with @supremenewyork, @nike, etc.)
- Stored in SQLite: `verticals` and `vertical_brands` tables
- Managed via `vertical_manager.py`
- Each brand can have Instagram, TikTok, and Facebook handles

### 2. **Brand Profiles**
- Optional YAML config files in `profiles/` directory
- Contains voice guidelines, target audience, content preferences, outlier thresholds
- Loaded by `profile_loader.py`; example: `profiles/heritage.yaml`

### 3. **Outlier Detection**
- Statistical analysis: z-score + engagement multipliers, per-platform thresholds
- Platform weights: Instagram (comments=3x), TikTok (shares=3x), Facebook (shares=4x)
- Configurable thresholds; core logic in `outlier_detector.py`

### 4. **Content Collection**
- Collects recent posts from Instagram, TikTok, and Facebook
- Primary: Apify actors; fallback: RapidAPI
- Stored in `competitor_posts` table
- Collectors: `collectors/instagram.py`, `collectors/tiktok.py`, `collectors/facebook.py`

### 5. **AI Analysis**
- GPT-4o-mini analyzes outlier posts and generates brand-specific adaptations
- Prompts dynamically constructed from brand profile + learned voice patterns
- Token usage tracking and monthly budget enforcement ($4.50 default)
- Core logic in `analyzer.py`

### 6. **Scout AI Chat Interface**
- Natural language commands via OpenAI function calling (e.g., "add SaintWoods to streetwear")
- `brand_registry.json` maps plain brand names → official handles automatically
- Fast-path local commands handled by `chat_handler.py` (no API cost)
- Full intent understanding via `scout_agent.py`

### 7. **Data Lifecycle Management**
- 3-day auto-cleanup of posts older than N days
- Competitive set change detection via JSON fingerprinting
- Blank canvas logic: clears data when set changes or >3 days old
- Incremental analysis: keeps existing outliers + adds new ones (same set within 3 days)
- Soft delete: removed brands are archived, not deleted
- Core logic in `data_lifecycle.py`

### 8. **Google OAuth Authentication**
- Optional; only enforced when Google credentials are configured in settings
- Allowlist support (`allowed_emails` in config table) for team access control
- Stores user login history in `users` table

---

## Directory Structure

```
outlier-content-engine/
├── main.py                      # CLI orchestrator for full analysis pipeline
├── dashboard.py                 # Flask web server (all routes + helpers)
├── config.py                    # Global config & environment variables
├── database_migrations.py       # SQLite schema setup & versioning (idempotent)
├── auth.py                      # Google OAuth 2.0 integration
├── scout_agent.py               # OpenAI function-calling chat agent
├── chat_handler.py              # Fast-path local command processor (no API cost)
│
├── profiles/                    # Brand voice profiles (YAML)
│   ├── heritage.yaml            # Example brand profile
│   └── _template.yaml          # Template for new profiles
│
├── collectors/                  # Social media data collectors
│   ├── __init__.py             # Base interface & CollectedPost dataclass
│   ├── instagram.py            # Instagram (Apify / RapidAPI)
│   ├── tiktok.py               # TikTok (Apify / RapidAPI)
│   ├── facebook.py             # Facebook (Apify)
│   └── instagram_graph.py      # Instagram Graph API (own-channel saves/shares)
│
├── outlier_detector.py          # Statistical outlier detection
├── analyzer.py                  # GPT-4 analysis and content rewriting
├── profile_loader.py            # YAML profile loader & validator
├── vertical_manager.py          # Competitive set CRUD
├── data_lifecycle.py            # 3-day cleanup & blank canvas logic
├── brand_handle_discovery.py    # Brand name → handle mapping
├── brand_registry.json          # Known brand → handle mappings (auto-resolution)
├── insight_generator.py         # Pattern analysis from outliers
├── voice_analyzer.py            # Learn brand voice from own top posts
├── content_tagger.py            # Classify posts by theme, hook, format
├── content_scorer.py            # Score user-submitted content concepts (0-100)
├── content_optimizer.py         # LLM-powered content improvement suggestions
├── reporter.py                  # Generate HTML reports & email notifications
├── progress_tracker.py          # Real-time pipeline progress tracking
├── gap_analyzer.py              # Content gaps vs. competitors
├── recommendation_engine.py     # Content recommendations from patterns
│
├── trend_radar/                 # Trending audio/hashtag tracking
│   ├── collector.py             # Collect sound/hashtag usage across posts
│   └── scorer.py                # Velocity-based trend scoring
│
├── templates/                   # Jinja2 HTML templates
│   ├── signal.html              # Main Scout AI dashboard (chat + outlier grid)
│   ├── login.html               # Google OAuth login page
│   ├── setup.html               # API keys & brand configuration UI
│   ├── base.html                # Base layout template
│   └── vertical_edit.html       # Competitive set editor
│
├── static/                      # CSS and static assets
│   ├── signal-ai.css            # Main dashboard styles (~3,057 lines)
│   ├── style.css                # Global styles
│   ├── split-layout.css         # Split-panel layout utilities
│   └── scoutai-logo-white-trimmed.svg  # App logo
│
├── render.yaml                  # Render.com deployment config
├── requirements.txt             # Python dependencies
└── data/                        # Runtime data (gitignored)
    ├── content_engine.db        # SQLite database
    ├── analysis_progress.json   # Real-time progress tracking
    ├── analysis.pid             # PID file for cancel support
    └── lifecycle_config.json    # Competitive set signature + last-run timestamp
```

---

## Key Files Deep Dive

### `dashboard.py` - Web Interface & API Server
**Purpose:** Flask server for interactive dashboard; all routes, helpers, template context

**Key Routes:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/signal` | GET | Main dashboard with chat + outlier posts grid |
| `/chat/message` | POST | Process natural language commands via Scout AI |
| `/run` | POST | Trigger analysis pipeline in background thread |
| `/analysis/stream` | GET | SSE stream for real-time pipeline progress |
| `/analysis/cancel` | POST | Cancel running analysis via PID file |
| `/api/outliers` | GET | JSON API for filtered outlier posts (AJAX) |
| `/api/score-concept` | POST | Score user content concept (0-100) |
| `/api/optimize-concept` | POST | LLM-powered content optimization |
| `/api/trends` | GET | Rising/declining content pattern trends |
| `/api/gap-analysis` | GET | Content gaps vs. competitors |
| `/api/export/csv` | GET | Export filtered outliers as CSV |
| `/api/validate_keys` | POST | Live API key validation |
| `/setup` | GET | API keys & settings page |
| `/setup/save` | POST | Save API keys, handles, emails, OAuth creds |
| `/proxy-image` | GET | CORS proxy for social media images (allowlist-protected) |
| `/auth/google` | GET | Google OAuth redirect |
| `/auth/google/callback` | GET | OAuth callback handler |
| `/verticals/create` | POST | Create new vertical with brands |
| `/verticals/brand/add` | POST | Add single brand to vertical |
| `/verticals/brand/bulk-add` | POST | Bulk add brands from pasted text |
| `/verticals/brand/remove` | POST | Remove brand from vertical |
| `/verticals/delete` | POST | Delete entire vertical |

**Key Helper Functions:**
- `needs_setup()` — Checks if both apify + openai keys are in `api_credentials` table
- `get_outlier_posts()` — Filtered query with platform/timeframe/sort/tag params
- `get_dashboard_stats()` — Overview stats for chat sidebar
- `auth_enabled()` — Returns True if Google credentials configured

---

### `scout_agent.py` - Chat AI Agent
**Purpose:** OpenAI function-calling agent for natural language commands

**Tools/Functions:**
- `create_category(name, description)` — Create a new vertical
- `add_brands(category, ig_handles, tt_handles)` — Add brands (auto-resolves names via `brand_registry.json`)
- `remove_brand(category, handle)` — Remove brand
- `list_categories()` — List all verticals
- `analyze_category(name)` — Trigger analysis pipeline
- `show_help()` — Show available commands

**Brand Auto-Resolution:**
- "SaintWoods" → `@saintwoods`
- "Supreme" → `@supremenewyork`
- "Palace" → `@palaceskateboards`
- "Fear of God Essentials" → `@fearofgod`
- Unknown brands are passed through as-is (treated as the handle)

**System Prompt Flow:**
1. Accept brand names (with or without @)
2. Ask for category name if not provided
3. Confirm resolved handles
4. Ask platforms & timeframe before analysis
5. Wait for user confirmation

---

### `scout_agent.py` - Conversational AI Agent
**Purpose:** GPT-powered chat agent using OpenAI function calling (tools)

**Architecture:**
- GPT handles natural language understanding
- Real actions executed by VerticalManager via tool handlers
- System prompt guides GPT through a step-by-step flow (Steps 1-7)

**GPT Tools (function calling):**
- `create_category` — Create or reuse a competitive set
- `delete_category` — Delete category and all brands (for "start fresh")
- `add_brands` — Add brands with IG/TT/FB handles (paired insertion)
- `remove_brand` — Remove a brand by any handle
- `run_analysis` — Launch analysis pipeline in background thread
- `list_categories` / `show_category` — View categories and brands
- `score_content` / `optimize_content` — Caption scoring and optimization
- `show_trends` — Display trend analysis

**Key Design Decisions:**
- Tool return values include `note` fields that guide GPT's next response
- System prompt has conditional logic (e.g., 0-brand vs >0-brand category handling)
- Anti-redundancy rules prevent GPT from re-calling tools unnecessarily
- All DB connections use WAL mode for concurrent access

---

### `outlier_detector.py` - Statistical Analysis
**Algorithm:**
1. Calculate per-competitor baseline (mean, median, std dev)
2. Compute z-scores (std devs above mean) per post
3. Calculate engagement multipliers vs. baseline
4. Apply platform-specific thresholds:
   - Instagram: 2.0x multiplier, 1.5 std devs
   - TikTok: 3.5x multiplier, 2.0 std devs
   - Facebook: 2.5x multiplier, 1.5 std devs
5. Weighted engagement score by platform driver
6. Rank outliers by composite score

**Key Classes:**
- `OutlierPost` — Data model with score, primary driver, content tags
- `CompetitorBaseline` — Per-competitor stats (mean, stdev, quartiles)
- `OutlierDetector` — Main detection logic

---

### `analyzer.py` - GPT-4 Analysis
**Output Schema (JSON):**
```json
{
  "outlier_analysis": [{
    "post_id": "...",
    "hook_type": "question|curiosity_gap|shock|...",
    "hook_breakdown": "Why this hook works",
    "visual_strategy": "What made the visual work",
    "emotional_trigger": "Core emotion activated",
    "content_pattern": "Named framework (e.g., Before/After)",
    "replicability_score": 8
  }],
  "brand_adaptations": [{
    "adapted_caption": "Rewritten in brand voice",
    "hook_suggestion": "Opening line concept",
    "visual_direction": "What the visual should show",
    "format_suggestion": "reel|carousel|static|story",
    "brand_fit_score": 8
  }],
  "weekly_patterns": {
    "best_content_types": ["..."],
    "trending_themes": ["..."]
  },
  "content_calendar_suggestions": [...]
}
```

**Budget Management:** Tracks tokens in `token_usage` table; default $4.50/month ceiling.

---

### `setup.html` - Settings Page
**Sections:**
1. **API Keys** — Apify token + OpenAI key (required), TikTok key (optional)
   - "Validate Keys" button: real-time API validation via `/api/validate_keys`
   - "Save Keys" button: calls `saveKeysOnly()` → POST to `/setup/save` → redirects to `/signal`
   - Uses `redirect: 'manual'` + `r.type === 'opaqueredirect'` check for proper success detection
   - On success, saves to localStorage and redirects to dashboard after 800ms
2. **Your Brand** — Own Instagram/TikTok handles for voice learning
3. **Team Emails** — Distribution list for email reports
4. **Google OAuth** — Optional client ID/secret to enable login
5. **Allowed Emails** — Access control allowlist

**Important:** `saveKeysOnly()` sends ALL form fields (including empty optional ones) to prevent backend errors. Missing fields caused "Error saving keys" failures.

**Database Connection:**
- Uses WAL mode (`PRAGMA journal_mode=WAL`) for concurrent read/write access
- `busy_timeout=5000` prevents "database is locked" errors during analysis

---

### `signal.html` - Main Dashboard
**Layout:** Split-panel (left chat, right outlier grid)

**Left Panel (Scout AI Chat):**
- Onboarding: shows API key setup prompt if `needs_setup` is True, template picker if no verticals, else "Welcome back"
- `needs_setup` is hidden client-side if localStorage has both apify + openai keys (BYOK support)
- Brand baselines collapsible section
- Insights, patterns, trend radar

**Right Panel (Outlier Posts Grid):**
- Competitive set dropdown to load/switch verticals
- Filter pills: platform (All/IG/TT/FB), timeframe (30 Days/3 Months), sort (Score/Saves/Shares/Recent)
- Post cards: media preview, engagement metrics, outlier score gauge, AI analysis, content tags
- "Create your first competitive set" empty state

**Splash Screen:**
- Shows on first visit per session (sessionStorage flag)
- 150px logo, "Discover What's Working in Social Media" tagline
- CSS: `.splash-screen`, `.splash-content`, `.splash-logo`, `.splash-tagline`

---

## Database Schema

**Database path:** `data/content_engine.db` (set in `config.py` as `DATA_DIR / "content_engine.db"`)

### Core Tables

```sql
-- All collected social media posts
CREATE TABLE competitor_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    brand_profile TEXT NOT NULL,        -- vertical name
    platform TEXT DEFAULT 'instagram',  -- instagram | tiktok | facebook
    competitor_name TEXT,
    competitor_handle TEXT,
    posted_at TEXT,
    caption TEXT,
    media_type TEXT,                    -- image | video | carousel
    media_url TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    saves INTEGER,
    shares INTEGER,
    views INTEGER,
    follower_count INTEGER,
    estimated_engagement_rate REAL,
    is_outlier INTEGER DEFAULT 0,
    is_own_channel INTEGER DEFAULT 0,
    outlier_score REAL,
    weighted_engagement_score REAL,
    primary_engagement_driver TEXT,
    content_tags TEXT,                  -- JSON array
    audio_id TEXT,                      -- TikTok only
    audio_name TEXT,                    -- TikTok only
    ai_analysis TEXT,                   -- JSON from GPT-4
    collected_at TEXT NOT NULL,
    archived INTEGER DEFAULT 0,         -- soft delete
    UNIQUE(post_id, platform, brand_profile)
);

-- Competitive sets
CREATE TABLE verticals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Brands in each vertical
CREATE TABLE vertical_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vertical_name TEXT NOT NULL,
    brand_name TEXT,
    instagram_handle TEXT,              -- nullable (TikTok/FB-only brands)
    tiktok_handle TEXT,
    facebook_handle TEXT,
    added_at TEXT NOT NULL,
    FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE
);
-- Unique indexes: idx_vertical_brands_ig_unique, idx_vertical_brands_tt_unique

-- API keys (stored in DB, not .env)
CREATE TABLE api_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT UNIQUE NOT NULL,       -- apify | openai | tiktok | google_client_id | google_client_secret
    api_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Generic key-value config
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
    -- Keys: own_brand_instagram, own_brand_tiktok, allowed_emails
);

-- Google OAuth users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    created_at TEXT NOT NULL,
    last_login TEXT NOT NULL
);

-- LLM token usage & cost tracking
CREATE TABLE token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd REAL,
    context TEXT
);

-- Email notification subscribers
CREATE TABLE email_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vertical_name TEXT,                 -- NULL = all verticals (team-wide)
    email TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);

-- Content concept scoring history
CREATE TABLE content_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_profile TEXT NOT NULL,
    concept_text TEXT NOT NULL,
    hook_line TEXT,
    format_choice TEXT,
    platform TEXT,
    score_data TEXT NOT NULL,           -- JSON breakdown
    overall_score REAL NOT NULL,        -- 0-100
    predicted_engagement_range TEXT,
    optimization_suggestions TEXT,
    version INTEGER DEFAULT 1,
    parent_score_id INTEGER,            -- for optimization lineage tracking
    scored_at TEXT NOT NULL
);

-- Trend radar: time-series sound/hashtag tracking
CREATE TABLE trend_radar_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_profile TEXT NOT NULL,
    snapshot_timestamp TEXT NOT NULL,
    item_type TEXT NOT NULL,            -- sound | hashtag
    item_id TEXT NOT NULL,
    item_name TEXT,
    usage_count INTEGER DEFAULT 0,
    outlier_count INTEGER DEFAULT 0,
    total_engagement INTEGER DEFAULT 0,
    avg_engagement REAL DEFAULT 0,
    top_post_id TEXT,
    collected_at TEXT NOT NULL,
    UNIQUE(brand_profile, snapshot_timestamp, item_type, item_id)
);
```

---

## Configuration

### Environment Variables / `config.py`

API keys are stored **in the database** (not .env) after being entered via the Settings UI. `config.get_api_key(service)` checks DB first, falls back to env var.

```bash
# OpenAI
OPENAI_API_KEY=sk-...             # fallback if not in DB
OPENAI_MODEL=gpt-4o-mini
MONTHLY_COST_LIMIT_USD=4.50

# Data Collection
COLLECTION_SOURCE=apify           # or rapidapi
APIFY_API_TOKEN=apify_api_...    # fallback if not in DB
RAPIDAPI_KEY=...
TIKTOK_RAPIDAPI_KEY=...

# Google OAuth (optional — enables login page)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email (Gmail SMTP)
EMAIL_ADDRESS=your@gmail.com
EMAIL_APP_PASSWORD=...
EMAIL_RECIPIENTS=team@company.com

# Flask
FLASK_SECRET_KEY=...              # auto-generated if missing

# Active defaults
ACTIVE_VERTICAL=Streetwear        # default vertical on startup
```

### Brand Profile (YAML) — `profiles/heritage.yaml`
```yaml
name: Heritage
vertical: Fashion & Lifestyle
target_audience: Age 25-45, affluent professionals
voice:
  tone: Sophisticated yet approachable
  language_style: Clear and direct, minimal jargon
  themes: [Craftsmanship, Authenticity]
  avoids: [Politics, Controversy]
outlier_settings:
  min_z_score: 1.5
  min_engagement_multiplier: 2.0
  top_outliers_to_analyze: 10
competitors:
  - name: Nike
    handles:
      instagram: nike
      tiktok: nike
```

---

## Deployment

**Platform:** Render.com
**Build command:** `pip install -r requirements.txt && python database_migrations.py`
**Start command:** `gunicorn dashboard:app`
**Persistent disk:** 1GB mounted at `/opt/render/project/src/data` (SQLite lives here)

`render.yaml` at repo root configures the above. Secrets (API keys) are set in Render dashboard environment variables; the app also stores them in the database via Settings UI.

**Deployment trigger:** Push to `master` branch on GitHub → Render auto-deploys.

---

## Running Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run database migrations
python database_migrations.py

# 3. Start web server
python dashboard.py
# Open http://localhost:5001/signal

# 4. Enter API keys via Settings UI (/setup)
#    OR set APIFY_API_TOKEN and OPENAI_API_KEY in .env
```

### CLI Analysis (optional)
```bash
# Run full pipeline for a vertical
python main.py --vertical Streetwear

# Skip collection (use existing data)
python main.py --vertical Streetwear --skip-collect --no-email
```

---

## Common Workflows

### Adding a New Competitive Set (via Chat)
Type in the Scout AI chat:
```
"Create a streetwear set with Supreme, Palace, Noah, and Stussy"
```
The agent auto-resolves brand names to handles via `brand_registry.json`.

### Switching Competitive Sets
Use the "COMPETITIVE SET" dropdown at top of the right panel filters.

### Saving API Keys
1. Go to `/setup` (Settings icon in top-right)
2. Enter Apify token and OpenAI key
3. Click "Save Keys" — saves to database, redirects back to `/signal`
4. The API key setup prompt in chat disappears on next page load

---

## Troubleshooting

### "Error saving keys" on Settings page
- The `saveKeysOnly()` function must send all form fields (including empty optional ones)
- Check browser console for the actual server error
- Verify the database has an `api_credentials` table (run `python database_migrations.py`)

### API key prompt still showing after saving keys
- `needs_setup()` queries `api_credentials` for both `apify` and `openai` rows
- Confirm keys exist: `sqlite3 data/content_engine.db "SELECT service FROM api_credentials;"`
- Client-side: localStorage keys (`scout_apify_token`, `scout_openai_key`) are also checked to hide the prompt

### No posts collected
- Verify API keys in Settings are valid (use "Validate Keys" button)
- Check handles exist on the platform
- Try switching `COLLECTION_SOURCE` (apify ↔ rapidapi)

### No outliers detected
- Lower thresholds in brand profile (`min_z_score`, `min_engagement_multiplier`)
- Verify competitors are posting actively in the selected timeframe

### Dashboard not loading
- Check port: `lsof -ti:5001 | xargs kill -9`
- Run migrations: `python database_migrations.py`
- Check `data/content_engine.db` exists

### Images not loading
- Uses `/proxy-image` endpoint for CORS; falls back to gradient placeholders
- Check browser console for CORS errors

---

## Architecture Decisions

**SQLite over PostgreSQL:** Single-user/small-team tool; simple, serverless, single file. Persistent disk on Render handles durability. Could migrate to PostgreSQL for multi-tenant.

**API keys in DB, not .env:** Allows runtime configuration via Settings UI without redeployment. `config.get_api_key()` tries DB first, .env second.

**Apify over RapidAPI:** More reliable, better rate limits, official actors, handles pagination. RapidAPI is kept as fallback.

**GPT-4o-mini over GPT-4:** 80% cheaper, fast enough for content analysis, stays within ~$4.50/month budget.

**Flask over FastAPI:** Server-side rendering is simpler to build and maintain; Jinja2 templates; no async complexity.

**No frontend framework:** Server-side rendering is faster to ship; less dependency surface; easier for AI to maintain; progressive enhancement with vanilla JS.

**`redirect: 'manual'` in fetch:** When browser follows a server redirect automatically, the session cookie set by Flask isn't accessible. Using `manual` + checking `r.type === 'opaqueredirect'` keeps the user on the correct page and allows localStorage updates before redirecting via `window.location.href`.

---

## Recent Changelog

### 2026-02-17: Fix Chat "Hiccup" on Every Multi-Step Message (0ae7533)
- `scout_agent.py`: Root cause — GPT function-calling loop was `for _ in range(3)`, but a typical create+add flow requires 2 tool rounds + 1 text round = 3 exactly. Any extra tool call (e.g. `show_category`, `list_categories`) exhausted the budget and fell through to the "I ran into a hiccup" fallback, breaking ALL multi-step interactions.
  - Increased loop limit from 3 → 8
  - On final iteration (`i==7`), forces `tool_choice="none"` so GPT MUST produce text — "hiccup" is now unreachable under normal conditions
  - Replaced useless "hiccup" message with contextual fallback showing active category + suggested next steps

### 2026-02-17: 9 Crash Fixes + 30 Regression Tests (9950316)
- `scout_agent.py`:
  - Fixed `tool_calls` NoneType iteration (`if choice.message.tool_calls:` guard)
  - Fixed `json.loads(None)` TypeError — catch `(JSONDecodeError, TypeError)`, use `arguments or "{}"` fallback
  - Fixed brand handle resolution KeyError — `suggestion['handle']` → `.get('handle')` with `isinstance(dict)` check
  - Fixed optimizer KeyError + context corruption — `.get()` with fallback; context only updated after all operations succeed
- `collectors/instagram.py`: Fixed `None + int` TypeError — `post.likes + post.comments` → `(post.likes or 0)`
- `collectors/tiktok.py`:
  - Fixed Apify response KeyError — validate `"data"` key exists before access
  - Fixed status response KeyError — `status_response.json()["data"]` → `.get("data")` with None check + early return
  - Fixed dataset ID KeyError/UnboundLocalError — `.get()` with early return on timeout
- `vertical_manager.py`: Fixed `conn.total_changes` data corruption — switched to `cursor.rowcount` for per-operation counts; wrapped `competitor_posts` DELETE for fresh DBs
- Added `test_error_handling.py` — 30 new regression tests:
  - VerticalManager CRUD, fresh-DB regression, case-insensitive duplicates
  - Engagement calc with None metrics, zero/None follower_count
  - Scout agent tool dispatch edge cases (None args, missing keys, wrong types)
  - Dashboard timestamp parsing (ISO, SQLite format, None, empty)
  - TikTok Apify response validation (missing data, null data, missing fields)

### 2026-02-17: CLAUDE.md Update + Exception Handling Cleanup (1b858ae)
- `CLAUDE.md`: Updated vertical_brands schema (added `facebook_handle`, WAL mode, ON DELETE CASCADE); added `scout_agent.py` GPT tools section; added 2026-02-17 changelog
- `dashboard.py`: Eliminated all 6 bare `except:` blocks; narrowed ~20 broad `except Exception` to specific types (`sqlite3.OperationalError`, `OSError`, `(ValueError, TypeError)`, `(FileNotFoundError, AttributeError)`, `(ImportError, sqlite3.Error)`)
- `scout_agent.py`: OpenAI init failure now logs error instead of silently passing

### 2026-02-17: WAL Mode, IG+TT Handle Pairing & remove_brand Column Fix (12fd4e3)
- `vertical_manager.py`: All DB connections now use `PRAGMA journal_mode=WAL` + `busy_timeout=5000`
  - Prevents "database is locked" errors when analysis subprocesses run concurrently with brand operations
  - Added `update_brand_tiktok()` method for adding TikTok handles to existing brands without creating duplicate rows
  - Fixed `remove_brand()` to use `COLLATE NOCASE` for case-insensitive handle matching on delete
- `scout_agent.py`: Fixed paired IG+TT handle insertion — when both lists are provided at matching indices, both handles are stored on the same brand row (separate TT-only insert failed due to `instagram_handle NOT NULL` constraint)
- Verified: 85 tests across 7 suites (CRUD, brands, cross-category, analysis, filters, edge cases, multi-category) — all pass

### 2026-02-17: Delete Category Tool & Case-Variant Duplicate Prevention (48c0c18)
- `scout_agent.py`: Added `delete_category` tool so GPT can properly handle "start fresh" requests
  - Previously GPT had no way to delete a category, leading to workarounds like creating "Streetwear2"
  - Added tool definition, handler, dispatch, and system prompt guidance ("NEVER create variant names, always delete + recreate")
  - Fixed `_handle_add_brands` using blanket `except Exception` that silently swallowed real errors — now uses `.get()` for safe key access and logs actual exceptions
- `vertical_manager.py`: `create_vertical()` now checks `COLLATE NOCASE` before INSERT to prevent `"streetwear"` and `"Streetwear"` coexisting as separate rows
- `database_migrations.py`: Added `consolidate_vertical_name_casing()` migration
  - Runs on startup to merge existing case-variant duplicate verticals
  - Keeps the most recently updated variant; migrates all brands + posts to it; deletes others
  - Re-runs `add_vertical_brands_unique_index()` after merging to clean up any new duplicates

### 2026-02-17: Facebook Handle Support & Brand Row Pairing Fix (e27a6d6)
- `vertical_manager.py`: Facebook handles now paired with Instagram handles at the same index (same brand row), consistent with the IG+TT pairing approach
  - `IG+FB` and `IG+TT+FB` combinations now correctly store on a single brand row
  - Added `update_brand_facebook()` method for FB-only handle updates on existing rows (avoids NOT NULL constraint on `instagram_handle`)
  - Fixed `remove_brand()` to also match by `facebook_handle`, with `OperationalError` fallback for older schemas
- `scout_agent.py`: Updated `add_brands` tool to pair FB handles at the same index as IG handles; unpaired FB handles update existing rows via `update_brand_facebook()`
- `database_migrations.py`: Additional migration work for Facebook handle support
- Verified 23 platform-combination scenarios: IG-only, IG+TT, IG+FB, IG+TT+FB, remove by each handle type, analysis/filters for all platforms

### 2026-02-17: Fix Case-Insensitive Vertical Queries & Category Collision Handling
Two interacting bugs caused brands to appear "added" but show 0 on query:

- `vertical_manager.py`: All SQL `WHERE vertical_name = ?` clauses now use `COLLATE NOCASE`
  - Affects `get_vertical`, `get_brand_count`, `add_brand`, `remove_brand`, `delete_vertical`, `update_vertical_timestamp`
  - Fixes mismatch between cached "streetwear" and DB-stored "Streetwear" returning 0 brands
- `scout_agent.py`: Fixed `create_category` tool returning `{ok: true}` when category already existed
  - Now returns `existing_brands` list so GPT can show legacy state to user
  - Added explicit "all skipped" warning when `add_brands` silently skipped everything via `IntegrityError`
  - Added system prompt guidance to present existing brands when category already exists
- `database_migrations.py`: Unique indexes on `vertical_brands` now use `COLLATE NOCASE`
  - Treats `"Streetwear/stussy"` and `"streetwear/stussy"` as duplicates

### 2026-02-17: Post-Analysis Follow-Up & Chat/Dashboard Refactor
- `scout_agent.py`: After analysis starts, chat now proactively offers three advanced features:
  - **Trend Analysis** — rising/declining sounds, hashtags, patterns
  - **Score a Caption** — paste a draft, get a 0-100 score instantly
  - **Optimize Content** — AI rewrite using top-performing patterns
  - Added as Step 7 in system prompt + `follow_up_hint` in `run_analysis` return
- `chat_handler.py`: Major refactor (299 lines changed) — improved command routing and response types
- `dashboard.py`: Refactored route handlers and chat context logic (226 lines changed)
- `signal.html`: Minor chat UI adjustments
- `database_migrations.py`: Added `add_vertical_brands_unique_index()` migration
  - Deduplicates existing `vertical_brands` rows before indexing
  - Creates partial unique indexes: `UNIQUE(vertical_name, instagram_handle) WHERE instagram_handle IS NOT NULL`
  - Creates partial unique indexes: `UNIQUE(vertical_name, tiktok_handle) WHERE tiktok_handle IS NOT NULL`
  - Prevents duplicate brands from being added to the same vertical

### 2026-02-17: Brand Name Auto-Resolution & Chat UX
- `scout_agent.py`: Integrated `BrandHandleDiscovery` — users can type "SaintWoods" or "Fear of God Essentials" instead of exact handles
- `brand_registry.json`: Expanded with saintwoods, kith, aimé leon dore, noah entries
- Updated system prompt with guided conversational flow (confirm handles before running)

### 2026-02-17: Fix Chat Bubble Overflow
- `signal-ai.css`: Added `min-width: 0` + `overflow: hidden` to `.signal-message-content`
- Constrained report header elements and added `word-wrap` to report lines

### 2026-02-17: Fix Save Keys Error
- `setup.html`: `saveKeysOnly()` now sends all form fields (was missing optional fields causing backend errors)
- Added `r.type === 'opaqueredirect'` check for proper success detection with `redirect: 'manual'`
- Improved error handling: async response parsing, console logging, actual error message display
- On save success: redirect to `/signal` after 800ms via `window.location.href`

### 2026-02-16: Fix API Key Prompt Persistence
- `setup.html`: After successful save, redirect to `/signal` so `needs_setup()` re-evaluates
- `signal.html` (commit 9c8e5b5): Added client-side BYOK detection — hides setup prompt when localStorage has both keys
- Polish: Google sign-in page copy ("Welcome back"), refined button hover states

### 2026-02-16: UI Polish Round 2
- Reverted splash screen to original layout (150px logo, standard centering)
- `signal-ai.css`: `.signal-chat-subtitle` — removed 48px left margin, added max-width 600px, improved line-height
- `signal-ai.css`: `.signal-empty` — reduced padding (120px → 60px), min-height (50vh → 40vh)
- `signal-ai.css`: `.signal-empty-cta` — added transitions, box-shadow, hover glow

### 2026-02-15: Data Lifecycle Management & Brand Removal
- `data_lifecycle.py` (new): 3-day cleanup, competitive set fingerprinting, blank canvas logic
- Fixed brand removal: posts correctly archived when brands removed from vertical
- Fixed analysis timer showing "0m 0s"
- Rewrote cancel endpoint to use PID file directly

---

**Last Updated:** 2026-02-17
**Version:** 1.9.0
**Maintained by:** Claude Code (AI Assistant)
