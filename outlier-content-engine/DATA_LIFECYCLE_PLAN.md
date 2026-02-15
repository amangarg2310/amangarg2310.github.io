# Data Lifecycle Management Plan

## User Requirements

1. **First-time visitors** → Blank canvas (no historical data)
2. **Same competitive set within 3 days** → Show existing outliers
3. **Re-running same set within 3 days** → Keep old outliers + add new outliers from fresh posts
4. **Different set or >3 days old** → Blank canvas (delete old data)

## Implementation Strategy

### Phase 1: Active Vertical Tracking ✅ DONE
- [x] Create `active_vertical.txt` file to track which vertical is currently loaded
- [x] Set active vertical when user loads the Signal page

### Phase 2: 3-Day Data Expiry
- [ ] Add cleanup job that runs before each analysis
- [ ] Delete competitor_posts older than 3 days
- [ ] Delete outlier analysis results older than 3 days

### Phase 3: Competitive Set Detection
- [ ] Create function to get "competitive set signature" (sorted list of brand handles in a vertical)
- [ ] Store last analysis signature and timestamp
- [ ] Compare current set vs last analysis set
  - If different → blank canvas (delete old posts for this brand_profile)
  - If same + within 3 days → keep existing + add new
  - If same + >3 days → blank canvas (delete old data)

### Phase 4: Blank Canvas on First Visit
- [ ] When Signal page loads with no active_vertical set → show empty state
- [ ] Show prompt to create/select a vertical
- [ ] Only show data after vertical is selected

### Phase 5: Incremental Analysis
- [ ] Modify analysis to detect which posts are new (not in DB)
- [ ] Only analyze new posts for outliers
- [ ] Merge new outliers with existing outliers (both shown in dashboard)

## Database Schema Changes Needed

```sql
-- Track analysis runs to detect "same set"
CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_profile TEXT NOT NULL,
    competitive_set_signature TEXT NOT NULL,  -- JSON array of sorted handles
    run_timestamp TEXT NOT NULL,
    posts_analyzed INTEGER,
    outliers_found INTEGER
);

-- Or simpler: add to config table
INSERT INTO config (key, value) VALUES
    ('last_analysis_signature', '["brand1", "brand2", ...]'),
    ('last_analysis_timestamp', '2026-02-14T...');
```

## Edge Cases

1. **User adds a brand to existing set** → Different signature → Start fresh
2. **User removes a brand** → Archive that brand's posts (already implemented ✅)
3. **User re-adds a removed brand within 3 days** → Unarchive posts (already implemented ✅)
4. **Analysis fails mid-run** → PID/progress files track this

## Quick Win: Manual Data Cleanup

For now, user can manually delete old data:
```sql
DELETE FROM competitor_posts WHERE collected_at < date('now', '-3 days');
```

## Next Steps

1. Implement Phase 2 (3-day cleanup) as a simple function in `scout_agent.py`
2. Run cleanup before each analysis
3. Defer complex "same set detection" to later iteration
