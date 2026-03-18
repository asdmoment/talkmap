import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeVar, cast, get_args


Status = Literal["unconfigured", "ready", "error"]
AsrProvider = Literal["google", "groq", "local"]
LlmProvider = Literal["ollama", "lmstudio", "openai", "openrouter"]
LiteralChoice = TypeVar("LiteralChoice", bound=str)


def _load_dotenv_values() -> dict[str, str]:
    current_dir = Path.cwd()
    for directory in (current_dir, *current_dir.parents):
        dotenv_path = directory / ".env"
        if not dotenv_path.is_file():
            continue

        values: dict[str, str] = {}
        for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", maxsplit=1)
            key = key.strip()
            if key.startswith("export "):
                key = key.removeprefix("export ").strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            values[key] = value

        return values

    return {}


def _get_env_value(
    name: str,
    default: str | None = None,
    *,
    dotenv_values: dict[str, str],
) -> str | None:
    value = os.getenv(name)
    if value is not None:
        return value

    if name in dotenv_values:
        return dotenv_values[name]

    return default


@dataclass(frozen=True)
class Settings:
    asr_status: Status = "unconfigured"
    llm_status: Status = "unconfigured"
    data_dir: str = "data"
    asr_provider: AsrProvider = "local"
    asr_language_code: str = "zh-CN"
    google_stt_model: str = "latest_long"
    groq_asr_model: str = "whisper-large-v3"
    groq_api_key: str | None = None
    asr_model: str = "large-v3"
    asr_device: str = "auto"
    asr_compute_type: str = "float16"
    llm_provider: LlmProvider = "openrouter"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_timeout_seconds: float = 30.0
    lmstudio_base_url: str = "http://127.0.0.1:1234/v1"
    lmstudio_model: str = "local-model"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "qwen/qwen3-coder:free"
    openrouter_api_key: str | None = None


def _get_literal_value(
    name: str,
    default: LiteralChoice,
    allowed: tuple[LiteralChoice, ...],
    *,
    dotenv_values: dict[str, str],
) -> LiteralChoice:
    value = _get_env_value(name, default, dotenv_values=dotenv_values)
    if value not in allowed:
        allowed_values = ", ".join(allowed)
        raise ValueError(f"{name} must be one of: {allowed_values}")
    return cast(LiteralChoice, value)


def _get_float_value(
    name: str, default: str, *, dotenv_values: dict[str, str]
) -> float:
    raw_value = _get_env_value(name, default, dotenv_values=dotenv_values)
    try:
        return float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a valid float") from exc


def _resolve_asr_status(
    *, asr_provider: AsrProvider, asr_model: str, groq_api_key: str | None
) -> Status:
    if asr_provider == "local":
        return "ready" if asr_model else "unconfigured"
    if asr_provider == "groq":
        return "ready" if groq_api_key else "unconfigured"
    return "ready"


def _resolve_llm_status(
    *, llm_provider: LlmProvider, openai_api_key: str | None, openrouter_api_key: str | None
) -> Status:
    if llm_provider in ("ollama", "lmstudio"):
        return "ready"
    if llm_provider == "openai" and openai_api_key:
        return "ready"
    if llm_provider == "openrouter" and openrouter_api_key:
        return "ready"
    return "unconfigured"


def get_settings() -> Settings:
    dotenv_values = _load_dotenv_values()

    asr_provider = _get_literal_value(
        "ASR_PROVIDER",
        "local",
        get_args(AsrProvider),
        dotenv_values=dotenv_values,
    )
    llm_provider = _get_literal_value(
        "LLM_PROVIDER",
        "openrouter",
        get_args(LlmProvider),
        dotenv_values=dotenv_values,
    )
    asr_model = _get_env_value("ASR_MODEL", "large-v3", dotenv_values=dotenv_values)
    groq_api_key = _get_env_value("GROQ_API_KEY", dotenv_values=dotenv_values)
    openai_api_key = _get_env_value("OPENAI_API_KEY", dotenv_values=dotenv_values)
    openrouter_api_key = _get_env_value(
        "OPENROUTER_API_KEY", dotenv_values=dotenv_values
    )

    return Settings(
        asr_status=_resolve_asr_status(
            asr_provider=asr_provider,
            asr_model=asr_model,
            groq_api_key=groq_api_key,
        ),
        llm_status=_resolve_llm_status(
            llm_provider=llm_provider,
            openai_api_key=openai_api_key,
            openrouter_api_key=openrouter_api_key,
        ),
        data_dir=_get_env_value("VOICE_MAP_DATA_DIR", "data", dotenv_values=dotenv_values),
        asr_provider=asr_provider,
        asr_language_code=_get_env_value(
            "ASR_LANGUAGE_CODE", "zh-CN", dotenv_values=dotenv_values
        ),
        google_stt_model=_get_env_value(
            "GOOGLE_STT_MODEL", "latest_long", dotenv_values=dotenv_values
        ),
        groq_asr_model=_get_env_value(
            "GROQ_ASR_MODEL", "whisper-large-v3", dotenv_values=dotenv_values
        ),
        groq_api_key=groq_api_key,
        asr_model=asr_model,
        asr_device=_get_env_value("ASR_DEVICE", "auto", dotenv_values=dotenv_values),
        asr_compute_type=_get_env_value(
            "ASR_COMPUTE_TYPE", "float16", dotenv_values=dotenv_values
        ),
        llm_provider=llm_provider,
        ollama_base_url=_get_env_value(
            "OLLAMA_BASE_URL", "http://127.0.0.1:11434", dotenv_values=dotenv_values
        ),
        ollama_model=_get_env_value(
            "OLLAMA_MODEL", "llama3.1:8b", dotenv_values=dotenv_values
        ),
        ollama_timeout_seconds=_get_float_value(
            "OLLAMA_TIMEOUT_SECONDS", "30", dotenv_values=dotenv_values
        ),
        lmstudio_base_url=_get_env_value(
            "LMSTUDIO_BASE_URL", "http://127.0.0.1:1234/v1", dotenv_values=dotenv_values
        ),
        lmstudio_model=_get_env_value(
            "LMSTUDIO_MODEL", "local-model", dotenv_values=dotenv_values
        ),
        openai_base_url=_get_env_value(
            "OPENAI_BASE_URL", "https://api.openai.com/v1", dotenv_values=dotenv_values
        ),
        openai_model=_get_env_value(
            "OPENAI_MODEL", "gpt-4o-mini", dotenv_values=dotenv_values
        ),
        openai_api_key=openai_api_key,
        openrouter_base_url=_get_env_value(
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
            dotenv_values=dotenv_values,
        ),
        openrouter_model=_get_env_value(
            "OPENROUTER_MODEL",
            "google/gemini-2.0-flash-001",
            dotenv_values=dotenv_values,
        ),
        openrouter_api_key=openrouter_api_key,
    )
