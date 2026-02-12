# Outlier Content Engine - Architecture Documentation

## Project Overview

The Outlier Content Engine is an AI-powered social media competitive intelligence platform that identifies high-performing "outlier" posts from competitors on Instagram and TikTok. It uses statistical analysis to detect posts that significantly outperform baseline engagement, then leverages GPT-4 to analyze patterns and rewrite concepts in your brand's voice.

**Tech Stack:** Python (Flask), SQLite, OpenAI GPT-4, Apify/RapidAPI collectors, Jinja2 templates

---

## Core Concepts

### 1. **Verticals (Competitive Sets)**
- A "vertical" is a collection of competitor brands to monitor (e.g., "Streetwear" with brands like Nike, Supreme, Adidas)
- Stored in SQLite tables: `verticals` and `vertical_brands`
- Managed via `vertical_manager.py`
- Each vertical has a list of brands with Instagram/TikTok handles

### 2. **Brand Profiles**
- Brand-specific configuration files in `profiles/` directory (YAML format)
- Contains voice guidelines, target audience, content preferences
- Example: `profiles/heritage.yaml` for the default "Heritage" brand profile
- Loaded by `profile_loader.py`

### 3. **Outlier Detection**
- Statistical analysis to identify posts that significantly outperform baseline
- Uses z-score (standard deviations above mean) and engagement multipliers
- Configurable thresholds in brand profiles
- Core logic in `outlier_detector.py`

### 4. **Content Collection**
- Collects recent posts from Instagram and TikTok
- Pluggable collector system: Apify or RapidAPI
- Stored in SQLite `posts` table
- Collectors: `collectors/instagram.py`, `collectors/tiktok.py`

### 5. **AI Analysis**
- GPT-4 analyzes outlier posts and generates brand-specific adaptations
- Prompts dynamically constructed from brand profile
- Token usage tracking and monthly budget enforcement
- Core logic in `analyzer.py`

---

## Directory Structure

```
outlier-content-engine/
├── main.py                      # CLI entry point for running analysis
├── dashboard.py                 # Flask web dashboard
├── config.py                    # Configuration and environment variables
├── database_migrations.py       # SQLite schema migrations
│
├── profiles/                    # Brand voice profiles (YAML)
│   └── heritage.yaml
│
├── collectors/                  # Social media data collectors
│   ├── base.py                 # Base collector interface
│   ├── instagram.py            # Instagram collection (Apify/RapidAPI)
│   └── tiktok.py               # TikTok collection (Apify/RapidAPI)
│
├── outlier_detector.py         # Statistical outlier detection
├── analyzer.py                 # GPT-4 analysis and content rewriting
├── profile_loader.py           # YAML profile loader
├── vertical_manager.py         # Competitive set management
├── brand_handle_discovery.py   # Brand name → handle mapping
├── insight_generator.py        # Pattern analysis from outliers
├── voice_learner.py            # Learn brand voice from top posts
├── audio_analyzer.py           # TikTok audio trend analysis
├── series_detector.py          # Detect recurring content formats
├── report_generator.py         # Generate analysis reports
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
1. Load brand profile from `profiles/<name>.yaml`
2. Get vertical (competitive set) from database
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
    name TEXT PRIMARY KEY,
    description TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Brands in each vertical
CREATE TABLE vertical_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vertical_name TEXT,
    brand_name TEXT,
    instagram_handle TEXT,
    tiktok_handle TEXT,
    notes TEXT,
    FOREIGN KEY (vertical_name) REFERENCES verticals(name)
);
```

**Key Methods:**
- `create_vertical(name, description)` - Create new competitive set
- `add_brand(vertical_name, instagram_handle, tiktok_handle)` - Add brand
- `remove_brand(vertical_name, handle)` - Remove brand
- `list_verticals()` - Get all competitive sets
- `get_vertical(name)` - Load specific vertical with brands

---

### `collectors/instagram.py` & `collectors/tiktok.py`
**Purpose:** Collect recent posts from social platforms

**Apify Collectors (Recommended):**
- Uses Apify actor API
- Instagram: `apify~instagram-scraper`
- TikTok: `clockworks~tiktok-scraper`
- More reliable than RapidAPI
- Requires `APIFY_API_TOKEN` in `.env`

**RapidAPI Collectors (Fallback):**
- Uses RapidAPI marketplace endpoints
- Instagram: `instagram-scraper-api2`
- TikTok: `tiktok-scraper7`
- Requires `RAPIDAPI_KEY` in `.env`

**Configuration:**
Set `COLLECTION_SOURCE=apify` or `rapidapi` in `.env`

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
        "distinctive_phrases": ["heritage", "timeless", "classic"]
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
    name TEXT PRIMARY KEY,
    description TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Brands in verticals
CREATE TABLE vertical_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vertical_name TEXT,
    brand_name TEXT,
    instagram_handle TEXT,
    tiktok_handle TEXT,
    notes TEXT,
    FOREIGN KEY (vertical_name) REFERENCES verticals(name)
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

# Collection Source
COLLECTION_SOURCE=apify  # or rapidapi

# Apify (recommended)
APIFY_API_TOKEN=apify_api_...

# RapidAPI (fallback)
RAPIDAPI_KEY=...

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

### Brand Profile (YAML)

Example: `profiles/heritage.yaml`

```yaml
name: Heritage
vertical: Fashion & Lifestyle
target_audience: Age 25-45, affluent professionals
follower_count: 50000

# Voice Guidelines
voice:
  tone: Sophisticated yet approachable
  personality: Timeless, confident, quality-focused
  language_style: Clear and direct, minimal jargon
  emoji_usage: Sparingly
  values:
    - Craftsmanship
    - Authenticity
    - Timeless design

# Outlier Detection Thresholds
outlier_settings:
  min_z_score: 1.5
  min_engagement_multiplier: 2.0
  top_outliers_to_analyze: 10
  top_outliers_to_rewrite: 5

# Content Preferences
content_preferences:
  formats: [carousel, reel, static]
  avoid_topics: [Politics, controversy]
  primary_cta: Shop link
```

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

# 4. Create a brand profile
cp profiles/heritage.yaml profiles/your_brand.yaml
# Edit your_brand.yaml

# 5. Create a competitive set
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
- Check API keys in `.env`
- Verify handles exist on Instagram/TikTok
- Try switching `COLLECTION_SOURCE` (apify ↔ rapidapi)
- Check rate limits

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

### Why Apify over RapidAPI?
- More reliable and consistent data
- Better rate limits
- Official Instagram/TikTok actors
- Handles pagination automatically

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

**Last Updated:** 2026-02-12

**Version:** 1.0.0

**Maintained by:** Claude Code (AI Assistant)
