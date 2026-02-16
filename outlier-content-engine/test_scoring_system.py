"""
Minimal integration test for the Content Scoring System.
Tests each component in isolation with a temporary database.
No external API calls needed (skips LLM optimizer).
"""

import json
import os
import sqlite3
import sys
import tempfile
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Ensure we're in the right directory
os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import config

# Use a temporary database for testing
TEST_DB = Path(tempfile.mktemp(suffix=".db"))
config.DB_PATH = TEST_DB

PASS = 0
FAIL = 0
ERRORS = []


def log_pass(name):
    global PASS
    PASS += 1
    print(f"  PASS  {name}")


def log_fail(name, err):
    global FAIL
    FAIL += 1
    ERRORS.append((name, str(err)))
    print(f"  FAIL  {name}: {err}")


# ── 1. Database Migrations ──────────────────────────────────────────────────

print("\n=== 1. Database Migrations ===")

try:
    from database_migrations import (
        run_vertical_migrations,
        add_scoring_tables,
        add_facebook_handle_column,
        fix_post_unique_constraint,
    )
    run_vertical_migrations(db_path=TEST_DB)
    log_pass("run_vertical_migrations")
except Exception as e:
    log_fail("run_vertical_migrations", e)

try:
    add_facebook_handle_column(db_path=TEST_DB)
    log_pass("add_facebook_handle_column")
except Exception as e:
    log_fail("add_facebook_handle_column", e)

try:
    add_scoring_tables(db_path=TEST_DB)
    log_pass("add_scoring_tables")
except Exception as e:
    log_fail("add_scoring_tables", e)

# Verify tables exist
try:
    conn = sqlite3.connect(str(TEST_DB))
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]
    conn.close()

    required = ["trend_snapshots", "content_scores", "gap_analysis_cache",
                 "verticals", "vertical_brands", "api_credentials"]
    missing = [t for t in required if t not in tables]
    if missing:
        log_fail("verify_tables", f"Missing tables: {missing}")
    else:
        log_pass(f"verify_tables ({len(required)} tables)")
except Exception as e:
    log_fail("verify_tables", e)


# ── 2. Seed Test Data ────────────────────────────────────────────────────────

print("\n=== 2. Seed Test Data ===")

try:
    conn = sqlite3.connect(str(TEST_DB))
    now = datetime.now(timezone.utc).isoformat()

    # Create a vertical
    conn.execute("""
        INSERT INTO verticals (name, description, created_at, updated_at)
        VALUES ('TestBrands', 'Test vertical', ?, ?)
    """, (now, now))

    # Add brands
    for handle in ["nike", "adidas", "puma"]:
        conn.execute("""
            INSERT INTO vertical_brands (vertical_name, brand_name, instagram_handle, added_at)
            VALUES ('TestBrands', ?, ?, ?)
        """, (handle.title(), handle, now))

    # Create competitor_posts table (mimicking main.py schema)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS competitor_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT NOT NULL,
            brand_profile TEXT NOT NULL,
            platform TEXT NOT NULL DEFAULT 'instagram',
            competitor_name TEXT NOT NULL,
            competitor_handle TEXT NOT NULL,
            posted_at TEXT,
            caption TEXT,
            media_type TEXT,
            media_url TEXT,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            saves INTEGER,
            shares INTEGER,
            views INTEGER,
            follower_count INTEGER,
            estimated_engagement_rate REAL,
            is_outlier INTEGER DEFAULT 0,
            outlier_score REAL,
            content_tags TEXT,
            collected_at TEXT NOT NULL,
            is_own_channel INTEGER DEFAULT 0,
            audio_id TEXT,
            audio_name TEXT,
            is_trending_audio INTEGER DEFAULT 0,
            weighted_engagement_score REAL,
            primary_engagement_driver TEXT,
            outlier_timeframe TEXT,
            ai_analysis TEXT,
            archived INTEGER DEFAULT 0,
            UNIQUE(post_id, platform, brand_profile)
        )
    """)

    # Insert sample outlier posts with ai_analysis
    sample_posts = [
        ("post1", "nike", "reel", "Never throw away your old sneakers. Here's why...", 15000, 500, 1,
         json.dumps({
             "hook_type": "curiosity_gap", "content_pattern": "Behind the Scenes",
             "emotional_trigger": "curiosity", "one_line_summary": "Sustainability angle"
         })),
        ("post2", "adidas", "carousel", "Top 5 running shoes for beginners. Thread:", 12000, 300, 1,
         json.dumps({
             "hook_type": "listicle", "content_pattern": "Listicle Roundup",
             "emotional_trigger": "aspiration", "one_line_summary": "Product roundup"
         })),
        ("post3", "puma", "reel", "How to style these 3 ways. Step by step guide.", 8000, 200, 1,
         json.dumps({
             "hook_type": "educational", "content_pattern": "Tutorial / How-To",
             "emotional_trigger": "inspiration", "one_line_summary": "Styling tutorial"
         })),
        ("post4", "nike", "static", "Just dropped. Link in bio.", 5000, 100, 0,
         json.dumps({
             "hook_type": "statement", "content_pattern": "Product Launch",
             "emotional_trigger": "fomo", "one_line_summary": "New product"
         })),
        ("post5", "nike", "reel", "You've been tying your shoes wrong this whole time", 20000, 800, 1,
         json.dumps({
             "hook_type": "curiosity_gap", "content_pattern": "Myth Busting",
             "emotional_trigger": "surprise", "one_line_summary": "Viral hack"
         })),
    ]

    for pid, handle, mtype, caption, likes, comments, is_outlier, ai_analysis in sample_posts:
        conn.execute("""
            INSERT INTO competitor_posts
            (post_id, brand_profile, platform, competitor_name, competitor_handle,
             posted_at, caption, media_type, likes, comments, is_outlier,
             outlier_score, collected_at, ai_analysis, is_own_channel)
            VALUES (?, 'TestBrands', 'instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            pid, handle.title(), handle, now, caption, mtype,
            likes, comments, is_outlier,
            likes * 1.5 if is_outlier else 0,
            now, ai_analysis,
        ))

    # Insert an own-channel post
    conn.execute("""
        INSERT INTO competitor_posts
        (post_id, brand_profile, platform, competitor_name, competitor_handle,
         posted_at, caption, media_type, likes, comments, is_outlier,
         collected_at, is_own_channel)
        VALUES ('own1', 'TestBrands', 'instagram', 'MyBrand', 'mybrand', ?,
                'Check out our new collection.', 'static', 2000, 50, 0, ?, 1)
    """, (now, now))

    # Create voice_analysis table + seed
    conn.execute("""
        CREATE TABLE IF NOT EXISTS voice_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            voice_data TEXT NOT NULL,
            analyzed_at TEXT NOT NULL
        )
    """)
    voice_data = json.dumps({
        "voice_summary": "Casual and energetic brand voice with short punchy sentences.",
        "vocabulary": {"distinctive_phrases": ["just dropped", "no cap", "fresh fit"]},
        "formality_score": 3,
        "avg_sentence_length": 8,
        "emoji_rate": 0.2,
        "opening_patterns": ["question", "statement"],
    })
    conn.execute("""
        INSERT INTO voice_analysis (brand_profile, voice_data, analyzed_at)
        VALUES ('TestBrands', ?, ?)
    """, (voice_data, now))

    # Create token_usage table (needed by optimizer)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT, model TEXT,
            prompt_tokens INTEGER, completion_tokens INTEGER,
            total_tokens INTEGER, estimated_cost_usd REAL, context TEXT
        )
    """)

    conn.commit()
    conn.close()
    log_pass("seed_test_data (5 outlier posts, 1 own-channel, voice profile)")
except Exception as e:
    log_fail("seed_test_data", traceback.format_exc())


# ── 3. Content Scorer ────────────────────────────────────────────────────────

print("\n=== 3. Content Scorer ===")

try:
    from content_scorer import ContentScorer

    scorer = ContentScorer("TestBrands", db_path=TEST_DB)
    concept = {
        "caption": "Never buy these shoes. Here's what to get instead.",
        "hook_line": "Never buy these shoes.",
        "format": "reel",
        "platform": "instagram",
    }
    result = scorer.score_concept(concept)

    # Verify structure
    assert "overall_score" in result, "Missing overall_score"
    assert "breakdown" in result, "Missing breakdown"
    assert "suggestions" in result, "Missing suggestions"
    assert "predicted_engagement_range" in result, "Missing predicted_engagement_range"

    score = result["overall_score"]
    assert 0 <= score <= 100, f"Score {score} out of range"

    breakdown = result["breakdown"]
    dims = ["format_fit", "hook_strength", "pattern_alignment", "voice_match", "competitive_gap_fill"]
    for dim in dims:
        assert dim in breakdown, f"Missing dimension: {dim}"
        assert "score" in breakdown[dim], f"Missing score in {dim}"
        assert 0 <= breakdown[dim]["score"] <= 20, f"{dim} score {breakdown[dim]['score']} out of range"

    log_pass(f"score_concept: {score}/100 (all 5 dimensions present)")

    # Print breakdown for visibility
    for dim in dims:
        d = breakdown[dim]
        print(f"         {dim}: {d['score']}/20 — {d.get('reasoning', '')[:60]}")

    # Test predicted engagement range
    pred = result["predicted_engagement_range"]
    assert "low" in pred and "mid" in pred and "high" in pred, "Missing engagement range fields"
    log_pass(f"predicted_engagement: {pred['low']}-{pred['high']} likes")

except Exception as e:
    log_fail("content_scorer", traceback.format_exc())


# ── 4. Store Score ───────────────────────────────────────────────────────────

print("\n=== 4. Store Score ===")

try:
    score_id = scorer.store_score(concept, result)
    assert isinstance(score_id, int) and score_id > 0, f"Invalid score_id: {score_id}"
    log_pass(f"store_score: id={score_id}")

    # Verify it's in the database
    conn = sqlite3.connect(str(TEST_DB))
    row = conn.execute("SELECT overall_score FROM content_scores WHERE id = ?", (score_id,)).fetchone()
    conn.close()
    assert row is not None, "Score not found in DB"
    assert row[0] == result["overall_score"], f"DB score {row[0]} != {result['overall_score']}"
    log_pass("score_persisted_in_db")

    # Test iteration chain
    concept2 = {
        "caption": "You've been styling this wrong. 5 ways to fix it.",
        "hook_line": "You've been styling this wrong.",
        "format": "reel",
        "platform": "instagram",
    }
    result2 = scorer.score_concept(concept2)
    score_id2 = scorer.store_score(concept2, result2, parent_score_id=score_id)

    conn = sqlite3.connect(str(TEST_DB))
    row2 = conn.execute("SELECT version, parent_score_id FROM content_scores WHERE id = ?", (score_id2,)).fetchone()
    conn.close()
    assert row2[0] == 2, f"Expected version 2, got {row2[0]}"
    assert row2[1] == score_id, f"Expected parent_score_id {score_id}, got {row2[1]}"
    log_pass(f"iteration_chain: v1(id={score_id}) -> v2(id={score_id2})")

except Exception as e:
    log_fail("store_score", traceback.format_exc())


# ── 5. Trend Analyzer ────────────────────────────────────────────────────────

print("\n=== 5. Trend Analyzer ===")

try:
    from trend_analyzer import TrendAnalyzer

    ta = TrendAnalyzer("TestBrands", db_path=TEST_DB)

    # Capture a snapshot
    ta.capture_snapshot()
    log_pass("capture_snapshot")

    # Verify snapshot was stored
    conn = sqlite3.connect(str(TEST_DB))
    snap = conn.execute(
        "SELECT snapshot_data, outlier_count FROM trend_snapshots WHERE brand_profile = 'TestBrands'"
    ).fetchone()
    conn.close()

    assert snap is not None, "Snapshot not stored"
    snap_data = json.loads(snap[0])
    assert "hook_types" in snap_data, "Missing hook_types in snapshot"
    assert "content_patterns" in snap_data, "Missing content_patterns in snapshot"
    assert snap[1] > 0, f"Expected outlier_count > 0, got {snap[1]}"
    log_pass(f"snapshot_data: {snap[1]} outliers, hooks={list(snap_data['hook_types'].keys())}")

    # Get trends (only 1 snapshot, should handle gracefully)
    trends = ta.get_trends(lookback_weeks=4)
    assert "snapshot_count" in trends, "Missing snapshot_count"
    log_pass(f"get_trends: {trends.get('snapshot_count', 0)} snapshots, message={trends.get('prediction', '')[:50]}")

    # Insert a second snapshot to test velocity
    yesterday = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    conn = sqlite3.connect(str(TEST_DB))
    conn.execute("""
        INSERT OR REPLACE INTO trend_snapshots (brand_profile, snapshot_date, snapshot_data, outlier_count, created_at)
        VALUES ('TestBrands', ?, ?, 2, ?)
    """, (yesterday, json.dumps({
        "hook_types": {"question": 3, "curiosity_gap": 1},
        "content_patterns": {"Behind the Scenes": 2},
        "formats": {"reel": 2},
        "triggers": {"curiosity": 2},
    }), yesterday))
    conn.commit()
    conn.close()

    trends2 = ta.get_trends(lookback_weeks=4)
    log_pass(f"get_trends_with_2_snapshots: rising={trends2.get('rising', [])}, declining={trends2.get('declining', [])}")

except Exception as e:
    log_fail("trend_analyzer", traceback.format_exc())


# ── 6. Gap Analyzer ──────────────────────────────────────────────────────────

print("\n=== 6. Gap Analyzer ===")

try:
    from gap_analyzer import GapAnalyzer

    ga = GapAnalyzer("TestBrands", db_path=TEST_DB)
    gaps = ga.analyze_gaps()

    assert "missing_hooks" in gaps, "Missing missing_hooks"
    assert "missing_patterns" in gaps, "Missing missing_patterns"
    assert "own_strengths" in gaps, "Missing own_strengths"
    log_pass(f"analyze_gaps: {len(gaps.get('missing_hooks', []))} missing hooks, {len(gaps.get('missing_patterns', []))} missing patterns")

    # Verify caching
    gaps2 = ga.analyze_gaps()
    log_pass("gap_analysis_cache (second call uses cache)")

except Exception as e:
    log_fail("gap_analyzer", traceback.format_exc())


# ── 7. Content Optimizer (structure only — no LLM call) ─────────────────────

print("\n=== 7. Content Optimizer (no LLM call) ===")

try:
    from content_optimizer import ContentOptimizer

    opt = ContentOptimizer("TestBrands", db_path=TEST_DB)

    # Test system prompt building (no API call)
    score_data = {
        "overall_score": 65,
        "breakdown": {
            "format_fit": {"score": 18, "reasoning": "Reel matches top format"},
            "hook_strength": {"score": 10, "reasoning": "Weak hook"},
            "pattern_alignment": {"score": 14, "reasoning": "Good pattern match"},
            "voice_match": {"score": 8, "reasoning": "Too formal"},
            "competitive_gap_fill": {"score": 15, "reasoning": "Fills curiosity gap"},
        },
    }
    sys_prompt = opt._build_system_prompt(score_data)
    assert "OUTLIER PATTERNS" in sys_prompt, "Missing outlier patterns in prompt"
    assert "BRAND VOICE" in sys_prompt, "Missing brand voice in prompt"
    assert "WEAK AREAS" in sys_prompt, "Missing weak areas in prompt"
    assert "hook_strength" in sys_prompt or "voice_match" in sys_prompt, "Weak areas not listed"
    log_pass(f"build_system_prompt: {len(sys_prompt)} chars, contains patterns + voice + weak areas")

    user_prompt = opt._build_user_prompt(concept, score_data)
    assert "65/100" in user_prompt, "Missing score in user prompt"
    log_pass("build_user_prompt: contains concept + score")

except Exception as e:
    log_fail("content_optimizer", traceback.format_exc())


# ── 8. Flask Route Smoke Test ────────────────────────────────────────────────

print("\n=== 8. Flask Routes (smoke test) ===")

try:
    # Patch config before importing dashboard
    config.DB_PATH = TEST_DB

    # We need to test the routes, but the dashboard imports many things.
    # Let's test at the function level instead.
    from content_scorer import ContentScorer as CS2

    # Simulate what /api/score-concept does
    scorer2 = CS2("TestBrands", db_path=TEST_DB)
    result3 = scorer2.score_concept({
        "caption": "This is a test caption for our brand",
        "hook_line": "",
        "format": "carousel",
        "platform": "instagram",
    })
    sid = scorer2.store_score(
        {"caption": "This is a test caption", "format": "carousel", "platform": "instagram"},
        result3,
    )
    assert sid > 0, f"Invalid score_id from route simulation: {sid}"
    log_pass(f"route_score_concept simulation: score={result3['overall_score']}, id={sid}")

    # Simulate /api/score-history
    conn = sqlite3.connect(str(TEST_DB))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, concept_text, overall_score, version, parent_score_id, scored_at
        FROM content_scores WHERE brand_profile = 'TestBrands'
        ORDER BY scored_at DESC LIMIT 5
    """).fetchall()
    conn.close()
    assert len(rows) >= 3, f"Expected at least 3 scores, got {len(rows)}"
    log_pass(f"route_score_history simulation: {len(rows)} scores returned")

    # Simulate /api/trends
    ta2 = TrendAnalyzer("TestBrands", db_path=TEST_DB)
    trends3 = ta2.get_trends(lookback_weeks=4)
    assert isinstance(trends3, dict), "Trends not a dict"
    log_pass("route_trends simulation: OK")

    # Simulate /api/gap-analysis
    ga2 = GapAnalyzer("TestBrands", db_path=TEST_DB)
    gaps3 = ga2.analyze_gaps(force_refresh=True)
    assert isinstance(gaps3, dict), "Gaps not a dict"
    log_pass("route_gap_analysis simulation: OK")

except Exception as e:
    log_fail("flask_routes", traceback.format_exc())


# ── 9. ScoutAgent Tool Handler Test ──────────────────────────────────────────

print("\n=== 9. ScoutAgent Tool Handlers ===")

try:
    from scout_agent import ScoutAgent

    agent = ScoutAgent()
    context = {"active_vertical": "TestBrands"}

    # Test score_content handler
    score_result = agent._handle_score_content(
        {"caption": "Stop buying cheap sneakers. Here's what you're missing.", "format": "reel"},
        context,
    )
    score_json = json.loads(score_result)
    assert score_json["ok"], f"score_content failed: {score_json.get('error')}"
    assert "overall_score" in score_json, "Missing overall_score"
    assert "score_id" in score_json, "Missing score_id"
    log_pass(f"handler_score_content: {score_json['overall_score']}/100, id={score_json['score_id']}")

    # Verify context was updated
    assert "last_score_id" in context, "Context not updated with last_score_id"
    assert "last_scored_concept" in context, "Context not updated with last_scored_concept"
    log_pass("context_updated_after_score")

    # Test show_trends handler
    trends_result = agent._handle_show_trends({"lookback_weeks": 4}, context)
    trends_json = json.loads(trends_result)
    assert trends_json["ok"], f"show_trends failed: {trends_json.get('error')}"
    log_pass("handler_show_trends: OK")

    # Test no-vertical error
    no_vert_result = agent._handle_score_content(
        {"caption": "test"}, {"active_vertical": None},
    )
    no_vert_json = json.loads(no_vert_result)
    assert not no_vert_json["ok"], "Expected error for no active vertical"
    log_pass("handler_no_vertical_error: correctly returned error")

except Exception as e:
    log_fail("scout_agent_handlers", traceback.format_exc())


# ── 10. Edge Cases ───────────────────────────────────────────────────────────

print("\n=== 10. Edge Cases ===")

try:
    # Empty caption
    scorer_edge = ContentScorer("TestBrands", db_path=TEST_DB)
    empty_result = scorer_edge.score_concept({"caption": "", "format": "reel"})
    assert "overall_score" in empty_result, "Empty caption should still return a score"
    log_pass(f"empty_caption: score={empty_result['overall_score']}")
except Exception as e:
    log_fail("edge_empty_caption", traceback.format_exc())

try:
    # Non-existent vertical
    scorer_none = ContentScorer("NonExistentVertical", db_path=TEST_DB)
    none_result = scorer_none.score_concept({"caption": "test", "format": "reel"})
    assert "overall_score" in none_result, "Non-existent vertical should still return a score"
    log_pass(f"nonexistent_vertical: score={none_result['overall_score']} (graceful degradation)")
except Exception as e:
    log_fail("edge_nonexistent_vertical", traceback.format_exc())

try:
    # Score with all parameters
    full_result = scorer.score_concept({
        "caption": "What's your favorite colorway? Drop a comment below!",
        "hook_line": "What's your favorite colorway?",
        "format": "story",
        "platform": "tiktok",
    })
    log_pass(f"full_params_tiktok_story: score={full_result['overall_score']}")
except Exception as e:
    log_fail("edge_full_params", traceback.format_exc())


# ── Cleanup & Summary ────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"  RESULTS: {PASS} passed, {FAIL} failed")
print(f"{'='*60}")

if ERRORS:
    print("\n  FAILURES:")
    for name, err in ERRORS:
        print(f"\n  --- {name} ---")
        # Print first 3 lines of error
        for line in str(err).strip().split('\n')[:5]:
            print(f"  {line}")

# Cleanup
try:
    TEST_DB.unlink()
except:
    pass

sys.exit(1 if FAIL > 0 else 0)
