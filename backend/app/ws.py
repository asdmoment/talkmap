from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

from .config import Settings, get_settings
from .models import (
    CommittedSegment,
    MindmapEdge,
    MindmapNode,
    PartialSegment,
    SessionSnapshot,
    SummaryBlock,
)
from .routes.export import get_session_store
from .session_store import SessionStore


class SessionStartedEvent(BaseModel):
    type: Literal["session_started"] = "session_started"
    session_id: str
    snapshot: SessionSnapshot


class PartialTranscriptEvent(BaseModel):
    type: Literal["partial_transcript"] = "partial_transcript"
    segment: PartialSegment


class CommittedTranscriptEvent(BaseModel):
    type: Literal["committed_transcript"] = "committed_transcript"
    segment: CommittedSegment


class SummaryUpdatedEvent(BaseModel):
    type: Literal["summary_updated"] = "summary_updated"
    blocks: list[SummaryBlock]


class GraphUpdatedEvent(BaseModel):
    type: Literal["graph_updated"] = "graph_updated"
    nodes: list[MindmapNode]
    edges: list[MindmapEdge]


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class UtteranceMessage(BaseModel):
    type: Literal["utterance"] = "utterance"
    utterance_id: str
    sample_rate: int = 16000
    samples: list[float]


SessionEvent = (
    SessionStartedEvent
    | PartialTranscriptEvent
    | CommittedTranscriptEvent
    | SummaryUpdatedEvent
    | GraphUpdatedEvent
    | ErrorEvent
)

router = APIRouter()


def get_transcribe_service(
    settings: Settings = Depends(get_settings),
) -> Any:
    from .asr.faster_whisper_engine import FasterWhisperEngine
    from .services.transcribe_stream import TranscribeStreamService

    return TranscribeStreamService(
        FasterWhisperEngine(
            settings.asr_model,
            device=settings.asr_device,
            compute_type=settings.asr_compute_type,
        )
    )


def get_summarizer_service(
    settings: Settings = Depends(get_settings),
) -> Any:
    from .llm.ollama_client import OllamaClient
    from .llm.openai_compatible_client import OpenAiCompatibleClient
    from .services.summarizer import RollingSummarizerService

    if settings.llm_provider == "ollama":
        client = OllamaClient(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            timeout_s=settings.ollama_timeout_seconds,
        )
    elif settings.llm_provider == "lmstudio":
        client = OpenAiCompatibleClient(
            model=settings.lmstudio_model,
            base_url=settings.lmstudio_base_url,
        )
    elif settings.llm_provider == "openai":
        client = OpenAiCompatibleClient(
            model=settings.openai_model,
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )
    elif settings.llm_provider == "openrouter":
        client = OpenAiCompatibleClient(
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")

    return RollingSummarizerService(client=client)


@router.websocket("/ws/session")
async def session_websocket(
    websocket: WebSocket,
    session_store: SessionStore = Depends(get_session_store),
    transcribe_service: Any = Depends(get_transcribe_service),
    summarizer_service: Any = Depends(get_summarizer_service),
) -> None:
    await websocket.accept()

    session_id = f"session-{uuid4().hex[:8]}"
    event = SessionStartedEvent(
        session_id=session_id,
        snapshot=session_store.ensure_snapshot(session_id),
    )
    await websocket.send_json(event.model_dump(mode="json"))

    try:
        while True:
            try:
                message = UtteranceMessage.model_validate(
                    await websocket.receive_json()
                )
            except ValidationError:
                await websocket.send_json(
                    ErrorEvent(message="Invalid client message").model_dump(mode="json")
                )
                continue

            try:
                transcript_events = transcribe_service.transcribe_utterance(
                    audio=message.samples,
                    utterance_id=message.utterance_id,
                )
            except Exception as exc:
                await websocket.send_json(
                    ErrorEvent(message=str(exc)).model_dump(mode="json")
                )
                continue

            for transcript_event in transcript_events:
                if isinstance(transcript_event, PartialTranscriptEvent):
                    session_store.append_partial_segment(
                        session_id, transcript_event.segment
                    )
                else:
                    session_store.append_committed_segment(
                        session_id, transcript_event.segment
                    )

                await websocket.send_json(transcript_event.model_dump(mode="json"))

            committed_segments = session_store.get_snapshot(
                session_id
            ).committed_segments
            if not committed_segments:
                continue

            try:
                summary_result = await summarizer_service.summarize(
                    committed_segments=committed_segments
                )
            except Exception as exc:
                await websocket.send_json(
                    ErrorEvent(message=str(exc)).model_dump(mode="json")
                )
                continue

            session_store.replace_summary_blocks(
                session_id, summary_result.summary_blocks
            )
            session_store.replace_mindmap(
                session_id,
                summary_result.nodes,
                summary_result.edges,
            )
            await websocket.send_json(
                summary_result.to_summary_event().model_dump(mode="json")
            )
            await websocket.send_json(
                summary_result.to_graph_event().model_dump(mode="json")
            )
    except WebSocketDisconnect:
        return
