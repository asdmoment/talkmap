import pytest

from app.config import LlmProvider, Settings
from app.llm.ollama_client import OllamaClient
from app.llm.openai_compatible_client import OpenAiCompatibleClient
from app.ws import get_summarizer_service


def test_get_summarizer_service_uses_openrouter_client() -> None:
    settings = Settings(
        llm_provider="openrouter",
        openrouter_base_url="https://openrouter.ai/api/v1",
        openrouter_model="openai/gpt-4o-mini",
        openrouter_api_key="secret",
    )

    service = get_summarizer_service(settings)

    assert isinstance(service._client, OpenAiCompatibleClient)


@pytest.mark.parametrize(
    ("provider", "base_url", "model", "api_key"),
    [
        ("lmstudio", "http://127.0.0.1:1234/v1", "local-model", None),
        ("openai", "https://api.openai.com/v1", "gpt-4o-mini", "openai-key"),
        (
            "openrouter",
            "https://openrouter.ai/api/v1",
            "openai/gpt-4o-mini",
            "openrouter-key",
        ),
    ],
)
def test_get_summarizer_service_uses_openai_compatible_clients(
    provider: LlmProvider,
    base_url: str,
    model: str,
    api_key: str | None,
) -> None:
    settings = Settings(
        llm_provider=provider,
        lmstudio_base_url=base_url,
        lmstudio_model=model,
        openai_base_url=base_url,
        openai_model=model,
        openai_api_key=api_key,
        openrouter_base_url=base_url,
        openrouter_model=model,
        openrouter_api_key=api_key,
    )

    service = get_summarizer_service(settings)

    assert isinstance(service._client, OpenAiCompatibleClient)
    assert service._client._base_url == base_url
    assert service._client._model == model
    assert service._client._api_key == api_key


def test_get_summarizer_service_keeps_ollama_adapter() -> None:
    settings = Settings(
        llm_provider="ollama",
        ollama_base_url="http://127.0.0.1:11434",
        ollama_model="llama3.1:8b",
        ollama_timeout_seconds=42.0,
    )

    service = get_summarizer_service(settings)

    assert isinstance(service._client, OllamaClient)
    assert service._client._base_url == "http://127.0.0.1:11434"
    assert service._client._model == "llama3.1:8b"
    assert service._client._timeout_s == 42.0


def test_get_summarizer_service_rejects_unknown_provider() -> None:
    settings = Settings()
    object.__setattr__(settings, "llm_provider", "unknown")

    with pytest.raises(ValueError, match="Unsupported LLM provider"):
        get_summarizer_service(settings)
