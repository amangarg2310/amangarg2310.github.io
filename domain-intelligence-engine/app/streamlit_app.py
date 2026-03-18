"""Streamlit frontend for the Domain Intelligence Engine."""

import json
import sys
from pathlib import Path

import streamlit as st
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import CONFIG_DIR, PROJECT_ROOT

# Page config
st.set_page_config(
    page_title="Domain Intelligence Engine",
    page_icon="🧠",
    layout="wide",
)

# Custom styling
st.markdown("""
<style>
    :root {
        --sage: #87A878;
        --cream: #F5F0E8;
        --terracotta: #C67B5C;
        --charcoal: #2D2D2D;
    }
    .stApp {
        background-color: var(--cream);
    }
    .main-header {
        color: var(--charcoal);
        font-size: 2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        color: var(--sage);
        font-size: 1.1rem;
        margin-bottom: 2rem;
    }
    .source-card {
        background: white;
        border-radius: 8px;
        padding: 12px;
        margin: 8px 0;
        border-left: 4px solid var(--sage);
    }
    .insight-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    .badge-high { background: #E8F5E9; color: #2E7D32; }
    .badge-medium { background: #FFF3E0; color: #E65100; }
    .badge-low { background: #ECEFF1; color: #546E7A; }
</style>
""", unsafe_allow_html=True)


def load_domains():
    with open(CONFIG_DIR / "domains.yaml") as f:
        return yaml.safe_load(f)["domains"]


# Sidebar
with st.sidebar:
    st.markdown('<p class="main-header">🧠 Domain Intelligence</p>', unsafe_allow_html=True)
    st.markdown('<p class="sub-header">Ask your domain expert anything</p>', unsafe_allow_html=True)

    domains = load_domains()
    domain_options = {"All Domains": None}
    for key, val in domains.items():
        domain_options[val["name"]] = key

    selected_domain_name = st.selectbox("Domain", list(domain_options.keys()))
    selected_domain = domain_options[selected_domain_name]

    st.divider()
    tab_selection = st.radio("View", ["Chat", "Playbooks", "Sources", "Recent"])

# Main content
if tab_selection == "Chat":
    st.markdown("### Ask a Question")
    st.markdown("Get synthesized answers from expert knowledge across all ingested content.")

    # Chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
            if message.get("sources"):
                with st.expander(f"📚 {len(message['sources'])} sources"):
                    for src in message["sources"]:
                        st.markdown(
                            f"**{src.get('expert', 'Unknown')}** — "
                            f"*{src.get('source_title', 'Unknown')}*"
                        )
                        if src.get("source_url"):
                            st.markdown(f"[Watch]({src['source_url']})")

    if prompt := st.chat_input("What would you like to know?"):
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            with st.spinner("Searching knowledge base..."):
                try:
                    from query.rag_engine import answer_question
                    result = answer_question(prompt, domain=selected_domain)
                    st.markdown(result["answer"])

                    if result["sources"]:
                        with st.expander(f"📚 {len(result['sources'])} sources"):
                            for src in result["sources"]:
                                st.markdown(
                                    f"**{src.get('expert', 'Unknown')}** — "
                                    f"*{src.get('source_title', 'Unknown')}*"
                                )

                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": result["answer"],
                        "sources": result["sources"],
                    })
                except Exception as e:
                    error_msg = f"Error: {e}. Make sure your .env is configured and Supabase is set up."
                    st.error(error_msg)
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": error_msg,
                    })

elif tab_selection == "Playbooks":
    st.markdown("### Domain Playbooks")

    playbook_dir = PROJECT_ROOT / "playbooks_output"
    if playbook_dir.exists():
        playbook_files = list(playbook_dir.glob("*.json"))
        if playbook_files:
            for pf in playbook_files:
                with open(pf) as f:
                    playbook = json.load(f)

                st.markdown(f"#### {playbook.get('title', pf.stem)}")
                st.markdown(
                    f"*{playbook.get('total_sources', 0)} sources, "
                    f"{playbook.get('total_experts', 0)} experts*"
                )

                for section in playbook.get("sections", []):
                    with st.expander(section.get("title", "Section")):
                        st.markdown(section.get("summary", ""))
                        if section.get("frameworks"):
                            st.markdown("**Frameworks:**")
                            for fw in section["frameworks"]:
                                if isinstance(fw, dict):
                                    st.markdown(f"- {fw.get('name', '')}: {fw.get('description', '')}")
                                else:
                                    st.markdown(f"- {fw}")

                if playbook.get("conflicts"):
                    st.markdown("#### Expert Disagreements")
                    for conflict in playbook["conflicts"]:
                        with st.expander(f"⚡ {conflict.get('topic', 'Conflict')}"):
                            st.markdown(f"**Side A:** {conflict.get('side_a', {}).get('position', '')}")
                            st.markdown(f"**Side B:** {conflict.get('side_b', {}).get('position', '')}")
                            st.markdown(f"**Synthesis:** {conflict.get('synthesis', '')}")
        else:
            st.info("No playbooks generated yet. Run `python scripts/generate_playbook.py <domain>` to create one.")
    else:
        st.info("No playbooks directory found. Generate playbooks first.")

elif tab_selection == "Sources":
    st.markdown("### Source Explorer")

    try:
        from ingestion.source_registry import SourceRegistry
        registry = SourceRegistry()
        sources = registry.get_all()

        if sources:
            stats = registry.stats()
            cols = st.columns(len(stats))
            for i, (status, count) in enumerate(stats.items()):
                cols[i].metric(status.title(), count)

            st.divider()
            for source in sources:
                with st.expander(f"{source.get('title', source['video_id'])} — {source.get('channel', 'Unknown')}"):
                    st.markdown(f"**Status:** {source['status']}")
                    st.markdown(f"**Video ID:** {source['video_id']}")
                    if source.get("ingested_at"):
                        st.markdown(f"**Ingested:** {source['ingested_at']}")
                    if source.get("error"):
                        st.error(source["error"])
        else:
            st.info("No sources ingested yet. Run `python scripts/ingest_video.py <url>` to start.")
    except Exception as e:
        st.error(f"Could not load source registry: {e}")

elif tab_selection == "Recent":
    st.markdown("### Recently Ingested")

    try:
        from ingestion.source_registry import SourceRegistry
        registry = SourceRegistry()
        sources = registry.get_all()[:20]

        if sources:
            for source in sources:
                status_color = {
                    "pending": "🟡",
                    "ingested": "🟢",
                    "processed": "✅",
                    "error": "🔴",
                }.get(source["status"], "⚪")

                st.markdown(
                    f"{status_color} **{source.get('title', source['video_id'])}** "
                    f"— {source.get('channel', 'Unknown')} "
                    f"({source['status']})"
                )
        else:
            st.info("Nothing ingested yet.")
    except Exception as e:
        st.error(f"Could not load recent sources: {e}")
