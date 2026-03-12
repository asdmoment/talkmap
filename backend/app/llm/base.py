import json
from typing import Protocol


class JsonLlmClient(Protocol):
    async def complete_json(self, *, prompt: str, transcript: str) -> object: ...


def parse_json_object_text(
    *,
    text: str,
    invalid_json_message: str,
    non_object_message: str,
) -> dict[str, object]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(invalid_json_message) from exc

    if not isinstance(parsed, dict):
        raise ValueError(non_object_message)

    return parsed
