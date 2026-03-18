import json
import re
from typing import Protocol


class JsonLlmClient(Protocol):
    async def complete_json(self, *, prompt: str, transcript: str) -> object: ...


_CODE_FENCE_RE = re.compile(
    r"^\s*```(?:json)?\s*\n(.*?)\n\s*```\s*$",
    re.DOTALL,
)


def _strip_code_fences(text: str) -> str:
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1) if match else text


def parse_json_object_text(
    *,
    text: str,
    invalid_json_message: str,
    non_object_message: str,
) -> dict[str, object]:
    cleaned = _strip_code_fences(text)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(invalid_json_message) from exc

    if not isinstance(parsed, dict):
        raise ValueError(non_object_message)

    return parsed
