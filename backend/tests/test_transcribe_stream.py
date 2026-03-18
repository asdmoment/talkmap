import asyncio
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.base import TranscriptionSegment
from app.services.transcribe_stream import TranscribeStreamService
from app.ws import CommittedTranscriptEvent, PartialTranscriptEvent


class FakeAsrEngine:
    def __init__(self, segments: list[TranscriptionSegment]) -> None:
        self._segments = segments
        self.calls: list[BrowserUtteranceAudio] = []

    def transcribe(self, audio: BrowserUtteranceAudio) -> list[TranscriptionSegment]:
        self.calls.append(audio)
        return self._segments


def test_transcribe_stream_service_wraps_browser_samples_with_sample_rate() -> None:
    captured_audio: BrowserUtteranceAudio | None = None

    class CapturingAsrEngine:
        def transcribe(self, audio):
            nonlocal captured_audio
            captured_audio = audio
            return []

    service = TranscribeStreamService(CapturingAsrEngine())

    asyncio.run(
        service.transcribe_utterance(
            audio=[0.0, 0.5, -0.5],
            sample_rate=16000,
            utterance_id="utt-1",
        )
    )

    assert captured_audio is not None
    assert captured_audio.sample_rate == 16000
    assert captured_audio.samples == [0.0, 0.5, -0.5]


def test_encode_wav_bytes_creates_non_empty_wave_payload() -> None:
    payload = BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])

    wav_bytes = payload.to_wav_bytes()

    assert wav_bytes[:4] == b"RIFF"
    assert len(wav_bytes) > 44


def test_encode_pcm16_bytes_preserves_negative_full_scale() -> None:
    payload = BrowserUtteranceAudio(sample_rate=16000, samples=[-1.0, 1.0])

    pcm16_bytes = payload.to_pcm16_bytes()

    assert pcm16_bytes[:2] == (-32768).to_bytes(2, byteorder="little", signed=True)
    assert pcm16_bytes[2:4] == (32767).to_bytes(2, byteorder="little", signed=True)


@pytest.mark.parametrize(
    ("sample_rate", "samples", "message"),
    [
        (0, [0.0], "sample_rate"),
        (-16000, [0.0], "sample_rate"),
        (16000, [float("nan")], "finite"),
    ],
)
def test_browser_utterance_audio_rejects_invalid_input(
    sample_rate: int, samples: list[float], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        BrowserUtteranceAudio(sample_rate=sample_rate, samples=samples)


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

    events = asyncio.run(
        service.transcribe_utterance(
            audio=[0.1, -0.1], sample_rate=16000, utterance_id="utt-1"
        )
    )

    assert engine.calls == [
        BrowserUtteranceAudio(sample_rate=16000, samples=[0.1, -0.1])
    ]
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

    events = asyncio.run(
        service.transcribe_utterance(
            audio=[0.1, -0.1], sample_rate=16000, utterance_id="utt-empty"
        )
    )

    assert engine.calls == [
        BrowserUtteranceAudio(sample_rate=16000, samples=[0.1, -0.1])
    ]
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


def test_faster_whisper_engine_returns_partial_results_on_generator_error() -> None:
    """When the faster-whisper generator raises mid-way, already-collected segments are returned."""
    from app.asr.faster_whisper_engine import FasterWhisperEngine

    class _FakeModel:
        def transcribe(self, audio_array, **_options):
            def _gen():
                class Seg:
                    def __init__(self, text, start, end):
                        self.text = text
                        self.start = start
                        self.end = end
                yield Seg("hello", 0.0, 0.5)
                raise RuntimeError("CUDA out of memory")
            return _gen(), None

    engine = FasterWhisperEngine.__new__(FasterWhisperEngine)
    engine._model = _FakeModel()
    engine._language = None
    engine._transcribe_options = {}

    audio = BrowserUtteranceAudio(sample_rate=16000, samples=[0.0])
    results = engine.transcribe(audio)

    assert len(results) == 1
    assert results[0].text == "hello"
    assert results[0].start_ms == 0
    assert results[0].end_ms == 500
