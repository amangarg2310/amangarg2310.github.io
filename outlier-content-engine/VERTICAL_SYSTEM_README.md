# Vertical Management System - Implementation Complete

## Overview

The Outlier Content Engine has been upgraded with a **Vertical Management System** that replaces the YAML profile approach with a database-driven, user-friendly interface.

## What's New

### 1. **Vertical-Based Organization**
- **Verticals** = Named categories (e.g., "Streetwear", "Luxury Fashion")
- Each vertical contains a list of brand handles to track
- Easily switch between verticals via dropdown
- Add/remove brands anytime through the UI

### 2. **One-Time Setup Flow**
- `/setup` route for initial API key configuration
- Store Apify + OpenAI keys in database (not .env)
- Configure team email distribution list
- No manual YAML editing required

### 3. **Simple Brand Management**
- Quick add: Individual handles one at a time
- Bulk add: Paste multiple handles at once
- Edit anytime: Add/remove brands from existing verticals
- No restart needed: Changes take effect on next pipeline run

## Getting Started

### First Time Setup

1. **Start the dashboard**:
   ```bash
   python3 dashboard.py
   ```

2. **Visit http://localhost:5000**
   - You'll be redirected to `/setup` automatically

3. **Enter API Keys**:
   - Apify API Token (for Instagram/TikTok data)
   - OpenAI API Key (for AI analysis)
   - Team emails (optional)

4. **Create First Vertical**:
   - Give it a name (e.g., "Streetwear")
   - Paste Instagram handles (one per line):
     ```
     @supremenewyork
     @stussy
     @palaceskateboards
     @carharttwip
     @bape
     ```
   - Click "Create & Start Tracking"

5. **Run Analysis**:
   - Dashboard redirects automatically
   - Click "Run Analysis" to collect data
   - View outliers in ~60 seconds

### Daily Usage

**Switch Verticals**:
- Use dropdown in sidebar footer
- Instantly switch between different markets

**Add More Brands**:
- Click "Edit" button on vertical
- Add handles via quick add or bulk paste
- Run analysis to include new brands

**Create New Vertical**:
- Click "+ New Vertical" in sidebar
- Name it and add brands
- Start tracking immediately

## Database Schema

### New Tables Created:

```sql
-- API credentials (admin-managed, one-time setup)
api_credentials
  - service (apify, openai)
  - api_key
  - created_at, updated_at

-- Verticals (user-created categories)
verticals
  - name (unique)
  - description
  - created_at, updated_at

-- Brands within verticals
vertical_brands
  - vertical_name
  - brand_name (optional display name)
  - instagram_handle
  - tiktok_handle (optional)
  - added_at

-- Email subscriptions (team members)
email_subscriptions
  - vertical_name (NULL = all verticals)
  - email
  - is_active
  - created_at
```

## Files Added/Modified

### New Files:
- `database_migrations.py` - Schema migrations for vertical system
- `vertical_manager.py` - CRUD operations for verticals/brands
- `templates/setup.html` - One-time API key setup page
- `templates/vertical_create.html` - Create new vertical form
- `templates/vertical_edit.html` - Edit existing vertical
- `VERTICAL_SYSTEM_README.md` - This file

### Modified Files:
- `config.py` - Added `get_api_key()` function for database-backed keys
- `dashboard.py` - Added vertical management routes
- `templates/base.html` - Replaced profile switcher with vertical switcher

### Files to Modify (Next Steps):
- `main.py` - Add `--vertical` flag support
- `collectors/instagram.py` - Use `config.get_api_key('apify')`
- `analyzer.py` - Use `config.get_api_key('openai')`

## Migration from Old System

If you have existing YAML profiles:

```bash
python3 database_migrations.py heritage
```

This converts the `heritage.yaml` profile into a "Heritage" vertical with all competitors as brands.

## Backward Compatibility

- Old `.env` API keys still work (fallback)
- YAML profiles can coexist with verticals
- `main.py --profile` flag still works (for now)

## Next Steps

1. **Update main.py** to accept verticals and generate temporary profiles on-the-fly
2. **Update collectors** to use `config.get_api_key()` instead of direct env vars
3. **Test full pipeline** with a vertical
4. **Migrate existing profiles** if any

## Benefits

✅ **Zero manual file editing** - Everything through UI
✅ **Team-friendly** - Non-technical users can manage brands
✅ **Fast iteration** - Add/remove brands instantly
✅ **Reusable** - Build library of verticals over time
✅ **Flexible** - Multiple verticals for different markets
✅ **Secure** - API keys in database, not version control

## Troubleshooting

**Dashboard won't start**:
- Run `python3 database_migrations.py` to ensure tables exist

**No API keys found**:
- Visit `/setup` to configure them
- Or check your `.env` file for fallback keys

**Vertical not showing**:
- Check sidebar dropdown - it should list all verticals
- Create a new one if none exist

## Support

For issues or questions, check the main README or create an issue on GitHub.
