/**
 * sounds.js â€” Synthesized Web Audio API sound effects.
 * No audio files needed â€” all sounds are generated procedurally.
 *
 * Usage:
 *   import { sfx } from './sounds.js';
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

function sweep(freqFrom, freqTo, type, duration, gainNode) {
  const c = getCtx();
  if (!c || !gainNode) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freqFrom, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), c.currentTime + duration);
  o.connect(gainNode);
  o.start(c.currentTime);
  o.stop(c.currentTime + duration + 0.02);
}

function playNoteSequence(notes, {
  type = 'triangle',
  gainValue = 0.14,
  noteDuration = 0.16,
  stepDelay = 0.07,
} = {}) {
  const c = getCtx();
  if (!c || muted || !Array.isArray(notes) || notes.length === 0) return;

  notes.forEach((freq, index) => {
    const start = c.currentTime + (index * stepDelay);
    const g = c.createGain();
    g.gain.setValueAtTime(gainValue, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + noteDuration);
    g.connect(masterGain);

    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    o.connect(g);
    o.start(start);
    o.stop(start + noteDuration + 0.03);
  });
}

// â”€â”€ Public sound effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  /** Healing sound â€” warm ascending tone */
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

  /** Status effect applied â€” fizzing blip */
  status() {
    const g = gain(0.12, 0.22);
    if (!g) return;
    noise(0.05, g, 0.7);
    osc(880, 'square', 0.08, g);
  },

  /** Mutation triggered â€” glitchy distortion */
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

  /** Victory fanfare â€” ascending arpeggio */
  victory() {
    playNoteSequence([523, 659, 784, 1047], {
      type: 'triangle',
      gainValue: 0.22,
      noteDuration: 0.4,
      stepDelay: 0.12,
    });
  },

  /** Defeat â€” descending mournful tone */
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

  /** Enemy attack telegraph â€” hostile warning stab */
  enemyAttack() {
    const g = gain(0.11, 0.34);
    if (!g) return;
    sweep(140, 280, 'sawtooth', 0.18, g);
    osc(92, 'triangle', 0.24, g);
    noise(0.04, g, 0.42);
  },

  /** Enemy defense telegraph â€” cool shield swell */
  enemyDefense() {
    const g = gain(0.085, 0.3);
    if (!g) return;
    sweep(220, 360, 'sine', 0.2, g);
    osc(540, 'triangle', 0.16, g);
  },

  /** Enemy buff telegraph â€” upward charge tone */
  enemyBuff() {
    const g = gain(0.09, 0.34);
    if (!g) return;
    playNoteSequence([260, 328, 390], {
      type: 'triangle',
      gainValue: 0.05,
      noteDuration: 0.16,
      stepDelay: 0.045,
    });
  },

  /** Enemy debuff telegraph â€” glitchy interference pulse */
  enemyDebuff() {
    const g = gain(0.095, 0.32);
    if (!g) return;
    sweep(620, 210, 'square', 0.18, g);
    noise(0.06, g, 0.66);
  },

  /** Enemy action cue, based on intent type */
  enemyAction(intentType = 'Unknown') {
    switch (intentType) {
      case 'Attack':
        this.enemyAttack();
        break;
      case 'Defense':
        this.enemyDefense();
        break;
      case 'Buff':
        this.enemyBuff();
        break;
      case 'Debuff':
        this.enemyDebuff();
        break;
      default: {
        const g = gain(0.1, 0.22);
        if (!g) return;
        osc(110, 'sawtooth', 0.18, g);
        break;
      }
    }
  },

  /** Target selection / arming cue */
  targetLock() {
    const g = gain(0.09, 0.16);
    if (!g) return;
    sweep(260, 420, 'triangle', 0.09, g);
    osc(640, 'sine', 0.07, g);
  },

  /** Heat threshold cue */
  heatAlert(level = 1) {
    const safeLevel = Math.max(1, Math.min(3, Number(level || 1)));
    if (safeLevel === 1) {
      playNoteSequence([330, 392], { type: 'triangle', gainValue: 0.08, noteDuration: 0.14, stepDelay: 0.06 });
      return;
    }
    if (safeLevel === 2) {
      playNoteSequence([294, 392, 440], { type: 'sawtooth', gainValue: 0.09, noteDuration: 0.16, stepDelay: 0.055 });
      return;
    }
    const g = gain(0.11, 0.34);
    if (!g) return;
    sweep(220, 120, 'sawtooth', 0.18, g);
    noise(0.06, g, 0.55);
    playNoteSequence([220, 330, 262], { type: 'square', gainValue: 0.06, noteDuration: 0.12, stepDelay: 0.05 });
  },

  /** Boss phase or objective spike */
  bossPhase() {
    const g = gain(0.14, 0.42);
    if (!g) return;
    sweep(180, 520, 'sawtooth', 0.18, g);
    osc(92, 'triangle', 0.28, g);
    playNoteSequence([262, 330, 494], { type: 'triangle', gainValue: 0.07, noteDuration: 0.18, stepDelay: 0.065 });
  },

  /** Urgent warning cue */
  systemWarning() {
    const g = gain(0.11, 0.28);
    if (!g) return;
    playNoteSequence([220, 220, 196], { type: 'square', gainValue: 0.07, noteDuration: 0.1, stepDelay: 0.06 });
    noise(0.04, g, 0.48);
  },

  // Toggle mute
  setMuted(m) { muted = m; },
  isMuted() { return muted; },

  /** Call on first user interaction to unlock audio context */
  unlock() { getCtx(); },
};
