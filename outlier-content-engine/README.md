# Outlier Content Engine

A brand-agnostic competitor intelligence platform that monitors competitor content on Instagram, identifies high-performing outlier posts, analyzes why they worked, and rewrites the best concepts in your brand's authentic voice.

## How It Works

```
Collect competitor posts → Detect statistical outliers → LLM analysis → Brand voice rewrite → Email report
```

1. **Collect** — Fetches recent posts from competitor Instagram accounts
2. **Detect** — Flags posts that significantly outperform using engagement multiplier (2x) and standard deviation (1.5σ) thresholds
3. **Analyze** — GPT-4o-mini explains *why* outliers worked and identifies replicable content patterns
4. **Rewrite** — Adapts the top outlier concepts into your brand's voice with captions, visual direction, and posting suggestions
5. **Report** — Sends a formatted HTML email with outlier insights, patterns, adapted content ideas, and a suggested content calendar

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# 3. Run the engine
python main.py
```

## Configuration

### Environment Variables (.env)

```bash
ACTIVE_PROFILE=heritage          # Which brand profile to use
RAPIDAPI_KEY=your_key            # Primary data source (RapidAPI Instagram scraper)
APIFY_API_TOKEN=your_token       # Fallback data source (optional)
COLLECTION_SOURCE=rapidapi       # "rapidapi" or "apify"
OPENAI_API_KEY=sk-...            # For GPT-4o-mini analysis
EMAIL_ADDRESS=you@gmail.com      # Sender email
EMAIL_APP_PASSWORD=xxxx          # Gmail App Password (NOT your regular password)
EMAIL_RECIPIENTS=team@co.com     # Comma-separated recipient list
```

### Gmail App Password Setup

Regular Gmail passwords won't work with SMTP. You need an App Password:

1. Go to [Google Account > Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already on
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a new App Password for "Mail"
5. Use that 16-character password as `EMAIL_APP_PASSWORD`

### Instagram Data Source

**RapidAPI (recommended for budget):**
- Sign up at [rapidapi.com](https://rapidapi.com)
- Subscribe to an Instagram scraper API (many have free tiers with 100-500 req/month)
- 6 competitors × 1 request/day = ~180 requests/month — fits most free tiers

**Apify (reliable fallback):**
- Sign up at [apify.com](https://apify.com)
- ~$5 per 1,000 results
- More reliable but costs per result

## Brand Profiles

All brand-specific configuration lives in YAML files under `profiles/`. The engine reads `ACTIVE_PROFILE` from `.env` to determine which profile to load.

### Switching Brands

```bash
# Edit .env
ACTIVE_PROFILE=my_new_brand

# Or use CLI flag
python main.py --profile my_new_brand
```

### Creating a New Profile

```bash
cp profiles/_template.yaml profiles/my_brand.yaml
# Edit my_brand.yaml with your brand's voice, competitors, and settings
```

Each profile defines:
- **Brand info** — name, vertical, tagline, description
- **Voice** — tone, language style, themes, things to avoid, example captions
- **Competitors** — names and platform handles to monitor
- **Content tags** — themes, hook types, and formats relevant to your vertical
- **Outlier settings** — engagement multiplier, std dev threshold, lookback window

## Web Dashboard

A visual dashboard for non-technical users to manage everything without touching config files.

```bash
python dashboard.py                # runs at http://localhost:5000
python dashboard.py --port 8080    # custom port
```

**Dashboard pages:**

| Page | What you can do |
|------|----------------|
| **Overview** | See stats, run the pipeline with one click, view recent runs |
| **Competitors** | Add or remove competitors with a simple form (no YAML editing) |
| **Brand Voice** | Edit tone, themes, example captions — the AI uses these to rewrite content |
| **Outliers** | Browse detected outlier posts, filter by competitor, sort by score/likes/date |
| **Reports** | View and download generated HTML intelligence reports |
| **Settings** | Adjust outlier sensitivity with sliders, manage content categories |

The profile switcher in the sidebar lets you swap between brands instantly.

## CLI Options

```bash
python main.py                        # Default: uses ACTIVE_PROFILE from .env
python main.py --profile heritage     # Override profile
python main.py --skip-collect         # Skip data collection, analyze existing data
python main.py --no-email             # Save report locally instead of emailing
```

## Project Structure

```
outlier-content-engine/
├── main.py                 # Pipeline orchestrator
├── dashboard.py            # Flask web dashboard
├── config.py               # Environment-driven global settings
├── profile_loader.py       # YAML profile loader + validation
├── profiles/
│   ├── heritage.yaml       # Heritage streetwear brand profile
│   └── _template.yaml      # Blank template for new brands
├── collectors/
│   ├── __init__.py         # BaseCollector interface + CollectedPost dataclass
│   └── instagram.py        # Instagram data fetcher (RapidAPI / Apify)
├── outlier_detector.py     # Statistical outlier detection + content tagging
├── analyzer.py             # GPT-4o-mini analysis + brand voice rewriter
├── reporter.py             # HTML email report generator
├── templates/              # Dashboard HTML templates
│   ├── base.html           # Layout with sidebar navigation
│   ├── index.html          # Overview / home page
│   ├── competitors.html    # Competitor management
│   ├── voice.html          # Brand voice editor
│   ├── outliers.html       # Outlier post viewer
│   ├── reports.html        # Report viewer + downloads
│   └── settings.html       # Detection thresholds + content tags
├── static/
│   └── style.css           # Dashboard styles
├── data/                   # SQLite database + saved reports (gitignored)
├── requirements.txt
└── .env.example
```

## First Run

On the first run, the engine collects posts but may not detect outliers — it needs at least 3 posts per competitor to compute baselines. After 1-2 daily runs, outlier detection becomes active.

## Cost Estimates

- **Instagram data:** $0/month (RapidAPI free tier) or ~$2/month (Apify)
- **LLM analysis:** ~$0.03/month (GPT-4o-mini, ~1K tokens/day)
- **Total:** Under $5/month

The engine tracks token usage in SQLite and enforces a configurable monthly ceiling (default $4.50) to prevent cost overruns.

## Roadmap

- [ ] Facebook + TikTok collectors
- [ ] GitHub Actions daily automation
- [ ] Historical trend tracking
- [ ] Own-brand performance comparison
- [ ] Slack/Discord real-time alerts
- [x] Web dashboard UI
- [ ] Multi-brand batch runs
- [ ] Cross-vertical profile templates
