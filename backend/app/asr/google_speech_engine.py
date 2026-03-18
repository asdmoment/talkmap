import base64
import math
from typing import Any, Protocol

import google.auth
from google.auth.exceptions import DefaultCredentialsError
from google.auth.transport.requests import Request
import httpx

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.base import TranscriptionSegment

_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


class GoogleSpeechEngine:
    def __init__(
        self,
        *,
        language_code: str,
        model: str,
        credentials: Any,
        http_client: "HttpClientProtocol | None" = None,
        timeout_s: float = 30.0,
    ) -> None:
        self._language_code = language_code
        self._model = model
        self._credentials = credentials
        self._http_client = http_client or httpx.Client()
        self._timeout_s = timeout_s

    @classmethod
    def from_default_credentials(
        cls,
        *,
        language_code: str,
        model: str,
        http_client: "HttpClientProtocol | None" = None,
        timeout_s: float = 30.0,
    ) -> "GoogleSpeechEngine":
        try:
            credentials, _ = google.auth.default(scopes=[_CLOUD_PLATFORM_SCOPE])
        except DefaultCredentialsError as exc:
            raise RuntimeError(
                "Google Cloud credentials are required to use GoogleSpeechEngine"
            ) from exc

        return cls(
            language_code=language_code,
            model=model,
            credentials=credentials,
            http_client=http_client,
            timeout_s=timeout_s,
        )

    def transcribe(self, audio: BrowserUtteranceAudio) -> list[TranscriptionSegment]:
        try:
            self._credentials.refresh(Request())
        except Exception as exc:
            raise RuntimeError(
                "Google transcription credentials refresh failed: "
                f"{type(exc).__name__}: {exc}"
            ) from exc

        if not isinstance(self._credentials.token, str) or not self._credentials.token:
            raise ValueError(
                "Google transcription access token is missing after credentials refresh"
            )

        try:
            response = self._http_client.post(
                "https://speech.googleapis.com/v1/speech:recognize",
                headers={"Authorization": f"Bearer {self._credentials.token}"},
                json={
                    "config": {
                        "languageCode": self._language_code,
                        "model": self._model,
                        "enableAutomaticPunctuation": True,
                    },
                    "audio": {
                        "content": base64.b64encode(audio.to_wav_bytes()).decode(
                            "ascii"
                        )
                    },
                },
                timeout=self._timeout_s,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError("Google transcription request failed") from exc

        try:
            payload = response.json()
        except Exception as exc:
            raise ValueError(
                "Google transcription response must contain valid JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise ValueError("Google transcription response must be a JSON object")

        results = payload.get("results")
        if not isinstance(results, list):
            raise ValueError(
                "Google transcription response must include a results array"
            )

        segments: list[TranscriptionSegment] = []
        current_start_ms = 0
        for index, result in enumerate(results):
            if not isinstance(result, dict):
                raise ValueError(
                    f"Google transcription result {index} must be a JSON object"
                )

            alternatives = result.get("alternatives")
            if not isinstance(alternatives, list) or not alternatives:
                continue

            first_alternative = alternatives[0]
            if not isinstance(first_alternative, dict):
                raise ValueError(
                    f"Google transcription alternative {index} must be a JSON object"
                )

            transcript = first_alternative.get("transcript", "")
            if not isinstance(transcript, str):
                raise ValueError(
                    f"Google transcription transcript {index} must be a string"
                )

            text = transcript.strip()
            if not text:
                continue

            end_ms = _duration_to_ms(result.get("resultEndTime"))
            start_ms = current_start_ms
            if end_ms < start_ms:
                raise ValueError(
                    "Google transcription resultEndTime must be greater than or equal to the segment start"
                )

            segments.append(
                TranscriptionSegment(text=text, start_ms=start_ms, end_ms=end_ms)
            )
            current_start_ms = end_ms

        return segments


class HttpClientProtocol(Protocol):
    def post(self, *args: Any, **kwargs: Any) -> Any: ...


def _duration_to_ms(value: Any) -> int:
    if not isinstance(value, str) or not value.endswith("s"):
        raise ValueError("Google transcription resultEndTime is invalid")

    try:
        seconds = float(value[:-1])
    except ValueError as exc:
        raise ValueError("Google transcription resultEndTime is invalid") from exc

    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("Google transcription resultEndTime is invalid")

    return int(round(seconds * 1000))
