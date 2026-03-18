from dataclasses import dataclass
from io import BytesIO
import math
import wave


@dataclass(frozen=True)
class BrowserUtteranceAudio:
    sample_rate: int
    samples: list[float]

    def __post_init__(self) -> None:
        if self.sample_rate <= 0:
            raise ValueError("sample_rate must be positive")

        for sample in self.samples:
            if not math.isfinite(sample):
                raise ValueError("samples must contain only finite values")

    def to_pcm16_bytes(self) -> bytes:
        pcm16 = bytearray()
        for sample in self.samples:
            clamped = max(-1.0, min(1.0, sample))
            value = -32768 if clamped == -1.0 else int(round(clamped * 32767))
            pcm16.extend(value.to_bytes(2, byteorder="little", signed=True))
        return bytes(pcm16)

    def to_wav_bytes(self) -> bytes:
        with BytesIO() as buffer:
            with wave.open(buffer, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(self.sample_rate)
                wav_file.writeframes(self.to_pcm16_bytes())
            return buffer.getvalue()
