from dataclasses import dataclass
from typing import Protocol

from app.asr.audio_payload import BrowserUtteranceAudio


@dataclass(frozen=True)
class TranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int

    def __post_init__(self) -> None:
        if self.start_ms < 0:
            raise ValueError("start_ms must be non-negative")
        if self.end_ms < 0:
            raise ValueError("end_ms must be non-negative")
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")


class AsrEngine(Protocol):
    def transcribe(
        self, audio: BrowserUtteranceAudio
    ) -> list[TranscriptionSegment]: ...
