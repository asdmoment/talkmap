import hashlib
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from app.llm.base import JsonLlmClient
from app.models import CommittedSegment, MindmapEdge, MindmapNode, SummaryBlock
from app.ws import GraphUpdatedEvent, SummaryUpdatedEvent


class StrictMindmapNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str


class StrictMindmapEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: str
    target: str


class RollingSummaryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    bullets: list[str]
    action_items: list[str]
    nodes: list[StrictMindmapNode]
    edges: list[StrictMindmapEdge]


class RollingSummaryResult(BaseModel):
    summary: str
    bullets: list[str]
    action_items: list[str]
    nodes: list[MindmapNode]
    edges: list[MindmapEdge]
    summary_blocks: list[SummaryBlock]

    def to_summary_event(self) -> SummaryUpdatedEvent:
        return SummaryUpdatedEvent(blocks=self.summary_blocks)

    def to_graph_event(self) -> GraphUpdatedEvent:
        return GraphUpdatedEvent(nodes=self.nodes, edges=self.edges)


class RollingSummarizerService:
    def __init__(
        self,
        *,
        client: JsonLlmClient,
        prompt_path: Path | None = None,
    ) -> None:
        self._client = client
        resolved_prompt_path = (
            prompt_path
            or Path(__file__).resolve().parent.parent
            / "prompts"
            / "rolling_summary.txt"
        )
        self._prompt = resolved_prompt_path.read_text(encoding="utf-8")
        self._last_transcript_hash: str | None = None
        self._last_result: RollingSummaryResult | None = None

    async def summarize(
        self, *, committed_segments: list[CommittedSegment]
    ) -> RollingSummaryResult:
        transcript = _format_transcript(committed_segments)
        transcript_hash = hashlib.sha256(transcript.encode()).hexdigest()

        if transcript_hash == self._last_transcript_hash and self._last_result is not None:
            return self._last_result

        payload = RollingSummaryPayload.model_validate(
            await self._client.complete_json(
                prompt=self._prompt,
                transcript=transcript,
            )
        )
        summary_blocks = _build_summary_blocks(payload)

        result = RollingSummaryResult(
            summary=payload.summary,
            bullets=payload.bullets,
            action_items=payload.action_items,
            nodes=[
                MindmapNode.model_validate(node.model_dump()) for node in payload.nodes
            ],
            edges=[
                MindmapEdge.model_validate(edge.model_dump()) for edge in payload.edges
            ],
            summary_blocks=summary_blocks,
        )

        self._last_transcript_hash = transcript_hash
        self._last_result = result
        return result


def _format_transcript(committed_segments: list[CommittedSegment]) -> str:
    return "\n".join(f"[{segment.id}] {segment.text}" for segment in committed_segments)


def _build_summary_blocks(payload: RollingSummaryPayload) -> list[SummaryBlock]:
    summary_blocks = [SummaryBlock(id="summary:0", text=payload.summary)]

    summary_blocks.extend(
        SummaryBlock(id=f"bullet:{index}", text=text)
        for index, text in enumerate(payload.bullets)
    )
    summary_blocks.extend(
        SummaryBlock(id=f"action:{index}", text=text)
        for index, text in enumerate(payload.action_items)
    )

    return summary_blocks
