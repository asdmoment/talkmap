from app.config import Settings
from app.llm.base import JsonLlmClient
from app.llm.ollama_client import OllamaClient
from app.llm.openai_compatible_client import OpenAiCompatibleClient


def create_llm_client(settings: Settings) -> JsonLlmClient:
    if settings.llm_provider == "ollama":
        return OllamaClient(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            timeout_s=settings.ollama_timeout_seconds,
        )
    if settings.llm_provider == "lmstudio":
        return OpenAiCompatibleClient(
            model=settings.lmstudio_model,
            base_url=settings.lmstudio_base_url,
        )
    if settings.llm_provider == "openai":
        return OpenAiCompatibleClient(
            model=settings.openai_model,
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )
    if settings.llm_provider == "openrouter":
        return OpenAiCompatibleClient(
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
        )
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")
