import pytest

from app.asr.base import TranscriptionSegment
from app.services.transcribe_stream import TranscribeStreamService
from app.ws import CommittedTranscriptEvent, PartialTranscriptEvent


class FakeAsrEngine:
    def __init__(self, segments: list[TranscriptionSegment]) -> None:
        self._segments = segments
        self.calls: list[object] = []

    def transcribe(self, audio: object) -> list[TranscriptionSegment]:
        self.calls.append(audio)
        return self._segments


def test_transcribe_stream_service_emits_matching_partial_and_committed_events_per_segment() -> (
    None
):
    engine = FakeAsrEngine(
        segments=[
            TranscriptionSegment(text="hello", start_ms=0, end_ms=480),
            TranscriptionSegment(text="world", start_ms=480, end_ms=960),
        ]
    )
    service = TranscribeStreamService(engine)

    events = service.transcribe_utterance(audio=b"pcm-bytes", utterance_id="utt-1")

    assert engine.calls == [b"pcm-bytes"]
    assert events == [
        PartialTranscriptEvent.model_validate(
            {
                "type": "partial_transcript",
                "segment": {
                    "id": "utt-1:0",
                    "text": "hello",
                    "start_ms": 0,
                    "end_ms": 480,
                },
            }
        ),
        CommittedTranscriptEvent.model_validate(
            {
                "type": "committed_transcript",
                "segment": {
                    "id": "utt-1:0",
                    "text": "hello",
                    "start_ms": 0,
                    "end_ms": 480,
                },
            }
        ),
        PartialTranscriptEvent.model_validate(
            {
                "type": "partial_transcript",
                "segment": {
                    "id": "utt-1:1",
                    "text": "world",
                    "start_ms": 480,
                    "end_ms": 960,
                },
            }
        ),
        CommittedTranscriptEvent.model_validate(
            {
                "type": "committed_transcript",
                "segment": {
                    "id": "utt-1:1",
                    "text": "world",
                    "start_ms": 480,
                    "end_ms": 960,
                },
            }
        ),
    ]


def test_transcribe_stream_service_returns_no_events_when_engine_returns_nothing() -> (
    None
):
    engine = FakeAsrEngine(segments=[])
    service = TranscribeStreamService(engine)

    events = service.transcribe_utterance(audio=b"pcm-bytes", utterance_id="utt-empty")

    assert engine.calls == [b"pcm-bytes"]
    assert events == []


@pytest.mark.parametrize(
    ("start_ms", "end_ms"),
    [(-1, 0), (0, -1), (10, 9)],
)
def test_transcription_segment_rejects_invalid_timestamps(
    start_ms: int, end_ms: int
) -> None:
    with pytest.raises(ValueError):
        TranscriptionSegment(text="bad", start_ms=start_ms, end_ms=end_ms)
