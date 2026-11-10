from typing import AsyncIterator

from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    AsyncOpenAI,
    AsyncStream,
    AuthenticationError,
    RateLimitError,
)

from backend.app.core.config import settings


class ProviderError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client

    if not settings.groq_api_key:
        raise ProviderError(500, "Falta GROQ_API_KEY en backend/.env.")

    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
            timeout=60.0,
            max_retries=1,
        )
    return _client


def _map_error(error: Exception, model: str) -> ProviderError:
    """Convierte errores del SDK en mensajes claros para el usuario."""
    if isinstance(error, AuthenticationError):
        return ProviderError(500, "Groq rechazó la clave. Revisa GROQ_API_KEY en backend/.env.")
    if isinstance(error, RateLimitError):
        return ProviderError(
            429,
            "Se alcanzó el límite gratuito de Groq. Espera un momento e inténtalo de nuevo.",
        )
    if isinstance(error, APIConnectionError):
        return ProviderError(503, "No pude conectar con Groq. Revisa tu conexión a internet.")
    if isinstance(error, APIStatusError):
        return ProviderError(
            502,
            f"Groq respondió con error {error.status_code}. "
            f"Revisa que el modelo '{model}' exista (GET /models).",
        )
    return ProviderError(502, "Groq devolvió un error inesperado.")


def _extra_body(model: str, reasoning_effort: str | None) -> dict | None:
    # Los modelos gpt-oss razonan antes de responder; el esfuerzo se controla así.
    if reasoning_effort and model.startswith("openai/gpt-oss"):
        return {"reasoning_effort": reasoning_effort}
    return None


async def generate(
    messages: list[dict],
    model: str,
    max_tokens: int,
    reasoning_effort: str | None = None,
) -> str:
    client = _get_client()

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
            extra_body=_extra_body(model, reasoning_effort),
        )
    except APIError as error:
        raise _map_error(error, model)

    choice = response.choices[0] if response.choices else None
    text = choice.message.content if choice else None

    if not text or not text.strip():
        if choice and choice.finish_reason == "length":
            raise ProviderError(
                502,
                "El modelo se quedó sin espacio para responder. Prueba con una pregunta más corta o el modo QUALITY.",
            )
        raise ProviderError(502, "Groq devolvió una respuesta vacía.")

    return text.strip()


async def open_stream(
    messages: list[dict],
    model: str,
    max_tokens: int,
    reasoning_effort: str | None = None,
) -> AsyncStream:
    """Abre la respuesta en vivo. Los errores iniciales (clave, límite, modelo) salen aquí."""
    client = _get_client()

    try:
        return await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
            stream=True,
            extra_body=_extra_body(model, reasoning_effort),
        )
    except APIError as error:
        raise _map_error(error, model)


async def iter_text(stream: AsyncStream, model: str) -> AsyncIterator[str]:
    """Entrega solo el texto de la respuesta, trozo a trozo."""
    try:
        async for chunk in stream:
            if not chunk.choices:
                continue
            text = getattr(chunk.choices[0].delta, "content", None)
            if text:
                yield text
    except APIError as error:
        raise _map_error(error, model)


async def list_models() -> list[str]:
    client = _get_client()
    try:
        models = await client.models.list()
    except Exception:
        raise ProviderError(502, "No pude obtener la lista de modelos de Groq.")
    return sorted(model.id for model in models.data)