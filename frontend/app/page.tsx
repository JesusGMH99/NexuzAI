"use client";

import { useEffect, useRef, useState } from "react";
import NexuzCore, { CoreState } from "./components/NexuzCore";
import MessageContent from "./components/MessageContent";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// Distancia (px) al final del chat para considerar que sigues "pegado" abajo
const NEAR_BOTTOM = 60;

type Role = "user" | "assistant";

type Msg = {
  role: Role;
  content: string;
  error?: boolean;
  model?: string;
};

type StreamEvent = { t: string; v?: string; model?: string };

// "openai/gpt-oss-120b" -> "gpt-oss-120b"
function shortModel(model?: string) {
  if (!model) return "";
  return model.split("/").pop() ?? model;
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setMode] = useState("AUTO");
  const [loading, setLoading] = useState(false);
  const [corruption, setCorruption] = useState(0);
  const [debug, setDebug] = useState(false);
  const [busyState, setBusyState] = useState<CoreState | null>(null);
  const [showJump, setShowJump] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const conversationId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true); // true = el chat sigue el final solo
  const abortRef = useRef<AbortController | null>(null);

  // El slider de corrupción solo aparece con localhost:3000/?debug
  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).has("debug"));
    return () => {
      timers.current.forEach(clearTimeout);
      abortRef.current?.abort();
    };
  }, []);

  // Esc detiene la respuesta, esté donde esté el cursor
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // El cuadro de escritura crece con el texto (hasta cierto límite)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [message]);

  // Sigue el final solo si no te has alejado hacia arriba
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = atBottom;
    setShowJump(!atBottom);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  }

  function focusInput() {
    // En móvil no se enfoca solo, para que no salte el teclado
    if (window.innerWidth > 700) inputRef.current?.focus();
  }

  // Con conversación activa el núcleo se encoge y queda fijo arriba
  const chatting = messages.length > 0;

  // Puntos de "pensando": solo mientras no ha llegado la primera palabra
  const waiting = loading && messages[messages.length - 1]?.role === "user";

  // Estado del núcleo: ocupado manda; si no, "listening" mientras se escribe, o "idle".
  const coreState: CoreState =
    busyState ?? (message.trim().length > 0 ? "listening" : "idle");

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function stopMessage() {
    abortRef.current?.abort();
  }

  async function sendMessage() {
    const text = message.trim();

    if (!text || loading) return;

    const myConversation = conversationId.current;

    // Historial previo (sin el mensaje actual y sin mensajes de error)
    const history = messages
      .filter((m) => !m.error)
      .slice(-40)
      .map(({ role, content }) => ({ role, content }));

    const controller = new AbortController();
    abortRef.current = controller;

    stick.current = true; // al enviar, vuelves al final
    setShowJump(false);
    setMessages((previous) => [...previous, { role: "user", content: text }]);
    setMessage("");
    setLoading(true);
    clearTimers();
    setBusyState("thinking");

    let full = "";
    let usedModel = "";
    let started = false;
    let raf = 0;

    // Pinta el texto acumulado (máximo una vez por fotograma)
    const flush = () => {
      raf = 0;
      if (myConversation !== conversationId.current) return;
      const content = full;
      const model = usedModel;
      setMessages((previous) => {
        const copy = [...previous];
        const last = copy.length - 1;
        if (last >= 0 && copy[last].role === "assistant" && !copy[last].error) {
          copy[last] = {
            ...copy[last],
            content,
            model: model || copy[last].model,
          };
        }
        return copy;
      });
    };

    const handleLine = (line: string) => {
      if (!line.trim()) return;

      let evt: StreamEvent;
      try {
        evt = JSON.parse(line);
      } catch {
        return;
      }

      if (evt.t === "delta" && evt.v) {
        full += evt.v;
        if (!started) {
          started = true;
          setMessages((previous) => [
            ...previous,
            { role: "assistant", content: full },
          ]);
          setBusyState("speaking");
        } else if (!raf) {
          raf = requestAnimationFrame(flush);
        }
      } else if (evt.t === "done") {
        if (evt.model) usedModel = evt.model;
      } else if (evt.t === "error") {
        throw new Error(evt.v || "Error durante la respuesta.");
      }
    };

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode, history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // sin detalle
        }
        throw new Error(detail || `Error del servidor (${response.status}).`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Tu navegador no soporta respuestas en vivo.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Si se inició otra conversación, se corta esta
        if (myConversation !== conversationId.current) {
          reader.cancel();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }

      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);

      if (myConversation !== conversationId.current) return;

      if (!started) {
        throw new Error("Nexuz no devolvió ninguna respuesta.");
      }

      // Último pintado con el texto completo (y el modelo que respondió)
      if (raf) cancelAnimationFrame(raf);
      flush();

      setBusyState("important");
      timers.current.push(setTimeout(() => setBusyState(null), 2600));
    } catch (error) {
      if (raf) cancelAnimationFrame(raf);
      if (myConversation !== conversationId.current) return;

      // Detenido por el usuario: se conserva lo recibido y no se muestra error
      if (error instanceof DOMException && error.name === "AbortError") {
        if (started) flush();
        setBusyState(null);
        return;
      }

      // Si ya había texto, se muestra lo recibido antes del error
      if (started) flush();

      // Un fallo de red lanza TypeError; los errores del backend traen su mensaje
      const errorText =
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "Se perdió la conexión con el backend. Revisa que esté encendido en el puerto 8000 e inténtalo de nuevo.";

      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: errorText, error: true },
      ]);
      setBusyState(null);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (myConversation === conversationId.current) {
        setLoading(false);
        focusInput();
      }
    }
  }

  function newConversation() {
    conversationId.current += 1;
    abortRef.current?.abort();
    clearTimers();
    stick.current = true;
    setShowJump(false);
    setBusyState(null);
    setLoading(false);
    setMessages([]);
    setMessage("");
    focusInput();
  }

  function quickAction(text: string) {
    setMessage(text);
    focusInput();
  }

  return (
    <main className="nexuz-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">N</div>
          <div>
            <h1>NEXUZ<span>AI</span></h1>
            <small>INTELLIGENCE SYSTEM</small>
          </div>
        </div>

        <button className="new-chat" onClick={newConversation}>
          ＋ Nueva conversación
        </button>

        <div className="sidebar-section">
          <span>PLATAFORMA</span>
          <button>◈ Inteligencia artificial</button>
          <button>⌘ Herramientas</button>
          <button>◷ Historial</button>
          <button>▤ Archivos</button>
        </div>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot" />
            SISTEMA OPERATIVO
          </div>

          <div className="profile">
            <div className="profile-avatar">U</div>
            <div>
              <strong>Usuario</strong>
              <small>Cuenta personal</small>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">NEXUZ AI</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">
              CENTRO DE INTELIGENCIA
            </span>
          </div>

          <div className="topbar-right">
            <button
              className="topbar-new"
              onClick={newConversation}
              title="Nueva conversación"
            >
              ＋ Nuevo
            </button>
            <span className="connection-status">
              <span className="status-dot" /> ONLINE
            </span>
            <button className="settings-button">⚙</button>
          </div>
        </header>

        <div
          className={`main-content nz-main${chatting ? " nz-chatting" : ""}`}
        >
          {/* PARTE FIJA: núcleo (y bienvenida si aún no hay chat) */}
          <div className="nz-top">
            {!chatting && (
              <div className="welcome-label">
                <span /> NÚCLEO DE INTELIGENCIA ACTIVO
              </div>
            )}

            <div
              className={`core-stage nz-stage${chatting ? " nz-compact" : ""}`}
            >
              <div className="nz-stage-inner">
                <NexuzCore
                  state={coreState}
                  corruption={corruption}
                  compact={chatting}
                />
              </div>
            </div>

            {/* Solo visible con /?debug */}
            {debug && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={corruption}
                onChange={(event) => setCorruption(Number(event.target.value))}
                style={{ width: 220, margin: "0 auto", display: "block" }}
              />
            )}

            {!chatting && (
              <>
                <h2 className="welcome-title">
                  ¿En qué puedo <span>ayudarte?</span>
                </h2>

                <p className="welcome-description">
                  Soy Nexuz. Tu centro de inteligencia artificial.
                  <br />
                  Cuéntame qué necesitas y encontraremos la mejor solución.
                </p>

                <div className="quick-actions">
                  <button
                    onClick={() => quickAction("Ayúdame a desarrollar un proyecto")}
                  >
                    <span>⌘</span>
                    Desarrollar un proyecto
                  </button>

                  <button onClick={() => quickAction("Analiza este documento")}>
                    <span>▤</span>
                    Analizar información
                  </button>

                  <button
                    onClick={() => quickAction("Ayúdame a escribir código")}
                  >
                    <span>〈/〉</span>
                    Programar
                  </button>
                </div>
              </>
            )}
          </div>

          {/* CHAT: tiene su propio scroll */}
          <div className="nz-scroll-wrap">
            <div className="nz-scroll" ref={scrollRef} onScroll={onScroll}>
              <div className="conversation">
                {messages.map((item, index) => {
                  if (item.role === "user") {
                    return (
                      <div className="user-message" key={index}>
                        {item.content}
                      </div>
                    );
                  }

                  if (item.error) {
                    return (
                      <div className="bot-message bot-error" key={index}>
                        {item.content}
                      </div>
                    );
                  }

                  const streaming = loading && index === messages.length - 1;

                  return (
                    <div className="bot-wrap" key={index}>
                      <div className="bot-message md">
                        <MessageContent content={item.content} />
                      </div>
                      {item.model && !streaming && (
                        <div className="bot-meta">
                          ◈ {shortModel(item.model)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {waiting && (
                  <div className="bot-message bot-thinking" aria-live="polite">
                    <span /> <span /> <span />
                  </div>
                )}
              </div>
            </div>

            {showJump && chatting && (
              <button
                className="jump-bottom"
                onClick={jumpToBottom}
                title="Ir al final"
                aria-label="Ir al final del chat"
              >
                ↓
              </button>
            )}
          </div>

          {/* PARTE FIJA: cuadro de escritura */}
          <div className="nz-bottom">
            <div className="composer">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Escribe un mensaje para Nexuz..."
                rows={2}
              />

              <div className="composer-footer">
                <div className="composer-tools">
                  <button title="Adjuntar archivo">＋</button>
                  <button title="Herramientas">◇</button>

                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    title="Modo de respuesta"
                  >
                    <option value="AUTO">◈ AUTO</option>
                    <option value="ECONOMY">ECONOMY</option>
                    <option value="QUALITY">QUALITY</option>
                  </select>
                </div>

                {loading ? (
                  <button
                    className="send-button stop"
                    onClick={stopMessage}
                    title="Detener respuesta (Esc)"
                    aria-label="Detener respuesta"
                  >
                    ■
                  </button>
                ) : (
                  <button
                    className="send-button"
                    onClick={sendMessage}
                    aria-label="Enviar mensaje"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>

            <div className="footer-note">
              NEXUZ AI · MULTI-MODEL INTELLIGENCE · v0.1.0
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}