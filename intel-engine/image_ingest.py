"""
Image ingestion — extract information from screenshots and images using OpenAI Vision API.

Uses GPT-4o-mini's vision capability to describe images, extract text (OCR-like),
and identify key information.
"""

import base64
import logging
from pathlib import Path

from openai import OpenAI

import config

logger = logging.getLogger(__name__)

VISION_PROMPT = """Analyze this image thoroughly. Your goal is to extract ALL useful information.

1. **Describe** what the image shows (UI screenshot, diagram, chart, photo, document, etc.)
2. **Extract ALL visible text** exactly as written — preserve formatting, headings, labels, code snippets, URLs, etc.
3. **Identify key information**: data points, settings, configurations, steps shown, error messages, file paths, tool names, etc.
4. **If it's a diagram or flowchart**: describe the structure, connections, and what it represents.
5. **If it's a screenshot of code or terminal**: transcribe the code/output exactly.

Be thorough and specific. This text will be used to build a knowledge base, so every detail matters.
Present your analysis as clear, structured text that captures everything someone would learn from looking at this image."""


def get_image_media_type(file_path: str) -> str:
    """Get the MIME type for an image file."""
    ext = Path(file_path).suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return media_types.get(ext, "image/png")


def ingest_image(file_path: str) -> str:
    """
    Analyze an image using OpenAI Vision API and return extracted text content.

    Returns the full text description/extraction from the image.
    """
    api_key = config.get_api_key("openai")
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    # Read and base64-encode the image
    with open(file_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    media_type = get_image_media_type(file_path)
    data_url = f"data:{media_type};base64,{image_data}"

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url, "detail": "high"},
                    },
                ],
            }
        ],
        max_tokens=4000,
        temperature=0.2,
    )

    text_content = response.choices[0].message.content.strip()
    logger.info(f"Extracted {len(text_content)} chars from image via Vision API")
    return text_content
