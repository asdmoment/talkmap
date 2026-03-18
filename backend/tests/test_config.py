import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.config as config


def test_get_settings_reads_llm_provider_configuration(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    settings = config.get_settings()

    assert settings.llm_provider == "openrouter"
    assert settings.openrouter_base_url == "https://openrouter.ai/api/v1"
    assert settings.openrouter_model == "openai/gpt-4o-mini"
    assert settings.openrouter_api_key == "test-key"


def test_get_settings_reads_values_from_dotenv_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "\n".join(
            [
                "ASR_PROVIDER=local",
                "ASR_MODEL=/tmp/faster-whisper-large-v3",
                "ASR_DEVICE=cpu",
                "ASR_COMPUTE_TYPE=int8",
                "LLM_PROVIDER=openrouter",
                "OPENROUTER_MODEL=minimax/minimax-m2.5:free",
                "OPENROUTER_API_KEY=test-openrouter-key",
            ]
        ),
        encoding="utf-8",
    )

    for name in (
        "ASR_PROVIDER",
        "ASR_MODEL",
        "ASR_DEVICE",
        "ASR_COMPUTE_TYPE",
        "LLM_PROVIDER",
        "OPENROUTER_MODEL",
        "OPENROUTER_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = config.get_settings()

    assert settings.asr_provider == "local"
    assert settings.asr_model == "/tmp/faster-whisper-large-v3"
    assert settings.asr_device == "cpu"
    assert settings.asr_compute_type == "int8"
    assert settings.llm_provider == "openrouter"
    assert settings.openrouter_model == "minimax/minimax-m2.5:free"
    assert settings.openrouter_api_key == "test-openrouter-key"
    assert settings.llm_status == "ready"


def test_get_settings_uses_current_local_asr_and_openrouter_defaults(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    for name in (
        "ASR_PROVIDER",
        "ASR_LANGUAGE_CODE",
        "GOOGLE_STT_MODEL",
        "GROQ_ASR_MODEL",
        "GROQ_API_KEY",
        "ASR_MODEL",
        "ASR_DEVICE",
        "ASR_COMPUTE_TYPE",
        "LLM_PROVIDER",
        "OPENROUTER_MODEL",
        "OPENROUTER_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = config.get_settings()

    assert settings.asr_provider == "local"
    assert settings.asr_language_code == "zh-CN"
    assert settings.asr_model == "large-v3"
    assert settings.asr_device == "auto"
    assert settings.asr_compute_type == "float16"
    assert settings.llm_provider == "openrouter"
    assert settings.openrouter_model == "google/gemini-2.0-flash-001"


def test_get_settings_reads_asr_provider_and_default_llm_path(monkeypatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "google")
    monkeypatch.setenv("ASR_LANGUAGE_CODE", "zh-CN")
    monkeypatch.setenv("GOOGLE_STT_MODEL", "latest_long")
    monkeypatch.setenv("GROQ_ASR_MODEL", "whisper-large-v3")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_MODEL", "qwen/qwen3-next-80b-a3b-instruct:free")

    settings = config.get_settings()

    assert settings.asr_provider == "google"
    assert settings.asr_language_code == "zh-CN"
    assert settings.google_stt_model == "latest_long"
    assert settings.groq_asr_model == "whisper-large-v3"
    assert settings.groq_api_key == "test-groq-key"
    assert settings.llm_provider == "openrouter"
    assert settings.openrouter_model == "qwen/qwen3-next-80b-a3b-instruct:free"


def test_get_settings_rejects_unknown_provider_values(monkeypatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "mystery")

    with pytest.raises(ValueError, match="ASR_PROVIDER"):
        config.get_settings()


def test_get_settings_rejects_invalid_ollama_timeout(monkeypatch) -> None:
    monkeypatch.setenv("OLLAMA_TIMEOUT_SECONDS", "not-a-number")

    with pytest.raises(ValueError, match="OLLAMA_TIMEOUT_SECONDS"):
        config.get_settings()
