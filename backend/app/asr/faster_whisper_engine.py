import logging
import struct
from collections.abc import Mapping
from typing import Any

from .audio_payload import BrowserUtteranceAudio
from .base import TranscriptionSegment


class FasterWhisperEngine:
    def __init__(
        self,
        model_size_or_path: str,
        *,
        device: str = "auto",
        compute_type: str = "default",
        language: str | None = None,
        transcribe_options: Mapping[str, Any] | None = None,
    ) -> None:
        self._model_size_or_path = model_size_or_path
        self._device = device
        self._compute_type = compute_type
        self._language = _normalize_language(language) if language else None
        self._transcribe_options = dict(transcribe_options or {})
        self._model: Any | None = None

    def transcribe(self, audio: BrowserUtteranceAudio) -> list[TranscriptionSegment]:
        model = self._get_model()
        audio_array = _to_float32_array(audio)
        options = dict(self._transcribe_options)
        if self._language:
            options.setdefault("language", self._language)
        segments, _ = model.transcribe(audio_array, **options)

        results: list[TranscriptionSegment] = []
        try:
            for segment in segments:
                text = segment.text.strip()
                if not text:
                    continue
                results.append(
                    TranscriptionSegment(
                        text=text,
                        start_ms=_seconds_to_ms(segment.start),
                        end_ms=_seconds_to_ms(segment.end),
                    )
                )
        except Exception:
            logging.getLogger(__name__).warning(
                "faster-whisper generator raised after %d segment(s); returning partial results",
                len(results),
                exc_info=True,
            )
        return results

    def _get_model(self) -> Any:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise RuntimeError(
                    "faster-whisper is required to use FasterWhisperEngine"
                ) from exc

            self._model = WhisperModel(
                self._model_size_or_path,
                device=self._device,
                compute_type=self._compute_type,
            )
        return self._model


def _seconds_to_ms(value: float) -> int:
    return int(round(value * 1000))


def _to_float32_array(audio: BrowserUtteranceAudio) -> Any:
    """Convert BrowserUtteranceAudio to a numpy-compatible float32 array."""
    try:
        import numpy as np

        return np.array(audio.samples, dtype=np.float32)
    except ImportError:
        pass

    # Fallback: pack as raw float32 bytes wrapped in an array-like
    # faster-whisper accepts numpy arrays; without numpy this engine won't work,
    # but we raise a clear error from _get_model anyway.
    return audio.samples


def _normalize_language(language: str) -> str:
    normalized = language.strip()
    if not normalized:
        return normalized
    return normalized.split("-", maxsplit=1)[0].lower()
