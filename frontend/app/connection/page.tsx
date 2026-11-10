
"use client";

import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [mode, setMode] = useState("AUTO");

  function sendMessage() {
    const text = message.trim();

    if (!text) return;

    setMessages((previous) => [...previous, text]);
    setMessage("");
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

        <button className="new-chat">＋ Nueva conversación</button>

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
            <span className="breadcrumb-current">CENTRO DE INTELIGENCIA</span>
          </div>

          <div className="topbar-right">
            <span className="connection-status">
              <span className="status-dot" /> ONLINE
            </span>
            <button className="settings-button">⚙</button>
          </div>
        </header>

        <div className="main-content">
          <div className="welcome-label">
            <span /> NÚCLEO DE INTELIGENCIA ACTIVO
          </div>

          <div className="core-container">
            <div className="core-ring ring-one" />
            <div className="core-ring ring-two" />
            <div className="core-ring ring-three" />

            <div className="core-orb">
              <div className="core-inner">
                <span className="core-symbol">N</span>
              </div>
            </div>

            <div className="core-particle particle-one" />
            <div className="core-particle particle-two" />
            <div className="core-particle particle-three" />
          </div>

          <h2 className="welcome-title">
            ¿En qué puedo <span>ayudarte?</span>
          </h2>

          <p className="welcome-description">
            Soy Nexuz. Tu centro de inteligencia artificial.
            <br />
            Cuéntame qué necesitas y encontraremos la mejor solución.
          </p>

          <div className="quick-actions">
            <button onClick={() => setMessage("Ayúdame a desarrollar un proyecto")}>
              <span>⌘</span>
              Desarrollar un proyecto
            </button>
            <button onClick={() => setMessage("Analiza este documento")}>
              <span>▤</span>
              Analizar información
            </button>
            <button onClick={() => setMessage("Ayúdame a escribir código")}>
              <span>〈/〉</span>
              Programar
            </button>
          </div>

          <div className="conversation">
            {messages.map((item, index) => (
              <div className="user-message" key={index}>
                {item}
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
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
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="AUTO">◈ AUTO</option>
                  <option value="ECONOMY">ECONOMY</option>
                  <option value="QUALITY">QUALITY</option>
                </select>
              </div>

              <button className="send-button" onClick={sendMessage}>
                ↑
              </button>
            </div>
          </div>

          <div className="footer-note">
            NEXUZ AI · MULTI-MODEL INTELLIGENCE · v0.1.0
          </div>
        </div>
      </section>
    </main>
  );
}
