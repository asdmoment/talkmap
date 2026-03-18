from app.llm.base import parse_json_object_text

ARGS = {
    "invalid_json_message": "bad json",
    "non_object_message": "not object",
}


def test_parse_plain_json():
    result = parse_json_object_text(text='{"key": "value"}', **ARGS)
    assert result == {"key": "value"}


def test_parse_json_wrapped_in_code_fence():
    text = '```json\n{"key": "value"}\n```'
    result = parse_json_object_text(text=text, **ARGS)
    assert result == {"key": "value"}


def test_parse_json_wrapped_in_plain_fence():
    text = '```\n{"key": "value"}\n```'
    result = parse_json_object_text(text=text, **ARGS)
    assert result == {"key": "value"}


def test_parse_json_with_leading_trailing_whitespace():
    text = '  \n```json\n{"key": "value"}\n```\n  '
    result = parse_json_object_text(text=text, **ARGS)
    assert result == {"key": "value"}


def test_parse_invalid_json_raises():
    import pytest
    with pytest.raises(ValueError, match="bad json"):
        parse_json_object_text(text="not json at all", **ARGS)


def test_parse_non_object_raises():
    import pytest
    with pytest.raises(ValueError, match="not object"):
        parse_json_object_text(text="[1, 2, 3]", **ARGS)
