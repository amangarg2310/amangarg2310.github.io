"""Data models for insights, playbooks, and related entities."""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class Insight:
    """Core unit of extracted knowledge."""
    source_video_id: str
    source_url: str
    source_title: str
    expert_name: str
    expert_channel: str
    title: str
    content: str
    insight_type: str  # framework|tactic|principle|case_study|contrarian_take|definition
    domain: str
    sub_domain: str
    actionability: str  # high|medium|low
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp_start: Optional[str] = None
    timestamp_end: Optional[str] = None
    key_quote: Optional[str] = None
    confidence: float = 0.5
    related_experts: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    embedding: Optional[list[float]] = None
    ingested_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    processed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_video_id": self.source_video_id,
            "source_url": self.source_url,
            "source_title": self.source_title,
            "expert_name": self.expert_name,
            "expert_channel": self.expert_channel,
            "timestamp_start": self.timestamp_start,
            "timestamp_end": self.timestamp_end,
            "domain": self.domain,
            "sub_domain": self.sub_domain,
            "insight_type": self.insight_type,
            "title": self.title,
            "content": self.content,
            "key_quote": self.key_quote,
            "actionability": self.actionability,
            "confidence": self.confidence,
            "related_experts": self.related_experts,
            "tags": self.tags,
            "ingested_at": self.ingested_at,
            "processed_at": self.processed_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Insight":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class PlaybookSection:
    title: str
    summary: str
    frameworks: list[dict] = field(default_factory=list)
    step_by_step: list[str] = field(default_factory=list)
    expert_consensus: str = ""
    dissenting_views: list[dict] = field(default_factory=list)
    key_sources: list[dict] = field(default_factory=list)


@dataclass
class Conflict:
    topic: str
    side_a: dict = field(default_factory=dict)
    side_b: dict = field(default_factory=dict)
    synthesis: str = ""


@dataclass
class Playbook:
    domain: str
    title: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    version: int = 1
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    total_sources: int = 0
    total_experts: int = 0
    sections: list[PlaybookSection] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "domain": self.domain,
            "title": self.title,
            "version": self.version,
            "generated_at": self.generated_at,
            "total_sources": self.total_sources,
            "total_experts": self.total_experts,
            "sections": [
                {
                    "title": s.title,
                    "summary": s.summary,
                    "frameworks": s.frameworks,
                    "step_by_step": s.step_by_step,
                    "expert_consensus": s.expert_consensus,
                    "dissenting_views": s.dissenting_views,
                    "key_sources": s.key_sources,
                }
                for s in self.sections
            ],
            "conflicts": [
                {
                    "topic": c.topic,
                    "side_a": c.side_a,
                    "side_b": c.side_b,
                    "synthesis": c.synthesis,
                }
                for c in self.conflicts
            ],
        }
