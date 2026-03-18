from pathlib import Path
import sys
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.groq_whisper_engine import GroqWhisperEngine


def test_groq_whisper_engine_parses_segment_timestamps() -> None:
    captured_request: dict[str, Any] = {}

    class FakeResponse:
        def json(self):
            return {
                "segments": [
                    {"text": "你好世界", "start": 0.0, "end": 1.2},
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            captured_request["args"] = args
            captured_request["kwargs"] = kwargs
            return FakeResponse()

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh",
        http_client=FakeClient(),
    )

    segments = engine.transcribe(
        BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
    )

    assert [
        (segment.text, segment.start_ms, segment.end_ms) for segment in segments
    ] == [("你好世界", 0, 1200)]
    assert captured_request["args"] == (
        "https://api.groq.com/openai/v1/audio/transcriptions",
    )
    kwargs = captured_request["kwargs"]
    assert kwargs["headers"] == {"Authorization": "Bearer test-key"}
    assert kwargs["data"] == {
        "model": "whisper-large-v3",
        "language": "zh",
        "response_format": "verbose_json",
    }
    assert kwargs["timeout"] == 30.0

    file_name, file_content, content_type = kwargs["files"]["file"]
    assert file_name == "utterance.wav"
    assert file_content[:4] == b"RIFF"
    assert content_type == "audio/wav"


def test_groq_whisper_engine_normalizes_bcp47_language_code() -> None:
    captured_request: dict[str, Any] = {}

    class FakeResponse:
        def json(self):
            return {"segments": []}

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            captured_request["kwargs"] = kwargs
            return FakeResponse()

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh-CN",
        http_client=FakeClient(),
    )

    engine.transcribe(
        BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
    )

    assert captured_request["kwargs"]["data"]["language"] == "zh"


def test_groq_whisper_engine_requires_api_key() -> None:
    with pytest.raises(ValueError, match="GROQ_API_KEY"):
        GroqWhisperEngine(api_key=None, model="whisper-large-v3", language="zh")


def test_groq_whisper_engine_rejects_missing_segments_payload() -> None:
    class FakeResponse:
        def json(self):
            return {"text": "hello"}

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh",
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="segments"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
        )


def test_groq_whisper_engine_rejects_invalid_segment_timestamps() -> None:
    class FakeResponse:
        def json(self):
            return {
                "segments": [
                    {"text": "你好世界", "start": "bad", "end": 1.2},
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh",
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="timestamp"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
        )


def test_groq_whisper_engine_wraps_http_errors_with_context() -> None:
    class FakeClient:
        def post(self, *args, **kwargs):
            raise httpx.HTTPError("boom")

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh",
        http_client=FakeClient(),
    )

    with pytest.raises(RuntimeError, match="Groq transcription request failed"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
        )


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (-0.1, 1.2),
        (0.0, float("inf")),
        (1.2, 0.5),
    ],
)
def test_groq_whisper_engine_rejects_out_of_range_segment_timestamps(
    start: float, end: float
) -> None:
    class FakeResponse:
        def json(self):
            return {
                "segments": [
                    {"text": "你好世界", "start": start, "end": end},
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GroqWhisperEngine(
        api_key="test-key",
        model="whisper-large-v3",
        language="zh",
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="timestamp"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.25, -0.25])
        )
