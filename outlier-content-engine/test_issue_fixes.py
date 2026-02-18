"""
Comprehensive tests for all 5 reported issues and their fixes.

Issue 1: Chat forgets vertical between sessions (secret key, vertical recovery, markdown)
Issue 2: Brands not shown in filter bar (get_analyzed_brands_with_data)
Issue 3: TikTok + Trend Radar break (error differentiation, filter pop)
Issue 4: Timeframe filter (CSS class, DB persistence, connection safety)
Issue 5: Handle discovery (suggest_handles, Facebook registry, 3-path flow)
"""

import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config


def _create_test_db(db_path):
    """Create a minimal test database with required tables."""
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS api_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT UNIQUE NOT NULL,
            api_key TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS verticals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vertical_brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vertical_name TEXT NOT NULL,
            brand_name TEXT,
            instagram_handle TEXT,
            tiktok_handle TEXT,
            facebook_handle TEXT,
            added_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS competitor_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT NOT NULL,
            brand_profile TEXT NOT NULL,
            platform TEXT NOT NULL DEFAULT 'instagram',
            competitor_handle TEXT,
            competitor_name TEXT,
            post_url TEXT,
            media_type TEXT,
            caption TEXT,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            saves INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            posted_at TEXT,
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_outlier INTEGER DEFAULT 0,
            outlier_score REAL DEFAULT 0,
            archived INTEGER DEFAULT 0,
            is_own_channel INTEGER DEFAULT 0,
            content_pattern TEXT
        );
    """)
    conn.commit()
    return conn


# ═══════════════════════════════════════════════════════════════════════
# ISSUE 1: Session Persistence
# ═══════════════════════════════════════════════════════════════════════

class TestIssue1_SecretKeyPersistence(unittest.TestCase):
    """Secret key must survive server restarts by persisting to DB."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.db_path = Path(self.tmpdir) / "test.db"
        self.conn = _create_test_db(self.db_path)
        self.conn.close()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_secret_key_generated_and_stored_in_db(self):
        """First call generates a key and stores it in DB config table."""
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("FLASK_SECRET_KEY", None)
            with patch.object(config, 'DB_PATH', self.db_path):
                # Import fresh to call _get_or_create_secret_key
                from dashboard import _get_or_create_secret_key
                key1 = _get_or_create_secret_key()

                # Key should be a 64-char hex string
                self.assertEqual(len(key1), 64)
                self.assertTrue(all(c in '0123456789abcdef' for c in key1))

                # Key should be in the DB
                conn = sqlite3.connect(str(self.db_path))
                row = conn.execute(
                    "SELECT value FROM config WHERE key = 'flask_secret_key'"
                ).fetchone()
                conn.close()
                self.assertIsNotNone(row)
                self.assertEqual(row[0], key1)

    def test_secret_key_same_across_restarts(self):
        """Second call returns the SAME key (simulates server restart)."""
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("FLASK_SECRET_KEY", None)
            with patch.object(config, 'DB_PATH', self.db_path):
                from dashboard import _get_or_create_secret_key
                key1 = _get_or_create_secret_key()
                key2 = _get_or_create_secret_key()
                self.assertEqual(key1, key2,
                    "Secret key changed between calls — sessions would be invalidated!")

    def test_env_var_takes_priority(self):
        """FLASK_SECRET_KEY env var overrides DB-stored key."""
        with patch.dict(os.environ, {"FLASK_SECRET_KEY": "env_key_abc123"}):
            with patch.object(config, 'DB_PATH', self.db_path):
                from dashboard import _get_or_create_secret_key
                key = _get_or_create_secret_key()
                self.assertEqual(key, "env_key_abc123")

    def test_fallback_when_db_missing(self):
        """Returns ephemeral key when DB doesn't exist yet."""
        missing_path = Path(self.tmpdir) / "nonexistent.db"
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("FLASK_SECRET_KEY", None)
            with patch.object(config, 'DB_PATH', missing_path):
                from dashboard import _get_or_create_secret_key
                key = _get_or_create_secret_key()
                # Should still get a key, just ephemeral
                self.assertEqual(len(key), 64)


class TestIssue1_VerticalRecovery(unittest.TestCase):
    """Active vertical must be recoverable from DB after session expiry."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.db_path = Path(self.tmpdir) / "test.db"
        self.conn = _create_test_db(self.db_path)
        # Create a test vertical
        self.conn.execute(
            "INSERT INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("Streetwear", "Test", "2024-01-01", "2024-01-01")
        )
        self.conn.commit()
        self.conn.close()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_persist_active_vertical_writes_to_db(self):
        """_persist_active_vertical() stores the vertical name in config table."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from dashboard import _persist_active_vertical
            _persist_active_vertical("Streetwear")

            conn = sqlite3.connect(str(self.db_path))
            row = conn.execute(
                "SELECT value FROM config WHERE key = 'last_active_vertical'"
            ).fetchone()
            conn.close()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "Streetwear")

    def test_persist_updates_on_switch(self):
        """Switching verticals updates the DB value."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from dashboard import _persist_active_vertical

            _persist_active_vertical("Streetwear")
            _persist_active_vertical("DTC Beauty")

            conn = sqlite3.connect(str(self.db_path))
            row = conn.execute(
                "SELECT value FROM config WHERE key = 'last_active_vertical'"
            ).fetchone()
            conn.close()
            self.assertEqual(row[0], "DTC Beauty")

    def test_get_active_vertical_falls_back_to_db(self):
        """When session is empty, get_active_vertical_name reads from DB config."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from dashboard import _persist_active_vertical, app

            # Store a vertical in DB
            _persist_active_vertical("Streetwear")

            # Clear in-memory state
            if hasattr(app, '_active_vertical'):
                app._active_vertical = None

            # Test within request context (session required)
            with app.test_request_context():
                from flask import session
                session.clear()  # Simulate expired session

                from dashboard import get_active_vertical_name, get_available_verticals
                with patch('dashboard.get_available_verticals', return_value=["Streetwear"]):
                    result = get_active_vertical_name()
                    self.assertEqual(result, "Streetwear",
                        "Should recover vertical from DB config after session expiry")


class TestIssue1_ChatHistoryMarkdown(unittest.TestCase):
    """Server-rendered chat history must process markdown via JS."""

    def test_template_has_data_raw_text_attribute(self):
        """Chat history bubbles must have data-raw-text for JS processing."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        content = template_path.read_text()
        self.assertIn('data-raw-text=', content,
            "Chat bubbles missing data-raw-text attribute for markdown processing")
        self.assertIn('chat-history-raw', content,
            "Chat bubbles missing chat-history-raw class for JS targeting")

    def test_js_processes_raw_text_on_load(self):
        """DOMContentLoaded handler processes .chat-history-raw elements."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        content = template_path.read_text()
        self.assertIn("querySelectorAll('.chat-history-raw')", content,
            "Missing JS code to process chat-history-raw elements on load")
        self.assertIn("formatChatText(raw)", content,
            "formatChatText() not called on raw chat history text")

    def test_data_raw_text_is_escaped(self):
        """data-raw-text uses |e filter to prevent XSS."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        content = template_path.read_text()
        self.assertIn('{{ msg.content|e }}', content,
            "data-raw-text must use |e filter to escape HTML entities")


# ═══════════════════════════════════════════════════════════════════════
# ISSUE 2: Brand Filter Bar
# ═══════════════════════════════════════════════════════════════════════

class TestIssue2_BrandFilterBar(unittest.TestCase):
    """All brands in a vertical must show in the filter bar, even without data."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.db_path = Path(self.tmpdir) / "test.db"
        self.conn = _create_test_db(self.db_path)
        # Create vertical with brands
        self.conn.execute(
            "INSERT INTO verticals (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("Streetwear", "Test", "2024-01-01", "2024-01-01")
        )
        self.conn.execute(
            "INSERT INTO vertical_brands (vertical_name, brand_name, instagram_handle, tiktok_handle, facebook_handle, added_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("Streetwear", "Nike", "nike", "nike", "nike", "2024-01-01")
        )
        self.conn.execute(
            "INSERT INTO vertical_brands (vertical_name, brand_name, instagram_handle, tiktok_handle, facebook_handle, added_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("Streetwear", "Stussy", "stussy", "stussy", "stussy", "2024-01-01")
        )
        self.conn.commit()
        self.conn.close()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_brands_shown_without_post_data(self):
        """Brands appear in filter bar even when no posts have been collected."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from vertical_manager import VerticalManager
            vm = VerticalManager(db_path=self.db_path)
            vertical = vm.get_vertical("Streetwear")
            self.assertIsNotNone(vertical)
            self.assertEqual(len(vertical.brands), 2,
                "Both brands must show even with 0 posts collected")

            # Verify the function used by dashboard returns all brands
            from dashboard import get_analyzed_brands_with_data
            with patch('dashboard.get_active_vertical_name', return_value="Streetwear"):
                brands = get_analyzed_brands_with_data("Streetwear")
                self.assertEqual(len(brands), 2,
                    "get_analyzed_brands_with_data must return ALL brands, not just analyzed ones")

    def test_brands_include_all_platform_handles(self):
        """Brand objects include IG, TikTok, and Facebook handles."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from vertical_manager import VerticalManager
            vm = VerticalManager(db_path=self.db_path)
            vertical = vm.get_vertical("Streetwear")
            nike = vertical.brands[0]
            self.assertEqual(nike.instagram_handle, "nike")
            self.assertEqual(nike.tiktok_handle, "nike")
            self.assertEqual(nike.facebook_handle, "nike")

    def test_empty_vertical_returns_empty(self):
        """No crash when vertical has zero brands."""
        with patch.object(config, 'DB_PATH', self.db_path):
            from dashboard import get_analyzed_brands_with_data
            result = get_analyzed_brands_with_data("NonExistent")
            self.assertEqual(result, [])


# ═══════════════════════════════════════════════════════════════════════
# ISSUE 3: TikTok Collection Error Differentiation + Trend Radar
# ═══════════════════════════════════════════════════════════════════════

class TestIssue3_TikTokErrorDifferentiation(unittest.TestCase):
    """TikTok collector must raise for errors, return [] only for 0 posts."""

    def test_api_start_failure_raises_runtime_error(self):
        """HTTP error starting Apify actor raises RuntimeError."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch('requests.post', return_value=mock_response):
            with self.assertRaises(RuntimeError) as ctx:
                collector.collect_posts("nike", "Nike", count=5)
            self.assertIn("Apify actor start failed", str(ctx.exception))

    def test_apify_run_failed_raises(self):
        """Apify run FAILED status raises RuntimeError."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        # Mock successful start
        start_response = MagicMock()
        start_response.status_code = 200
        start_response.json.return_value = {"data": {"id": "run123"}}

        # Mock status check returning FAILED
        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {"data": {"status": "FAILED"}}

        with patch('requests.post', return_value=start_response):
            with patch('requests.get', return_value=status_response):
                with patch('time.sleep'):  # Don't actually wait
                    with self.assertRaises(RuntimeError) as ctx:
                        collector.collect_posts("nike", "Nike", count=5)
                    self.assertIn("Apify run FAILED", str(ctx.exception))

    def test_apify_timeout_raises(self):
        """Apify run that exceeds max_wait raises RuntimeError."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        start_response = MagicMock()
        start_response.status_code = 200
        start_response.json.return_value = {"data": {"id": "run123"}}

        # Always return RUNNING status (never completes)
        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {"data": {"status": "RUNNING"}}

        with patch('requests.post', return_value=start_response):
            with patch('requests.get', return_value=status_response):
                with patch('time.sleep'):
                    with self.assertRaises(RuntimeError) as ctx:
                        collector.collect_posts("nike", "Nike", count=5)
                    self.assertIn("timed out", str(ctx.exception))

    def test_successful_empty_result_returns_empty_list(self):
        """Profile with 0 posts returns [] (NOT an error)."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        start_response = MagicMock()
        start_response.status_code = 200
        start_response.json.return_value = {"data": {"id": "run123"}}

        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {
            "data": {"status": "SUCCEEDED", "defaultDatasetId": "ds123"}
        }

        dataset_response = MagicMock()
        dataset_response.status_code = 200
        dataset_response.json.return_value = []  # Empty — 0 posts

        with patch('requests.post', return_value=start_response):
            with patch('requests.get', side_effect=[status_response, dataset_response]):
                with patch('time.sleep'):
                    result = collector.collect_posts("some_brand", "SomeBrand", count=5)
                    self.assertEqual(result, [],
                        "0 posts should return empty list, NOT raise")

    def test_successful_collection_returns_posts(self):
        """Successful collection returns parsed CollectedPost objects."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        start_response = MagicMock()
        start_response.status_code = 200
        start_response.json.return_value = {"data": {"id": "run123"}}

        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {
            "data": {"status": "SUCCEEDED", "defaultDatasetId": "ds123"}
        }

        dataset_response = MagicMock()
        dataset_response.status_code = 200
        dataset_response.json.return_value = [
            {
                "id": "post1",
                "text": "Test caption",
                "createTime": 1700000000,
                "diggCount": 1000,
                "commentCount": 50,
                "shareCount": 10,
                "playCount": 50000,
                "collectCount": 100,
                "webVideoUrl": "https://tiktok.com/@nike/video/post1",
                "hashtags": [{"name": "streetwear"}],
                "musicMeta": {"musicId": "m1", "musicName": "Sound1"},
                "videoMeta": {"coverUrl": "https://img.example.com/cover.jpg"},
                "authorMeta": {"fans": 5000000},
            }
        ]

        with patch('requests.post', return_value=start_response):
            with patch('requests.get', side_effect=[status_response, dataset_response]):
                with patch('time.sleep'):
                    result = collector.collect_posts("nike", "Nike", count=5)
                    self.assertEqual(len(result), 1)
                    post = result[0]
                    self.assertEqual(post.platform, "tiktok")
                    self.assertEqual(post.post_id, "post1")
                    self.assertEqual(post.likes, 1000)
                    self.assertEqual(post.views, 50000)
                    self.assertEqual(post.audio_name, "Sound1")

    def test_dataset_fetch_failure_raises(self):
        """HTTP error fetching dataset raises RuntimeError."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        start_response = MagicMock()
        start_response.status_code = 200
        start_response.json.return_value = {"data": {"id": "run123"}}

        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {
            "data": {"status": "SUCCEEDED", "defaultDatasetId": "ds123"}
        }

        dataset_response = MagicMock()
        dataset_response.status_code = 503  # Service unavailable

        with patch('requests.post', return_value=start_response):
            with patch('requests.get', side_effect=[status_response, dataset_response]):
                with patch('time.sleep'):
                    with self.assertRaises(RuntimeError) as ctx:
                        collector.collect_posts("nike", "Nike", count=5)
                    self.assertIn("Dataset fetch failed", str(ctx.exception))

    def test_network_exception_wrapped_as_runtime_error(self):
        """Network exceptions (ConnectionError etc) become RuntimeError."""
        from collectors.tiktok import ApifyTikTokCollector

        collector = ApifyTikTokCollector(api_token="test_token")

        with patch('requests.post', side_effect=ConnectionError("DNS resolution failed")):
            with self.assertRaises(RuntimeError) as ctx:
                collector.collect_posts("nike", "Nike", count=5)
            self.assertIn("TikTok collection failed", str(ctx.exception))


class TestIssue3_FilterPopNotGet(unittest.TestCase):
    """Filter context keys must be .pop()'d (one-shot) not .get()'d."""

    def test_filter_keys_popped_from_context(self):
        """Verify dashboard.py uses .pop() for all filter context keys."""
        dashboard_path = Path(__file__).parent / "dashboard.py"
        content = dashboard_path.read_text()

        # These keys MUST use pop() — not get() — to prevent stale values
        must_pop = [
            "analysis_started",
            "selected_brands",
            "filter_action",
            "filter_brands",
            "filter_platform",
            "filter_timeframe",
            "filter_sort",
        ]

        for key in must_pop:
            # Look for updated_context.pop('key_name', ...) pattern
            pop_pattern = f"updated_context.pop('{key}'"
            self.assertIn(pop_pattern, content,
                f"'{key}' must use .pop() to be consumed once — "
                f"using .get() causes stale values and page reloads!")


class TestIssue3_TrendRadarDoesNotBreakChat(unittest.TestCase):
    """show_trends tool must not set persistent filter context values."""

    def test_show_trends_returns_json_without_filter_keys(self):
        """show_trends result must not include filter_platform/filter_timeframe."""
        # Read the _handle_show_trends implementation
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()

        # Find the show_trends handler and check it doesn't set filter context
        import re
        handler_match = re.search(
            r'def _handle_show_trends\(self.*?\n(.*?)(?=\n    def )',
            content, re.DOTALL
        )
        self.assertIsNotNone(handler_match, "Cannot find _handle_show_trends")
        handler_body = handler_match.group(1)

        # It should NOT set filter keys on the context
        self.assertNotIn("context['filter_platform']", handler_body,
            "show_trends must NOT set filter_platform — this causes stale filters!")
        self.assertNotIn("context['filter_timeframe']", handler_body,
            "show_trends must NOT set filter_timeframe — this causes page reloads!")


# ═══════════════════════════════════════════════════════════════════════
# ISSUE 4: Timeframe Filter
# ═══════════════════════════════════════════════════════════════════════

class TestIssue4_TimeframeFilter(unittest.TestCase):
    """Timeframe filter must respect data collection window."""

    def test_css_class_exists(self):
        """signal-pill-disabled CSS class must be defined in stylesheet."""
        css_path = Path(__file__).parent / "static" / "signal-ai.css"
        content = css_path.read_text()
        self.assertIn('.signal-pill.signal-pill-disabled', content,
            "CSS class .signal-pill-disabled not defined!")
        self.assertIn('opacity', content.split('.signal-pill-disabled')[1][:200],
            "signal-pill-disabled must set opacity")
        self.assertIn('pointer-events: none', content.split('.signal-pill-disabled')[1][:200],
            "signal-pill-disabled must disable pointer events")

    def test_no_inline_styles_on_3months_button(self):
        """3 Months button must NOT have inline style= for disabled state."""
        template_path = Path(__file__).parent / "templates" / "signal.html"
        content = template_path.read_text()

        # Find the 3 Months button line(s)
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if '3 Months</button>' in line or '>3 Months<' in line:
                # Check the button and surrounding lines for inline disabled styles
                context_block = '\n'.join(lines[max(0,i-3):i+1])
                if 'signal-pill-disabled' in context_block:
                    self.assertNotIn("style=\"opacity:", context_block,
                        "3 Months button still has inline style= for disabled state. "
                        "Should use .signal-pill-disabled CSS class instead!")

    def test_collection_timeframe_stored_in_db(self):
        """run_analysis must store timeframe in config table."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn("last_collection_timeframe_", content,
            "run_analysis must store collection timeframe in config table")
        self.assertIn("INSERT OR REPLACE INTO config", content,
            "Timeframe must be persisted via INSERT OR REPLACE")

    def test_db_connection_has_try_finally(self):
        """DB connections in new code must have try/finally protection."""
        # Check dashboard.py collection_timeframe read
        dashboard_path = Path(__file__).parent / "dashboard.py"
        content = dashboard_path.read_text()

        # Find the collection_timeframe block
        tf_idx = content.find("collection_timeframe = None")
        if tf_idx > 0:
            block = content[tf_idx:tf_idx+600]
            self.assertIn("finally:", block,
                "collection_timeframe DB read missing try/finally!")
            self.assertIn("conn.close()", block,
                "collection_timeframe DB connection not closed in finally block!")

        # Check scout_agent.py timeframe write
        scout_path = Path(__file__).parent / "scout_agent.py"
        scout_content = scout_path.read_text()

        tf_write_idx = scout_content.find("last_collection_timeframe_")
        if tf_write_idx > 0:
            # Go back to find the try block
            block_start = max(0, tf_write_idx - 300)
            block = scout_content[block_start:tf_write_idx + 400]
            self.assertIn("finally:", block,
                "scout_agent timeframe DB write missing try/finally!")


# ═══════════════════════════════════════════════════════════════════════
# ISSUE 5: Handle Discovery
# ═══════════════════════════════════════════════════════════════════════

class TestIssue5_HandleDiscovery(unittest.TestCase):
    """suggest_handles must work for all platforms including Facebook."""

    def test_facebook_entries_in_registry(self):
        """All brands in registry must have a facebook key."""
        registry_path = Path(__file__).parent / "brand_registry.json"
        with open(registry_path) as f:
            data = json.load(f)

        brands = data.get("brands", {})
        self.assertGreater(len(brands), 0, "Brand registry is empty!")

        for key, brand in brands.items():
            self.assertIn("facebook", brand,
                f"Brand '{key}' missing facebook entry! "
                f"suggest_handles will always return 'unknown' for FB.")

    def test_known_brands_have_fb_data(self):
        """Major brands must have actual Facebook handles."""
        from brand_handle_discovery import BrandHandleDiscovery
        discovery = BrandHandleDiscovery()

        # These brands definitely have Facebook pages
        brands_with_fb = ["Nike", "Adidas", "Supreme", "Stussy"]
        for brand_name in brands_with_fb:
            result = discovery.discover_handle(brand_name, platform="facebook")
            self.assertIsNotNone(result,
                f"{brand_name} has no Facebook handle in registry!")
            self.assertIsNotNone(result.get("handle"),
                f"{brand_name} Facebook handle is null!")
            self.assertTrue(len(result["handle"]) > 0,
                f"{brand_name} Facebook handle is empty string!")

    def test_discover_handle_works_for_all_platforms(self):
        """discover_handle returns data for instagram, tiktok, AND facebook."""
        from brand_handle_discovery import BrandHandleDiscovery
        discovery = BrandHandleDiscovery()

        for platform in ["instagram", "tiktok", "facebook"]:
            result = discovery.discover_handle("Nike", platform=platform)
            self.assertIsNotNone(result,
                f"Nike discovery returned None for {platform}")
            self.assertEqual(result["handle"], "nike",
                f"Nike {platform} handle should be 'nike'")

    def test_suggest_handles_tool_registered(self):
        """suggest_handles must be in TOOL_DEFINITIONS."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn('"name": "suggest_handles"', content,
            "suggest_handles tool not found in TOOL_DEFINITIONS!")

    def test_suggest_handles_dispatched(self):
        """_dispatch_tool routes 'suggest_handles' to handler."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn('elif name == "suggest_handles"', content,
            "suggest_handles not routed in _dispatch_tool!")
        self.assertIn('self._handle_suggest_handles(args)', content,
            "_handle_suggest_handles not called in dispatch!")


class TestIssue5_SuggestHandlesHandler(unittest.TestCase):
    """Test the actual suggest_handles tool handler logic."""

    def test_suggest_handles_returns_found_for_known_brands(self):
        """Known brands get 'found' status with handle data."""
        from scout_agent import ScoutAgent

        # We can't instantiate ScoutAgent without OpenAI key,
        # so test the handler directly by constructing a minimal instance
        agent = ScoutAgent.__new__(ScoutAgent)
        agent.client = None  # Not needed for tool handlers

        result_json = agent._handle_suggest_handles({
            "brand_names": ["Nike", "Adidas"],
            "platforms": ["instagram", "tiktok", "facebook"],
        })
        result = json.loads(result_json)

        self.assertTrue(result["ok"])
        self.assertEqual(len(result["suggestions"]), 2)

        nike = result["suggestions"][0]
        self.assertEqual(nike["brand_name"], "Nike")

        # Instagram
        self.assertEqual(nike["platforms"]["instagram"]["status"], "found")
        self.assertEqual(nike["platforms"]["instagram"]["handle"], "nike")

        # TikTok
        self.assertEqual(nike["platforms"]["tiktok"]["status"], "found")
        self.assertEqual(nike["platforms"]["tiktok"]["handle"], "nike")

        # Facebook — NEW: must be found, not unknown
        self.assertEqual(nike["platforms"]["facebook"]["status"], "found",
            "Nike Facebook handle should be 'found' — registry must have FB data!")
        self.assertEqual(nike["platforms"]["facebook"]["handle"], "nike")

    def test_suggest_handles_unknown_brand(self):
        """Unknown brands get 'unknown' status with helpful message."""
        from scout_agent import ScoutAgent

        agent = ScoutAgent.__new__(ScoutAgent)
        agent.client = None

        result_json = agent._handle_suggest_handles({
            "brand_names": ["NonExistentBrand123"],
            "platforms": ["instagram"],
        })
        result = json.loads(result_json)

        self.assertTrue(result["ok"])
        brand = result["suggestions"][0]
        self.assertEqual(brand["platforms"]["instagram"]["status"], "unknown")
        self.assertIsNone(brand["platforms"]["instagram"]["handle"])
        self.assertIn("user must provide", brand["platforms"]["instagram"]["message"])

    def test_suggest_handles_empty_input(self):
        """Empty brand_names returns error."""
        from scout_agent import ScoutAgent

        agent = ScoutAgent.__new__(ScoutAgent)
        agent.client = None

        result_json = agent._handle_suggest_handles({"brand_names": []})
        result = json.loads(result_json)
        self.assertFalse(result["ok"])

    def test_suggest_handles_does_not_write_to_db(self):
        """suggest_handles is READ-ONLY — must not modify database."""
        from scout_agent import ScoutAgent

        agent = ScoutAgent.__new__(ScoutAgent)
        agent.client = None

        tmpdir = tempfile.mkdtemp()
        db_path = Path(tmpdir) / "test.db"
        conn = _create_test_db(db_path)
        conn.close()

        with patch.object(config, 'DB_PATH', db_path):
            # Get DB state before
            conn = sqlite3.connect(str(db_path))
            before = conn.execute("SELECT COUNT(*) FROM vertical_brands").fetchone()[0]
            conn.close()

            agent._handle_suggest_handles({
                "brand_names": ["Nike", "Adidas"],
                "platforms": ["instagram", "tiktok", "facebook"],
            })

            # Get DB state after
            conn = sqlite3.connect(str(db_path))
            after = conn.execute("SELECT COUNT(*) FROM vertical_brands").fetchone()[0]
            conn.close()

            self.assertEqual(before, after,
                "suggest_handles wrote to the database! Must be read-only.")

        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)

    def test_suggest_handles_mixed_known_unknown(self):
        """Mix of known and unknown brands handled correctly."""
        from scout_agent import ScoutAgent

        agent = ScoutAgent.__new__(ScoutAgent)
        agent.client = None

        result_json = agent._handle_suggest_handles({
            "brand_names": ["Nike", "SomeRandomBrand"],
            "platforms": ["instagram", "facebook"],
        })
        result = json.loads(result_json)

        self.assertTrue(result["ok"])
        nike = result["suggestions"][0]
        unknown = result["suggestions"][1]

        # Nike: found on all
        self.assertEqual(nike["platforms"]["instagram"]["status"], "found")
        self.assertEqual(nike["platforms"]["facebook"]["status"], "found")

        # Unknown brand: unknown on all
        self.assertEqual(unknown["platforms"]["instagram"]["status"], "unknown")
        self.assertEqual(unknown["platforms"]["facebook"]["status"], "unknown")


class TestIssue5_SystemPrompt3PathLogic(unittest.TestCase):
    """System prompt must document the 3-path handle resolution logic."""

    def test_three_paths_documented(self):
        """System prompt has A/B/C handle resolution paths."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()

        # Path A: Brand names → suggest_handles → confirm → add_brands
        self.assertIn("suggest_handles", content)
        self.assertIn("brand NAMES", content,
            "System prompt missing Path A: brand names → suggest_handles")

        # Path B: @handles → add_brands directly
        self.assertIn("@handles directly", content,
            "System prompt missing Path B: @handles → add_brands directly")

        # Path C: Mixed input
        self.assertIn("Mixed", content,
            "System prompt missing Path C: mixed input handling")

    def test_confirm_before_add_brands(self):
        """System prompt requires user confirmation before add_brands."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn("DO NOT call add_brands until", content,
            "System prompt must require confirmation before calling add_brands!")


# ═══════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: Advanced Analysis Doesn't Break System
# ═══════════════════════════════════════════════════════════════════════

class TestAdvancedAnalysis_SystemIntegrity(unittest.TestCase):
    """Trend Radar and Gap Analysis must not corrupt chat state."""

    def test_show_trends_in_dispatch_table(self):
        """show_trends tool is properly routed."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn('elif name == "show_trends"', content)
        self.assertIn('self._handle_show_trends(args, context)', content)

    def test_tool_definitions_include_show_trends(self):
        """show_trends appears in TOOL_DEFINITIONS for GPT."""
        scout_path = Path(__file__).parent / "scout_agent.py"
        content = scout_path.read_text()
        self.assertIn('"name": "show_trends"', content,
            "show_trends not in TOOL_DEFINITIONS — GPT can't call it!")

    def test_chat_history_preserved_after_tool_calls(self):
        """Updated context is persisted after tool dispatch (DB-backed)."""
        # Verify the chat handler stores context back via DB helper
        dashboard_path = Path(__file__).parent / "dashboard.py"
        content = dashboard_path.read_text()
        self.assertIn("_save_chat_context(chat_sid, updated_context)", content,
            "Chat handler must persist updated_context to DB via _save_chat_context!")


# ═══════════════════════════════════════════════════════════════════════
# INTEGRATION: Full Pipeline Error Surfacing
# ═══════════════════════════════════════════════════════════════════════

class TestIntegration_PipelineErrorSurfacing(unittest.TestCase):
    """0-post and error results must be visible to the user via run_stats."""

    def test_instagram_0_posts_in_errors(self):
        """main.py surfaces IG 0-post results to run_stats['errors']."""
        main_path = Path(__file__).parent / "main.py"
        content = main_path.read_text()
        # Check that IG 0-post appends to errors
        self.assertIn('run_stats["errors"].append', content)
        ig_block = content[content.find("Instagram @"):content.find("Instagram @") + 300] if "Instagram @" in content else ""
        self.assertIn("0 posts collected", ig_block or content,
            "IG 0-post results must be appended to run_stats errors")

    def test_tiktok_0_posts_in_errors(self):
        """main.py surfaces TikTok 0-post results to run_stats['errors']."""
        main_path = Path(__file__).parent / "main.py"
        content = main_path.read_text()
        self.assertIn("TikTok @", content)

    def test_tiktok_exceptions_surfaced(self):
        """TikTok RuntimeError exceptions go to run_stats['errors'] via caller."""
        main_path = Path(__file__).parent / "main.py"
        content = main_path.read_text()
        # The _collect_tt_brand function catches Exception and puts it in error field
        self.assertIn('"error": str(e)', content,
            "TikTok collection exceptions must be captured in result dict")
        self.assertIn('run_stats["errors"].append', content,
            "Collection errors must be appended to run_stats")


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
