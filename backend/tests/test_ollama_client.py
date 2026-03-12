import json
from urllib.error import HTTPError

import pytest

from app.llm.ollama_client import OllamaClient


class FakeHttpResponse:
    def __init__(self, payload: object) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None


def test_ollama_client_rejects_missing_response_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = OllamaClient(model="tiny")

    monkeypatch.setattr(
        "app.llm.ollama_client.request.urlopen",
        lambda http_request, timeout: FakeHttpResponse({"done": True}),
    )

    with pytest.raises(ValueError, match="response"):
        client._complete_json_sync(prompt="prompt", transcript="transcript")


def test_ollama_client_rejects_non_string_response_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = OllamaClient(model="tiny")

    monkeypatch.setattr(
        "app.llm.ollama_client.request.urlopen",
        lambda http_request, timeout: FakeHttpResponse(
            {"response": {"summary": "nope"}}
        ),
    )

    with pytest.raises(ValueError, match="response"):
        client._complete_json_sync(prompt="prompt", transcript="transcript")


def test_ollama_client_rejects_non_object_json_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = OllamaClient(model="tiny")

    monkeypatch.setattr(
        "app.llm.ollama_client.request.urlopen",
        lambda http_request, timeout: FakeHttpResponse(
            {"response": '["not", "an", "object"]'}
        ),
    )

    with pytest.raises(ValueError, match="JSON object"):
        client._complete_json_sync(prompt="prompt", transcript="transcript")


def test_ollama_client_rejects_invalid_json_in_response_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = OllamaClient(model="tiny")

    monkeypatch.setattr(
        "app.llm.ollama_client.request.urlopen",
        lambda http_request, timeout: FakeHttpResponse({"response": "{not-json}"}),
    )

    with pytest.raises(ValueError, match="valid JSON"):
        client._complete_json_sync(prompt="prompt", transcript="transcript")
