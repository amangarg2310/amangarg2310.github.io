"""
Test TikTok collection to diagnose why no TikTok posts are being collected.
"""
import logging
import sys

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

def test_tiktok_collection():
    """Test TikTok collection with configured handles."""

    # Check API keys
    logger.info("=" * 60)
    logger.info("STEP 1: Checking API key configuration")
    logger.info("=" * 60)

    import config

    apify_key = config.get_api_key('apify')

    logger.info(f"Apify key: {'✓ Present (' + str(len(apify_key)) + ' chars)' if apify_key else '✗ Missing'}")

    # Check database for TikTok handles
    logger.info("")
    logger.info("=" * 60)
    logger.info("STEP 2: Checking configured TikTok handles")
    logger.info("=" * 60)

    import sqlite3
    conn = sqlite3.connect(str(config.DB_PATH))
    cursor = conn.execute("""
        SELECT vertical_name, brand_name, tiktok_handle
        FROM vertical_brands
        WHERE tiktok_handle IS NOT NULL
    """)
    tt_handles = cursor.fetchall()
    conn.close()

    if tt_handles:
        logger.info(f"Found {len(tt_handles)} TikTok handles configured:")
        for vertical, brand, handle in tt_handles:
            logger.info(f"  - {vertical}/{brand}: @{handle}")
    else:
        logger.error("✗ No TikTok handles configured in database!")
        return False

    # Test collector import
    logger.info("")
    logger.info("=" * 60)
    logger.info("STEP 3: Testing TikTok collector import")
    logger.info("=" * 60)

    try:
        from collectors.tiktok import create_tiktok_collector
        logger.info("✓ TikTok collector module imported successfully")
    except ImportError as e:
        logger.error(f"✗ Failed to import TikTok collector: {e}")
        return False

    # Create collector instance
    logger.info("")
    logger.info("=" * 60)
    logger.info("STEP 4: Creating Apify TikTok collector")
    logger.info("=" * 60)

    try:
        collector = create_tiktok_collector()
        logger.info(f"✓ Created {collector.__class__.__name__}")
    except Exception as e:
        logger.error(f"✗ Failed to create collector: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Test collection with first handle
    logger.info("")
    logger.info("=" * 60)
    logger.info("STEP 5: Testing collection with first handle")
    logger.info("=" * 60)

    test_handle = tt_handles[0][2]  # tiktok_handle from first row
    test_brand = tt_handles[0][1] or test_handle

    logger.info(f"Testing with handle: @{test_handle}")

    try:
        posts = collector.collect_posts(
            handle=test_handle,
            competitor_name=test_brand,
            count=3  # Just collect 3 posts for testing
        )

        logger.info(f"✓ Collection successful! Received {len(posts)} posts")

        if posts:
            logger.info("Sample post data:")
            sample = posts[0]
            logger.info(f"  Post ID: {sample.get('post_id', 'N/A')}")
            logger.info(f"  Caption: {sample.get('caption', 'N/A')[:50]}...")
            logger.info(f"  Likes: {sample.get('likes', 0)}")
            logger.info(f"  Views: {sample.get('views', 0)}")
        else:
            logger.warning("Collection returned 0 posts - handle may have no recent content")

        return True

    except Exception as e:
        logger.error(f"✗ Collection failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logger.info("TikTok Collection Diagnostic Test")
    logger.info("")

    success = test_tiktok_collection()

    logger.info("")
    logger.info("=" * 60)
    if success:
        logger.info("✓ DIAGNOSIS: TikTok collection is working!")
        logger.info("The issue may be:")
        logger.info("  1. Analysis run with --skip-collect flag")
        logger.info("  2. tt_competitors list not being populated in main.py")
        logger.info("  3. Silent exception during parallel collection")
    else:
        logger.info("✗ DIAGNOSIS: TikTok collection has issues")
        logger.info("Check the errors above for details")
    logger.info("=" * 60)

    sys.exit(0 if success else 1)
