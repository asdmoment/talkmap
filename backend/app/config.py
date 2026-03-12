import os
from dataclasses import dataclass
from typing import Literal, cast


Status = Literal["unconfigured", "ready", "error"]
LlmProvider = Literal["ollama", "lmstudio", "openai", "openrouter"]


@dataclass(frozen=True)
class Settings:
    asr_status: Status = "unconfigured"
    llm_status: Status = "unconfigured"
    data_dir: str = "data"
    asr_model: str = "base.en"
    asr_device: str = "cpu"
    asr_compute_type: str = "int8"
    llm_provider: LlmProvider = "ollama"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_timeout_seconds: float = 30.0
    lmstudio_base_url: str = "http://127.0.0.1:1234/v1"
    lmstudio_model: str = "local-model"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_api_key: str | None = None


def get_settings() -> Settings:
    return Settings(
        data_dir=os.getenv("VOICE_MAP_DATA_DIR", "data"),
        asr_model=os.getenv("ASR_MODEL", "base.en"),
        asr_device=os.getenv("ASR_DEVICE", "cpu"),
        asr_compute_type=os.getenv("ASR_COMPUTE_TYPE", "int8"),
        llm_provider=cast(LlmProvider, os.getenv("LLM_PROVIDER", "ollama")),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        ollama_model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
        ollama_timeout_seconds=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "30")),
        lmstudio_base_url=os.getenv("LMSTUDIO_BASE_URL", "http://127.0.0.1:1234/v1"),
        lmstudio_model=os.getenv("LMSTUDIO_MODEL", "local-model"),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openrouter_base_url=os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        ),
        openrouter_model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
    )
