import asyncio
import logging
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

logger = logging.getLogger(__name__)


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


class TitleUpdatedEvent(BaseModel):
    type: Literal["title_updated"] = "title_updated"
    title: str


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
    | TitleUpdatedEvent
    | ErrorEvent
)

router = APIRouter()


def get_transcribe_service(
    settings: Settings = Depends(get_settings),
) -> Any:
    from .asr.faster_whisper_engine import FasterWhisperEngine
    from .asr.google_speech_engine import GoogleSpeechEngine
    from .asr.groq_whisper_engine import GroqWhisperEngine
    from .services.transcribe_stream import TranscribeStreamService

    if settings.asr_provider == "local":
        engine = FasterWhisperEngine(
            settings.asr_model,
            device=settings.asr_device,
            compute_type=settings.asr_compute_type,
            language=settings.asr_language_code,
        )
    elif settings.asr_provider == "groq":
        engine = GroqWhisperEngine(
            api_key=settings.groq_api_key,
            model=settings.groq_asr_model,
            language=settings.asr_language_code,
        )
    elif settings.asr_provider == "google":
        engine = GoogleSpeechEngine.from_default_credentials(
            language_code=settings.asr_language_code,
            model=settings.google_stt_model,
        )
    else:
        raise ValueError(f"Unsupported ASR provider: {settings.asr_provider}")

    return TranscribeStreamService(engine)


def get_summarizer_service(
    settings: Settings = Depends(get_settings),
) -> Any:
    from .llm.factory import create_llm_client
    from .services.summarizer import RollingSummarizerService

    return RollingSummarizerService(client=create_llm_client(settings))


@router.websocket("/ws/session")
async def session_websocket(
    websocket: WebSocket,
    session_id: str | None = None,
    session_store: SessionStore = Depends(get_session_store),
    transcribe_service: Any = Depends(get_transcribe_service),
    summarizer_service: Any = Depends(get_summarizer_service),
) -> None:
    await websocket.accept()
    send_lock = asyncio.Lock()
    summary_tasks: set[asyncio.Task[None]] = set()
    latest_summary_generation = 0

    if not session_id or not session_store.has_snapshot(session_id):
        session_id = f"session-{uuid4().hex[:8]}"

    async def send_session_event(event: SessionEvent) -> None:
        async with send_lock:
            await websocket.send_json(event.model_dump(mode="json"))

    async def send_error(message: str) -> None:
        await send_session_event(ErrorEvent(message=message))

    async def summarize_and_emit(
        committed_segments: list[CommittedSegment],
        generation: int,
    ) -> None:
        try:
            summary_result = await summarizer_service.summarize(
                committed_segments=committed_segments
            )
        except Exception as exc:
            if generation != latest_summary_generation:
                return
            await send_error(f"Thought organization failed: {exc}")
            return

        if generation != latest_summary_generation:
            return

        session_store.replace_summary_blocks(session_id, summary_result.summary_blocks)
        session_store.set_title(session_id, summary_result.title)
        await send_session_event(TitleUpdatedEvent(title=summary_result.title))
        session_store.replace_mindmap(
            session_id,
            summary_result.nodes,
            summary_result.edges,
        )
        session_store.flush(session_id)
        await send_session_event(summary_result.to_summary_event())
        await send_session_event(summary_result.to_graph_event())

    event = SessionStartedEvent(
        session_id=session_id,
        snapshot=session_store.ensure_snapshot(session_id),
    )
    await send_session_event(event)

    try:
        while True:
            try:
                message = UtteranceMessage.model_validate(
                    await websocket.receive_json()
                )
            except ValidationError as exc:
                detail = "; ".join(
                    f"{'.'.join(str(p) for p in error['loc'])}: {error['msg']}"
                    for error in exc.errors()
                )
                await send_error(f"Invalid client message: {detail}")
                continue

            try:
                transcript_events = await transcribe_service.transcribe_utterance(
                    audio=message.samples,
                    sample_rate=message.sample_rate,
                    utterance_id=message.utterance_id,
                )
            except Exception as exc:
                await send_error(f"Speech recognition failed: {exc}")
                continue

            has_new_committed_segment = False
            for transcript_event in transcript_events:
                if isinstance(transcript_event, PartialTranscriptEvent):
                    session_store.append_partial_segment(
                        session_id, transcript_event.segment
                    )
                elif isinstance(transcript_event, CommittedTranscriptEvent):
                    session_store.append_committed_segment(
                        session_id, transcript_event.segment
                    )
                    has_new_committed_segment = True
                else:
                    await send_error("Invalid transcript event from ASR service")
                    continue

                await send_session_event(transcript_event)

            if not has_new_committed_segment:
                continue

            committed_segments = session_store.get_snapshot(
                session_id
            ).committed_segments
            if not committed_segments:
                continue

            latest_summary_generation += 1
            summary_task = asyncio.create_task(
                summarize_and_emit(
                    list(committed_segments), latest_summary_generation
                )
            )
            summary_tasks.add(summary_task)
            summary_task.add_done_callback(summary_tasks.discard)
    except WebSocketDisconnect:
        return
    finally:
        for summary_task in list(summary_tasks):
            summary_task.cancel()

        if summary_tasks:
            await asyncio.gather(*summary_tasks, return_exceptions=True)
