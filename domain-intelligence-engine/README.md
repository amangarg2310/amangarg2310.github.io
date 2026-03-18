# Domain Intelligence Engine

A domain intelligence engine that ingests expert content (starting with YouTube transcripts), processes it through an LLM pipeline, stores structured insights in a vector database, and serves synthesized playbooks and answers via a RAG interface.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys

# 3. Set up Supabase schema
python scripts/setup_supabase.py
# Copy the printed SQL and run it in your Supabase SQL Editor

# 4. Ingest a video
python scripts/ingest_video.py https://www.youtube.com/watch?v=VIDEO_ID

# 5. Run the processing pipeline
python scripts/run_pipeline.py

# 6. Launch the Streamlit app
streamlit run app/streamlit_app.py
```

## CLI Scripts

| Script | Description |
|--------|-------------|
| `scripts/ingest_video.py <url>` | Ingest a single YouTube video transcript |
| `scripts/ingest_channel.py <url>` | Ingest all videos from a channel |
| `scripts/ingest_playlist.py <url>` | Ingest all videos from a playlist |
| `scripts/run_pipeline.py` | Process ingested videos through the full pipeline |
| `scripts/generate_playbook.py <domain>` | Generate a playbook for a domain |
| `scripts/setup_supabase.py` | Print the Supabase schema SQL |

## Running Tests

```bash
pip install pytest
pytest tests/
```
