"""Generate embeddings for text chunks using OpenAI or Voyage AI."""

import logging
import time
from typing import Optional

import openai

from config.settings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, OPENAI_API_KEY

logger = logging.getLogger(__name__)


def generate_embedding(
    text: str,
    model: Optional[str] = None,
    max_retries: int = 3,
) -> list[float]:
    """Generate an embedding vector for a single text string."""
    model = model or EMBEDDING_MODEL
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    for attempt in range(max_retries):
        try:
            response = client.embeddings.create(
                input=text,
                model=model,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            return response.data[0].embedding

        except openai.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Embedding rate limited, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Embedding retry {attempt + 1}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to generate embedding: {e}")
                raise

    return []


def generate_embeddings_batch(
    texts: list[str],
    model: Optional[str] = None,
    batch_size: int = 100,
    max_retries: int = 3,
) -> list[list[float]]:
    """Generate embeddings for a batch of texts."""
    model = model or EMBEDDING_MODEL
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]

        for attempt in range(max_retries):
            try:
                response = client.embeddings.create(
                    input=batch,
                    model=model,
                    dimensions=EMBEDDING_DIMENSIONS,
                )
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)
                break

            except openai.RateLimitError:
                wait = 2 ** (attempt + 2)
                logger.warning(f"Batch embedding rate limited, waiting {wait}s...")
                time.sleep(wait)

            except Exception as e:
                if attempt < max_retries - 1:
                    wait = 2 ** (attempt + 1)
                    logger.warning(f"Batch embedding retry {attempt + 1}: {e}")
                    time.sleep(wait)
                else:
                    logger.error(f"Failed to generate batch embeddings: {e}")
                    raise

    logger.info(f"Generated {len(all_embeddings)} embeddings")
    return all_embeddings
