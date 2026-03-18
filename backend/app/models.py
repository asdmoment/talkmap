from pydantic import BaseModel, Field


class PartialSegment(BaseModel):
    id: str
    text: str
    start_ms: int
    end_ms: int


class CommittedSegment(BaseModel):
    id: str
    text: str
    start_ms: int
    end_ms: int


class SummaryBlock(BaseModel):
    id: str
    text: str


class MindmapNode(BaseModel):
    id: str
    label: str


class MindmapEdge(BaseModel):
    id: str
    source: str
    target: str


class SessionSnapshot(BaseModel):
    session_id: str
    title: str | None = None
    partial_segments: list[PartialSegment] = Field(default_factory=list)
    committed_segments: list[CommittedSegment] = Field(default_factory=list)
    summary_blocks: list[SummaryBlock] = Field(default_factory=list)
    mindmap_nodes: list[MindmapNode] = Field(default_factory=list)
    mindmap_edges: list[MindmapEdge] = Field(default_factory=list)
