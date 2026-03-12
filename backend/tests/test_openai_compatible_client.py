import asyncio

import pytest

from app.llm.openai_compatible_client import OpenAiCompatibleClient


class FakeTransport:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: object,
        timeout_s: float,
    ) -> object:
        return self.payload


def test_openai_compatible_client_parses_json_response() -> None:
    transport = FakeTransport(
        {
            "choices": [
                {
                    "message": {
                        "content": '{"summary":"ok","bullets":[],"action_items":[],"nodes":[],"edges":[]}'
                    }
                }
            ]
        }
    )
    client = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        api_key="secret",
        transport=transport,
    )

    result = asyncio.run(client.complete_json(prompt="Prompt", transcript="Hello"))

    assert result == {
        "summary": "ok",
        "bullets": [],
        "action_items": [],
        "nodes": [],
        "edges": [],
    }


def test_openai_compatible_client_rejects_missing_message_content() -> None:
    client = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        transport=FakeTransport({"choices": [{"message": {}}]}),
    )

    with pytest.raises(ValueError, match="content"):
        asyncio.run(client.complete_json(prompt="Prompt", transcript="Hello"))


def test_openai_compatible_client_rejects_non_object_json_response() -> None:
    client = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        transport=FakeTransport(
            {"choices": [{"message": {"content": '["not", "an", "object"]'}}]}
        ),
    )

    with pytest.raises(ValueError, match="JSON object"):
        asyncio.run(client.complete_json(prompt="Prompt", transcript="Hello"))


def test_openai_compatible_client_rejects_invalid_json_response() -> None:
    client = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        transport=FakeTransport({"choices": [{"message": {"content": "{not-json}"}}]}),
    )

    with pytest.raises(ValueError, match="valid JSON"):
        asyncio.run(client.complete_json(prompt="Prompt", transcript="Hello"))
