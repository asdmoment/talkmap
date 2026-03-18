import asyncio

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.base import AsrEngine, TranscriptionSegment
from app.models import CommittedSegment, PartialSegment
from app.ws import CommittedTranscriptEvent, PartialTranscriptEvent


class TranscribeStreamService:
    def __init__(self, engine: AsrEngine) -> None:
        self._engine = engine

    async def transcribe_utterance(
        self, *, audio: list[float], sample_rate: int, utterance_id: str
    ) -> list[PartialTranscriptEvent | CommittedTranscriptEvent]:
        audio_payload = BrowserUtteranceAudio(
            sample_rate=sample_rate, samples=list(audio)
        )
        segments = await asyncio.to_thread(self._engine.transcribe, audio_payload)
        events: list[PartialTranscriptEvent | CommittedTranscriptEvent] = []

        for index, segment in enumerate(segments):
            segment_id = f"{utterance_id}:{index}"
            events.append(
                PartialTranscriptEvent(segment=_to_partial_segment(segment, segment_id))
            )
            events.append(
                CommittedTranscriptEvent(
                    segment=_to_committed_segment(segment, segment_id)
                )
            )

        return events


def _to_partial_segment(
    segment: TranscriptionSegment, segment_id: str
) -> PartialSegment:
    return PartialSegment(
        id=segment_id,
        text=segment.text,
        start_ms=segment.start_ms,
        end_ms=segment.end_ms,
    )


def _to_committed_segment(
    segment: TranscriptionSegment, segment_id: str
) -> CommittedSegment:
    return CommittedSegment(
        id=segment_id,
        text=segment.text,
        start_ms=segment.start_ms,
        end_ms=segment.end_ms,
    )
