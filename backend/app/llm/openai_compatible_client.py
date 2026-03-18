import asyncio
import json
from typing import Protocol
from urllib import request

from pydantic import BaseModel, ValidationError

from app.llm.base import parse_json_object_text


class JsonHttpTransport(Protocol):
    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: object,
        timeout_s: float,
    ) -> object: ...


class UrllibJsonTransport:
    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: object,
        timeout_s: float,
    ) -> object:
        http_request = request.Request(
            url=url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with request.urlopen(http_request, timeout=timeout_s) as response:
            return json.loads(response.read().decode("utf-8"))


class OpenAiCompatibleMessage(BaseModel):
    content: str


class OpenAiCompatibleChoice(BaseModel):
    message: OpenAiCompatibleMessage


class OpenAiCompatibleResponse(BaseModel):
    choices: list[OpenAiCompatibleChoice]


class OpenAiCompatibleClient:
    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        api_key: str | None = None,
        timeout_s: float = 30.0,
        transport: JsonHttpTransport | None = None,
    ) -> None:
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_s = timeout_s
        self._transport = transport or UrllibJsonTransport()

    async def complete_json(self, *, prompt: str, transcript: str) -> object:
        return await asyncio.to_thread(
            self._complete_json_sync,
            prompt=prompt,
            transcript=transcript,
        )

    def _complete_json_sync(self, *, prompt: str, transcript: str) -> object:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        response = self._transport.post_json(
            url=f"{self._base_url}/chat/completions",
            headers=headers,
            payload={
                "model": self._model,
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"Transcript:\n{transcript}"},
                ],
            },
            timeout_s=self._timeout_s,
        )

        try:
            envelope = OpenAiCompatibleResponse.model_validate(response)
        except ValidationError as exc:
            raise ValueError(
                "OpenAI-compatible response envelope must include message content"
            ) from exc

        if not envelope.choices:
            raise ValueError(
                "OpenAI-compatible response envelope must include message content"
            )

        return parse_json_object_text(
            text=envelope.choices[0].message.content,
            invalid_json_message=(
                "OpenAI-compatible message content must contain valid JSON"
            ),
            non_object_message=(
                "OpenAI-compatible message content must decode to a JSON object"
            ),
        )
