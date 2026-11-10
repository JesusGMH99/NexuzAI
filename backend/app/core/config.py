from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env (funciona sin importar desde dónde arranques uvicorn)
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # Modelo por modo. Se pueden cambiar desde backend/.env sin tocar código.
    groq_model_economy: str = "openai/gpt-oss-20b"
    groq_model_auto: str = "openai/gpt-oss-120b"
    groq_model_quality: str = "openai/gpt-oss-120b"


settings = Settings()