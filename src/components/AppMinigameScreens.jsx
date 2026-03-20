import React, { useEffect, useRef, useState } from 'react';
import { C, UI_MONO } from '../app/uiTheme.js';
import { MINIGAME_REGISTRY } from '../game/minigames.js';
import { getEventImage } from '../data/eventImages.js';
import RuntimeArt from './RuntimeArt.jsx';
import { RunHeader, ScreenShell } from './AppShellScreens.jsx';

const MONO = UI_MONO;
const MG_SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const TIER_LABEL = { gold: 'GOLD', silver: 'SILVER', fail: 'FAILED', skip: 'SKIPPED' };
const TIER_COLOR = { gold: C.yellow, silver: '#b9c2ce', fail: C.red, skip: C.textDim };
const TYPE_THEME = {
  memory: { accent: C.purple, label: 'Pattern lock', support: 'Match the mirrored nodes before the trace settles.' },
  timing: { accent: C.cyan, label: 'Timing window', support: 'Hit the clean lane, not the noise around it.' },
  sequence: { accent: C.orange, label: 'Signal chain', support: 'Read the route once, then play it back clean.' },
  rapid: { accent: C.green, label: 'Overclock burst', support: 'Push throughput before the window hard-closes.' },
};

function MemoryGame({ config, onComplete }) {
  const { pairs = 3, cols = 3, goldMisses = 1, silverMisses = 3 } = config;
  const [tiles, setTiles] = useState(() => {
    const items = [...MG_SYMBOLS.slice(0, pairs), ...MG_SYMBOLS.slice(0, pairs)]
      .map((sym, index) => ({ id: index, sym, flipped: false, matched: false }));
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  });
  const [selected, setSelected] = useState([]);
  const [misses, setMisses] = useState(0);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);

  const tap = (index) => {
    if (locked || done || tiles[index].flipped || tiles[index].matched) return;
    const nextSelected = [...selected, index];
    setTiles((prev) => prev.map((tile, tileIndex) => (tileIndex === index ? { ...tile, flipped: true } : tile)));
    if (nextSelected.length < 2) {
      setSelected(nextSelected);
      return;
    }
    setLocked(true);
    setSelected([]);
    const [first, second] = nextSelected;
    if (tiles[first].sym === tiles[second].sym) {
      setTimeout(() => {
        setTiles((prev) => {
          const next = prev.map((tile, tileIndex) => (
            tileIndex === first || tileIndex === second ? { ...tile, matched: true } : tile
          ));
          if (next.every((tile) => tile.matched)) {
            setDone(true);
            const tier = misses <= goldMisses ? 'gold' : misses <= silverMisses ? 'silver' : 'fail';
            setTimeout(() => onComplete(tier), 350);
          }
          return next;
        });
        setLocked(false);
      }, 260);
      return;
    }
    setMisses((value) => value + 1);
    setTimeout(() => {
      setTiles((prev) => prev.map((tile, tileIndex) => (
        (tileIndex === first || tileIndex === second) && !tile.matched
          ? { ...tile, flipped: false }
          : tile
      )));
      setLocked(false);
    }, 750);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: 'center' }}>
        Misses: {misses} / {silverMisses + 1}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols === 4 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 10 }}>
        {tiles.map((tile, index) => (
          <button
            key={tile.id}
            onClick={() => tap(index)}
            style={{
              height: 72,
              borderRadius: 14,
              fontFamily: MONO,
              fontSize: 24,
              fontWeight: 700,
              border: `1px solid ${tile.matched ? `${C.green}55` : tile.flipped ? `${C.cyan}55` : '#2a2a3a'}`,
              background: tile.matched ? '#0a2a18' : tile.flipped ? '#1a1a30' : '#161824',
              color: tile.matched ? C.green : tile.flipped ? C.cyan : C.textDim,
              boxShadow: tile.matched ? `0 0 12px ${C.green}30` : tile.flipped ? `0 0 10px ${C.cyan}22` : 'none',
              cursor: tile.matched ? 'default' : 'pointer',
            }}
          >
            {tile.flipped || tile.matched ? tile.sym : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimingGame({ config, onComplete }) {
  const { rounds = 4, goldHits, silverHits, duration = 2500, zoneWidth = 22 } = config;
  const [round, setRound] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zone, setZone] = useState({ start: 25, end: 45 });
  const [phase, setPhase] = useState('countdown');
  const [countdown, setCountdown] = useState(2);
  const [lastHit, setLastHit] = useState(null);
  const hitsRef = useRef(0);
  const phaseRef = useRef('countdown');
  const startRef = useRef(null);
  const frameRef = useRef(null);
  const zoneRef = useRef(zone);
  const progressRef = useRef(0);

  const startRound = () => {
    const start = 18 + Math.floor(Math.random() * 52);
    const nextZone = { start, end: Math.min(94, start + zoneWidth) };
    zoneRef.current = nextZone;
    setZone(nextZone);
    setProgress(0);
    progressRef.current = 0;
    setLastHit(null);
    setPhase('running');
    phaseRef.current = 'running';
    startRef.current = performance.now();
    const tick = (now) => {
      const nextProgress = Math.min(100, ((now - startRef.current) / duration) * 100);
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      if (nextProgress >= 100) {
        resolve(false);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const resolve = (hit) => {
    cancelAnimationFrame(frameRef.current);
    if (hit) hitsRef.current += 1;
    setLastHit(hit);
    setPhase('feedback');
    phaseRef.current = 'feedback';
    setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= rounds) {
        const goldTarget = goldHits ?? rounds;
        const silverTarget = silverHits ?? Math.ceil(rounds / 2);
        const tier = hitsRef.current >= goldTarget ? 'gold' : hitsRef.current >= silverTarget ? 'silver' : 'fail';
        setPhase('done');
        setTimeout(() => onComplete(tier), 350);
        return;
      }
      setRound(nextRound);
      startRound();
    }, 600);
  };

  useEffect(() => {
    if (countdown <= 0) {
      startRound();
      return undefined;
    }
    const timeoutId = setTimeout(() => setCountdown((value) => value - 1), 600);
    return () => clearTimeout(timeoutId);
  }, [countdown]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return (
    <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
        Round {Math.min(round + 1, rounds)} / {rounds} - Hits: {hitsRef.current}
      </div>
      {countdown > 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.cyan }}>{countdown}</div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 320, height: 30, borderRadius: 8, overflow: 'hidden', background: '#1a1a2a' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: phase === 'feedback' ? (lastHit ? C.green : C.red) : C.cyan }} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${zone.start}%`,
                width: `${zone.end - zone.start}%`,
                border: `1px solid ${C.green}80`,
                background: `${C.green}25`,
              }}
            />
          </div>
          {phase === 'feedback' && (
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: lastHit ? C.green : C.red }}>
              {lastHit ? 'HIT' : 'MISS'}
            </div>
          )}
          <button
            onClick={() => {
              if (phaseRef.current !== 'running') return;
              const currentZone = zoneRef.current;
              resolve(progressRef.current >= currentZone.start && progressRef.current <= currentZone.end);
            }}
            disabled={phase !== 'running'}
            style={{
              width: 148,
              height: 148,
              borderRadius: '50%',
              border: 'none',
              fontFamily: MONO,
              fontSize: 32,
              fontWeight: 700,
              background: phase === 'running' ? C.cyan : '#222233',
              color: phase === 'running' ? '#021217' : '#555',
              boxShadow: phase === 'running' ? `0 0 28px ${C.cyan}40` : 'none',
            }}
          >
            TAP
          </button>
        </>
      )}
    </div>
  );
}

function SequenceGame({ config, onComplete }) {
  const { length = 4, showMs = 2000, goldCorrect, silverCorrect } = config;
  const [sequence] = useState(() => {
    const pool = [...MG_SYMBOLS];
    const next = [];
    for (let index = 0; index < length; index += 1) {
      const choiceIndex = Math.floor(Math.random() * pool.length);
      next.push(pool.splice(choiceIndex, 1)[0]);
    }
    return next;
  });
  const [grid] = useState(() => [...MG_SYMBOLS].sort(() => Math.random() - 0.5));
  const [phase, setPhase] = useState('showing');
  const [tapped, setTapped] = useState([]);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (phase !== 'showing') return undefined;
    const timeoutId = setTimeout(() => setPhase('input'), showMs);
    return () => clearTimeout(timeoutId);
  }, [phase, showMs]);

  const tapSymbol = (symbol) => {
    if (phase !== 'input' || wrong) return;
    const expected = sequence[tapped.length];
    const nextTapped = [...tapped, symbol];
    if (symbol !== expected) {
      setWrong(true);
      setTapped(nextTapped);
      const goldTarget = goldCorrect ?? length;
      const silverTarget = silverCorrect ?? Math.ceil(length / 2);
      const tier = tapped.length >= goldTarget ? 'gold' : tapped.length >= silverTarget ? 'silver' : 'fail';
      setTimeout(() => onComplete(tier), 700);
      return;
    }
    setTapped(nextTapped);
    if (nextTapped.length === sequence.length) {
      setTimeout(() => onComplete('gold'), 300);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {phase === 'showing' ? (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: 'center', letterSpacing: '0.1em' }}>
            MEMORISE THE SEQUENCE
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {sequence.map((symbol, index) => (
              <div key={index} style={{ width: 60, height: 60, borderRadius: 12, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 28, border: `2px solid ${C.cyan}60`, background: '#1a1a30' }}>
                {symbol}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: 'center' }}>
            Tap in order - {tapped.length}/{sequence.length}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {sequence.map((symbol, index) => (
              <div key={index} style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', border: `1px solid ${index < tapped.length ? (wrong && index === tapped.length - 1 ? C.red : C.green) : '#2a2a3a'}`, background: index < tapped.length ? (wrong && index === tapped.length - 1 ? `${C.red}20` : `${C.green}20`) : '#171a22', color: C.text }}>
                {index < tapped.length ? tapped[index] : '.'}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {grid.map((symbol, index) => (
              <button key={index} onClick={() => tapSymbol(symbol)} style={{ height: 58, borderRadius: 12, border: '1px solid #2a2a3a', background: '#161824', color: C.text, fontFamily: MONO, fontSize: 24, cursor: 'pointer', opacity: tapped.includes(symbol) ? 0.45 : 1 }}>
                {symbol}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RapidGame({ config, onComplete }) {
  const { duration = 5000, goldTaps, silverTaps } = config;
  const [phase, setPhase] = useState('ready');
  const [countdown, setCountdown] = useState(3);
  const [count, setCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const doneRef = useRef(false);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    if (countdown <= 0) {
      setPhase('playing');
      return undefined;
    }
    const timeoutId = setTimeout(() => setCountdown((value) => value - 1), 900);
    return () => clearTimeout(timeoutId);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const intervalId = setInterval(() => setTimeLeft((value) => Math.max(0, value - 100)), 100);
    return () => clearInterval(intervalId);
  }, [phase]);

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete(count >= goldTaps ? 'gold' : count >= silverTaps ? 'silver' : 'fail');
    }
  }, [count, goldTaps, onComplete, phase, silverTaps, timeLeft]);

  if (phase === 'ready') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', gap: 8, minHeight: 260 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.14em' }}>GET READY</div>
        <div style={{ fontFamily: MONO, fontSize: 92, fontWeight: 700, color: C.cyan, lineHeight: 1 }}>{countdown > 0 ? countdown : 'GO!'}</div>
      </div>
    );
  }

  const ratio = timeLeft / duration;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textAlign: 'center', letterSpacing: '0.15em' }}>TAP AS FAST AS YOU CAN</div>
      <div style={{ width: '100%', height: 8, background: '#1a1a28', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', background: ratio > 0.5 ? C.cyan : ratio > 0.25 ? C.orange : C.red }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 72, fontWeight: 700, color: C.cyan, textAlign: 'center', lineHeight: 1 }}>{count}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textAlign: 'center' }}>
        Gold {goldTaps}+ - Silver {silverTaps}+ - {(timeLeft / 1000).toFixed(1)}s
      </div>
      <button
        onPointerDown={(event) => {
          event.preventDefault();
          setCount((value) => value + 1);
        }}
        style={{ width: 180, height: 180, justifySelf: 'center', borderRadius: '50%', border: `3px solid ${C.cyan}50`, background: `${C.cyan}12`, color: C.cyan, fontFamily: MONO, fontSize: 22, fontWeight: 700, cursor: 'pointer' }}
      >
        TAP
      </button>
    </div>
  );
}

export function formatMinigameRewardOp(op) {
  if (op.op === 'GainGold') return `+${op.amount}g`;
  if (op.op === 'LoseGold') return `-${op.amount}g`;
  if (op.op === 'Heal') return `+${op.amount} HP`;
  if (op.op === 'LoseHP') return `-${op.amount} HP`;
  if (op.op === 'GainMP') return `+${op.amount} MP`;
  if (op.op === 'GainScrap') return `+${op.amount} scrap`;
  if (op.op === 'GainMaxHP') return `+${op.amount} Max HP`;
  if (op.op === 'GainCard') return 'Gain a card';
  if (op.op === 'DuplicateSelectedCard') return 'Duplicate a card';
  if (op.op === 'CompileSelectedCard') return 'Compile a card';
  if (op.op === 'AccelerateSelectedCard') return 'Accelerate a card';
  if (op.op === 'StabiliseSelectedCard') return 'Stabilise a card';
  if (op.op === 'RepairSelectedCard') return 'Repair a card';
  if (op.op === 'RemoveSelectedCard') return 'Remove a card';
  return String(op.op || 'Effect').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function summarizeEventChoiceOps(ops = []) {
  if (!Array.isArray(ops) || ops.length === 0) return 'Leave without changing your run.';
  return ops.slice(0, 3).map(formatMinigameRewardOp).join(' | ');
}

function describeMinigameObjective(def) {
  const cfg = def?.config || {};
  switch (def?.type) {
    case 'memory': return `Match ${cfg.pairs || 3} pairs. Gold holds at ${cfg.goldMisses ?? 1} misses or fewer.`;
    case 'timing': return `Land ${cfg.goldHits ?? cfg.rounds ?? 3} clean hits across ${cfg.rounds || 3} rounds.`;
    case 'sequence': return `Replay ${cfg.length || 4} signals in order before the chain breaks.`;
    case 'rapid': return `Reach ${cfg.goldTaps || 10} taps before ${(Number(cfg.duration || 4000) / 1000).toFixed(1)}s expires.`;
    default: return def?.desc || 'Complete the side-op cleanly.';
  }
}

function getDifficultyLabel(def) {
  const cfg = def?.config || {};
  let score = 0;
  if (def?.type === 'memory') score = Number(cfg.pairs || 3) + Math.max(0, 3 - Number(cfg.silverMisses || 3));
  if (def?.type === 'timing') score = Number(cfg.rounds || 3) + Math.max(0, (24 - Number(cfg.zoneWidth || 24)) / 4);
  if (def?.type === 'sequence') score = Number(cfg.length || 4) + Math.max(0, (2200 - Number(cfg.showMs || 2200)) / 400);
  if (def?.type === 'rapid') score = Math.max(1, Number(cfg.goldTaps || 10) / 4) + Math.max(0, (5000 - Number(cfg.duration || 5000)) / 1000);
  if (score >= 6.5) return 'Severe';
  if (score >= 4.5) return 'High';
  if (score >= 3) return 'Medium';
  return 'Low';
}

function getTheme(def) {
  const theme = TYPE_THEME[def?.type] || TYPE_THEME.sequence;
  return { ...theme, actLabel: `Act ${def?.act || 1} side-op`, difficulty: getDifficultyLabel(def), objective: describeMinigameObjective(def) };
}

function MinigameStageCard({ accent, children }) {
  return (
    <div className="panel-chrome" style={{ padding: '18px clamp(14px, 3vw, 20px)', borderRadius: 24, border: `1px solid ${accent}28`, background: `radial-gradient(circle at 0% 0%, ${accent}14 0%, transparent 38%), linear-gradient(180deg, rgba(12,14,22,0.92) 0%, rgba(8,10,18,0.98) 100%)`, boxShadow: `0 24px 56px rgba(0,0,0,0.32), 0 0 24px ${accent}10` }}>
      {children}
    </div>
  );
}

export function MinigameScreen({ state, onAction }) {
  const eventId = state.event?.eventId;
  const def = MINIGAME_REGISTRY[eventId];
  const [phase, setPhase] = useState('intro');
  const [resultTier, setResultTier] = useState(null);

  const handleComplete = (tier) => {
    setResultTier(tier);
    setPhase('result');
  };
  const handleSkip = () => onAction({ type: 'Minigame_Complete', eventId, tier: 'skip' });
  const handleClaim = () => onAction({ type: 'Minigame_Complete', eventId, tier: resultTier });

  if (!def) {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={null} mode="Event" />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
          <button onClick={handleSkip} style={{ padding: '12px 24px', borderRadius: 14, fontFamily: MONO, fontWeight: 700, border: 'none', background: C.cyan, color: '#021217' }}>
            Continue
          </button>
        </div>
      </ScreenShell>
    );
  }

  const theme = getTheme(def);
  const accent = theme.accent;
  const rewardItems = (ops = []) => (ops.length === 0 ? ['No reward'] : ops.map(formatMinigameRewardOp));
  const backgroundArt = getEventImage(eventId);
  const backdrop = (
    <>
      {backgroundArt && (
        <RuntimeArt
          src={backgroundArt}
          alt={def.title}
          accent={accent}
          label={def.title}
          loading="eager"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.22, pointerEvents: 'none' }}
          imageStyle={{ objectFit: 'cover', objectPosition: 'center center', filter: 'saturate(0.82) brightness(0.48)' }}
          fallbackStyle={{ background: `radial-gradient(circle at 20% 10%, ${accent}24 0%, transparent 32%), linear-gradient(180deg, rgba(8,10,16,0.94) 0%, rgba(6,8,14,0.98) 100%)` }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,6,12,0.86) 0%, rgba(4,6,12,0.94) 100%)', pointerEvents: 'none' }} />
    </>
  );

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={null} mode="Event" />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px clamp(16px, 4vw, 28px) 32px' }}>
        {backdrop}
        <div style={{ position: 'relative', zIndex: 1, width: 'min(100%, 980px)', display: 'grid', gap: 16, alignContent: 'center' }}>
          {phase === 'intro' && (
            <MinigameStageCard accent={accent}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[theme.actLabel.toUpperCase(), theme.label.toUpperCase(), `DIFFICULTY ${theme.difficulty.toUpperCase()}`].map((chip) => (
                    <div key={chip} style={{ padding: '5px 9px', borderRadius: 999, border: `1px solid ${accent}32`, background: `${accent}12`, color: accent, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {chip}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontSize: 52, lineHeight: 1 }}>{def.icon}</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: accent }}>{def.title}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.55 }}>{def.desc}</div>
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 18, border: `1px solid ${accent}26`, background: 'rgba(8,12,18,0.72)' }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginBottom: 6, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Objective</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.55 }}>{theme.objective}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                    <div style={{ padding: '14px 16px', borderRadius: 20, border: `1px solid ${accent}30`, background: 'rgba(8,10,18,0.82)', display: 'grid', gap: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: accent, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Ops Brief</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.55 }}>{theme.support}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>Gold line: {rewardItems(def.rewards?.gold || []).join(' | ')}</div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {['gold', 'silver', 'fail'].map((tier) => (
                        <div key={tier} style={{ padding: '8px 10px', borderRadius: 14, border: `1px solid ${TIER_COLOR[tier]}26`, background: `${TIER_COLOR[tier]}10` }}>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: TIER_COLOR[tier], marginBottom: 4, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{TIER_LABEL[tier]}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.text, lineHeight: 1.45 }}>{rewardItems(def.rewards?.[tier] || []).join(' | ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 360, justifySelf: 'center' }}>
                  <button onClick={() => setPhase('playing')} style={{ flex: 1, padding: '14px 0', borderRadius: 16, fontFamily: MONO, fontWeight: 700, fontSize: 14, background: accent, color: '#000', border: 'none', cursor: 'pointer', boxShadow: `0 0 24px ${accent}40` }}>RUN SIDE-OP</button>
                  <button onClick={handleSkip} style={{ padding: '14px 18px', borderRadius: 16, fontFamily: MONO, fontSize: 12, background: 'rgba(8,10,18,0.72)', color: C.textDim, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Jack Out</button>
                </div>
              </div>
            </MinigameStageCard>
          )}

          {phase === 'playing' && (
            <MinigameStageCard accent={accent}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28 }}>{def.icon}</span>
                    <div>
                      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: accent }}>{def.title}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{theme.label} | {theme.difficulty} pressure</div>
                    </div>
                  </div>
                  <button onClick={handleSkip} style={{ padding: '10px 12px', borderRadius: 12, fontFamily: MONO, fontSize: 11, background: 'rgba(8,10,18,0.72)', color: C.textDim, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Jack Out</button>
                </div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div style={{ padding: '10px 12px', borderRadius: 16, border: `1px solid ${accent}24`, background: 'rgba(8,12,18,0.72)' }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMuted, marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Objective</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.5 }}>{theme.objective}</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 16, border: `1px solid ${C.yellow}22`, background: 'rgba(8,12,18,0.72)' }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMuted, marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Gold line</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.5 }}>{rewardItems(def.rewards?.gold || []).join(' | ')}</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 16, border: `1px solid ${((def.rewards?.fail || []).length > 0 ? C.red : '#7b8698')}22`, background: 'rgba(8,12,18,0.72)' }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMuted, marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Failure line</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.5 }}>{rewardItems(def.rewards?.fail || []).join(' | ')}</div>
                  </div>
                </div>
                <div style={{ padding: '16px clamp(12px, 3vw, 20px)', borderRadius: 24, border: `1px solid ${accent}28`, background: 'linear-gradient(180deg, rgba(10,12,20,0.9) 0%, rgba(8,10,18,0.98) 100%)' }}>
                  {def.type === 'memory' && <MemoryGame config={def.config} onComplete={handleComplete} />}
                  {def.type === 'timing' && <TimingGame config={def.config} onComplete={handleComplete} />}
                  {def.type === 'sequence' && <SequenceGame config={def.config} onComplete={handleComplete} />}
                  {def.type === 'rapid' && <RapidGame config={def.config} onComplete={handleComplete} />}
                </div>
              </div>
            </MinigameStageCard>
          )}

          {phase === 'result' && (
            <MinigameStageCard accent={TIER_COLOR[resultTier] || C.text}>
              <div style={{ display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: 56 }}>{def.icon}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Side-op settled</div>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: TIER_COLOR[resultTier] || C.text }}>{TIER_LABEL[resultTier]}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.55, maxWidth: 520 }}>
                  {resultTier === 'gold' ? 'Clean extraction. You kept the channel stable and got paid on the premium tier.' : resultTier === 'silver' ? 'Messy, but profitable. The trace noticed, the payout still cleared.' : 'The side-op bit back. Take what survived and move.'}
                </div>
                <div style={{ width: '100%', padding: '14px 16px', borderRadius: 18, border: `1px solid ${(TIER_COLOR[resultTier] || C.text)}28`, background: 'rgba(8,12,18,0.74)' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginBottom: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Payout</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                    {rewardItems(def.rewards?.[resultTier] || []).map((entry) => (
                      <div key={entry} style={{ padding: '6px 9px', borderRadius: 999, border: `1px solid ${(TIER_COLOR[resultTier] || C.text)}34`, background: `${TIER_COLOR[resultTier] || C.text}12`, color: TIER_COLOR[resultTier] || C.text, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
                        {entry}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={handleClaim} style={{ padding: '14px 48px', borderRadius: 16, fontFamily: MONO, fontWeight: 700, fontSize: 15, background: TIER_COLOR[resultTier] || C.text, color: '#000', border: 'none', cursor: 'pointer', boxShadow: `0 0 24px ${TIER_COLOR[resultTier] || C.text}50` }}>Claim Payout</button>
              </div>
            </MinigameStageCard>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
