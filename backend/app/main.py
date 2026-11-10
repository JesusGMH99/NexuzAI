import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.app.core.config import settings
from backend.app.core.persona import SYSTEM_PROMPT
from backend.app.modules.ai_providers import groq_provider
from backend.app.modules.ai_providers.groq_provider import ProviderError

app = FastAPI(
    title="Nexuz AI",
    description="Sistema inteligente de múltiples modelos de inteligencia artificial.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Smart Router mínimo: por ahora el modo decide modelo, largo y esfuerzo de razonamiento.
MODE_CONFIG = {
    "ECONOMY": {
        "model": lambda: settings.groq_model_economy,
        "max_tokens": 1500,
        "effort": "low",
    },
    "AUTO": {
        "model": lambda: settings.groq_model_auto,
        "max_tokens": 2500,
        "effort": "low",
    },
    "QUALITY": {
        "model": lambda: settings.groq_model_quality,
        "max_tokens": 4000,
        "effort": "medium",
    },
}

MAX_HISTORY = 20


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    mode: Literal["AUTO", "ECONOMY", "QUALITY"] = "AUTO"
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)


class ChatResponse(BaseModel):
    reply: str
    mode: str
    model: str


def build_request(request: ChatRequest):
    """Arma modelo, límites y mensajes a partir de la petición."""
    config = MODE_CONFIG[request.mode]
    model = config["model"]()

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [
        {"role": item.role, "content": item.content}
        for item in request.history[-MAX_HISTORY:]
    ]
    messages.append({"role": "user", "content": request.message})

    return config, model, messages


def event(payload: dict) -> str:
    """Una línea JSON por evento (formato NDJSON)."""
    return json.dumps(payload, ensure_ascii=False) + "\n"


@app.get("/")
async def root():
    return {
        "name": "Nexuz AI",
        "status": "online",
        "message": "Nexuz Core initialized.",
        "version": "0.1.0",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Nexuz Backend",
    }


@app.get("/models")
async def models():
    """Lista los modelos disponibles en tu cuenta de Groq."""
    try:
        return {"provider": "groq", "models": await groq_provider.list_models()}
    except ProviderError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    config, model, messages = build_request(request)

    try:
        reply = await groq_provider.generate(
            messages=messages,
            model=model,
            max_tokens=config["max_tokens"],
            reasoning_effort=config["effort"],
        )
    except ProviderError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    return ChatResponse(reply=reply, mode=request.mode, model=model)


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    config, model, messages = build_request(request)

    # Los errores iniciales (clave, límite, modelo) salen como error HTTP normal
    try:
        stream = await groq_provider.open_stream(
            messages=messages,
            model=model,
            max_tokens=config["max_tokens"],
            reasoning_effort=config["effort"],
        )
    except ProviderError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    async def events():
        got_text = False
        try:
            async for piece in groq_provider.iter_text(stream, model):
                got_text = True
                yield event({"t": "delta", "v": piece})

            if got_text:
                yield event({"t": "done", "model": model, "mode": request.mode})
            else:
                yield event(
                    {
                        "t": "error",
                        "v": "El modelo no devolvió texto. Prueba con una pregunta más corta o el modo QUALITY.",
                    }
                )
        except ProviderError as error:
            # Error a mitad de la respuesta: ya no se puede cambiar el código HTTP
            yield event({"t": "error", "v": error.message})
        finally:
            try:
                await stream.close()
            except Exception:
                pass

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )