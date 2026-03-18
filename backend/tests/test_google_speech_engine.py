from pathlib import Path
import sys
from typing import Any

import pytest
from google.auth.exceptions import DefaultCredentialsError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.google_speech_engine import GoogleSpeechEngine


def test_google_speech_engine_parses_alternatives_from_response() -> None:
    captured_request: dict[str, Any] = {}

    class FakeCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            captured_request["refresh_request_type"] = type(request).__name__

    class FakeResponse:
        def json(self):
            return {
                "results": [
                    {
                        "alternatives": [
                            {"transcript": "你好，今天先整理待办", "words": []}
                        ],
                        "resultEndTime": "1.500s",
                    }
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            captured_request["args"] = args
            captured_request["kwargs"] = kwargs
            return FakeResponse()

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=FakeCredentials(),
        http_client=FakeClient(),
    )

    segments = engine.transcribe(
        BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
    )

    assert [
        (segment.text, segment.start_ms, segment.end_ms) for segment in segments
    ] == [("你好，今天先整理待办", 0, 1500)]
    assert captured_request["refresh_request_type"] == "Request"
    assert captured_request["args"] == (
        "https://speech.googleapis.com/v1/speech:recognize",
    )
    kwargs = captured_request["kwargs"]
    assert kwargs["headers"] == {"Authorization": "Bearer test-token"}
    assert kwargs["timeout"] == 30.0
    assert kwargs["json"]["config"] == {
        "languageCode": "zh-CN",
        "model": "latest_long",
        "enableAutomaticPunctuation": True,
    }
    assert isinstance(kwargs["json"]["audio"]["content"], str)
    assert kwargs["json"]["audio"]["content"]


def test_google_speech_engine_from_default_credentials_requires_google_cloud_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_default(*args, **kwargs):
        raise DefaultCredentialsError("missing credentials")

    monkeypatch.setattr(
        "app.asr.google_speech_engine.google.auth.default", fake_default
    )

    class FakeClient:
        def post(self, *args, **kwargs):
            raise AssertionError("http client should not be used")

    with pytest.raises(RuntimeError, match="Google Cloud credentials"):
        GoogleSpeechEngine.from_default_credentials(
            language_code="zh-CN",
            model="latest_long",
            http_client=FakeClient(),
        )


def test_google_speech_engine_from_default_credentials_uses_cloud_platform_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_scopes: dict[str, object] = {}

    class FakeCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            return None

    def fake_default(*args, **kwargs):
        captured_scopes["scopes"] = kwargs.get("scopes")
        return FakeCredentials(), "demo-project"

    monkeypatch.setattr(
        "app.asr.google_speech_engine.google.auth.default", fake_default
    )

    engine = GoogleSpeechEngine.from_default_credentials(
        language_code="zh-CN",
        model="latest_long",
    )

    assert captured_scopes["scopes"] == [
        "https://www.googleapis.com/auth/cloud-platform"
    ]
    assert isinstance(engine, GoogleSpeechEngine)


def test_google_speech_engine_wraps_refresh_errors_with_context() -> None:
    class BrokenCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            raise RuntimeError("refresh failed")

    class FakeClient:
        def post(self, *args, **kwargs):
            raise AssertionError("http client should not be used")

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=BrokenCredentials(),
        http_client=FakeClient(),
    )

    with pytest.raises(
        RuntimeError,
        match="Google transcription credentials refresh failed: RuntimeError: refresh failed",
    ):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
        )


def test_google_speech_engine_rejects_non_string_transcripts() -> None:
    class FakeCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            return None

    class FakeResponse:
        def json(self):
            return {
                "results": [
                    {
                        "alternatives": [{"transcript": 123}],
                        "resultEndTime": "1.500s",
                    }
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=FakeCredentials(),
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="transcript"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
        )


def test_google_speech_engine_rejects_missing_access_token_after_refresh() -> None:
    class FakeCredentials:
        token = None

        def refresh(self, request: object) -> None:
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            raise AssertionError("http client should not be used")

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=FakeCredentials(),
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="access token"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
        )


def test_google_speech_engine_rejects_invalid_result_end_time() -> None:
    class FakeCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            return None

    class FakeResponse:
        def json(self):
            return {
                "results": [
                    {
                        "alternatives": [{"transcript": "你好"}],
                        "resultEndTime": "bad",
                    }
                ]
            }

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=FakeCredentials(),
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="resultEndTime"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
        )


def test_google_speech_engine_rejects_invalid_json_payload() -> None:
    class FakeCredentials:
        token = "test-token"

        def refresh(self, request: object) -> None:
            return None

    class FakeResponse:
        def json(self):
            raise ValueError("bad json")

        def raise_for_status(self):
            return None

    class FakeClient:
        def post(self, *args, **kwargs):
            return FakeResponse()

    engine = GoogleSpeechEngine(
        language_code="zh-CN",
        model="latest_long",
        credentials=FakeCredentials(),
        http_client=FakeClient(),
    )

    with pytest.raises(ValueError, match="valid JSON"):
        engine.transcribe(
            BrowserUtteranceAudio(sample_rate=16000, samples=[0.0, 0.2, -0.2])
        )
