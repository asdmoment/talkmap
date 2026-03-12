import asyncio
import json
from urllib import request

from pydantic import BaseModel, ValidationError

from app.llm.base import JsonLlmClient, parse_json_object_text


class OllamaGenerateResponse(BaseModel):
    response: str


class OllamaClient:
    def __init__(
        self,
        *,
        model: str,
        base_url: str = "http://127.0.0.1:11434",
        timeout_s: float = 30.0,
    ) -> None:
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s

    async def complete_json(self, *, prompt: str, transcript: str) -> object:
        return await asyncio.to_thread(
            self._complete_json_sync,
            prompt=prompt,
            transcript=transcript,
        )

    def _complete_json_sync(self, *, prompt: str, transcript: str) -> object:
        payload = json.dumps(
            {
                "model": self._model,
                "prompt": f"{prompt}\n\nTranscript:\n{transcript}",
                "stream": False,
                "format": "json",
            }
        ).encode("utf-8")
        http_request = request.Request(
            url=f"{self._base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(http_request, timeout=self._timeout_s) as response:
            raw_response = json.loads(response.read().decode("utf-8"))

        try:
            envelope = OllamaGenerateResponse.model_validate(raw_response)
        except ValidationError as exc:
            raise ValueError(
                "Ollama response envelope must include a string response field"
            ) from exc

        return parse_json_object_text(
            text=envelope.response,
            invalid_json_message="Ollama response field must contain valid JSON",
            non_object_message="Ollama response field must decode to a JSON object",
        )
