"""
Trend Radar -- forward-looking trend detection for TikTok sounds and hashtags.

Detects viral signals BEFORE they peak using velocity (growth rate)
rather than volume. A sound with 500 uses growing at 400%/hour is a
better signal than one with 50,000 uses that peaked yesterday.

Components:
  collector.py  -- Aggregates sound/hashtag counts from existing DB data
  scorer.py     -- Velocity calculation + composite scoring engine
"""
