import math
from typing import Any, Protocol

import httpx

from app.asr.audio_payload import BrowserUtteranceAudio
from app.asr.base import TranscriptionSegment


class GroqWhisperEngine:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        language: str,
        http_client: "HttpClientProtocol | None" = None,
        timeout_s: float = 30.0,
    ) -> None:
        if not api_key:
            raise ValueError("GROQ_API_KEY is required to use GroqWhisperEngine")

        self._api_key = api_key
        self._model = model
        self._language = _normalize_language(language)
        self._http_client = http_client or httpx.Client()
        self._timeout_s = timeout_s

    def transcribe(self, audio: BrowserUtteranceAudio) -> list[TranscriptionSegment]:
        try:
            response = self._http_client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                data={
                    "model": self._model,
                    "language": self._language,
                    "response_format": "verbose_json",
                },
                files={"file": ("utterance.wav", audio.to_wav_bytes(), "audio/wav")},
                timeout=self._timeout_s,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError("Groq transcription request failed") from exc

        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Groq transcription response must be a JSON object")

        segments = payload.get("segments")
        if not isinstance(segments, list):
            raise ValueError(
                "Groq transcription response must include a segments array"
            )

        results: list[TranscriptionSegment] = []
        for index, segment in enumerate(segments):
            if not isinstance(segment, dict):
                raise ValueError(
                    f"Groq transcription segment {index} must be a JSON object"
                )

            text = str(segment.get("text", "")).strip()
            if not text:
                continue
            start_ms = _seconds_to_ms(segment.get("start"), field="start")
            end_ms = _seconds_to_ms(segment.get("end"), field="end")
            if end_ms < start_ms:
                raise ValueError(
                    f"Groq transcription timestamp end must be greater than or equal to start for segment {index}"
                )
            results.append(
                TranscriptionSegment(
                    text=text,
                    start_ms=start_ms,
                    end_ms=end_ms,
                )
            )
        return results


class HttpClientProtocol(Protocol):
    def post(self, *args: Any, **kwargs: Any) -> Any: ...


def _seconds_to_ms(value: Any, *, field: str) -> int:
    try:
        seconds = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Groq transcription timestamp {field} is invalid") from exc

    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError(f"Groq transcription timestamp {field} is invalid")

    return int(round(seconds * 1000))


def _normalize_language(language: str) -> str:
    normalized = language.strip()
    if not normalized:
        return normalized

    return normalized.split("-", maxsplit=1)[0].lower()
