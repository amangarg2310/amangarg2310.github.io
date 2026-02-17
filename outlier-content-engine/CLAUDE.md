# Outlier Content Engine - Architecture Documentation

## Project Overview

The Outlier Content Engine is an AI-powered social media competitive intelligence platform that identifies high-performing "outlier" posts from competitors on Instagram, TikTok, and Facebook. It uses statistical analysis to detect posts that significantly outperform baseline engagement, then leverages GPT-4 to analyze patterns and rewrite concepts in your brand's voice.

**Tech Stack:** Python (Flask), SQLite, OpenAI GPT-4, Apify collectors, Jinja2 templates

---

## Core Concepts

### 1. **Verticals (Competitive Sets)**
- A "vertical" is a collection of competitor brands to monitor (e.g., "Streetwear" with brands like Nike, Supreme, Adidas)
- Stored in SQLite tables: `verticals` and `vertical_brands`
- Managed via `vertical_manager.py`
- Each vertical has a list of brands with Instagram/TikTok/Facebook handles

### 2. **Brand Profiles**
- Brand-specific configuration loaded from the database vertical system
- Contains voice guidelines, target audience, content preferences
- Managed via `profile_loader.py` (loads from database)

### 3. **Outlier Detection**
- Statistical analysis to identify posts that significantly outperform baseline
- Uses z-score (standard deviations above mean) and engagement multipliers
- Configurable thresholds in brand profiles
- Core logic in `outlier_detector.py`

### 4. **Content Collection**
- Collects recent posts from Instagram and TikTok
- Collector system powered by Apify
- Stored in SQLite `posts` table
- Collectors: `collectors/instagram.py`, `collectors/tiktok.py`

### 5. **AI Analysis**
- GPT-4 analyzes outlier posts and generates brand-specific adaptations
- Prompts dynamically constructed from brand profile
- Token usage tracking and monthly budget enforcement
- Core logic in `analyzer.py`

### 6. **Data Lifecycle Management** 🆕
- **3-day auto-cleanup**: Automatically deletes posts older than 3 days
- **Competitive set tracking**: Detects when brands are added/removed
- **Blank canvas logic**: Clears data when set changes or >3 days old
- **Incremental analysis**: Keeps existing outliers + adds new ones (same set within 3 days)
- **Soft delete**: Removed brands are archived (not deleted) for instant re-add
- Core logic in `data_lifecycle.py`

---

## Directory Structure

```
outlier-content-engine/
├── main.py                      # CLI entry point for running analysis
├── dashboard.py                 # Flask web dashboard
├── config.py                    # Configuration and environment variables
├── database_migrations.py       # SQLite schema migrations
│
├── collectors/                  # Social media data collectors
│   ├── base.py                 # Base collector interface
│   ├── instagram.py            # Instagram collection (Apify)
│   └── tiktok.py               # TikTok collection (Apify)
│
├── outlier_detector.py         # Statistical outlier detection
├── analyzer.py                 # GPT-4 analysis and content rewriting
├── profile_loader.py           # Brand profile loader (database)
├── vertical_manager.py         # Competitive set management (CRUD)
├── data_lifecycle.py           # 3-day cleanup & blank canvas logic 🆕
├── brand_handle_discovery.py   # Brand name → handle mapping
├── insight_generator.py        # Pattern analysis from outliers
├── voice_learner.py            # Learn brand voice from top posts
├── audio_analyzer.py           # TikTok audio trend analysis
├── series_detector.py          # Detect recurring content formats
├── report_generator.py         # Generate analysis reports
├── progress_tracker.py         # Real-time progress tracking
│
├── templates/                  # Jinja2 HTML templates
│   ├── signal.html            # Scout AI dashboard (main view)
│   ├── base.html              # Base layout
│   ├── verticals.html         # Competitive set management
│   └── settings.html          # Configuration UI
│
├── static/                     # CSS and assets
│   ├── signal-ai.css          # Main dashboard styles
│   ├── style.css              # Global styles
│   └── split-layout.css       # Split-panel layout
│
├── brand_registry.json         # Known brand → handle mappings
└── outlier_data.db            # SQLite database
```

---

## Key Files Deep Dive

### `main.py` - Analysis Pipeline
**Purpose:** CLI entry point for running the full analysis pipeline

**Flow:**
1. Load vertical (competitive set) from database
2. Build brand profile from vertical data
3. Collect recent posts from Instagram/TikTok
4. Detect outliers using statistical analysis
5. Learn brand voice from own top posts (optional)
6. Analyze outliers with GPT-4
7. Generate insights and recommendations
8. Save report and send email (optional)

**Key Functions:**
- `run_outlier_analysis()` - Main orchestration
- `get_competitive_set()` - Load brands from vertical
- Uses all core modules in sequence

---

### `dashboard.py` - Web Interface
**Purpose:** Flask web server for interactive dashboard

**Key Routes:**
- `/signal` - Scout AI dashboard with outlier posts and chat interface
- `/api/load_vertical/<name>` - Load a competitive set
- `/chat/message` - Process chat commands (add/remove brands)
- `/verticals` - Manage competitive sets
- `/settings` - Configure thresholds and API keys

**Architecture:**
- Uses SQLite for persistence
- Server-side rendering with Jinja2
- Real-time filtering via URL query parameters
- Chat handler for natural language commands

**Recent Updates:**
- Added empty state support (`?empty=true`)
- Competitive set dropdown for easy switching
- Reset button clears all brands and chat

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
**Purpose:** Identify posts that significantly outperform baseline

**Algorithm:**
1. Calculate baseline metrics per competitor (mean, median, std dev)
2. Compute z-scores (std devs above mean) for each post
3. Calculate engagement multipliers vs. baseline
4. Apply configurable thresholds from brand profile
5. Rank outliers by composite score

**Key Classes:**
- `OutlierPost` - Data model for an outlier
- `CompetitorBaseline` - Per-competitor baseline stats
- `OutlierDetector` - Main detection logic

**Thresholds (configurable in profile):**
- Minimum z-score: 1.5 (1.5 std devs above mean)
- Minimum engagement multiplier: 2.0x baseline
- Top N outliers to analyze: 10

---

### `analyzer.py` - GPT-4 Analysis
**Purpose:** Analyze outlier posts and rewrite concepts in brand voice

**Prompt Construction:**
- Dynamically built from brand profile
- Includes learned voice patterns from top posts
- Real caption examples from brand's own posts
- Trending audio and content series context

**Output Schema (JSON):**
```json
{
  "outlier_analysis": [
    {
      "post_id": "...",
      "hook_type": "question|curiosity_gap|shock|...",
      "hook_breakdown": "Why this hook works",
      "visual_strategy": "What made the visual work",
      "emotional_trigger": "Core emotion activated",
      "content_pattern": "Named framework (e.g., 'Before/After')",
      "replicability_score": 8
    }
  ],
  "brand_adaptations": [
    {
      "adapted_caption": "Rewritten in brand voice",
      "hook_suggestion": "Opening line concept",
      "visual_direction": "What the visual should show",
      "format_suggestion": "reel|carousel|static|story",
      "brand_fit_score": 8
    }
  ],
  "weekly_patterns": {
    "best_content_types": ["..."],
    "trending_themes": ["..."]
  },
  "content_calendar_suggestions": [...]
}
```

**Budget Management:**
- Tracks token usage in `token_usage` table
- Monthly cost ceiling (default: $5.00)
- Returns raw data if budget exceeded

---

### `vertical_manager.py` - Competitive Sets
**Purpose:** CRUD operations for competitive sets (verticals)

**Database Schema:**
```sql
-- Verticals (competitive sets)
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
    instagram_handle TEXT,
    tiktok_handle TEXT,
    facebook_handle TEXT,
    added_at TEXT NOT NULL,
    FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE,
    UNIQUE(vertical_name, instagram_handle)
);
```

**Key Methods:**
- `create_vertical(name, description)` - Create new competitive set (case-insensitive duplicate check)
- `delete_vertical(name)` - Delete competitive set and all brands (CASCADE)
- `add_brand(vertical_name, instagram_handle, tiktok_handle, facebook_handle)` - Add brand with paired handles
- `update_brand_tiktok(vertical_name, tiktok_handle)` - Add TikTok handle to existing brand
- `update_brand_facebook(vertical_name, facebook_handle)` - Add Facebook handle to existing brand
- `remove_brand(vertical_name, handle)` - Remove brand by any handle (IG/TT/FB)
- `list_verticals()` - Get all competitive sets
- `get_vertical(name)` - Load specific vertical with brands

**Database Connection:**
- Uses WAL mode (`PRAGMA journal_mode=WAL`) for concurrent read/write access
- `busy_timeout=5000` prevents "database is locked" errors during analysis

---

### `collectors/instagram.py` & `collectors/tiktok.py`
**Purpose:** Collect recent posts from social platforms

**Apify Collectors:**
- Uses Apify actor API
- Instagram: `apify~instagram-scraper`
- TikTok: `clockworks~tiktok-scraper`
- Requires `APIFY_API_TOKEN` in `.env` or database

**Data Model (CollectedPost):**
```python
@dataclass
class CollectedPost:
    post_id: str
    competitor_name: str
    competitor_handle: str
    platform: str  # "instagram" or "tiktok"
    post_url: str
    media_type: str  # "image", "video", "carousel"
    caption: Optional[str]
    likes: int
    comments: int
    shares: int
    views: int
    saves: int
    posted_at: Optional[datetime]
    media_url: Optional[str]
    hashtags: List[str]
    follower_count: Optional[int]
    audio_id: Optional[str]  # TikTok only
    audio_name: Optional[str]  # TikTok only
```

---

### `voice_learner.py` - Brand Voice Learning
**Purpose:** Learn brand voice patterns from own top-performing posts

**Process:**
1. Fetch brand's own Instagram posts
2. Identify top performers (by engagement rate)
3. Analyze with GPT-4 to extract voice patterns
4. Returns structured voice profile

**Output:**
```python
{
    "voice_summary": "Conversational, enthusiastic, emoji-light",
    "sentence_patterns": {
        "structure": "Mix of short punchy and longer storytelling",
        "avg_length": "3-5 sentences"
    },
    "vocabulary": {
        "formality": "Casual",
        "distinctive_phrases": ["elevated", "timeless", "classic"]
    },
    "opening_patterns": ["Question hook", "Bold statement"],
    "closing_patterns": ["Shop link", "Call to community"],
    "emoji_usage": "Sparingly, 1-2 per caption",
    "caption_length": "Medium (80-150 words)",
    "punctuation_habits": "Period-heavy, occasional exclamation"
}
```

**Integration:**
- Used in `analyzer.py` to build more accurate prompts
- Helps GPT-4 write in authentic brand voice
- Optional feature (run with `--learn-voice` flag)

---

### `insight_generator.py` - Pattern Analysis
**Purpose:** Generate high-level insights from detected outliers

**Analyzes:**
- Best performing content types (video, carousel, static)
- Optimal posting days/times
- Trending themes and topics
- Hook types that work best
- Recurring content formats (franchises)

**Output Structure:**
```python
{
    "summary": "Text summary of key findings",
    "patterns": [
        {
            "name": "Video Reels Dominate",
            "pattern_type": "format",
            "metric": "3.2x avg engagement",
            "description": "...",
            "actionable_takeaway": "..."
        }
    ],
    "franchises": [
        {
            "name": "Behind the Scenes Series",
            "description": "...",
            "retention_score": "High",
            "post_count": 5
        }
    ],
    "recommendations": [...]
}
```

---

### `templates/signal.html` - Scout AI Dashboard
**Purpose:** Main interactive dashboard for viewing and analyzing outliers

**Layout:**
- **Left Panel:** Chat interface with Scout AI
  - Welcome message
  - Current competitive set display
  - AI-generated insights and patterns
  - Recommendations
  - Reset button

- **Right Panel:** Outlier posts grid
  - Competitive set dropdown (select saved sets)
  - Filter pills (brands, platform, timeframe, sort)
  - Post cards with engagement metrics
  - Visual previews with fallback gradients

**Key Features:**
1. **Competitive Set Dropdown** - Switch between saved sets
2. **Empty State** - Shows when no competitive set loaded (`?empty=true`)
3. **Brand Filter Pills** - Click to filter, long-press to replace
4. **Reset Button** - Clears all brands and chat, returns to empty state
5. **Real-time Filtering** - URL-based filter state
6. **Image Proxy** - `/proxy-image?url=...` for CORS-protected media
7. **Gradient Fallbacks** - Colorful placeholders when images fail

**Recent Improvements:**
- Added competitive set management (dropdown + load/reset)
- Empty state UI with guidance message
- Reset functionality that truly clears everything

---

## Database Schema

### Main Tables

```sql
-- Social media posts (collected)
CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT UNIQUE NOT NULL,
    competitor_name TEXT,
    competitor_handle TEXT,
    platform TEXT,
    post_url TEXT,
    media_type TEXT,
    caption TEXT,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    views INTEGER,
    saves INTEGER,
    posted_at TEXT,
    collected_at TEXT,
    media_url TEXT,
    hashtags TEXT,  -- JSON array
    follower_count INTEGER,
    audio_id TEXT,
    audio_name TEXT
);

-- Outlier posts (detected)
CREATE TABLE outliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT,
    profile_name TEXT,  -- Brand profile name
    outlier_score REAL,
    engagement_multiplier REAL,
    std_devs_above REAL,
    detected_at TEXT,
    content_tags TEXT,  -- JSON array
    FOREIGN KEY (post_id) REFERENCES posts(post_id)
);

-- Competitive sets (verticals)
CREATE TABLE verticals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Brands in verticals
CREATE TABLE vertical_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vertical_name TEXT NOT NULL,
    brand_name TEXT,
    instagram_handle TEXT,
    tiktok_handle TEXT,
    facebook_handle TEXT,
    added_at TEXT NOT NULL,
    FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE,
    UNIQUE(vertical_name, instagram_handle)
);

-- Analysis reports
CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name TEXT,
    vertical_name TEXT,
    report_date TEXT,
    outlier_count INTEGER,
    report_json TEXT,  -- Full JSON report
    created_at TEXT
);

-- Token usage tracking
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

-- API keys (encrypted)
CREATE TABLE api_keys (
    service TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);

-- Configuration
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
);
```

### Indexes

```sql
CREATE INDEX idx_posts_competitor ON posts(competitor_handle);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_posted_at ON posts(posted_at);
CREATE INDEX idx_outliers_profile ON outliers(profile_name);
CREATE INDEX idx_outliers_score ON outliers(outlier_score DESC);
```

---

## Configuration

### Environment Variables (`.env`)

```bash
# OpenAI API
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # or gpt-4o
MONTHLY_COST_LIMIT_USD=5.00

# Apify (Instagram + TikTok data collection)
APIFY_API_TOKEN=apify_api_...

# Instagram Collection
INSTAGRAM_ACCOUNT=your_brand_handle  # For learning voice

# Email Notifications
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your@email.com
SMTP_PASSWORD=...
SMTP_FROM=your@email.com
SMTP_TO=recipient@email.com

# Database
DB_PATH=outlier_data.db

# Dashboard
DASHBOARD_PORT=5001
```

### Brand Profiles (Database)

Brand profiles are loaded from the database vertical system. Each vertical in the `verticals` table has associated brands in `vertical_brands`. The `profile_loader.py` module builds a `BrandProfile` dataclass from this data with default voice config and outlier settings.

---

## API Endpoints

### Dashboard Routes

**GET `/signal`**
- Main Scout AI dashboard
- Query params: `competitor`, `platform`, `timeframe`, `sort`, `tag`, `empty`
- Returns: HTML with outlier posts and chat interface

**GET `/api/load_vertical/<name>`**
- Load a competitive set by name
- Sets active vertical in session
- Redirects to `/signal`

**POST `/chat/message`**
- Process natural language chat commands
- Body: `{"message": "add @nike to streetwear"}`
- Returns: JSON with response and action data

**GET `/verticals`**
- List all competitive sets
- Returns: HTML with vertical management UI

**POST `/verticals/create`**
- Create new competitive set
- Body: `{"name": "...", "description": "..."}`

**GET `/verticals/<name>/edit`**
- Edit competitive set
- Returns: HTML form with brands list

**POST `/verticals/<name>/brands/add`**
- Add brand to competitive set
- Body: `{"instagram_handle": "...", "tiktok_handle": "..."}`

**DELETE `/verticals/<name>/brands/<handle>`**
- Remove brand from competitive set

**GET `/settings`**
- Configuration UI
- Manage API keys, thresholds, content tags

**GET `/proxy-image?url=<encoded_url>`**
- Proxy for CORS-protected images
- Returns: Image with proper CORS headers

---

## Running the Application

### Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create .env file
cp .env.example .env
# Edit .env with your API keys

# 3. Run database migrations
python database_migrations.py

# 4. Create a competitive set
python -c "from vertical_manager import VerticalManager; vm = VerticalManager(); vm.create_vertical('Streetwear', 'Fashion competitors'); vm.add_brand('Streetwear', instagram_handle='nike')"
```

### Run Analysis (CLI)

```bash
# Basic analysis
python main.py --vertical Streetwear

# With voice learning
python main.py --vertical Streetwear --learn-voice

# Skip collection (use existing data)
python main.py --vertical Streetwear --skip-collect

# With email report
python main.py --vertical Streetwear --email
```

### Run Dashboard

```bash
# Start web server
python dashboard.py --port 5001

# Open browser
open http://localhost:5001/signal
```

---

## Common Workflows

### 1. Adding a New Competitive Set

**Via CLI:**
```python
from vertical_manager import VerticalManager

vm = VerticalManager()
vm.create_vertical('Streetwear', 'Urban fashion brands')
vm.add_brand('Streetwear', instagram_handle='nike')
vm.add_brand('Streetwear', instagram_handle='adidas')
vm.add_brand('Streetwear', instagram_handle='supremenewyork')
```

**Via Dashboard:**
1. Go to `/verticals`
2. Click "Create New Collection"
3. Enter name and description
4. Add brands via chat: "add @nike @adidas to streetwear"

### 2. Running Your First Analysis

```bash
# 1. Make sure you have a vertical created
python -c "from vertical_manager import VerticalManager; print(VerticalManager().list_verticals())"

# 2. Run analysis
python main.py --vertical Streetwear --no-email

# 3. View results in dashboard
python dashboard.py --port 5001
# Open http://localhost:5001/signal
```

### 3. Resetting the Dashboard

1. Click the "Reset" button in Scout AI dashboard
2. This clears all brand filters and chat messages
3. Shows empty state with dropdown to load saved competitive sets
4. Select a competitive set from dropdown to load it back

### 4. Switching Competitive Sets

1. Use the "COMPETITIVE SET" dropdown at top of filters
2. Select a different vertical from the list
3. Page reloads with new brands and outliers

---

## Troubleshooting

### No posts collected
- Check `APIFY_API_TOKEN` in `.env` or database (api_credentials table)
- Verify handles exist on Instagram/TikTok
- Check Apify rate limits and account balance

### No outliers detected
- Lower thresholds in brand profile (`min_z_score`, `min_engagement_multiplier`)
- Increase lookback period
- Verify competitors are posting actively

### GPT-4 analysis fails
- Check `OPENAI_API_KEY` is valid
- Verify monthly budget not exceeded (check `token_usage` table)
- Check OpenAI service status

### Dashboard not loading
- Check if port 5001 is available: `lsof -ti:5001`
- Kill existing process: `lsof -ti:5001 | xargs kill -9`
- Check `outlier_data.db` exists
- Run migrations: `python database_migrations.py`

### Images not loading
- Uses `/proxy-image` endpoint for CORS
- Falls back to gradient placeholders if all sources fail
- Check browser console for CORS errors

---

## Architecture Decisions

### Why SQLite?
- Simple, serverless, single file
- Perfect for single-user tool
- Easy backup and portability
- Sufficient performance for this use case

### Why Apify?
- Reliable and consistent data
- Official Instagram/TikTok actors
- Handles pagination automatically
- Single API token for all platforms

### Why GPT-4o-mini?
- 80% cheaper than GPT-4
- Fast enough for this use case
- Good quality for content analysis
- Budget-friendly for monthly usage

### Why Flask over FastAPI?
- Simpler for server-side rendering
- Mature template engine (Jinja2)
- Easier to integrate with existing tools
- No async complexity needed

### Why No Frontend Framework?
- Server-side rendering is faster to build
- Less complexity and dependencies
- Easier for AI to maintain
- Progressive enhancement with vanilla JS

---

## Future Improvements

### Potential Features
- [ ] Multi-user support with authentication
- [ ] Real-time updates (WebSocket)
- [ ] Custom AI models (fine-tuned on brand)
- [ ] LinkedIn/Twitter/YouTube support
- [ ] Collaborative features (teams, comments)
- [ ] A/B testing recommendations
- [ ] Automated content scheduling
- [ ] Competitor alerts (new outliers)
- [ ] Export to Notion/Airtable

### Technical Debt
- [ ] Add comprehensive test suite
- [ ] Implement proper logging framework
- [ ] Add Redis caching layer
- [ ] Migrate to PostgreSQL for multi-user
- [ ] Add API rate limiting
- [ ] Implement proper error tracking (Sentry)
- [ ] Add CI/CD pipeline
- [ ] Containerize with Docker

---

## Contributing

This is a personal project, but contributions are welcome!

**Before submitting:**
1. Test your changes locally
2. Update this CLAUDE.md if you change architecture
3. Follow existing code style
4. Add docstrings to new functions

---

## License

MIT License - See LICENSE file for details

---

## Contact

For questions or issues, please open a GitHub issue or contact the project maintainer.

---

## Recent Updates & Changelog

### 2026-02-15: Data Lifecycle Management & Brand Removal Fixes

**Major Features Added:**

1. **3-Day Data Lifecycle System** (`data_lifecycle.py`)
   - Automatic cleanup of posts older than 3 days
   - Competitive set change detection via signature fingerprinting
   - Blank canvas logic: clears data when set changes or is >3 days old
   - Incremental analysis: keeps existing outliers + adds new ones when re-running same set within 3 days
   - Integration points in `main.py` (lines 236-249 and 687-698)

2. **Soft Delete Verification**
   - Fixed brand removal system to properly archive posts when brands are removed
   - Verified with Stussy brand test: 24 posts correctly archived on removal
   - System works for ANY brand removal, not just specific cases
   - Removed brands no longer appear in dashboard results

**Bug Fixes:**

1. **Analysis Timer Showing "0m 0s"** ([scout_agent.py:619](scout_agent.py#L619))
   - Fixed database query: changed `WHERE handle = ?` to `WHERE competitor_handle = ?`
   - Added frontend fallback in [signal.html:1703-1706](templates/signal.html#L1703-L1706) to show "Starting..." instead of "0m 0s"

2. **Cancel Button Error** ([dashboard.py:1365-1420](dashboard.py#L1365-L1420))
   - Rewrote cancel endpoint to use PID file directly instead of scanning processes
   - Now reliably kills analysis process using `psutil.Process(pid).send_signal(SIGTERM)`
   - Gracefully handles "already stopped" cases

3. **Removed Brands Still Showing (Nike, Adidas)**
   - Root cause: Database migrations hadn't been run, so `verticals` and `vertical_brands` tables didn't exist
   - Fixed by running `run_vertical_migrations()` and `add_archived_column_to_posts()`
   - Manually archived Nike and Adidas posts: `UPDATE competitor_posts SET archived = 1 WHERE brand_profile = 'Streetwear' AND competitor_handle IN ('nike', 'adidas')`
   - Created Streetwear vertical with 8 active brands

4. **Timer Display Logic** ([dashboard.py:1451](dashboard.py#L1451))
   - Removed overly restrictive condition preventing elapsed timer calculation
   - Timer now updates properly during analysis

**Technical Implementation:**

- **Data Lifecycle Manager Class** with methods:
  - `cleanup_old_data(days=3)` - Deletes posts older than N days
  - `get_competitive_set_signature(vertical_name)` - Creates sorted JSON fingerprint of brand handles
  - `should_clear_data(vertical_name)` - Determines if data should be cleared based on set changes or age
  - `clear_vertical_data(vertical_name)` - Clears all posts for a vertical (blank canvas)
  - `save_analysis_info()` - Stores competitive set signature and timestamp for future comparisons

- **Lifecycle Config File**: `data/lifecycle_config.json` tracks:
  - Competitive set signature (sorted JSON array of handles)
  - Last analysis timestamp
  - Number of posts analyzed

**User-Facing Changes:**

1. **First-time visitors** now see a blank canvas (no historical data)
2. **Re-running same competitive set within 3 days** keeps existing outliers AND adds new outliers from fresh posts
3. **Different competitive set or >3 days old** shows blank canvas (old data deleted)
4. **Removed brands** are properly archived and don't appear in results
5. **Analysis timer** displays correctly during runs
6. **Cancel button** works reliably without errors

**Files Modified:**
- [scout_agent.py](scout_agent.py) - Fixed cache check database query
- [templates/signal.html](templates/signal.html) - Added timer fallback display
- [dashboard.py](dashboard.py) - Rewrote cancel endpoint, fixed timer logic
- [main.py](main.py) - Integrated data lifecycle management
- [data_lifecycle.py](data_lifecycle.py) - NEW FILE: Complete lifecycle management system
- [CLAUDE.md](CLAUDE.md) - Updated documentation

**Testing Performed:**
- Verified brand removal with Stussy: 24 posts archived correctly ✅
- Confirmed Nike and Adidas no longer appear after archiving ✅
- Tested lifecycle logic: competitive set signatures match/differ correctly ✅
- Verified timer displays "Starting..." then updates with elapsed time ✅
- Confirmed cancel button terminates running analysis ✅

---

### 2026-02-17: GPT Orchestration Fixes & Platform Parity

**Critical Bug Fixes:**

1. **GPT Contradictory Response Bug** (`scout_agent.py`)
   - **Root cause:** When category existed with 0 brands, `create_category` told GPT "has brands from a previous session" — GPT said brands were "already tracked" while also saying "0 brands"
   - **Fix 1:** `_handle_create_category` returns different `note` for 0-brand vs >0-brand cases
   - **Fix 2:** System prompt STEP 1 updated — empty categories skip "start fresh?" and proceed to add brands
   - **Fix 3:** Added "CRITICAL RULE" preventing GPT from redundantly re-calling `create_category`
   - **Fix 4:** `add_brands` success response includes explicit guidance note for GPT

2. **add_brand Crash on Fresh DB** (`vertical_manager.py`)
   - `add_brand()` queried `competitor_posts` for archived post unarchiving BEFORE inserting into `vertical_brands`
   - On fresh DBs (no `competitor_posts` table yet), this threw `OperationalError` and silently skipped ALL brand insertions
   - Wrapped archived-posts check in try/except so brand insertion always proceeds

3. **Facebook Handle Support** (`vertical_manager.py`, `scout_agent.py`)
   - Added `facebook_handle TEXT` column to `vertical_brands`
   - Paired IG/TT/FB handle insertion (same-index handles stored on same DB row)
   - `update_brand_facebook()` method for FB-only handle updates
   - `remove_brand()` matches against any handle (IG, TT, or FB)

4. **WAL Mode for Concurrent Access** (`vertical_manager.py`, `scout_agent.py`)
   - Added `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` to all DB connections
   - Fixes "database is locked" errors when analysis subprocess runs alongside dashboard

5. **Case-Insensitive Category Duplicates** (`vertical_manager.py`)
   - `create_vertical` uses `COLLATE NOCASE` to prevent "Streetwear" and "streetwear" as separate entries
   - `delete_category` tool added for "start fresh" flow

**Files Modified:**
- `scout_agent.py` — GPT orchestration fixes (system prompt, tool responses, anti-redundancy rule)
- `vertical_manager.py` — WAL mode, facebook_handle, paired handles, remove_brand fixes, add_brand crash fix
- `database_migrations.py` — facebook_handle column migration

---

**Last Updated:** 2026-02-17

**Version:** 1.2.0

**Maintained by:** Claude Code (AI Assistant)
