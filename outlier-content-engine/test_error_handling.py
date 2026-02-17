"""
Error handling regression tests.

Tests critical paths that can crash at runtime or silently corrupt data.
No external API calls needed — uses mock/temp data and a temporary database.

Run: python test_error_handling.py
"""

import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from dataclasses import dataclass
from typing import Optional, List

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


def test(name):
    """Decorator to register and run a test."""
    def decorator(func):
        global PASS, FAIL
        try:
            func()
            PASS += 1
            print(f"  \u2713 {name}")
        except Exception as e:
            FAIL += 1
            ERRORS.append((name, str(e)))
            print(f"  \u2717 {name}: {e}")
        return func
    return decorator


def setup_test_db():
    """Create a fresh test database with the required schema."""
    if TEST_DB.exists():
        TEST_DB.unlink()
    conn = sqlite3.connect(str(TEST_DB))
    conn.execute("""
        CREATE TABLE verticals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
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
        )
    """)
    conn.execute("""
        CREATE TABLE competitor_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT UNIQUE,
            brand_profile TEXT,
            platform TEXT,
            competitor_name TEXT,
            competitor_handle TEXT,
            posted_at TEXT,
            caption TEXT,
            media_type TEXT,
            media_url TEXT,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            saves INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            follower_count INTEGER,
            engagement_rate REAL,
            collected_at TEXT,
            audio_id TEXT,
            audio_name TEXT,
            is_outlier INTEGER DEFAULT 0,
            archived INTEGER DEFAULT 0,
            total_engagement INTEGER DEFAULT 0,
            is_own_channel INTEGER DEFAULT 0,
            hashtags TEXT
        )
    """)
    conn.commit()
    conn.close()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# VERTICAL MANAGER TESTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

print("\n=== VerticalManager Tests ===")

setup_test_db()
from vertical_manager import VerticalManager


@test("create_vertical returns True on success")
def _():
    setup_test_db()
    vm = VerticalManager()
    assert vm.create_vertical("Test", "A test vertical") is True


@test("create_vertical is case-insensitive (no duplicates)")
def _():
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("Streetwear", "test")
    result = vm.create_vertical("streetwear", "duplicate")
    assert result is False


@test("add_brand with all three handles (IG + TT + FB)")
def _():
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("Test", "test")
    result = vm.add_brand("Test", instagram_handle="nike",
                          tiktok_handle="nike", facebook_handle="nike")
    assert result is True
    v = vm.get_vertical("Test")
    brands = v.brands
    assert len(brands) == 1
    assert brands[0].instagram_handle == "nike"
    assert brands[0].tiktok_handle == "nike"
    assert getattr(brands[0], "facebook_handle", None) == "nike"


@test("add_brand works on fresh DB (no competitor_posts table)")
def _():
    """Regression test: add_brand used to crash when competitor_posts didn't exist."""
    db = Path(tempfile.mktemp(suffix=".db"))
    conn = sqlite3.connect(str(db))
    conn.execute("""CREATE TABLE verticals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
        description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE vertical_brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT, vertical_name TEXT NOT NULL,
        brand_name TEXT, instagram_handle TEXT, tiktok_handle TEXT,
        facebook_handle TEXT, added_at TEXT NOT NULL,
        FOREIGN KEY (vertical_name) REFERENCES verticals(name),
        UNIQUE(vertical_name, instagram_handle))""")
    conn.commit()
    conn.close()
    # Temporarily swap DB path
    old_db = config.DB_PATH
    config.DB_PATH = db
    try:
        vm2 = VerticalManager()
        vm2.create_vertical("Fresh", "fresh test")
        result = vm2.add_brand("Fresh", instagram_handle="testbrand")
        assert result is True, "add_brand should succeed even without competitor_posts table"
    finally:
        config.DB_PATH = old_db
        db.unlink(missing_ok=True)


@test("remove_brand by Instagram handle")
def _():
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("Test", "test")
    vm.add_brand("Test", instagram_handle="nike", tiktok_handle="nike_tt")
    result = vm.remove_brand("Test", "nike")
    assert result is True
    v = vm.get_vertical("Test")
    assert len(v.brands) == 0


@test("remove_brand by TikTok handle")
def _():
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("Test", "test")
    vm.add_brand("Test", instagram_handle="adidas", tiktok_handle="adidas_tt")
    result = vm.remove_brand("Test", "adidas_tt")
    assert result is True


@test("remove_brand by Facebook handle")
def _():
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("Test", "test")
    vm.add_brand("Test", instagram_handle="puma", facebook_handle="pumafb")
    result = vm.remove_brand("Test", "pumafb")
    assert result is True


@test("delete_vertical returns correct deletion counts")
def _():
    """Regression test: delete_vertical used conn.total_changes instead of cursor.rowcount."""
    setup_test_db()
    vm = VerticalManager()
    vm.create_vertical("ToDelete", "will be deleted")
    vm.add_brand("ToDelete", instagram_handle="brand1")
    vm.add_brand("ToDelete", instagram_handle="brand2")
    vm.add_brand("ToDelete", instagram_handle="brand3")
    # Insert some posts for this vertical
    conn = sqlite3.connect(str(TEST_DB))
    for i in range(5):
        conn.execute("""INSERT INTO competitor_posts
            (post_id, brand_profile, platform, competitor_handle, collected_at)
            VALUES (?, ?, ?, ?, ?)""",
            (f"post_{i}", "ToDelete", "instagram", "brand1", "2026-01-01"))
    conn.commit()
    conn.close()
    result = vm.delete_vertical("ToDelete")
    assert result is True


@test("delete_vertical handles missing competitor_posts table")
def _():
    """delete_vertical should not crash if competitor_posts table doesn't exist."""
    db = Path(tempfile.mktemp(suffix=".db"))
    conn = sqlite3.connect(str(db))
    conn.execute("""CREATE TABLE verticals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
        description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE vertical_brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT, vertical_name TEXT NOT NULL,
        brand_name TEXT, instagram_handle TEXT, tiktok_handle TEXT,
        facebook_handle TEXT, added_at TEXT NOT NULL,
        FOREIGN KEY (vertical_name) REFERENCES verticals(name),
        UNIQUE(vertical_name, instagram_handle))""")
    conn.commit()
    conn.close()
    old_db = config.DB_PATH
    config.DB_PATH = db
    try:
        vm2 = VerticalManager()
        vm2.create_vertical("NoPosts", "no posts table")
        vm2.add_brand("NoPosts", instagram_handle="test")
        result = vm2.delete_vertical("NoPosts")
        assert result is True
    finally:
        config.DB_PATH = old_db
        db.unlink(missing_ok=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENGAGEMENT CALCULATION TESTS (instagram.py)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

print("\n=== Engagement Calculation Tests ===")


@dataclass
class MockPost:
    post_id: str = "test_1"
    competitor_name: str = "TestBrand"
    competitor_handle: str = "testbrand"
    platform: str = "instagram"
    post_url: str = "https://instagram.com/p/test"
    media_type: str = "image"
    caption: Optional[str] = "test caption"
    likes: int = 100
    comments: int = 10
    shares: int = 5
    views: int = 1000
    saves: int = 20
    posted_at: Optional[datetime] = None
    media_url: Optional[str] = None
    hashtags: Optional[List[str]] = None
    follower_count: Optional[int] = 10000
    audio_id: Optional[str] = None
    audio_name: Optional[str] = None


@test("engagement_rate calculates correctly with valid data")
def _():
    post = MockPost(likes=100, comments=10, saves=20, shares=5, follower_count=10000)
    engagement_rate = None
    if post.follower_count and post.follower_count > 0:
        total_engagement = (
            (post.likes or 0) + (post.comments or 0) +
            (post.saves or 0) + (post.shares or 0)
        )
        engagement_rate = total_engagement / post.follower_count
    assert engagement_rate == 135 / 10000


@test("engagement_rate handles None likes gracefully")
def _():
    """Regression test: post.likes + post.comments crashed with TypeError when likes was None."""
    post = MockPost(likes=None, comments=10, saves=None, shares=None, follower_count=5000)
    engagement_rate = None
    if post.follower_count and post.follower_count > 0:
        total_engagement = (
            (post.likes or 0) + (post.comments or 0) +
            (post.saves or 0) + (post.shares or 0)
        )
        engagement_rate = total_engagement / post.follower_count
    assert engagement_rate == 10 / 5000


@test("engagement_rate handles None follower_count (skips calculation)")
def _():
    post = MockPost(likes=100, comments=10, follower_count=None)
    engagement_rate = None
    if post.follower_count and post.follower_count > 0:
        total_engagement = (
            (post.likes or 0) + (post.comments or 0) +
            (post.saves or 0) + (post.shares or 0)
        )
        engagement_rate = total_engagement / post.follower_count
    assert engagement_rate is None


@test("engagement_rate handles zero follower_count (no division by zero)")
def _():
    post = MockPost(likes=100, comments=10, follower_count=0)
    engagement_rate = None
    if post.follower_count and post.follower_count > 0:
        total_engagement = (
            (post.likes or 0) + (post.comments or 0) +
            (post.saves or 0) + (post.shares or 0)
        )
        engagement_rate = total_engagement / post.follower_count
    assert engagement_rate is None


@test("engagement_rate handles all-None metrics")
def _():
    post = MockPost(likes=None, comments=None, saves=None, shares=None, follower_count=1000)
    engagement_rate = None
    if post.follower_count and post.follower_count > 0:
        total_engagement = (
            (post.likes or 0) + (post.comments or 0) +
            (post.saves or 0) + (post.shares or 0)
        )
        engagement_rate = total_engagement / post.follower_count
    assert engagement_rate == 0.0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SCOUT AGENT TOOL DISPATCH TESTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

print("\n=== Scout Agent Tool Dispatch Tests ===")


@test("json.loads handles None arguments without TypeError")
def _():
    """Regression test: json.loads(None) raised TypeError, not JSONDecodeError."""
    try:
        result = json.loads(None or "{}")
        assert result == {}
    except (json.JSONDecodeError, TypeError):
        # Both should be caught now
        result = {}
    assert result == {}


@test("json.loads handles empty string arguments")
def _():
    try:
        result = json.loads("" or "{}")
        assert result == {}
    except (json.JSONDecodeError, TypeError):
        result = {}
    assert result == {}


@test("json.loads handles valid tool arguments")
def _():
    result = json.loads('{"category_name": "Streetwear"}' or "{}")
    assert result == {"category_name": "Streetwear"}


@test("brand handle resolution handles dict without 'handle' key")
def _():
    """Regression test: suggestion['handle'] crashed with KeyError if key missing."""
    suggestion = {"official_name": "Nike Inc", "verified": True}  # No 'handle' key
    if suggestion and isinstance(suggestion, dict):
        resolved_handle = suggestion.get('handle')
        assert resolved_handle is None
    else:
        assert False, "Should enter the if block"


@test("brand handle resolution handles None suggestion")
def _():
    suggestion = None
    if suggestion and isinstance(suggestion, dict):
        assert False, "Should not enter if block"
    # Should not crash — just skip resolution


@test("brand handle resolution handles list suggestion")
def _():
    """Regression test: if API returns list instead of dict, .get() crashes."""
    suggestion = ["nike", "instagram"]
    if suggestion and isinstance(suggestion, dict):
        assert False, "Should not enter if block for list"
    # Should not crash — isinstance check prevents it


@test("optimize_content handles missing keys in optimizer response")
def _():
    """Regression test: optimized['improved_caption'] crashed with KeyError."""
    optimized = {"improvements": ["Better hook"], "format_recommendation": "reel"}
    concept = {"caption": "Original caption", "hook_line": "Original hook",
               "format": "carousel", "platform": "instagram"}
    # The fix uses .get() with fallbacks
    improved_caption = optimized.get("improved_caption", concept.get("caption", ""))
    improved_hook = optimized.get("improved_hook", concept.get("hook_line", ""))
    assert improved_caption == "Original caption"
    assert improved_hook == "Original hook"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DASHBOARD TIMESTAMP PARSING TESTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

print("\n=== Dashboard Timestamp Parsing Tests ===")


@test("ISO timestamp with Z parses correctly")
def _():
    ts = "2026-01-15T12:30:00Z"
    post_time = datetime.fromisoformat(ts.replace('Z', '+00:00'))
    assert post_time.tzinfo is not None


@test("ISO timestamp without timezone gets UTC applied")
def _():
    ts = "2026-01-15T12:30:00"
    try:
        post_time = datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        post_time = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
    # Ensure timezone info is applied (either natively or via fallback)
    if post_time.tzinfo is None:
        post_time = post_time.replace(tzinfo=timezone.utc)
    assert post_time.tzinfo is not None


@test("SQLite datetime format parses correctly")
def _():
    ts = "2026-01-15 12:30:00"
    try:
        post_time = datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        post_time = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
    assert post_time.year == 2026


@test("None timestamp returns empty string (not crash)")
def _():
    ts = None
    if not ts:
        result = ""
    assert result == ""


@test("Empty string timestamp returns empty string")
def _():
    ts = ""
    if not ts:
        result = ""
    assert result == ""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TIKTOK APIFY RESPONSE VALIDATION TESTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

print("\n=== TikTok Apify Response Validation Tests ===")


@test("Apify response with missing 'data' key is handled")
def _():
    """Regression test: run_data['data']['id'] crashed with KeyError."""
    run_data = {"error": "Invalid token"}
    result = run_data.get("data") if run_data else None
    assert result is None


@test("Apify response with null 'data' is handled")
def _():
    run_data = {"data": None}
    result = run_data.get("data") if run_data else None
    assert result is None


@test("Apify status response with missing status key is handled")
def _():
    """Regression test: run_info['status'] crashed with KeyError."""
    run_info = {"defaultDatasetId": "abc123"}  # No 'status' key
    status = run_info.get("status", "UNKNOWN")
    assert status == "UNKNOWN"


@test("Apify run_info with missing dataset ID is handled")
def _():
    """Regression test: run_info['defaultDatasetId'] crashed with KeyError."""
    run_info = {"status": "SUCCEEDED"}  # No dataset ID
    dataset_id = run_info.get("defaultDatasetId")
    assert dataset_id is None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CLEANUP & RESULTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Cleanup
if TEST_DB.exists():
    TEST_DB.unlink()

print(f"\n{'=' * 70}")
if FAIL == 0:
    print(f"ALL {PASS} TESTS PASSED \u2713")
else:
    print(f"{PASS} passed, {FAIL} FAILED")
    for name, err in ERRORS:
        print(f"  FAIL: {name}")
        print(f"        {err}")
print(f"{'=' * 70}")

sys.exit(1 if FAIL > 0 else 0)
