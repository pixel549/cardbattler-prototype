import React, { memo, useState } from 'react';
import { getFixerLine } from '../game/narrativeDirector.js';
import { getTutorialDefinition } from '../game/tutorial.js';
import { C, UI_MONO } from '../app/uiTheme.js';

export const ScreenShell = memo(function ScreenShell({ children, extraStyle = {} }) {
  return (
    <div
      className="scanlines atmosphere-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.bg,
        backgroundImage: `
          radial-gradient(circle at 18% 14%, ${C.cyan}10 0%, transparent 24%),
          radial-gradient(circle at 82% 20%, ${C.orange}0b 0%, transparent 22%),
          linear-gradient(180deg, rgba(7, 10, 18, 0.96) 0%, rgba(4, 6, 12, 1) 100%),
          linear-gradient(${C.cyan}03 1px, transparent 1px),
          linear-gradient(90deg, ${C.cyan}03 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 100% 100%, 24px 24px, 24px 24px',
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
});

export const CombatRecoveryScreen = memo(function CombatRecoveryScreen({
  message,
  onReturnToMenu,
  onStartFreshRun,
  onReloadApp,
}) {
  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div
        style={{
          width: 'min(520px, 100%)',
          padding: '24px',
          borderRadius: '20px',
          border: `1px solid ${C.red}55`,
          background: 'rgba(10, 10, 20, 0.92)',
          boxShadow: `0 0 32px ${C.red}18`,
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ fontFamily: UI_MONO, color: C.red, fontWeight: 700, letterSpacing: '0.12em', fontSize: 13 }}>
          COMBAT RECOVERY
        </div>
        <div style={{ fontFamily: UI_MONO, color: C.text, fontSize: 22, fontWeight: 700 }}>
          Combat hit a bad saved state
        </div>
        <div style={{ fontFamily: UI_MONO, color: C.textDim, fontSize: 13, lineHeight: 1.7 }}>
          {message || 'The stored combat snapshot no longer matches the current build. You can return to the menu or start fresh without staying stuck on a black screen.'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '12px' }}>
          <button
            onClick={onReturnToMenu}
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              border: `1px solid ${C.cyan}55`,
              background: `${C.cyan}12`,
              color: C.cyan,
              fontFamily: UI_MONO,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back To Menu
          </button>
          <button
            onClick={onStartFreshRun}
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              border: `1px solid ${C.yellow}55`,
              background: `${C.yellow}12`,
              color: C.yellow,
              fontFamily: UI_MONO,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Start Fresh Run
          </button>
          <button
            onClick={onReloadApp}
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.05)',
              color: C.text,
              fontFamily: UI_MONO,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    </ScreenShell>
  );
});

export const RunHeader = memo(function RunHeader({ run, data, mode = 'Map' }) {
  if (!run) return null;

  const DISPLAY = "'Rajdhani', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const relics = run.relicIds || [];
  const fixerLine = getFixerLine({ mode, run });
  const resourceChips = [
    { label: 'HP', value: `${run.hp}/${run.maxHP}`, color: C.green },
    { label: 'Gold', value: `${run.gold}g`, color: C.yellow },
    { label: 'Scrap', value: `${run.scrap ?? 0}`, color: C.orange },
    { label: 'RAM', value: `${run.mp}`, color: C.cyan },
  ];

  return (
    <div
      className="safe-area-top panel-chrome hud-scanline"
      style={{
        background: `
          linear-gradient(180deg, rgba(9, 14, 22, 0.94) 0%, rgba(7, 10, 18, 0.98) 100%),
          radial-gradient(circle at 0% 0%, ${C.cyan}14 0%, transparent 28%)
        `,
        borderBottom: `1px solid ${C.cyan}24`,
        boxShadow: '0 18px 32px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          width: 'min(1400px, 100%)',
          margin: '0 auto',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '10px',
          paddingBottom: relics.length > 0 ? '8px' : '10px',
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div
                className="signal-chip"
                style={{
                  padding: '5px 8px',
                  borderRadius: 999,
                  border: `1px solid ${C.cyan}30`,
                  background: `${C.cyan}10`,
                  color: C.cyan,
                  fontFamily: UI_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {mode}
              </div>
              <div style={{ fontFamily: UI_MONO, color: '#888', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Act {run.act} / Floor {run.floor}
              </div>
            </div>
            <div style={{ fontFamily: DISPLAY, color: C.text, fontSize: 22, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 0.92 }}>
              {run.starterProfileName || 'Runner'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {resourceChips.map((chip) => (
              <div
                key={chip.label}
                className="signal-chip"
                style={{
                  minWidth: 78,
                  padding: '7px 10px',
                  borderRadius: 14,
                  border: `1px solid ${chip.color}28`,
                  background: `linear-gradient(180deg, ${chip.color}12 0%, rgba(9, 14, 22, 0.72) 100%)`,
                  display: 'grid',
                  gap: 2,
                }}
              >
                <div style={{ fontFamily: UI_MONO, fontSize: 8, color: C.textMuted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  {chip.label}
                </div>
                <div style={{ fontFamily: UI_MONO, fontSize: 13, fontWeight: 700, color: chip.color }}>
                  {chip.value}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 16,
            border: `1px solid ${C.cyan}20`,
            background: 'linear-gradient(90deg, rgba(0,240,255,0.08) 0%, rgba(7,10,18,0.2) 24%, rgba(7,10,18,0.55) 100%)',
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 12px ${C.cyan}` }} />
          <div style={{ fontFamily: UI_MONO, fontSize: 9, letterSpacing: '0.14em', color: C.cyan, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Fixer Wire
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.45, color: '#cad3de' }}>
            {fixerLine}
          </div>
        </div>
        {relics.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              paddingBottom: '2px',
            }}
          >
            {relics.map((rid) => {
              const relic = data?.relics?.[rid];
              const tier = relic?.rarity || relic?.tier || 'common';
              const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
              const col = tierColors[tier] || C.cyan;
              return (
                <div
                  key={rid}
                  className="signal-chip"
                  title={`${relic?.name || rid}: ${relic?.description || ''}`}
                  style={{
                    fontFamily: UI_MONO,
                    fontSize: 9,
                    fontWeight: 700,
                    color: col,
                    background: `linear-gradient(180deg, ${col}16 0%, rgba(8, 12, 18, 0.7) 100%)`,
                    border: `1px solid ${col}36`,
                    borderRadius: '999px',
                    padding: '5px 9px',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {relic?.icon || '◈'} {relic?.name || rid}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export const LoadingScreen = memo(function LoadingScreen({
  title = 'INITIALIZING',
  message = 'Loading game data...',
  detail = '',
  accent = C.cyan,
}) {
  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: '20px', marginBottom: '24px', color: accent }}>
          {title}
        </div>
        <div style={{ width: '160px', height: '4px', borderRadius: '9999px', overflow: 'hidden', backgroundColor: '#1a1a2a' }}>
          <div
            className="animate-pulse"
            style={{ height: '100%', borderRadius: '9999px', width: '60%', backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }}
          />
        </div>
        <div style={{ fontFamily: UI_MONO, marginTop: '12px', color: C.textMuted, fontSize: 10 }}>
          {message}
        </div>
        {detail ? (
          <div style={{ fontFamily: UI_MONO, marginTop: '6px', color: C.textDim, fontSize: 10 }}>
            {detail}
          </div>
        ) : null}
      </div>
    </ScreenShell>
  );
});

export function TutorialCompleteScreen({ state, onNewGame, onReturnToMenu }) {
  const [showJessePopup, setShowJessePopup] = useState(true);
  const tutorialId = state?.run?.tutorial?.id;
  const tutorialDef = getTutorialDefinition(tutorialId);
  const outcome = state?.run?.tutorial?.outcome ?? 'complete';
  const victory = outcome === 'victory';
  const accent = victory ? C.green : C.cyan;
  const title = victory ? `${tutorialDef.title} Complete` : `${tutorialDef.title} Reviewed`;
  const body = victory
    ? tutorialDef.completionVictoryBody
    : tutorialDef.completionReviewBody;

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(560px, 100%)', position: 'relative' }}>
        <div
          style={{
            padding: 24,
            borderRadius: 24,
            border: `1px solid ${accent}36`,
            background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,7,12,0.99) 100%)',
            boxShadow: `0 24px 54px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.02)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ fontFamily: UI_MONO, fontSize: 12, letterSpacing: '0.18em', color: accent }}>
            TRAINING NODE
          </div>
          <div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 28, color: C.text }}>
            {title}
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 13, lineHeight: 1.7, color: C.textDim }}>
            {body}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tutorialDef.concepts.map((label) => (
              <span
                key={label}
                style={{
                  padding: '7px 10px',
                  borderRadius: 999,
                  border: `1px solid ${accent}30`,
                  background: `${accent}10`,
                  color: accent,
                  fontFamily: UI_MONO,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <button
              onClick={onNewGame}
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                border: 'none',
                background: C.cyan,
                color: '#031014',
                fontFamily: UI_MONO,
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Start Real Run
            </button>
            <button
              onClick={onReturnToMenu}
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,0.03)',
                color: C.text,
                fontFamily: UI_MONO,
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Return To Menu
            </button>
          </div>
        </div>

        {showJessePopup && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(4, 6, 12, 0.68)',
              zIndex: 120,
            }}
          >
            <div
              style={{
                width: 'min(420px, 100%)',
                padding: 22,
                borderRadius: 20,
                border: `1px solid ${accent}44`,
                background: 'linear-gradient(180deg, rgba(10,14,24,0.98) 0%, rgba(6,8,14,0.99) 100%)',
                boxShadow: `0 26px 60px rgba(0,0,0,0.46), 0 0 32px ${accent}12`,
                display: 'grid',
                gap: 14,
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.18em', color: accent }}>
                TUTORIAL COMPLETE
              </div>
              <div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 24, color: C.text }}>
                Happy now, Jesse? :^)
              </div>
              <button
                onClick={() => setShowJessePopup(false)}
                style={{
                  justifySelf: 'center',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: `1px solid ${accent}34`,
                  background: `${accent}12`,
                  color: accent,
                  fontFamily: UI_MONO,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </ScreenShell>
  );
}
