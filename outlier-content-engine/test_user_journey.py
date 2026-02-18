"""
End-to-end user journey tests for ScoutAI.

Tests the full user journey: setup → vertical creation → brand management →
data collection (IG/TT/FB) → outlier detection → dashboard rendering →
chat/agent → trend radar → content scoring → reports → security fixes.

All external APIs (Apify, OpenAI) are mocked. Uses Flask test_client() for
HTTP-level testing and real DB migrations for production-equivalent schema.

Run with: python -m pytest test_user_journey.py -x -q
"""

import json
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock

# Ensure we're in the right directory
os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import config

# ── Shared test DB setup ──

def create_full_test_db(db_path):
    """Create a production-equivalent test DB using real migrations."""
    config.DB_PATH = db_path
    from database_migrations import (
        run_vertical_migrations,
        add_scoring_tables,
        add_facebook_handle_column,
        add_trend_radar_tables,
        add_post_url_column,
    )
    run_vertical_migrations(db_path=db_path)
    add_facebook_handle_column(db_path=db_path)
    add_scoring_tables(db_path=db_path)
    add_trend_radar_tables(db_path=db_path)
    add_post_url_column(db_path=db_path)

    # Tables not created by migrations
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS voice_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            analyzed_at TEXT NOT NULL,
            source_post_count INTEGER,
            voice_data TEXT NOT NULL,
            top_post_ids TEXT,
            UNIQUE(brand_profile)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER,
            completion_tokens INTEGER,
            total_tokens INTEGER,
            estimated_cost_usd REAL,
            context TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS collection_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_timestamp TEXT NOT NULL,
            profile_name TEXT NOT NULL,
            competitors_collected INTEGER DEFAULT 0,
            posts_collected INTEGER DEFAULT 0,
            posts_new INTEGER DEFAULT 0,
            errors TEXT,
            duration_seconds REAL
        )
    """)
    conn.commit()
    conn.close()


def seed_test_data(db_path, vertical_name="TestBrand"):
    """Seed a vertical with brands and sample posts for testing."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    now = datetime.now(timezone.utc).isoformat()

    # Create vertical
    conn.execute(
        "INSERT OR IGNORE INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (vertical_name, "Test vertical", now, now),
    )

    # Add brands with all 3 platform handles
    conn.execute(
        "INSERT OR IGNORE INTO vertical_brands (vertical_name, brand_name, instagram_handle, tiktok_handle, facebook_handle, added_at) VALUES (?, ?, ?, ?, ?, ?)",
        (vertical_name, "Nike", "nike", "nike", "nike", now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO vertical_brands (vertical_name, brand_name, instagram_handle, tiktok_handle, facebook_handle, added_at) VALUES (?, ?, ?, ?, ?, ?)",
        (vertical_name, "Adidas", "adidas", "adidas", "adidas", now),
    )

    # Seed Instagram posts (mix of outlier + normal)
    base_ig_posts = [
        ("ig_outlier_1", "instagram", "Nike", "nike", "This is a viral post! Top 10 sneakers #trending", "reel", 50000, 5000, 2000, 1000, 500000, 10000000, 1, 9.5, 58000),
        ("ig_normal_1", "instagram", "Nike", "nike", "Regular post about shoes", "image", 500, 50, 20, 10, 0, 10000000, 0, 0.0, 580),
        ("ig_normal_2", "instagram", "Nike", "nike", "Another regular post", "carousel", 600, 60, 30, 15, 0, 10000000, 0, 0.0, 705),
        ("ig_normal_3", "instagram", "Adidas", "adidas", "Adidas regular post", "image", 400, 40, 10, 5, 0, 8000000, 0, 0.0, 455),
    ]

    # Seed TikTok posts
    base_tt_posts = [
        ("tt_outlier_1", "tiktok", "Nike", "nike", "Never do this with your sneakers #challenge", "video", 200000, 15000, 8000, 25000, 5000000, 10000000, 1, 9.0, 248000),
        ("tt_normal_1", "tiktok", "Nike", "nike", "TikTok post about running", "video", 1000, 100, 50, 30, 10000, 10000000, 0, 0.0, 1180),
    ]

    # Seed Facebook posts
    base_fb_posts = [
        ("fb_outlier_1", "facebook", "Nike", "nike", "How to pick the best sneakers?", "link", 30000, 3000, 0, 5000, 100000, 5000000, 1, 8.5, 38000),
        ("fb_normal_1", "facebook", "Nike", "nike", "Facebook regular post", "image", 200, 20, 0, 5, 1000, 5000000, 0, 0.0, 225),
    ]

    for post in base_ig_posts + base_tt_posts + base_fb_posts:
        conn.execute("""
            INSERT OR IGNORE INTO competitor_posts
            (post_id, platform, competitor_name, competitor_handle, caption, media_type,
             likes, comments, saves, shares, views, follower_count,
             is_outlier, outlier_score, weighted_engagement_score,
             brand_profile, collected_at, media_url, posted_at, archived)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            post[0], post[1], post[2], post[3], post[4], post[5],
            post[6], post[7], post[8], post[9], post[10], post[11],
            post[12], post[13], post[14],
            vertical_name, now, f"https://example.com/{post[0]}.jpg", now,
        ))

    # Seed own-channel post (for gap analysis)
    conn.execute("""
        INSERT OR IGNORE INTO competitor_posts
        (post_id, platform, competitor_name, competitor_handle, caption, media_type,
         likes, comments, saves, shares, views, follower_count,
         is_outlier, outlier_score, weighted_engagement_score,
         brand_profile, collected_at, is_own_channel, archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (
        "own_1", "instagram", "MyBrand", "mybrand",
        "My own brand post about shoes", "reel",
        1000, 100, 50, 20, 5000, 50000,
        0, 0.0, 1170,
        vertical_name, now, 1,
    ))

    conn.commit()
    conn.close()


# ══════════════════════════════════════════════════════════════════════
# Section 1: Setup Flow
# ══════════════════════════════════════════════════════════════════════

class TestSetupFlow(unittest.TestCase):
    """Test the API key setup and configuration flow."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_setup_page_renders(self):
        """GET /setup returns 200 with form fields."""
        resp = self.client.get('/setup')
        self.assertEqual(resp.status_code, 200)
        html = resp.data.decode()
        self.assertIn('apifyToken', html)
        self.assertIn('openaiKey', html)
        self.assertIn('type="password"', html)

    def test_save_setup_stores_keys(self):
        """POST /setup/save with valid keys stores them and redirects."""
        resp = self.client.post('/setup/save', data={
            'apify_token': 'apify_api_test123',
            'openai_key': 'sk-test456',
        }, follow_redirects=False)
        self.assertIn(resp.status_code, (302, 303))

        # Verify keys are stored in DB
        conn = sqlite3.connect(str(self.db_path))
        row = conn.execute("SELECT api_key FROM api_credentials WHERE service='apify'").fetchone()
        self.assertEqual(row[0], 'apify_api_test123')
        row = conn.execute("SELECT api_key FROM api_credentials WHERE service='openai'").fetchone()
        self.assertEqual(row[0], 'sk-test456')
        conn.close()

    def test_save_setup_rejects_empty_keys(self):
        """POST /setup/save with blank keys redirects back (not stored)."""
        resp = self.client.post('/setup/save', data={
            'apify_token': '',
            'openai_key': '',
        }, follow_redirects=False)
        self.assertIn(resp.status_code, (302, 303))

        # Verify nothing stored
        conn = sqlite3.connect(str(self.db_path))
        row = conn.execute("SELECT COUNT(*) FROM api_credentials WHERE service='apify' AND api_key != ''").fetchone()
        self.assertEqual(row[0], 0)
        conn.close()

    def test_get_api_key_reads_from_db(self):
        """config.get_api_key() reads freshly saved keys (not stale cache)."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO api_credentials (service, api_key, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ('apify', 'apify_live_key', now, now),
        )
        conn.commit()
        conn.close()

        result = config.get_api_key('apify')
        self.assertEqual(result, 'apify_live_key')


# ══════════════════════════════════════════════════════════════════════
# Section 2: Vertical & Brand Management
# ══════════════════════════════════════════════════════════════════════

class TestVerticalManagement(unittest.TestCase):
    """Test vertical and brand CRUD operations via routes."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_create_vertical_via_route(self):
        """POST /verticals/create creates a vertical in DB."""
        resp = self.client.post('/verticals/create', data={
            'vertical_name': 'Streetwear',
            'description': 'Streetwear brands',
            'bulk_handles': '',
        }, follow_redirects=False)
        self.assertIn(resp.status_code, (302, 303))

        conn = sqlite3.connect(str(self.db_path))
        row = conn.execute("SELECT name FROM verticals WHERE name='Streetwear'").fetchone()
        self.assertIsNotNone(row)
        conn.close()

    def test_add_brand_all_platforms(self):
        """Adding a brand with IG+TT+FB handles stores all three."""
        from vertical_manager import VerticalManager
        vm = VerticalManager(db_path=self.db_path)
        vm.create_vertical("TestVert")
        result = vm.add_brand("TestVert", instagram_handle="nike",
                              brand_name="Nike", tiktok_handle="nike",
                              facebook_handle="nike")
        self.assertTrue(result)

        conn = sqlite3.connect(str(self.db_path))
        row = conn.execute(
            "SELECT instagram_handle, tiktok_handle, facebook_handle FROM vertical_brands WHERE vertical_name='TestVert'"
        ).fetchone()
        self.assertEqual(row[0], "nike")
        self.assertEqual(row[1], "nike")
        self.assertEqual(row[2], "nike")
        conn.close()

    def test_bulk_add_brands(self):
        """Bulk add parses multi-line handle text correctly."""
        from vertical_manager import VerticalManager
        vm = VerticalManager(db_path=self.db_path)
        vm.create_vertical("BulkTest")
        result = vm.bulk_add_brands("BulkTest", "@nike\n@adidas\n@puma")
        self.assertEqual(result["added"], 3)
        self.assertEqual(result["total"], 3)

    def test_remove_brand_soft_deletes_posts(self):
        """Removing a brand archives (soft-deletes) its posts."""
        seed_test_data(self.db_path, "SoftDelTest")
        from vertical_manager import VerticalManager
        vm = VerticalManager(db_path=self.db_path)
        vm.remove_brand("SoftDelTest", "nike")

        conn = sqlite3.connect(str(self.db_path))
        rows = conn.execute(
            "SELECT archived FROM competitor_posts WHERE brand_profile='SoftDelTest' AND competitor_handle='nike'"
        ).fetchall()
        for row in rows:
            self.assertEqual(row[0], 1, "Post should be archived after brand removal")
        conn.close()

    def test_delete_vertical_cascades(self):
        """Deleting a vertical removes brands and posts."""
        seed_test_data(self.db_path, "CascadeTest")
        from vertical_manager import VerticalManager
        vm = VerticalManager(db_path=self.db_path)
        vm.delete_vertical("CascadeTest")

        conn = sqlite3.connect(str(self.db_path))
        v = conn.execute("SELECT COUNT(*) FROM verticals WHERE name='CascadeTest'").fetchone()
        b = conn.execute("SELECT COUNT(*) FROM vertical_brands WHERE vertical_name='CascadeTest'").fetchone()
        self.assertEqual(v[0], 0)
        self.assertEqual(b[0], 0)
        conn.close()


# ══════════════════════════════════════════════════════════════════════
# Section 3: Data Collection — All 3 Platforms
# ══════════════════════════════════════════════════════════════════════

def _mock_apify_responses(run_id="run123", dataset_id="ds456", items=None):
    """Build standard Apify mock responses for start/poll/fetch cycle."""
    start_resp = MagicMock()
    start_resp.status_code = 201
    start_resp.json.return_value = {"data": {"id": run_id}}
    start_resp.raise_for_status = MagicMock()

    poll_resp = MagicMock()
    poll_resp.status_code = 200
    poll_resp.json.return_value = {"data": {"status": "SUCCEEDED", "defaultDatasetId": dataset_id}}

    dataset_resp = MagicMock()
    dataset_resp.status_code = 200
    dataset_resp.json.return_value = items or []

    return start_resp, poll_resp, dataset_resp


class TestInstagramCollector(unittest.TestCase):
    """Test Instagram data collection with mocked Apify."""

    def test_collect_posts_mock(self):
        """Instagram collector returns CollectedPost list from mocked Apify data."""
        from collectors.instagram import ApifyInstagramCollector

        items = [{
            "shortCode": "ABC123",
            "id": "12345",
            "caption": "Test IG post",
            "likesCount": 5000,
            "commentsCount": 200,
            "savesCount": 100,
            "sharesCount": 50,
            "videoViewCount": 50000,
            "timestamp": "2025-01-15T12:00:00.000Z",
            "displayUrl": "https://example.com/img.jpg",
            "type": "Video",
            "url": "https://www.instagram.com/p/ABC123/",
            "ownerFollowerCount": 1000000,
        }]
        start_resp, poll_resp, dataset_resp = _mock_apify_responses(items=items)

        with patch('collectors.instagram.requests.post', return_value=start_resp):
            with patch('collectors.instagram.requests.get', side_effect=[poll_resp, dataset_resp]):
                with patch('time.sleep'):
                    collector = ApifyInstagramCollector(api_token="test_token")
                    posts = collector.collect_posts("testhandle", "TestBrand", count=1)

        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0].post_id, "ABC123")
        self.assertEqual(posts[0].platform, "instagram")
        self.assertEqual(posts[0].likes, 5000)
        self.assertEqual(posts[0].comments, 200)
        self.assertEqual(posts[0].caption, "Test IG post")

    def test_collect_posts_empty(self):
        """Instagram collector returns empty list when Apify returns no items."""
        from collectors.instagram import ApifyInstagramCollector

        start_resp, poll_resp, dataset_resp = _mock_apify_responses(items=[])

        with patch('collectors.instagram.requests.post', return_value=start_resp):
            with patch('collectors.instagram.requests.get', side_effect=[poll_resp, dataset_resp]):
                with patch('time.sleep'):
                    collector = ApifyInstagramCollector(api_token="test_token")
                    posts = collector.collect_posts("testhandle", "TestBrand")

        self.assertEqual(len(posts), 0)


class TestTikTokCollector(unittest.TestCase):
    """Test TikTok data collection with mocked Apify."""

    def test_collect_posts_mock(self):
        """TikTok collector returns CollectedPost list from mocked Apify data."""
        from collectors.tiktok import ApifyTikTokCollector

        items = [{
            "id": "tt_99",
            "text": "TikTok viral challenge #sneakers",
            "diggCount": 100000,
            "commentCount": 5000,
            "shareCount": 20000,
            "playCount": 3000000,
            "collectCount": 8000,
            "createTime": 1705300000,
            "videoMeta": {"coverUrl": "https://example.com/cover.jpg"},
            "authorMeta": {"fans": 5000000},
            "musicMeta": {"musicId": "mus123", "musicName": "Trending Sound"},
            "hashtags": [{"name": "sneakers"}, {"name": "challenge"}],
            "webVideoUrl": "https://www.tiktok.com/@test/video/tt_99",
        }]
        start_resp, poll_resp, dataset_resp = _mock_apify_responses(items=items)

        with patch('collectors.tiktok.requests.post', return_value=start_resp):
            with patch('collectors.tiktok.requests.get', side_effect=[poll_resp, dataset_resp]):
                with patch('time.sleep'):
                    collector = ApifyTikTokCollector(api_token="test_token")
                    posts = collector.collect_posts("testhandle", "TestBrand", count=1)

        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0].post_id, "tt_99")
        self.assertEqual(posts[0].platform, "tiktok")
        self.assertEqual(posts[0].likes, 100000)
        self.assertEqual(posts[0].shares, 20000)
        self.assertEqual(posts[0].views, 3000000)
        self.assertEqual(posts[0].audio_id, "mus123")

    def test_tiktok_raises_on_failure(self):
        """TikTok collector raises RuntimeError on Apify run failure."""
        from collectors.tiktok import ApifyTikTokCollector

        start_resp = MagicMock()
        start_resp.status_code = 201
        start_resp.json.return_value = {"data": {"id": "run_fail"}}
        start_resp.raise_for_status = MagicMock()

        poll_resp = MagicMock()
        poll_resp.status_code = 200
        poll_resp.json.return_value = {"data": {"status": "FAILED"}}

        with patch('collectors.tiktok.requests.post', return_value=start_resp):
            with patch('collectors.tiktok.requests.get', return_value=poll_resp):
                with patch('time.sleep'):
                    collector = ApifyTikTokCollector(api_token="test_token")
                    with self.assertRaises(RuntimeError):
                        collector.collect_posts("testhandle", "TestBrand")


class TestFacebookCollector(unittest.TestCase):
    """Test Facebook data collection with mocked Apify."""

    def test_collect_posts_mock(self):
        """Facebook collector returns CollectedPost list from mocked Apify data."""
        from collectors.facebook import ApifyFacebookCollector

        items = [{
            "postId": "fb_001",
            "text": "Check out our new product!",
            "likesCount": 3000,
            "commentsCount": 500,
            "sharesCount": 1000,
            "videoViewCount": 20000,
            "time": "2025-01-15T12:00:00.000Z",
            "imageUrl": "https://example.com/fb_img.jpg",
            "type": "photo",
            "pageFollowerCount": 2000000,
        }]
        start_resp, poll_resp, dataset_resp = _mock_apify_responses(items=items)

        with patch('collectors.facebook.requests.post', return_value=start_resp):
            with patch('collectors.facebook.requests.get', side_effect=[poll_resp, dataset_resp]):
                with patch('time.sleep'):
                    collector = ApifyFacebookCollector(api_token="test_token")
                    posts = collector.collect_posts("testpage", "TestBrand", count=1)

        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0].post_id, "fb_001")
        self.assertEqual(posts[0].platform, "facebook")
        self.assertEqual(posts[0].likes, 3000)


class TestStorePostsDedup(unittest.TestCase):
    """Test that storing posts deduplicates on UNIQUE constraint."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_store_posts_deduplicates(self):
        """Storing same posts twice doesn't create duplicates."""
        from collectors.instagram import store_posts
        from collectors import CollectedPost

        posts = [CollectedPost(
            post_id="dedup_1", competitor_name="Nike", competitor_handle="nike",
            platform="instagram", post_url="https://instagram.com/p/dedup_1",
            media_type="image", caption="Test", likes=100, comments=10,
            follower_count=10000,
        )]

        count1 = store_posts(posts, "DedupTest", db_path=self.db_path)
        count2 = store_posts(posts, "DedupTest", db_path=self.db_path)

        conn = sqlite3.connect(str(self.db_path))
        total = conn.execute(
            "SELECT COUNT(*) FROM competitor_posts WHERE post_id='dedup_1' AND brand_profile='DedupTest'"
        ).fetchone()[0]
        conn.close()

        self.assertEqual(count1, 1)
        self.assertEqual(count2, 0)
        self.assertEqual(total, 1)


# ══════════════════════════════════════════════════════════════════════
# Section 4: Outlier Detection
# ══════════════════════════════════════════════════════════════════════

class TestOutlierDetection(unittest.TestCase):
    """Test the outlier detection algorithm."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def _seed_posts_for_detection(self, platform="instagram", profile="OutlierTest"):
        """Seed 10 posts: 9 normal + 1 with 10x engagement."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc).isoformat()

        conn.execute(
            "INSERT OR IGNORE INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (profile, "test", now, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO vertical_brands (vertical_name, brand_name, instagram_handle, tiktok_handle, added_at) VALUES (?, ?, ?, ?, ?)",
            (profile, "TestBrand", "testbrand", "testbrand", now),
        )

        # 9 normal posts
        for i in range(9):
            conn.execute("""
                INSERT INTO competitor_posts
                (post_id, platform, competitor_name, competitor_handle,
                 caption, media_type, likes, comments, saves, shares, views,
                 follower_count, brand_profile, collected_at, archived)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                f"normal_{i}", platform, "TestBrand", "testbrand",
                f"Normal post {i}", "image", 100, 10, 5, 2, 500,
                100000, profile, now,
            ))

        # 1 outlier post (10x engagement)
        conn.execute("""
            INSERT INTO competitor_posts
            (post_id, platform, competitor_name, competitor_handle,
             caption, media_type, likes, comments, saves, shares, views,
             follower_count, brand_profile, collected_at, archived)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            "outlier_big", platform, "TestBrand", "testbrand",
            "This went viral!", "reel", 10000, 1000, 500, 200, 500000,
            100000, profile, now,
        ))

        conn.commit()
        conn.close()

    def _make_mock_profile(self, vertical_name):
        """Create a mock profile matching main.py's MockProfile pattern."""
        from profile_loader import OutlierSettings, ContentTags
        from vertical_manager import VerticalManager

        class MockProfile:
            def __init__(self, name, vertical, db_path):
                self.name = name
                self.vertical = vertical
                self.profile_name = vertical
                self._vm = VerticalManager(db_path=db_path)
                self.outlier_settings = OutlierSettings()
                self.follower_count = None
                self.description = None

            def get_outlier_thresholds(self):
                return self.outlier_settings

            def get_content_tags(self):
                return ContentTags(themes=[], hook_types=[], formats=[])

            def get_competitor_handles(self, platform="instagram"):
                """Load competitors from database vertical."""
                vertical_obj = self._vm.get_vertical(self.vertical)
                if not vertical_obj:
                    return []
                results = []
                for brand in vertical_obj.brands:
                    if platform == "instagram" and brand.instagram_handle:
                        results.append({
                            "name": brand.brand_name or brand.instagram_handle,
                            "handle": brand.instagram_handle,
                        })
                    elif platform == "tiktok" and brand.tiktok_handle:
                        results.append({
                            "name": brand.brand_name or brand.tiktok_handle,
                            "handle": brand.tiktok_handle,
                        })
                    elif platform == "facebook" and getattr(brand, 'facebook_handle', None):
                        results.append({
                            "name": brand.brand_name or brand.facebook_handle,
                            "handle": brand.facebook_handle,
                        })
                return results

        return MockProfile(vertical_name, vertical_name, self.db_path)

    def test_outlier_detection_basic(self):
        """Post with 10x engagement is flagged as outlier."""
        self._seed_posts_for_detection(platform="instagram")

        profile = self._make_mock_profile("OutlierTest")
        from outlier_detector import OutlierDetector
        detector = OutlierDetector(profile, db_path=self.db_path)
        outliers, baselines = detector.detect()

        outlier_ids = [o.post_id for o in outliers]
        self.assertIn("outlier_big", outlier_ids)

        # Verify the normal posts are NOT flagged as outliers
        for i in range(9):
            self.assertNotIn(f"normal_{i}", outlier_ids)

    def test_outlier_empty_dataset(self):
        """No posts → no crash, empty results."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT OR IGNORE INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("EmptyTest", "test", now, now),
        )
        conn.commit()
        conn.close()

        profile = self._make_mock_profile("EmptyTest")
        from outlier_detector import OutlierDetector
        detector = OutlierDetector(profile, db_path=self.db_path)
        outliers, baselines = detector.detect()

        self.assertEqual(len(outliers), 0)
        self.assertEqual(len(baselines), 0)


# ══════════════════════════════════════════════════════════════════════
# Section 5: Dashboard / Signal Page
# ══════════════════════════════════════════════════════════════════════

class TestDashboardRendering(unittest.TestCase):
    """Test the main dashboard signal page rendering and filters."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        seed_test_data(self.db_path, "DashTest")
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_signal_page_renders_with_data(self):
        """GET /signal with seeded outliers returns 200."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'DashTest'

        resp = self.client.get('/signal?vertical=DashTest')
        self.assertEqual(resp.status_code, 200)
        html = resp.data.decode()
        # Page should contain the signal UI structure
        self.assertIn('signal', html.lower())

    def test_signal_page_empty_state(self):
        """GET /signal with no vertical shows empty state or setup."""
        resp = self.client.get('/signal?empty=true')
        self.assertEqual(resp.status_code, 200)

    def test_filter_by_platform(self):
        """GET /api/outliers?platform=tiktok returns only TikTok posts."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'DashTest'

        resp = self.client.get('/api/outliers?platform=tiktok')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        for post in data.get('outliers', []):
            self.assertEqual(post['platform'], 'tiktok')

    def test_filter_by_competitor(self):
        """GET /api/outliers?competitor=nike returns only Nike posts."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'DashTest'

        resp = self.client.get('/api/outliers?competitor=nike')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        for post in data.get('outliers', []):
            self.assertEqual(post['competitor_handle'], 'nike')

    def test_api_outliers_json_structure(self):
        """GET /api/outliers returns valid JSON with expected keys."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'DashTest'

        resp = self.client.get('/api/outliers')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn('outliers', data)
        self.assertIsInstance(data['outliers'], list)
        if data['outliers']:
            post = data['outliers'][0]
            for key in ['post_id', 'platform', 'likes', 'comments', 'outlier_score']:
                self.assertIn(key, post)


# ══════════════════════════════════════════════════════════════════════
# Section 6: Chat & AI Agent
# ══════════════════════════════════════════════════════════════════════

class TestChatAgent(unittest.TestCase):
    """Test the chat message flow and AI agent integration."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        seed_test_data(self.db_path, "ChatTest")
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_chat_message_returns_response(self):
        """POST /chat/message returns 200 with a response field."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'ChatTest'

        # Mock OpenAI to return a simple text response
        mock_message = MagicMock()
        mock_message.content = "Hello! I can help you with your competitive analysis."
        mock_message.tool_calls = None

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_completion.usage = MagicMock(prompt_tokens=100, completion_tokens=50, total_tokens=150)

        with patch('scout_agent.OpenAI') as mock_openai_cls:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_openai_cls.return_value = mock_client

            resp = self.client.post('/chat/message',
                data=json.dumps({"message": "hello"}),
                content_type='application/json',
                headers={'X-OpenAI-Key': 'test-key-123'})

        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn('response', data)
        self.assertTrue(len(data['response']) > 0)

    def test_chat_filter_context_not_stale(self):
        """Filter context keys are popped after use (not stale on next message)."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'ChatTest'
            sess['chat_context'] = {
                'active_vertical': 'ChatTest',
                'chat_history': [],
                'filter_platform': 'tiktok',  # This should be popped
            }

        # Mock a simple response
        mock_message = MagicMock()
        mock_message.content = "Showing TikTok posts"
        mock_message.tool_calls = None
        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_completion.usage = MagicMock(prompt_tokens=100, completion_tokens=50, total_tokens=150)

        with patch('scout_agent.OpenAI') as mock_openai_cls:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_openai_cls.return_value = mock_client

            # First message: filter should be present in response
            resp1 = self.client.post('/chat/message',
                data=json.dumps({"message": "show tiktok"}),
                content_type='application/json',
                headers={'X-OpenAI-Key': 'test-key-123'})

        # After first message, filter_platform should have been popped from session
        with self.client.session_transaction() as sess:
            ctx = sess.get('chat_context', {})
            self.assertNotIn('filter_platform', ctx,
                "filter_platform should be popped after first message")


# ══════════════════════════════════════════════════════════════════════
# Section 7: Trend Radar & Gap Analysis
# ══════════════════════════════════════════════════════════════════════

class TestTrendRadar(unittest.TestCase):
    """Test trend radar snapshot capture and scoring."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def _seed_tiktok_with_audio(self, profile="TrendTest"):
        """Seed TikTok posts with audio data for trend radar."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc).isoformat()

        conn.execute(
            "INSERT OR IGNORE INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (profile, "test", now, now),
        )

        # Multiple posts using the same sound (threshold is >= 2)
        for i in range(3):
            conn.execute("""
                INSERT INTO competitor_posts
                (post_id, platform, competitor_name, competitor_handle,
                 caption, media_type, likes, comments, saves, shares, views,
                 follower_count, audio_id, audio_name, is_outlier,
                 brand_profile, collected_at, archived)
                VALUES (?, 'tiktok', 'Brand', 'brand', ?, 'video', ?, 100, 50, 200, 50000,
                        1000000, 'trending_audio_1', 'Viral Sound', ?, ?, ?, 0)
            """, (
                f"trend_tt_{i}", f"Post with #trending hashtag {i} #viral",
                5000 + i * 1000, 1 if i == 0 else 0, profile, now,
            ))

        conn.commit()
        conn.close()

    def test_trend_radar_capture_snapshot(self):
        """Capturing a trend radar snapshot finds trending sounds and hashtags."""
        self._seed_tiktok_with_audio()

        from trend_radar.collector import TrendRadarCollector
        collector = TrendRadarCollector("TrendTest", db_path=self.db_path)
        result = collector.capture_snapshot()

        self.assertIn('sounds_tracked', result)
        self.assertIn('hashtags_tracked', result)
        # We seeded 3 posts with the same audio_id → should be tracked
        self.assertGreaterEqual(result['sounds_tracked'], 1)

    def test_trend_radar_scorer(self):
        """Scoring trends after 2+ snapshots returns scored items."""
        self._seed_tiktok_with_audio()

        from trend_radar.collector import TrendRadarCollector
        collector = TrendRadarCollector("TrendTest", db_path=self.db_path)
        collector.capture_snapshot()

        # Manually insert a second snapshot with higher counts to create velocity
        conn = sqlite3.connect(str(self.db_path))
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        conn.execute("""
            INSERT INTO trend_radar_snapshots
            (brand_profile, snapshot_timestamp, item_type, item_id, item_name,
             usage_count, outlier_count, total_engagement, avg_engagement, collected_at)
            VALUES (?, ?, 'sound', 'trending_audio_1', 'Viral Sound', 6, 2, 100000, 16666, ?)
        """, ("TrendTest", future, future))
        conn.commit()
        conn.close()

        from trend_radar.scorer import TrendRadarScorer
        scorer = TrendRadarScorer("TrendTest", db_path=self.db_path)
        trends = scorer.get_top_trends(limit=10, lookback_hours=72)

        self.assertIsInstance(trends, list)


class TestTrendAnalyzer(unittest.TestCase):
    """Test the trend analyzer (hook type / pattern tracking)."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_trend_analyzer_with_snapshots(self):
        """Two trend snapshots → correctly identifies rising/declining patterns."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc)

        # Snapshot 1: question hook has 3 occurrences
        snap1 = {
            "hook_types": {"question": 3, "curiosity_gap": 1},
            "content_patterns": {"Tutorial / How-To": 2},
            "formats": {"reel": 5},
            "triggers": {"curiosity": 2},
        }
        conn.execute("""
            INSERT INTO trend_snapshots
            (brand_profile, snapshot_date, snapshot_data, outlier_count, avg_outlier_score, created_at)
            VALUES (?, ?, ?, 5, 7.0, ?)
        """, ("TrendTest", (now - timedelta(days=7)).strftime("%Y-%m-%d"),
              json.dumps(snap1), now.isoformat()))

        # Snapshot 2: question hook dropped to 0, listicle rose to 3
        snap2 = {
            "hook_types": {"question": 0, "curiosity_gap": 1, "listicle": 3},
            "content_patterns": {"Tutorial / How-To": 2, "Myth Busting": 2},
            "formats": {"reel": 5},
            "triggers": {"curiosity": 1},
        }
        conn.execute("""
            INSERT INTO trend_snapshots
            (brand_profile, snapshot_date, snapshot_data, outlier_count, avg_outlier_score, created_at)
            VALUES (?, ?, ?, 5, 7.5, ?)
        """, ("TrendTest", now.strftime("%Y-%m-%d"),
              json.dumps(snap2), now.isoformat()))

        conn.commit()
        conn.close()

        from trend_analyzer import TrendAnalyzer
        analyzer = TrendAnalyzer("TrendTest", db_path=self.db_path)
        trends = analyzer.get_trends(lookback_weeks=4)

        self.assertIn('rising', trends)
        self.assertIn('declining', trends)
        self.assertGreater(trends['snapshot_count'], 1)

        # Listicle should be rising
        rising_names = [t['name'] for t in trends['rising']]
        self.assertIn('listicle', rising_names)

        # Question hook should be declining
        declining_names = [t['name'] for t in trends['declining']]
        self.assertIn('question', declining_names)


class TestGapAnalysis(unittest.TestCase):
    """Test the competitive gap analysis."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        seed_test_data(self.db_path, "GapTest")
        config.DB_PATH = self.db_path

        # Set own brand handle in config
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('own_brand_instagram', 'mybrand')")
        conn.commit()

        # Add AI analysis to competitor outlier posts
        analysis = json.dumps({
            "hook_type": "curiosity_gap",
            "content_pattern": "Before/After",
            "emotional_trigger": "curiosity",
        })
        conn.execute(
            "UPDATE competitor_posts SET ai_analysis=? WHERE is_outlier=1 AND brand_profile='GapTest'",
            (analysis,),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_gap_analysis_detects_missing_hooks(self):
        """Gap analysis finds hooks competitors use that own brand doesn't."""
        from gap_analyzer import GapAnalyzer
        analyzer = GapAnalyzer("GapTest", db_path=self.db_path)
        result = analyzer.analyze_gaps(force_refresh=True)

        self.assertTrue(result.get('has_data', False))
        # Competitor outliers use "curiosity_gap" hook; own brand doesn't
        missing_hook_names = [h['hook_type'] for h in result.get('missing_hooks', [])]
        self.assertIn('curiosity_gap', missing_hook_names)


# ══════════════════════════════════════════════════════════════════════
# Section 8: Content Scoring
# ══════════════════════════════════════════════════════════════════════

class TestContentScoring(unittest.TestCase):
    """Test the content scoring system."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        seed_test_data(self.db_path, "ScoreTest")
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        app._active_vertical = None  # Clear stale state from prior tests
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        self.app._active_vertical = None
        if self.db_path.exists():
            self.db_path.unlink()

    def test_score_concept_route(self):
        """POST /api/score-concept returns a score 0-100 with breakdown."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'ScoreTest'

        resp = self.client.post('/api/score-concept',
            data=json.dumps({
                "caption": "Top 10 sneakers you NEED this season! Which one is your favorite?",
                "format": "reel",
                "platform": "instagram",
            }),
            content_type='application/json')

        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn('overall_score', data)
        self.assertGreaterEqual(data['overall_score'], 0)
        self.assertLessEqual(data['overall_score'], 100)
        self.assertIn('breakdown', data)

    def test_score_stored_in_db(self):
        """After scoring, the score is persisted in content_scores table."""
        with self.client.session_transaction() as sess:
            sess['active_vertical'] = 'ScoreTest'

        self.client.post('/api/score-concept',
            data=json.dumps({
                "caption": "Test scoring persistence",
                "format": "reel",
                "platform": "instagram",
            }),
            content_type='application/json')

        conn = sqlite3.connect(str(self.db_path))
        row = conn.execute("SELECT COUNT(*) FROM content_scores WHERE brand_profile='ScoreTest'").fetchone()
        conn.close()
        self.assertGreater(row[0], 0)


# ══════════════════════════════════════════════════════════════════════
# Section 9: Report Serving
# ══════════════════════════════════════════════════════════════════════

class TestReportServing(unittest.TestCase):
    """Test report generation and serving routes."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()
        # Clean up any test report files
        report_path = config.DATA_DIR / "test_report.html"
        if report_path.exists():
            report_path.unlink()

    def test_report_raw_route_serves_html(self):
        """GET /reports/raw/<name> serves an existing HTML report."""
        # Create a test report file
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        report_path = config.DATA_DIR / "test_report.html"
        report_path.write_text("<html><body>Test Report</body></html>")

        resp = self.client.get('/reports/raw/test_report.html')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'Test Report', resp.data)

    def test_report_path_traversal_blocked(self):
        """Path traversal attempts are blocked by secure_filename."""
        resp = self.client.get('/reports/raw/../../etc/passwd.html')
        # secure_filename strips path components → file not found
        self.assertIn(resp.status_code, (403, 404))


# ══════════════════════════════════════════════════════════════════════
# Section 10: Security Fixes Verification
# ══════════════════════════════════════════════════════════════════════

class TestSecurityFixes(unittest.TestCase):
    """Verify all 13 security hardening fixes are in place."""

    def setUp(self):
        self.db_path = Path(tempfile.mktemp(suffix=".db"))
        create_full_test_db(self.db_path)
        config.DB_PATH = self.db_path

        from dashboard import app
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret'
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_xss_md_bold_filter_escapes_html(self):
        """md_bold_filter escapes HTML before applying bold formatting."""
        from dashboard import md_bold_filter
        result = str(md_bold_filter('<script>alert(1)</script>**bold**'))
        self.assertNotIn('<script>', result)
        self.assertIn('&lt;script&gt;', result)
        self.assertIn('<strong>bold</strong>', result)

    def test_xss_escapehtml_in_template(self):
        """escapeHtml() function is defined in signal.html."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        html = template_path.read_text()
        self.assertIn('function escapeHtml(', html)
        self.assertIn('div.textContent = str', html)

    def test_xss_suggestions_escaped(self):
        """Score suggestions use escapeHtml() in innerHTML."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        html = template_path.read_text()
        self.assertIn('escapeHtml(s)', html)

    def test_xss_category_name_escaped(self):
        """Category names use escapeHtml() in innerHTML."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        html = template_path.read_text()
        self.assertIn('escapeHtml(cat.name', html)

    def test_path_traversal_secure_filename(self):
        """Report routes use secure_filename to strip path components."""
        resp = self.client.get('/reports/raw/../../../etc/passwd.html')
        self.assertIn(resp.status_code, (403, 404))

    def test_open_redirect_blocked(self):
        """next_url stores relative path, absolute URLs are rejected."""
        from auth import login_required
        # Verify auth.py stores request.path (not request.url)
        auth_path = Path(__file__).parent / "auth.py"
        auth_code = auth_path.read_text()
        self.assertIn('session["next_url"] = request.path', auth_code)

        # Verify dashboard.py validates next_url starts with '/'
        dash_path = Path(__file__).parent / "dashboard.py"
        dash_code = dash_path.read_text()
        self.assertIn("if not next_url.startswith('/')", dash_code)

    def test_security_headers_present(self):
        """Responses include X-Frame-Options and X-Content-Type-Options."""
        resp = self.client.get('/setup')
        self.assertEqual(resp.headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(resp.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(resp.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')

    def test_admin_mode_header_ignored(self):
        """X-Admin-Mode header from client is ignored; only config.ADMIN_MODE counts."""
        dash_path = Path(__file__).parent / "dashboard.py"
        dash_code = dash_path.read_text()
        # The old pattern should be gone
        self.assertNotIn("request.headers.get('X-Admin-Mode'", dash_code)
        # New pattern uses config.ADMIN_MODE only
        self.assertIn('admin_mode = config.ADMIN_MODE', dash_code)

    def test_proxy_rate_limit(self):
        """Image proxy enforces rate limiting (429 after exceeding limit)."""
        from dashboard import _proxy_rate_limit
        _proxy_rate_limit.clear()  # Reset rate limit state

        # Send 60 requests (at the limit)
        for i in range(60):
            resp = self.client.get('/proxy-image?url=https://cdninstagram.com/test.jpg',
                                   environ_base={'REMOTE_ADDR': '127.0.0.1'})
            # These will fail for other reasons (can't reach the URL) but shouldn't be 429
            if resp.status_code == 429:
                self.fail(f"Rate limited too early at request {i+1}")

        # 61st request should hit rate limit
        resp = self.client.get('/proxy-image?url=https://cdninstagram.com/test.jpg',
                               environ_base={'REMOTE_ADDR': '127.0.0.1'})
        self.assertEqual(resp.status_code, 429)

    def test_api_keys_password_type(self):
        """Setup page uses type='password' for API key inputs."""
        resp = self.client.get('/setup')
        html = resp.data.decode()
        # Count password-type inputs for API keys
        self.assertIn('type="password" name="apify_token"', html)
        self.assertIn('type="password" name="openai_key"', html)

    def test_login_required_on_api_routes(self):
        """API routes have @login_required decorator."""
        dash_path = Path(__file__).parent / "dashboard.py"
        dash_code = dash_path.read_text()
        # These routes should have @login_required right after @app.route
        routes_to_check = [
            '/api/trends',
            '/api/gap-analysis',
            '/api/score-history',
            '/api/budget',
            '/proxy-image',
            '/analysis/stream',
            '/analysis/status',
        ]
        for route in routes_to_check:
            # Find the route definition and verify login_required follows
            idx = dash_code.find(f'@app.route("{route}"')
            if idx == -1:
                idx = dash_code.find(f"@app.route('{route}'")
            self.assertNotEqual(idx, -1, f"Route {route} not found")
            # Next 200 chars should contain @login_required
            snippet = dash_code[idx:idx + 200]
            self.assertIn('@login_required', snippet,
                f"Route {route} missing @login_required")

    def test_stale_config_removed(self):
        """Module-level APIFY_API_TOKEN and OPENAI_API_KEY are None (not cached)."""
        self.assertIsNone(config.APIFY_API_TOKEN)
        self.assertIsNone(config.OPENAI_API_KEY)

    def test_db_connections_use_finally(self):
        """Key dashboard helpers use try/finally for DB connections."""
        dash_path = Path(__file__).parent / "dashboard.py"
        dash_code = dash_path.read_text()

        # _get_or_create_secret_key should have finally
        fn_start = dash_code.find('def _get_or_create_secret_key')
        fn_end = dash_code.find('\napp.secret_key', fn_start)
        fn_code = dash_code[fn_start:fn_end]
        self.assertIn('finally:', fn_code)

        # _persist_active_vertical should have finally
        fn_start = dash_code.find('def _persist_active_vertical')
        fn_end = dash_code.find('\ndef ', fn_start + 10)
        fn_code = dash_code[fn_start:fn_end]
        self.assertIn('finally:', fn_code)

    def test_ssrf_proxy_no_blind_redirects(self):
        """Image proxy uses allow_redirects=False."""
        dash_path = Path(__file__).parent / "dashboard.py"
        dash_code = dash_path.read_text()
        # Find the proxy_image function
        idx = dash_code.find('def proxy_image()')
        fn_code = dash_code[idx:idx + 1500]
        self.assertIn('allow_redirects=False', fn_code)
        self.assertNotIn('allow_redirects=True', fn_code)


if __name__ == '__main__':
    unittest.main()
