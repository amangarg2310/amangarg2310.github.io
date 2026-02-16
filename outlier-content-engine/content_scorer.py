"""
Content Scorer — deterministic pre-publish content scoring engine.

Scores content concepts against learned outlier patterns in 5 dimensions:
  1. Format Fit (0-20)        — does the format match what works?
  2. Hook Strength (0-20)     — is the hook type effective?
  3. Pattern Alignment (0-20) — does the content match winning patterns?
  4. Voice Match (0-20)       — does the caption match the brand voice?
  5. Competitive Gap Fill (0-20) — does this fill a strategic gap?

Total: 0-100. No LLM calls — fast (<1s) and free ($0).
"""

import json
import logging
import re
import sqlite3
import statistics
from collections import Counter
from typing import Dict, List, Optional, Set

import config

logger = logging.getLogger(__name__)

# Stop words for keyword extraction
STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "if", "because", "while", "this", "that", "these",
    "those", "i", "me", "my", "we", "our", "you", "your", "it", "its",
    "they", "them", "their", "what", "which", "who", "whom",
}


def _detect_hook_type(caption: str) -> str:
    """Detect hook type from caption. Mirrors pattern_analyzer._detect_hook_type."""
    if not caption:
        return "none"
    first_line = caption.split('\n')[0].strip()[:200]
    fl = first_line.lower()

    if '?' in first_line:
        return "question"
    if any(w in fl for w in ['top', 'best', 'worst', '5 ', '3 ', '10 ', '7 ']):
        return "listicle"
    if any(w in fl for w in ['never', 'stop', "don't", 'warning', 'mistake', 'wrong', 'truth', 'secret', 'shocking']):
        return "curiosity_gap"
    if any(w in fl for w in ['how to', 'how i', 'tutorial', 'step by step', 'guide', 'learn']):
        return "educational"
    if any(w in fl for w in ['i just', 'i was', 'story time', 'so i', 'when i', 'this is']):
        return "story"
    return "statement"


def _extract_keywords(text: str) -> Set[str]:
    """Extract meaningful keywords from text."""
    words = re.findall(r'\b[a-z]+\b', text.lower())
    return {w for w in words if w not in STOP_WORDS and len(w) > 2}


def _jaccard_similarity(set_a: Set[str], set_b: Set[str]) -> float:
    """Jaccard similarity between two word sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


class ContentScorer:
    """Scores content concepts against learned outlier patterns."""

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH
        # Lazy-loaded caches
        self._outlier_data = None
        self._voice_data = None
        self._gap_data = None
        self._own_baselines = None

    def score_concept(self, concept: Dict) -> Dict:
        """
        Score a content concept.

        Args:
            concept: {
                "caption": str,
                "hook_line": str (optional),
                "format": str (optional, default "reel"),
                "platform": str (optional, default "instagram"),
            }

        Returns:
            {
                "overall_score": int (0-100),
                "breakdown": {dimension: {score, max, reasoning}},
                "predicted_engagement_range": {low, mid, high},
                "matching_patterns": [str],
                "trend_alignment": str,
                "suggestions": [str],
            }
        """
        caption = concept.get("caption", "")
        hook_line = concept.get("hook_line", "")
        format_choice = concept.get("format", "reel")
        platform = concept.get("platform", "instagram")

        # Load data once
        self._ensure_data_loaded()

        # Score each dimension
        format_score = self._score_format_fit(format_choice, platform)
        hook_score = self._score_hook_strength(hook_line or caption, caption)
        pattern_score = self._score_pattern_alignment(caption)
        voice_score = self._score_voice_match(caption)
        gap_score = self._score_competitive_gap(caption, format_choice)

        overall = (
            format_score["score"] +
            hook_score["score"] +
            pattern_score["score"] +
            voice_score["score"] +
            gap_score["score"]
        )

        # Build suggestions from low-scoring areas
        suggestions = []
        breakdown = {
            "format_fit": format_score,
            "hook_strength": hook_score,
            "pattern_alignment": pattern_score,
            "voice_match": voice_score,
            "competitive_gap_fill": gap_score,
        }

        for name, data in breakdown.items():
            if data["score"] < 12 and data.get("suggestion"):
                suggestions.append(data["suggestion"])

        # Predicted engagement range
        predicted = self._predict_engagement_range(overall)

        return {
            "overall_score": overall,
            "breakdown": breakdown,
            "predicted_engagement_range": predicted,
            "matching_patterns": pattern_score.get("matching_patterns", []),
            "trend_alignment": pattern_score.get("trend_alignment", "stable"),
            "suggestions": suggestions,
        }

    def _ensure_data_loaded(self):
        """Load outlier distributions, voice profile, and gap data once."""
        if self._outlier_data is not None:
            return

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Load outlier distributions
        rows = conn.execute("""
            SELECT ai_analysis, media_type, platform, outlier_score
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_outlier = 1
              AND COALESCE(is_own_channel, 0) = 0
              AND COALESCE(archived, 0) = 0
        """, (self.brand_profile,)).fetchall()

        hook_dist = Counter()
        format_dist = Counter()
        platform_format_dist = {}  # platform -> Counter of formats
        pattern_keywords = {}  # pattern_name -> set of keywords
        pattern_counts = Counter()

        for row in rows:
            fmt = row["media_type"] or "unknown"
            plat = row["platform"] or "instagram"
            format_dist[fmt] += 1

            if plat not in platform_format_dist:
                platform_format_dist[plat] = Counter()
            platform_format_dist[plat][fmt] += 1

            if row["ai_analysis"]:
                try:
                    analysis = json.loads(row["ai_analysis"])
                    hook = analysis.get("hook_type", "")
                    if hook:
                        hook_dist[hook] += 1
                    pattern = analysis.get("content_pattern", "")
                    if pattern:
                        pattern_counts[pattern] += 1
                        pattern_keywords[pattern] = _extract_keywords(pattern)
                except (json.JSONDecodeError, TypeError):
                    pass

        self._outlier_data = {
            "hook_dist": hook_dist,
            "format_dist": format_dist,
            "platform_format_dist": platform_format_dist,
            "pattern_keywords": pattern_keywords,
            "pattern_counts": pattern_counts,
            "total": len(rows),
        }

        # Load voice profile
        try:
            voice_row = conn.execute("""
                SELECT voice_data
                FROM voice_analysis
                WHERE brand_profile = ?
                ORDER BY analyzed_at DESC LIMIT 1
            """, (self.brand_profile,)).fetchone()
            if voice_row:
                self._voice_data = json.loads(voice_row["voice_data"])
        except (sqlite3.OperationalError, json.JSONDecodeError):
            pass

        # Load own-channel baselines
        own_rows = conn.execute("""
            SELECT likes, comments, saves, shares
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_own_channel = 1
              AND COALESCE(archived, 0) = 0
        """, (self.brand_profile,)).fetchall()

        if own_rows and len(own_rows) >= 3:
            engagements = [
                (r["likes"] or 0) + (r["comments"] or 0) +
                (r["saves"] or 0) + (r["shares"] or 0)
                for r in own_rows
            ]
            self._own_baselines = {
                "mean": statistics.mean(engagements),
                "median": statistics.median(engagements),
            }

        conn.close()

        # Load gap data
        try:
            from gap_analyzer import GapAnalyzer
            ga = GapAnalyzer(self.brand_profile, self.db_path)
            self._gap_data = ga.analyze_gaps()
        except Exception:
            self._gap_data = {"has_data": False}

    def _score_format_fit(self, format_choice: str, platform: str) -> Dict:
        """Score how well the chosen format matches what performs on this platform."""
        pf_dist = self._outlier_data.get("platform_format_dist", {}).get(platform)
        if not pf_dist:
            pf_dist = self._outlier_data.get("format_dist", Counter())

        if not pf_dist:
            return {"score": 10, "max": 20, "reasoning": "No outlier data yet — neutral score.",
                    "suggestion": "Run an analysis first for accurate format scoring."}

        total = sum(pf_dist.values())
        if total == 0:
            return {"score": 10, "max": 20, "reasoning": "No format data available."}

        # Rank formats by frequency
        ranked = pf_dist.most_common()
        top_format = ranked[0][0]
        top_pct = ranked[0][1] / total

        if format_choice == top_format:
            score = 20
            reasoning = f"{format_choice} is the top-performing format ({top_pct:.0%} of outliers)."
        elif format_choice in pf_dist:
            choice_pct = pf_dist[format_choice] / total
            score = max(4, int(20 * (choice_pct / top_pct)))
            reasoning = f"{format_choice} makes up {choice_pct:.0%} of outliers (top is {top_format} at {top_pct:.0%})."
        else:
            score = 4
            reasoning = f"{format_choice} isn't used in any outliers. Top format: {top_format}."

        suggestion = None
        if score < 12:
            suggestion = f"Consider switching to {top_format} — it dominates {top_pct:.0%} of outlier posts."

        return {"score": score, "max": 20, "reasoning": reasoning, "suggestion": suggestion}

    def _score_hook_strength(self, hook_text: str, full_caption: str) -> Dict:
        """Score the hook type against the distribution of successful hooks."""
        detected_hook = _detect_hook_type(hook_text)
        hook_dist = self._outlier_data.get("hook_dist", Counter())

        if not hook_dist:
            return {"score": 10, "max": 20, "reasoning": "No hook data yet.",
                    "suggestion": "Run analysis to build hook intelligence."}

        total = sum(hook_dist.values())
        ranked = hook_dist.most_common()
        top_hook = ranked[0][0]
        top_pct = ranked[0][1] / total if total else 0

        # Base score: does the caption have any clear hook?
        has_hook = detected_hook != "statement"  # statement is the fallback
        hook_base = 8 if has_hook else 4

        # Bonus: does the hook type match top performers?
        if detected_hook in hook_dist:
            hook_pct = hook_dist[detected_hook] / total
            hook_rank_bonus = int(12 * (hook_pct / max(top_pct, 0.01)))
        else:
            hook_rank_bonus = 2

        score = min(20, hook_base + hook_rank_bonus)
        reasoning = f"Detected hook: {detected_hook}. Top hook type: {top_hook} ({top_pct:.0%} of outliers)."

        suggestion = None
        if score < 12:
            suggestion = f"Try a {top_hook} hook — it drives {top_pct:.0%} of outlier engagement."

        return {"score": score, "max": 20, "reasoning": reasoning,
                "detected_hook": detected_hook, "suggestion": suggestion}

    def _score_pattern_alignment(self, caption: str) -> Dict:
        """Score how well the caption aligns with top-performing content patterns."""
        pattern_keywords = self._outlier_data.get("pattern_keywords", {})
        pattern_counts = self._outlier_data.get("pattern_counts", Counter())

        if not pattern_keywords:
            return {"score": 10, "max": 20, "reasoning": "No pattern data yet.",
                    "matching_patterns": [], "trend_alignment": "unknown"}

        caption_keywords = _extract_keywords(caption)

        # Find best-matching patterns
        matches = []
        for pattern_name, kw_set in pattern_keywords.items():
            sim = _jaccard_similarity(caption_keywords, kw_set)
            if sim > 0.05:
                matches.append({
                    "name": pattern_name,
                    "similarity": sim,
                    "count": pattern_counts.get(pattern_name, 0),
                })

        matches.sort(key=lambda x: x["similarity"], reverse=True)
        matching_patterns = [m["name"] for m in matches[:3]]

        if matches:
            best_sim = matches[0]["similarity"]
            score = min(20, int(20 * min(best_sim * 3, 1.0)))  # Scale up since Jaccard is usually low
            reasoning = f"Matches patterns: {', '.join(matching_patterns[:2])} (similarity: {best_sim:.2f})."
        else:
            score = 6
            top_patterns = [p[0] for p in pattern_counts.most_common(2)]
            reasoning = f"Low alignment with known patterns. Top patterns: {', '.join(top_patterns)}."

        suggestion = None
        if score < 12 and pattern_counts:
            top = pattern_counts.most_common(1)[0][0]
            suggestion = f"Lean into the '{top}' pattern — it's the most common in outlier posts."

        return {"score": score, "max": 20, "reasoning": reasoning,
                "matching_patterns": matching_patterns, "trend_alignment": "stable",
                "suggestion": suggestion}

    def _score_voice_match(self, caption: str) -> Dict:
        """Score how well the caption matches the brand's learned voice profile."""
        if not self._voice_data:
            return {"score": 10, "max": 20,
                    "reasoning": "No voice profile yet. Set up own-brand handle and run analysis.",
                    "suggestion": "Add your brand's Instagram handle in Settings to enable voice matching."}

        score = 0
        details = []

        # 1. Formality check (4 points)
        vocab = self._voice_data.get("vocabulary", {})
        formality = vocab.get("formality", "balanced")
        caption_words = caption.split()
        avg_word_len = sum(len(w) for w in caption_words) / max(len(caption_words), 1)

        if formality == "casual" and avg_word_len < 5.5:
            score += 4
            details.append("Formality matches (casual)")
        elif formality == "elevated" and avg_word_len > 5.0:
            score += 4
            details.append("Formality matches (elevated)")
        elif formality == "balanced":
            score += 3
            details.append("Balanced formality")
        else:
            score += 1
            details.append(f"Formality mismatch (brand is {formality})")

        # 2. Caption length check (4 points)
        pref_length = self._voice_data.get("caption_length", "medium")
        word_count = len(caption_words)
        if pref_length == "micro" and word_count < 20:
            score += 4
        elif pref_length == "short" and word_count < 50:
            score += 4
        elif pref_length == "medium" and 30 <= word_count <= 150:
            score += 4
        elif pref_length == "long" and word_count > 100:
            score += 4
        else:
            score += 1
            details.append(f"Caption length mismatch (brand prefers {pref_length})")

        # 3. Emoji usage (4 points)
        emoji_pref = self._voice_data.get("emoji_usage", "minimal")
        emoji_count = len(re.findall(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\u2600-\u26FF\u2700-\u27BF]', caption))
        if emoji_pref == "none" and emoji_count == 0:
            score += 4
        elif emoji_pref == "minimal" and emoji_count <= 2:
            score += 4
        elif emoji_pref == "moderate" and 1 <= emoji_count <= 5:
            score += 4
        elif emoji_pref == "heavy" and emoji_count > 3:
            score += 4
        else:
            score += 1

        # 4. Distinctive phrases overlap (4 points)
        distinctive = vocab.get("distinctive_phrases", [])
        if distinctive:
            caption_lower = caption.lower()
            matches = sum(1 for p in distinctive if p.lower() in caption_lower)
            if matches >= 2:
                score += 4
                details.append(f"Uses {matches} brand phrases")
            elif matches == 1:
                score += 3
            else:
                score += 1
        else:
            score += 2  # No phrases to compare

        # 5. Sentence structure (4 points)
        sp = self._voice_data.get("sentence_patterns", {})
        uses_fragments = sp.get("uses_fragments", False)
        sentences = [s.strip() for s in re.split(r'[.!?]+', caption) if s.strip()]
        has_fragments = any(len(s.split()) < 4 for s in sentences) if sentences else False

        if uses_fragments == has_fragments:
            score += 4
        else:
            score += 2

        reasoning = f"Voice match: {', '.join(details[:3]) if details else 'Good alignment'}."

        suggestion = None
        if score < 12:
            tips = []
            if distinctive:
                tips.append(f"Try using phrases like: \"{distinctive[0]}\"")
            tips.append(f"Brand prefers {pref_length} captions with {emoji_pref} emoji usage")
            suggestion = ". ".join(tips)

        return {"score": score, "max": 20, "reasoning": reasoning, "suggestion": suggestion}

    def _score_competitive_gap(self, caption: str, format_choice: str) -> Dict:
        """Score whether this concept fills a strategic gap."""
        if not self._gap_data or not self._gap_data.get("has_data"):
            return {"score": 10, "max": 20,
                    "reasoning": "Gap analysis not available yet.",
                    "suggestion": "Set up own-brand handle and run analysis for gap scoring."}

        score = 0
        fills = []

        # Check if format fills a gap
        missing_formats = self._gap_data.get("missing_formats", [])
        for gap in missing_formats:
            if gap["format"] == format_choice:
                score += 7
                fills.append(f"Uses untapped format: {format_choice}")
                break

        # Check if hook type fills a gap
        detected_hook = _detect_hook_type(caption)
        missing_hooks = self._gap_data.get("missing_hooks", [])
        for gap in missing_hooks:
            if gap["hook_type"] == detected_hook:
                score += 7
                fills.append(f"Uses untapped hook: {detected_hook}")
                break

        # Check if content matches a missing pattern
        missing_patterns = self._gap_data.get("missing_patterns", [])
        caption_kw = _extract_keywords(caption)
        for gap in missing_patterns:
            pattern_kw = _extract_keywords(gap["pattern"])
            if _jaccard_similarity(caption_kw, pattern_kw) > 0.1:
                score += 6
                fills.append(f"Fills pattern gap: {gap['pattern']}")
                break

        # If nothing fills a gap, still give some credit
        if score == 0:
            score = 8
            reasoning = "This concept doesn't fill any identified competitive gaps."
        else:
            score = min(20, score)
            reasoning = f"Gap fills: {', '.join(fills)}."

        suggestion = None
        if score < 12 and missing_hooks:
            suggestion = f"Try a {missing_hooks[0]['hook_type']} hook — competitors get {missing_hooks[0]['competitor_count']} outliers from it but you haven't used it."

        return {"score": score, "max": 20, "reasoning": reasoning, "suggestion": suggestion}

    def store_score(self, concept: Dict, result: Dict,
                    parent_score_id: int = None) -> int:
        """Store a scored concept in the database. Returns score ID."""
        return store_score(
            self.brand_profile, concept, result,
            parent_score_id=parent_score_id, db_path=self.db_path,
        )

    def _predict_engagement_range(self, overall_score: int) -> Dict:
        """Map overall score to predicted engagement range."""
        if self._own_baselines:
            base = self._own_baselines["mean"]
        else:
            base = 500  # Fallback estimate

        if overall_score >= 80:
            return {"low": int(base * 2), "mid": int(base * 3), "high": int(base * 4)}
        elif overall_score >= 60:
            return {"low": int(base * 1.5), "mid": int(base * 2), "high": int(base * 2.5)}
        elif overall_score >= 40:
            return {"low": int(base * 0.8), "mid": int(base * 1.2), "high": int(base * 1.5)}
        else:
            return {"low": int(base * 0.3), "mid": int(base * 0.6), "high": int(base * 1.0)}


def store_score(brand_profile: str, concept: Dict, result: Dict,
                parent_score_id: int = None, db_path=None) -> int:
    """Store a scored concept and return the score ID."""
    from datetime import datetime, timezone

    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    now = datetime.now(timezone.utc).isoformat()

    version = 1
    if parent_score_id:
        row = conn.execute(
            "SELECT version FROM content_scores WHERE id = ?", (parent_score_id,)
        ).fetchone()
        if row:
            version = row[0] + 1

    cursor = conn.execute("""
        INSERT INTO content_scores
            (brand_profile, concept_text, hook_line, format_choice, platform,
             score_data, overall_score, predicted_engagement_range,
             optimization_suggestions, version, parent_score_id, scored_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        brand_profile,
        concept.get("caption", ""),
        concept.get("hook_line", ""),
        concept.get("format", "reel"),
        concept.get("platform", "instagram"),
        json.dumps(result.get("breakdown", {})),
        result["overall_score"],
        json.dumps(result.get("predicted_engagement_range", {})),
        json.dumps(result.get("suggestions", [])),
        version,
        parent_score_id,
        now,
    ))

    score_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return score_id
