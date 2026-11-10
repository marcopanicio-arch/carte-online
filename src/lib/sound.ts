// Suoni sintetizzati con la Web Audio API: niente file da scaricare, funzionano anche offline.
// Il browser permette l'audio solo dopo un tocco dell'utente, quindi il contesto nasce al primo suono.

import { load, save } from "./storage";

let ctx: AudioContext | null = null;
let muted = load("suoni", { muted: false }).muted;
const listeners = new Set<() => void>();

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  save("suoni", { muted });
  listeners.forEach((l) => l());
}

export function subscribeMuted(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Colpo di carta: un soffio di rumore filtrato, breve. */
function slap(a: AudioContext, when: number, { freq = 1800, dur = 0.07, gain = 0.5 } = {}) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(when);
}

/** Nota morbida (campanella). */
function tone(a: AudioContext, when: number, freq: number, { dur = 0.35, gain = 0.18, type = "triangle" as OscillatorType } = {}) {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(a.destination);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G4: 392, Eb5: 622.25, F4: 349.23, Ab4: 415.3 };

export const sounds = {
  /** Carta giocata sul tavolo. */
  play() {
    const a = audio();
    if (a) slap(a, a.currentTime, { freq: 1500, dur: 0.08, gain: 0.6 });
  },
  /** Carta pescata dal mazzo. */
  draw() {
    const a = audio();
    if (a) slap(a, a.currentTime, { freq: 3200, dur: 0.12, gain: 0.25 });
  },
  /** Ho preso una mano con punti. */
  take(points: number) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    tone(a, t, NOTE.E5, { dur: 0.25 });
    if (points >= 10) tone(a, t + 0.09, NOTE.A5, { dur: 0.35 });
  },
  /** Scopa! */
  scopa() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    [NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(a, t + i * 0.07, f, { dur: 0.4, gain: 0.2 }));
  },
  win() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + 0.05;
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => tone(a, t + i * 0.13, f, { dur: 0.3, gain: 0.2 }));
    tone(a, t + 0.42, NOTE.C6, { dur: 0.9, gain: 0.22 });
    tone(a, t + 0.42, NOTE.E5, { dur: 0.9, gain: 0.12, type: "sine" });
  },
  lose() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + 0.05;
    [NOTE.Eb5, NOTE.C5, NOTE.Ab4].forEach((f, i) => tone(a, t + i * 0.2, f, { dur: 0.45, gain: 0.16, type: "sine" }));
  },
  tie() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + 0.05;
    tone(a, t, NOTE.G4, { dur: 0.35, type: "sine" });
    tone(a, t + 0.22, NOTE.G4, { dur: 0.5, type: "sine" });
  },
};
