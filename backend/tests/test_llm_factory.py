from app.config import Settings
from app.llm.factory import create_llm_client
from app.llm.ollama_client import OllamaClient
from app.llm.openai_compatible_client import OpenAiCompatibleClient


def test_creates_ollama_client():
    settings = Settings(llm_provider="ollama")
    client = create_llm_client(settings)
    assert isinstance(client, OllamaClient)


def test_creates_lmstudio_client():
    settings = Settings(llm_provider="lmstudio")
    client = create_llm_client(settings)
    assert isinstance(client, OpenAiCompatibleClient)


def test_creates_openai_client():
    settings = Settings(llm_provider="openai", openai_api_key="sk-test")
    client = create_llm_client(settings)
    assert isinstance(client, OpenAiCompatibleClient)


def test_creates_openrouter_client():
    settings = Settings(llm_provider="openrouter", openrouter_api_key="sk-test")
    client = create_llm_client(settings)
    assert isinstance(client, OpenAiCompatibleClient)
