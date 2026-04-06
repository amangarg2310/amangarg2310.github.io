"""
Visual generation — creates interactive HTML/SVG visualizations from domain synthesis.

Uses the Anthropic Claude API to generate clean, interactive HTML+SVG infographics,
flowcharts, timelines, and concept maps from synthesis content.
"""

import logging

import config

logger = logging.getLogger(__name__)

VISUAL_PROMPT = """Create an interactive, self-contained HTML visualization that summarizes the key concepts, workflows, and relationships from this knowledge base.

REQUIREMENTS:
1. Use HTML + inline CSS + inline SVG — everything in a single HTML document
2. Make it visually clear and professional — clean layout, good typography, color-coded sections
3. Use a style inspired by modern infographics: sections with icons (Unicode emoji), connecting arrows or flow indicators, color-coded categories
4. Include: key workflows as numbered steps, important tools/concepts as labeled nodes, warnings as highlighted callouts
5. Make it interactive where helpful: hover effects for details, clickable sections that highlight
6. The visualization should help someone quickly understand the structure and key takeaways of this domain
7. Keep text concise — use short labels and phrases, not full sentences
8. Use a light background, modern sans-serif fonts, and a cohesive color palette
9. The HTML must be completely self-contained (no external resources)
10. Target dimensions: approximately 900px wide, flexible height

KNOWLEDGE BASE CONTENT:
{synthesis}

Return ONLY the complete HTML document (starting with <!DOCTYPE html> or <html>), no explanation or markdown."""


def generate_visual(synthesis_content: str) -> str | None:
    """
    Generate an interactive HTML/SVG visualization from synthesis content.

    Returns the HTML string, or None if generation fails.
    """
    api_key = config.get_api_key('anthropic')
    if not api_key:
        logger.warning("Anthropic API key not configured, cannot generate visual")
        return None

    try:
        import anthropic
    except ImportError:
        logger.error("anthropic package not installed. Run: pip install anthropic")
        return None

    # Truncate synthesis to fit in context (~4000 words max for the prompt)
    words = synthesis_content.split()
    if len(words) > 4000:
        truncated = " ".join(words[:4000]) + "\n\n[... truncated for length ...]"
    else:
        truncated = synthesis_content

    try:
        client = anthropic.Anthropic(api_key=api_key)

        message = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=8000,
            messages=[
                {
                    "role": "user",
                    "content": VISUAL_PROMPT.format(synthesis=truncated),
                }
            ],
        )

        html_content = message.content[0].text.strip()

        # Strip markdown code fences if present
        if html_content.startswith("```"):
            lines = html_content.split("\n")
            # Remove first line (```html or ```)
            lines = lines[1:]
            # Remove last line if it's ```)
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            html_content = "\n".join(lines).strip()

        # Validate it looks like HTML
        if not html_content or ("<" not in html_content):
            logger.warning("Claude returned non-HTML content for visual generation")
            return None

        logger.info(f"Generated visual: {len(html_content)} chars of HTML")
        return html_content

    except Exception as e:
        logger.error(f"Visual generation failed: {e}")
        return None
