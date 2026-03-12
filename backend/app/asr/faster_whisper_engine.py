from collections.abc import Mapping
from typing import Any

from .base import TranscriptionSegment


class FasterWhisperEngine:
    def __init__(
        self,
        model_size_or_path: str,
        *,
        device: str = "auto",
        compute_type: str = "default",
        transcribe_options: Mapping[str, Any] | None = None,
    ) -> None:
        self._model_size_or_path = model_size_or_path
        self._device = device
        self._compute_type = compute_type
        self._transcribe_options = dict(transcribe_options or {})
        self._model: Any | None = None

    def transcribe(self, audio: object) -> list[TranscriptionSegment]:
        model = self._get_model()
        segments, _ = model.transcribe(audio, **self._transcribe_options)

        results: list[TranscriptionSegment] = []
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
