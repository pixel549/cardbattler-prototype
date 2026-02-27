/**
 * sounds.js — Synthesized Web Audio API sound effects.
 * No audio files needed — all sounds are generated procedurally.
 *
 * Usage:
 *   import { sfx } from './sounds';
 *   sfx.attack();
 *   sfx.block();
 *   sfx.victory();
 */

let ctx = null;
let masterGain = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
    } catch (_) {
      ctx = null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function gain(value, time, ramp = 0.05) {
  const c = getCtx();
  if (!c || muted) return null;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(value, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + time);
  g.connect(masterGain);
  return g;
}

function osc(freq, type, duration, gainNode) {
  const c = getCtx();
  if (!c || !gainNode) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  o.connect(gainNode);
  o.start(c.currentTime);
  o.stop(c.currentTime + duration + 0.02);
}

function noise(duration, gainNode, color = 0.95) {
  const c = getCtx();
  if (!c || !gainNode) return;
  const bufLen = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufLen; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + (1 - color) * white) / 1;
    data[i] = white * (1 - color) + last * color;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(gainNode);
  src.start();
  src.stop(c.currentTime + duration);
}

// ── Public sound effects ──────────────────────────────────────────────────────

export const sfx = {
  /** Short swoosh when a player card is played */
  cardPlay() {
    const g = gain(0.18, 0.18);
    if (!g) return;
    const c = getCtx();
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(200, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.08);
    o.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.18);
    o.connect(g);
    o.start();
    o.stop(c.currentTime + 0.22);
  },

  /** Sharp crunch when damage is dealt */
  damage() {
    const g = gain(0.25, 0.15);
    if (!g) return;
    const c = getCtx();
    // Low thud
    osc(80, 'sine', 0.12, g);
    // White noise burst
    noise(0.08, g, 0.5);
    // High transient
    const ho = c.createOscillator();
    ho.type = 'sawtooth';
    ho.frequency.setValueAtTime(380, c.currentTime);
    ho.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.12);
    ho.connect(g);
    ho.start();
    ho.stop(c.currentTime + 0.15);
  },

  /** Soft whoosh when block is applied */
  block() {
    const g = gain(0.14, 0.2);
    if (!g) return;
    osc(320, 'sine', 0.2, g);
    osc(640, 'triangle', 0.1, g);
  },

  /** Healing sound — warm ascending tone */
  heal() {
    const g = gain(0.15, 0.35);
    if (!g) return;
    const c = getCtx();
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, c.currentTime);
    o.frequency.setValueAtTime(440, c.currentTime + 0.1);
    o.frequency.setValueAtTime(550, c.currentTime + 0.2);
    o.connect(g);
    o.start();
    o.stop(c.currentTime + 0.4);
  },

  /** Status effect applied — fizzing blip */
  status() {
    const g = gain(0.12, 0.22);
    if (!g) return;
    noise(0.05, g, 0.7);
    osc(880, 'square', 0.08, g);
  },

  /** Mutation triggered — glitchy distortion */
  mutation() {
    const c = getCtx();
    if (!c || muted) return;
    const g = gain(0.2, 0.4);
    if (!g) return;
    // Sweep down
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.35);
    o.connect(g);
    o.start();
    o.stop(c.currentTime + 0.4);
    // Noise burst
    noise(0.15, g, 0.6);
  },

  /** Victory fanfare — ascending arpeggio */
  victory() {
    const c = getCtx();
    if (!c || muted) return;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const t = c.currentTime + i * 0.12;
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0.22, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      g2.connect(masterGain);
      const o2 = c.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(freq, t);
      o2.connect(g2);
      o2.start(t);
      o2.stop(t + 0.45);
    });
  },

  /** Defeat — descending mournful tone */
  defeat() {
    const c = getCtx();
    if (!c || muted) return;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(400, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.0);
    o.connect(g);
    g.connect(masterGain);
    o.start();
    o.stop(c.currentTime + 1.1);
  },

  /** End turn click */
  endTurn() {
    const g = gain(0.12, 0.12);
    if (!g) return;
    osc(180, 'square', 0.08, g);
    osc(220, 'square', 0.08, g);
  },

  /** Enemy action — low ominous buzz */
  enemyAction() {
    const g = gain(0.1, 0.2);
    if (!g) return;
    osc(110, 'sawtooth', 0.18, g);
  },

  // Toggle mute
  setMuted(m) { muted = m; },
  isMuted() { return muted; },

  /** Call on first user interaction to unlock audio context */
  unlock() { getCtx(); },
};
