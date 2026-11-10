"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./NexuzCore.css";

export type CoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "important";

type Props = {
  state?: CoreState;
  corruption?: number; // 0 a 1
  size?: number;
  compact?: boolean; // true cuando el núcleo se muestra pequeño: engrosa las líneas
};

type SpinKey =
  | "blades"
  | "crescents"
  | "r1"
  | "r2"
  | "r3"
  | "inner"
  | "scan"
  | "orbA"
  | "orbB";

type Motion = {
  spin: Record<SpinKey, number>; // grados por segundo
  pulseAmp: number;
  pulseFreq: number; // Hz
  pupilAmp: number;
  pupilFreq: number; // Hz
};

const SPIN_KEYS: SpinKey[] = [
  "blades",
  "crescents",
  "r1",
  "r2",
  "r3",
  "inner",
  "scan",
  "orbA",
  "orbB",
];

// Velocidades objetivo por estado. El movimiento se acerca a ellas de forma suave.
const MOTION: Record<CoreState, Motion> = {
  idle: {
    spin: {
      blades: 12,
      crescents: -14,
      r1: 6,
      r2: -4,
      r3: 10,
      inner: -20,
      scan: 40,
      orbA: 18,
      orbB: -26,
    },
    pulseAmp: 0,
    pulseFreq: 0.4,
    pupilAmp: 0.12,
    pupilFreq: 0.25,
  },
  listening: {
    spin: {
      blades: 34,
      crescents: -40,
      r1: 10,
      r2: -7,
      r3: 16,
      inner: -34,
      scan: 80,
      orbA: 34,
      orbB: -48,
    },
    pulseAmp: 0.02,
    pulseFreq: 0.7,
    pupilAmp: 0.16,
    pupilFreq: 0.6,
  },
  thinking: {
    spin: {
      blades: 260,
      crescents: -170,
      r1: 60,
      r2: -90,
      r3: 150,
      inner: -220,
      scan: 460,
      orbA: 170,
      orbB: -250,
    },
    pulseAmp: 0.03,
    pulseFreq: 2.2,
    pupilAmp: 0.2,
    pupilFreq: 2.6,
  },
  speaking: {
    spin: {
      blades: 120,
      crescents: -95,
      r1: 26,
      r2: -20,
      r3: 44,
      inner: -110,
      scan: 220,
      orbA: 85,
      orbB: -125,
    },
    pulseAmp: 0.06,
    pulseFreq: 2.4,
    pupilAmp: 0.32,
    pupilFreq: 2.6,
  },
  important: {
    spin: {
      blades: 90,
      crescents: -64,
      r1: 22,
      r2: -15,
      r3: 36,
      inner: -90,
      scan: 150,
      orbA: 64,
      orbB: -95,
    },
    pulseAmp: 0.11,
    pulseFreq: 1.3,
    pupilAmp: 0.3,
    pupilFreq: 1.3,
  },
};

// Cada cuánto (segundos, mínimo y máximo) aparece un destello por estado
const GLINT_EVERY: Record<CoreState, [number, number]> = {
  idle: [2.5, 6],
  listening: [1.2, 3],
  thinking: [0.25, 0.6],
  speaking: [0.2, 0.6],
  important: [0.3, 0.8],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

function mix(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
) {
  return `rgb(${lerp(c1[0], c2[0], t)},${lerp(c1[1], c2[1], t)},${lerp(
    c1[2],
    c2[2],
    t
  )})`;
}

// Cuchilla larga en forma de lente: delgada y con las dos puntas muy afiladas
const BLADE = "M 0,-146 C 19,-70 19,70 0,146 C -19,70 -19,-70 0,-146 Z";

// Línea fina interior de la cuchilla
const BLADE_INNER = "M 0,-124 C 10,-56 10,56 0,124 C -10,56 -10,-56 0,-124 Z";

// Cuchilla corta decorativa (solo contorno), entre las largas
const BLADE_SHORT = "M 0,-98 C 11,-46 11,46 0,98 C -11,46 -11,-46 0,-98 Z";

// Media luna oscura
const CRESCENT =
  "M -116.5,-42.4 A 124 124 0 0 1 62,-107.4 A 160 160 0 0 0 -116.5,-42.4 Z";

// Grietas (etapa 1 de la corrupción)
const CRACKS = [
  "M 0,-46 L -8,-78 L 6,-104 L -4,-140 L 4,-168",
  "M 40,-24 L 66,-48 L 62,-78 L 92,-100 L 100,-132",
  "M 40,24 L 70,30 L 82,58 L 114,64 L 140,92",
  "M 0,46 L 10,80 L -6,108 L 6,142 L -2,170",
  "M -40,24 L -66,48 L -62,78 L -92,100 L -100,132",
  "M -40,-24 L -70,-30 L -82,-58 L -114,-64 L -140,-92",
];

// Venas orgánicas que invaden el disco desde el borde hacia el centro (etapa 2)
const VEINS = [
  "M 110,-92 C 90,-70 96,-44 70,-30 C 54,-20 56,-4 40,4",
  "M -128,-60 C -104,-48 -96,-24 -72,-20 C -58,-16 -52,0 -36,6",
  "M -40,134 C -34,108 -56,92 -44,68 C -38,52 -22,50 -16,36",
  "M 70,120 C 74,98 56,86 62,64 C 66,50 52,40 46,28",
  "M 0,-140 C 12,-116 -10,-100 0,-80 C 6,-68 -4,-56 2,-44",
  "M 140,20 C 118,26 108,6 88,14 C 74,20 68,34 52,34",
];

// Astilla que se desprende en la fragmentación avanzada (etapa 5)
const SHARD = "M -6,-166 L 0,-190 L 6,-166 L 0,-172 Z";

// Rombo pequeño para las partículas orbitales
const DIAMOND = "M 0,-199 L 3.6,-195 L 0,-191 L -3.6,-195 Z";

// 3 cuchillas largas = 6 puntas
const BLADE_ANGLES = [0, 60, 120];
const SHORT_ANGLES = [30, 90, 150];
const CRESCENT_ANGLES = [0, 180];
const SHARD_ANGLES = [12, 57, 102, 147, 192, 237, 282, 327];
const ORB_A_ANGLES = [0, 120, 240];
const ORB_B_ANGLES = [60, 240];

// Deformación distinta para cada cuchilla según la corrupción
const WARP_K = [1, -0.7, 0.9];

export default function NexuzCore({
  state = "idle",
  corruption = 0,
  size = 360,
  compact = false,
}: Props) {
  const uid = useId().replace(/:/g, "");

  // Corrupción suavizada: se acerca al valor pedido, así avanza y retrocede sin saltos
  const [c, setC] = useState(clamp01(corruption));
  const targetC = useRef(clamp01(corruption));
  useEffect(() => {
    targetC.current = clamp01(corruption);
  }, [corruption]);

  // Modos de rendimiento y accesibilidad
  const [lite, setLite] = useState(false);
  const [reduced, setReduced] = useState(false);
  const liteRef = useRef(false);
  const reducedRef = useRef(false);
  const docVisible = useRef(true);
  const inView = useRef(true);

  // Referencias a las piezas animadas por JS
  const rootRef = useRef<HTMLDivElement>(null);
  const bladesRef = useRef<SVGGElement>(null);
  const crescentsRef = useRef<SVGGElement>(null);
  const r1Ref = useRef<SVGGElement>(null);
  const r2Ref = useRef<SVGGElement>(null);
  const r3Ref = useRef<SVGGElement>(null);
  const innerRef = useRef<SVGGElement>(null);
  const scanRef = useRef<SVGGElement>(null);
  const orbARef = useRef<SVGGElement>(null);
  const orbBRef = useRef<SVGGElement>(null);
  const flexRef = useRef<SVGGElement>(null);
  const pupilRef = useRef<SVGCircleElement>(null);
  const flashRef = useRef<SVGCircleElement>(null);
  const glintRefs = useRef<(SVGPathElement | null)[]>([]);

  const stateRef = useRef<CoreState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Detecta pantalla pequeña, equipo modesto y preferencia de reducir movimiento
  useEffect(() => {
    const mqSmall = window.matchMedia("(max-width: 640px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
      const l = mqSmall.matches || weak;
      liteRef.current = l;
      reducedRef.current = mqMotion.matches;
      setLite(l);
      setReduced(mqMotion.matches);
    };

    update();
    mqSmall.addEventListener("change", update);
    mqMotion.addEventListener("change", update);
    return () => {
      mqSmall.removeEventListener("change", update);
      mqMotion.removeEventListener("change", update);
    };
  }, []);

  // Pausa la animación si la pestaña está oculta o el núcleo fuera de pantalla
  useEffect(() => {
    const onVisibility = () => {
      docVisible.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (rootRef.current && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([entry]) => {
        inView.current = entry.isIntersecting;
      });
      io.observe(rootRef.current);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  // Bucle de animación continuo: la velocidad cambia suavemente, nunca se reinicia
  useEffect(() => {
    const els: Record<SpinKey, SVGGElement | null> = {
      blades: bladesRef.current,
      crescents: crescentsRef.current,
      r1: r1Ref.current,
      r2: r2Ref.current,
      r3: r3Ref.current,
      inner: innerRef.current,
      scan: scanRef.current,
      orbA: orbARef.current,
      orbB: orbBRef.current,
    };

    const start = MOTION.idle;
    const speed: Record<SpinKey, number> = { ...start.spin };
    const angle: Record<SpinKey, number> = {
      blades: 0,
      crescents: 0,
      r1: 0,
      r2: 0,
      r3: 0,
      inner: 0,
      scan: 0,
      orbA: 0,
      orbB: 0,
    };

    let pulseAmp = start.pulseAmp;
    let pulseFreq = start.pulseFreq;
    let pulsePhase = 0;
    let pupilAmp = start.pupilAmp;
    let pupilFreq = start.pupilFreq;
    let pupilPhase = 0;

    // Vida en reposo: destellos en las aspas y parpadeo de la pupila
    const glint = [0, 0, 0];
    let glintClock = 1.5;
    let flick = 0;

    // Destello de transición: aro de energía al cambiar de estado
    let lastState: CoreState = stateRef.current;
    let flash = 0;

    let cur = targetC.current;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      // Pausado: pestaña oculta o núcleo fuera de pantalla
      if (!docVisible.current || !inView.current) {
        last = now;
        return;
      }
      // Modo ligero: limita a ~30 fps
      if (liteRef.current && now - last < 32) return;

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const reducedMotion = reducedRef.current;
      const m = MOTION[stateRef.current];
      const k = 1 - Math.exp(-dt / 0.45); // suavizado (~0.45 s)
      const rm = reducedMotion ? 0.12 : 1;

      for (const key of SPIN_KEYS) {
        speed[key] += (m.spin[key] - speed[key]) * k;
        angle[key] = (angle[key] + speed[key] * rm * dt) % 360;
        els[key]?.setAttribute("transform", `rotate(${angle[key].toFixed(3)})`);
      }

      pulseAmp += ((reducedMotion ? 0 : m.pulseAmp) - pulseAmp) * k;
      pulseFreq += (m.pulseFreq - pulseFreq) * k;
      pulsePhase += Math.PI * 2 * pulseFreq * dt;
      flexRef.current?.setAttribute(
        "transform",
        `scale(${(1 + pulseAmp * Math.sin(pulsePhase)).toFixed(4)})`
      );

      // Cambio de estado: dispara el aro de energía
      if (stateRef.current !== lastState) {
        lastState = stateRef.current;
        if (!reducedMotion) flash = 1;
      }
      flash = Math.max(0, flash - dt * 1.5);
      if (flashRef.current) {
        const grow = 1 + (1 - flash) * 0.45;
        flashRef.current.setAttribute("opacity", (flash * 0.95).toFixed(3));
        flashRef.current.setAttribute("transform", `scale(${grow.toFixed(3)})`);
      }

      // Destellos aleatorios
      if (!reducedMotion) {
        glintClock -= dt;
        if (glintClock <= 0) {
          const [a, b] = GLINT_EVERY[stateRef.current];
          glintClock = a + Math.random() * (b - a);
          glint[Math.floor(Math.random() * glint.length)] = 1;
          if (Math.random() < 0.4) flick = 1;
        }
      }
      for (let i = 0; i < glint.length; i++) {
        glint[i] = Math.max(0, glint[i] - dt * 1.4);
        glintRefs.current[i]?.setAttribute("opacity", glint[i].toFixed(3));
      }
      flick = Math.max(0, flick - dt * 2.5);

      pupilAmp += (m.pupilAmp - pupilAmp) * k;
      pupilFreq += (m.pupilFreq - pupilFreq) * k;
      pupilPhase += Math.PI * 2 * pupilFreq * dt;
      const pupilScale =
        1 + pupilAmp * (0.5 + 0.5 * Math.sin(pupilPhase)) + flick * 0.35;
      pupilRef.current?.setAttribute("transform", `scale(${pupilScale.toFixed(4)})`);

      // Corrupción: se acerca al objetivo (avanza y retrocede suave)
      const target = targetC.current;
      if (Math.abs(target - cur) > 0.002) {
        cur += (target - cur) * (1 - Math.exp(-dt / 0.5));
        setC(cur);
      } else if (cur !== target) {
        cur = target;
        setC(cur);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Paleta morado oscuro -> corrupción magenta/rojo
  const main = mix([104, 42, 190], [255, 40, 90], c);
  const glow = mix([70, 22, 140], [190, 18, 60], c);
  const bright = mix([176, 136, 250], [255, 170, 190], c);
  const tip = mix([72, 26, 150], [130, 12, 44], c);

  // En modo compacto las líneas finas se engrosan para que no se pierdan
  const w = (n: number) => n * (compact ? 1.6 : 1);

  // Filtros: se omiten en modo ligero
  const glowFilter = lite ? undefined : `url(#glow-${uid})`;
  const displacement = c > 0.2 ? (c - 0.2) * 22 : 0;
  const corruptFilter =
    displacement > 0 && !lite ? `url(#corrupt-${uid})` : undefined;

  // Etapas de la corrupción
  const veinsOpacity = clamp01((c - 0.12) / 0.4) * 0.95;
  const bladeFrag =
    c > 0.45
      ? `${(1 - (c - 0.45) * 0.9).toFixed(2)} ${((c - 0.45) * 0.12 + 0.01).toFixed(3)}`
      : undefined;
  const ringFrag = c > 0.6 ? "0.18 0.03 0.09 0.05" : undefined;
  const shardsOpacity = clamp01((c - 0.6) / 0.4);

  const warp = (i: number) => {
    const kk = WARP_K[i];
    return `rotate(${(c * 9 * kk).toFixed(2)}) scale(${(
      1 -
      c * 0.12 * Math.abs(kk)
    ).toFixed(3)} ${(1 + c * 0.07 * kk).toFixed(3)})`;
  };

  return (
    <div
      ref={rootRef}
      className={`nz-core nz-${state}${lite ? " nz-lite" : ""}${
        reduced ? " nz-reduced" : ""
      }`}
      style={
        {
          width: size,
          height: size,
          "--nz-main": main,
          "--nz-glow": glow,
        } as React.CSSProperties
      }
    >
      <svg
        viewBox="-200 -200 400 400"
        width="100%"
        height="100%"
        role="img"
        aria-label="Núcleo de Nexuz"
      >
        <defs>
          <radialGradient id={`aura-${uid}`}>
            <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
            <stop offset="55%" stopColor={glow} stopOpacity="0.14" />
            <stop offset="100%" stopColor={glow} stopOpacity="0" />
          </radialGradient>

          <radialGradient id={`disc-${uid}`}>
            <stop offset="0%" stopColor={glow} />
            <stop offset="65%" stopColor={main} />
            <stop offset="100%" stopColor={main} />
          </radialGradient>

          {/* Aspas: base oscura y puntas luminosas */}
          <linearGradient
            id={`blade-${uid}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="-146"
            x2="0"
            y2="146"
          >
            <stop offset="0%" stopColor={tip} />
            <stop offset="22%" stopColor="#0a0418" />
            <stop offset="78%" stopColor="#0a0418" />
            <stop offset="100%" stopColor={tip} />
          </linearGradient>

          <radialGradient id={`pupil-${uid}`}>
            <stop offset="0%" stopColor="#fff" />
            <stop offset="45%" stopColor={bright} />
            <stop offset="100%" stopColor={main} />
          </radialGradient>

          <filter
            id={`glow-${uid}`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter
            id={`corrupt-${uid}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves="2"
              seed="7"
              result="n"
            />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={displacement} />
          </filter>
        </defs>

        {/* Aura */}
        <circle className="nz-aura" r="198" fill={`url(#aura-${uid})`} />

        {/* Ondas de energía (respuesta importante) */}
        <circle
          className="nz-wave nz-wave-a"
          r="120"
          fill="none"
          stroke={main}
          strokeWidth="2"
        />
        <circle
          className="nz-wave nz-wave-b"
          r="120"
          fill="none"
          stroke={main}
          strokeWidth="2"
        />

        {/* ANILLOS TEK exteriores segmentados */}
        <g ref={r1Ref} filter={glowFilter}>
          <circle
            r="188"
            fill="none"
            stroke={main}
            strokeWidth={w(1.5)}
            strokeDasharray="60 8 14 8"
            opacity="0.85"
            style={{ strokeDashoffset: c * 40 }}
          />
        </g>
        <g ref={r2Ref}>
          <circle
            r="180"
            fill="none"
            stroke={main}
            strokeWidth="5"
            strokeDasharray="2 7"
            opacity={0.6 - c * 0.25}
          />
          {/* marcas finas tipo regla */}
          <circle
            r="194"
            fill="none"
            stroke={bright}
            strokeWidth={w(4)}
            strokeDasharray="1 9.2"
            opacity={0.4 - c * 0.15}
          />
        </g>
        <g ref={r3Ref}>
          <circle
            r="172"
            fill="none"
            stroke={main}
            strokeWidth={w(1)}
            strokeDasharray={`${120 - c * 70} ${16 + c * 40}`}
            opacity="0.9"
          />
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d="M -7,-172 L 0,-183 L 7,-172 Z"
              fill={main}
              transform={`rotate(${a})`}
            />
          ))}
        </g>

        {/* ESCÁNER: arco luminoso que recorre el borde */}
        <g ref={scanRef} filter={glowFilter}>
          <circle
            r="160"
            fill="none"
            stroke={bright}
            strokeWidth={w(2.2)}
            strokeLinecap="round"
            strokeDasharray="74 931"
            opacity="0.9"
          />
        </g>

        {/* PARTÍCULAS orbitando en sentido contrario */}
        <g ref={orbARef} filter={glowFilter}>
          {ORB_A_ANGLES.map((a) => (
            <circle
              key={`oa-${a}`}
              cx="0"
              cy="-200"
              r={w(2.6)}
              fill={bright}
              transform={`rotate(${a})`}
            />
          ))}
        </g>
        <g ref={orbBRef} filter={glowFilter}>
          {ORB_B_ANGLES.map((a) => (
            <path
              key={`ob-${a}`}
              d={DIAMOND}
              fill={main}
              stroke={bright}
              strokeWidth="0.8"
              transform={`rotate(${a})`}
            />
          ))}
        </g>

        {/* RINNEGAN: ondas concéntricas alrededor del disco */}
        <g className="nz-ripples">
          <circle r="164" fill="none" stroke={main} strokeWidth={w(1)} opacity="0.3" />
          <circle r="156" fill="none" stroke={main} strokeWidth={w(1.2)} opacity="0.4" />
        </g>

        {/* DISCO + MANGEKYŌ (la corrupción deforma este conjunto) */}
        <g filter={corruptFilter}>
          <circle
            r="145"
            pathLength={1}
            fill="none"
            stroke={main}
            strokeWidth="6"
            strokeDasharray={ringFrag}
            filter={glowFilter}
          />
          <circle
            r="134"
            fill={`url(#disc-${uid})`}
            stroke={bright}
            strokeWidth={w(1)}
          />
          <circle
            r="124"
            fill="none"
            stroke={bright}
            strokeWidth={w(1)}
            strokeDasharray="2 6"
            opacity="0.5"
          />

          {/* medias lunas oscuras (giran al revés) */}
          <g ref={crescentsRef} filter={glowFilter}>
            {CRESCENT_ANGLES.map((a) => (
              <path
                key={`cr-${a}`}
                d={CRESCENT}
                fill="#06030f"
                stroke={bright}
                strokeWidth={w(0.8)}
                strokeLinejoin="miter"
                transform={`rotate(${a})`}
              />
            ))}
          </g>

          {/* cuchillas */}
          <g ref={bladesRef}>
            <g ref={flexRef} filter={glowFilter}>
              {/* cortas, solo contorno */}
              {SHORT_ANGLES.map((a) => (
                <path
                  key={`s-${a}`}
                  d={BLADE_SHORT}
                  fill="none"
                  stroke={bright}
                  strokeWidth={w(1)}
                  opacity="0.7"
                  strokeLinejoin="miter"
                  transform={`rotate(${a})`}
                />
              ))}

              {/* largas: se deforman y fragmentan con la corrupción */}
              {BLADE_ANGLES.map((a, i) => (
                <g key={`b-${a}`} transform={`rotate(${a}) ${warp(i)}`}>
                  <path
                    d={BLADE}
                    pathLength={1}
                    fill={`url(#blade-${uid})`}
                    stroke={bright}
                    strokeWidth={w(1.3)}
                    strokeLinejoin="miter"
                    strokeDasharray={bladeFrag}
                  />
                  <path
                    d={BLADE_INNER}
                    fill="none"
                    stroke={main}
                    strokeWidth={w(1)}
                    opacity="0.9"
                    strokeLinejoin="miter"
                  />
                  {/* destello de energía */}
                  <path
                    ref={(el) => {
                      glintRefs.current[i] = el;
                    }}
                    d={BLADE}
                    fill="none"
                    stroke="#f1e6ff"
                    strokeWidth={w(2.4)}
                    strokeLinejoin="miter"
                    opacity="0"
                  />
                </g>
              ))}
            </g>
          </g>

          {/* venas orgánicas de la corrupción (invaden desde el borde) */}
          {c > 0.12 && (
            <g filter={glowFilter} opacity={veinsOpacity}>
              {VEINS.map((d, i) => {
                const p = clamp01((c - 0.12 - i * 0.07) / 0.45);
                return (
                  <path
                    key={`v-${i}`}
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={main}
                    strokeWidth={1.4 + c * 1.6}
                    strokeLinecap="round"
                    strokeDasharray="1"
                    strokeDashoffset={1 - p}
                  />
                );
              })}
            </g>
          )}
        </g>

        {/* Destello de transición: aro de energía al cambiar de estado */}
        <circle
          ref={flashRef}
          r="134"
          fill="none"
          stroke={bright}
          strokeWidth={w(3)}
          opacity="0"
          filter={glowFilter}
        />

        {/* CENTRO: anillo oscuro + Rinnegan */}
        <circle r="30" fill="#05030c" stroke={bright} strokeWidth={w(1.5)} />
        <g ref={innerRef}>
          <circle
            r="38"
            fill="none"
            stroke={main}
            strokeWidth={w(1.4)}
            strokeDasharray="8 4"
          />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle
              key={a}
              cx="0"
              cy="-44"
              r="2.6"
              fill={bright}
              transform={`rotate(${a + 30})`}
            />
          ))}
        </g>
        <circle
          className="nz-ring-pulse"
          r="24"
          fill="none"
          stroke={main}
          strokeWidth={w(1.2)}
          opacity="0.9"
        />

        {/* Pupila */}
        <circle
          ref={pupilRef}
          r="14"
          fill={`url(#pupil-${uid})`}
          filter={glowFilter}
        />
        <circle r="5" fill="#0a0612" />

        {/* CORRUPCIÓN: grietas que crecen */}
        <g className="nz-cracks" filter={glowFilter}>
          {CRACKS.map((d, i) => {
            const start = i * 0.1;
            const p = clamp01((c - start) / 0.5);
            return (
              <path
                key={i}
                d={d}
                pathLength={1}
                fill="none"
                stroke="#12020a"
                strokeWidth={2 + c * 3}
                strokeLinecap="round"
                strokeLinejoin="miter"
                strokeDasharray="1"
                strokeDashoffset={1 - p}
              />
            );
          })}
        </g>

        {/* CORRUPCIÓN AVANZADA: astillas que se desprenden */}
        {c > 0.6 && (
          <g opacity={shardsOpacity}>
            {SHARD_ANGLES.map((a, i) => (
              <g key={`sh-${a}`} transform={`rotate(${a})`}>
                <path
                  className="nz-shard"
                  d={SHARD}
                  fill={main}
                  style={{ animationDelay: `${(i * 0.37).toFixed(2)}s` }}
                />
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}