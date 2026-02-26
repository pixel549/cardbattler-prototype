import { useState, useEffect, useRef } from 'react';
import { loadGameData } from './data/loadData';
import { createInitialState, dispatchGame } from './game/game_core';
import { dispatchWithJournal } from './game/dispatch_with_journal';
import CombatScreen from './components/CombatScreen';
import AIDebugPanel from './components/AIDebugPanel';
import { getAIAction, AI_PLAYSTYLES } from './game/aiPlayer';
import { decodeDebugSeed, decodeSensibleDebugSeed, randomDebugSeed } from './game/debugSeed';

// ============================================================
// SHARED CONSTANTS
// ============================================================
const C = {
  bg: '#0a0a0f',
  bgCard: '#12121a',
  bgBar: '#0d0d14',
  border: '#2a2a3a',
  cyan: '#00f0ff',
  orange: '#ff6b00',
  red: '#ff2a2a',
  green: '#00ff6b',
  purple: '#b44aff',
  yellow: '#ffe600',
  text: '#e0e0e0',
  textDim: '#888',
  textMuted: '#555',
};

const NODE_COLORS = {
  Combat: C.orange,
  Elite: C.red,
  Boss: C.purple,
  Shop: C.yellow,
  Rest: C.green,
  Event: C.cyan,
};

const NODE_ICONS = {
  Combat: '\u2694',
  Elite: '\u2620',
  Boss: '\uD83D\uDC51',
  Shop: '\uD83D\uDED2',
  Rest: '\u2665',
  Event: '?',
};

/** Shared full-screen background wrapper */
function ScreenShell({ children, extraStyle = {} }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.bg,
        backgroundImage: `
          linear-gradient(${C.cyan}03 1px, transparent 1px),
          linear-gradient(90deg, ${C.cyan}03 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

/** Shared top bar showing run stats */
function RunHeader({ run }) {
  if (!run) return null;
  return (
    <div
      className="safe-area-top"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '8px',
        paddingBottom: '8px',
        backgroundColor: C.bgBar,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.cyan, fontSize: 11 }}>
        <span style={{ opacity: 0.5 }}>ACT</span> {run.act}
        <span style={{ marginLeft: '8px', marginRight: '8px', opacity: 0.3 }}>|</span>
        <span style={{ opacity: 0.5 }}>FLOOR</span> {run.floor}
      </div>
      <div style={{ display: 'flex', gap: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontSize: 12 }}>
        <span style={{ color: C.green }}>{run.hp}/{run.maxHP}</span>
        <span style={{ color: C.yellow }}>{run.gold}g</span>
        <span style={{ color: C.cyan }}>{run.mp}mp</span>
      </div>
    </div>
  );
}

// ============================================================
// MAP SCREEN
// ============================================================
function MapScreen({ state, data, onAction }) {
  const nodes = state.map?.nodes || {};
  const currentNode = nodes[state.map?.currentNodeId];
  const selectableNext = state.map?.selectableNext || [];

  return (
    <ScreenShell>
      <RunHeader run={state.run} />

      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {/* Current location */}
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '24px',
            textAlign: 'center',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '4px', color: C.textMuted, fontSize: 10, letterSpacing: '0.1em' }}>
            CURRENT LOCATION
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, fontSize: '20px', color: C.cyan }}>
            {currentNode?.type || 'Unknown'}
          </div>
        </div>

        {/* Section label */}
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '12px', color: C.textMuted, fontSize: 10, letterSpacing: '0.1em' }}>
          CHOOSE YOUR PATH
        </div>

        {/* Path choices */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {selectableNext.map(nodeId => {
            const node = nodes[nodeId];
            const color = NODE_COLORS[node?.type] || '#888';
            const icon = NODE_ICONS[node?.type] || '\u00B7';

            return (
              <button
                key={nodeId}
                onClick={() => onAction({ type: 'SelectNextNode', nodeId })}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  backgroundColor: C.bgCard,
                  border: `2px solid ${color}40`,
                  boxShadow: `0 0 20px ${color}10`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      backgroundColor: `${color}15`,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color, fontSize: 15 }}>
                      {node?.type || 'Unknown'}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 11 }}>
                      {node?.type === 'Combat' && 'Face enemies'}
                      {node?.type === 'Elite' && 'Dangerous encounter'}
                      {node?.type === 'Boss' && 'Act boss fight'}
                      {node?.type === 'Shop' && 'Buy cards & services'}
                      {node?.type === 'Rest' && 'Heal & repair'}
                      {node?.type === 'Event' && 'Random encounter'}
                    </div>
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 18 }}>{'\u203A'}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Deck button */}
        <button
          onClick={() => onAction({ type: 'OpenDeck' })}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '12px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            textAlign: 'center',
            transition: 'all 0.15s ease',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.cyan}30`,
            color: C.cyan,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          View Deck ({state.deck?.master?.length || 0} cards)
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// REWARD SCREEN
// ============================================================
function RewardScreen({ state, data, onAction }) {
  const choices = state.reward?.cardChoices || [];

  return (
    <ScreenShell>
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', paddingTop: '24px', paddingBottom: '24px' }}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '4px',
              color: C.green,
            }}
          >
            VICTORY
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.textMuted, fontSize: 12 }}>
            Select a card reward
          </div>
        </div>

        {/* Card choices */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {choices.map(defId => {
            const card = data.cards?.[defId];
            const typeColors = { Attack: C.red, Skill: C.green, Power: C.purple, Defense: C.cyan, Support: C.green, Utility: C.yellow };
            const color = typeColors[card?.type] || C.cyan;
            const cost = card?.costRAM || 0;

            return (
              <button
                key={defId}
                onClick={() => onAction({ type: 'Reward_PickCard', defId })}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  backgroundColor: C.bgCard,
                  border: `2px solid ${color}40`,
                  boxShadow: `0 0 16px ${color}10`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Cost badge */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                      fontWeight: 700,
                      flexShrink: 0,
                      backgroundColor: color,
                      color: '#000',
                      fontSize: 14,
                    }}
                  >
                    {cost}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, color, fontSize: 14 }}>
                      {card?.name || defId}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '2px', color: C.textDim, fontSize: 11 }}>
                      {card?.type}
                    </div>
                    {card?.effects && (
                      <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '4px', color: C.textMuted, fontSize: 10 }}>
                        {card.effects.map(e => {
                          if (e.op === 'DealDamage') return `Deal ${e.amount} damage`;
                          if (e.op === 'GainBlock') return `Gain ${e.amount} Block`;
                          if (e.op === 'Heal') return `Heal ${e.amount}`;
                          if (e.op === 'DrawCards') return `Draw ${e.amount}`;
                          if (e.op === 'RawText') return e.text;
                          return e.op;
                        }).join(' \u00B7 ')}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip button */}
        <button
          onClick={() => onAction({ type: 'Reward_Skip' })}
          className="safe-area-bottom"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            marginTop: '16px',
            transition: 'all 0.15s ease',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Skip Reward
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// SHOP SCREEN
// ============================================================
function ShopScreen({ state, data, onAction }) {
  const offers = state.shop?.offers || [];
  const gold = state.run?.gold || 0;

  return (
    <ScreenShell>
      {/* Shop header */}
      <div
        className="safe-area-top"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '12px',
          paddingBottom: '12px',
          backgroundColor: C.bgBar,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, color: C.yellow, fontSize: 16 }}>
          SHOP
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            paddingLeft: '12px',
            paddingRight: '12px',
            paddingTop: '4px',
            paddingBottom: '4px',
            borderRadius: '8px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 700,
            backgroundColor: `${C.yellow}15`,
            border: `1px solid ${C.yellow}30`,
            color: C.yellow,
            fontSize: 14,
          }}
        >
          {gold}g
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {offers.map((offer, i) => {
            const canAfford = gold >= offer.price;
            const card = offer.kind === 'Card' ? data.cards?.[offer.defId] : null;
            const typeColors = { Attack: C.red, Skill: C.green, Power: C.purple, Defense: C.cyan, Support: C.green, Utility: C.yellow };
            const color = card ? (typeColors[card.type] || C.cyan) : C.cyan;

            return (
              <button
                key={i}
                onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index: i })}
                disabled={!canAfford}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  opacity: !canAfford ? 0.4 : 1,
                  backgroundColor: C.bgCard,
                  border: `1px solid ${canAfford ? `${C.yellow}40` : C.border}`,
                  cursor: canAfford ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, color: canAfford ? color : C.textMuted, fontSize: 14 }}>
                      {card?.name || offer.serviceId}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '2px', color: C.textMuted, fontSize: 11 }}>
                      {offer.kind === 'Card' ? card?.type : 'Service'}
                    </div>
                  </div>
                  <div
                    style={{
                      paddingLeft: '12px',
                      paddingRight: '12px',
                      paddingTop: '4px',
                      paddingBottom: '4px',
                      borderRadius: '8px',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                      fontWeight: 700,
                      backgroundColor: canAfford ? `${C.yellow}15` : 'transparent',
                      border: `1px solid ${canAfford ? C.yellow : C.border}40`,
                      color: canAfford ? C.yellow : C.textMuted,
                      fontSize: 13,
                    }}
                  >
                    {offer.price}g
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onAction({ type: 'Shop_Exit' })}
          className="safe-area-bottom"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            marginTop: '16px',
            transition: 'all 0.15s ease',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Leave Shop
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// EVENT SCREEN
// ============================================================
function EventScreen({ state, data, onAction }) {
  const eventId = state.event?.eventId;

  if (eventId === 'RestSite') {
    return (
      <ScreenShell>
        <RunHeader run={state.run} />
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '8px',
              color: C.green,
            }}
          >
            REST SITE
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '32px', color: C.textMuted, fontSize: 12 }}>
            Choose an action
          </div>

          <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { type: 'Rest_Heal', label: 'Rest', desc: 'Heal 30% HP', color: C.green, icon: '\u2665' },
              { type: 'Rest_Repair', label: 'Repair', desc: 'Restore a card', color: C.cyan, icon: '\uD83D\uDD27' },
              { type: 'Rest_Stabilise', label: 'Stabilise', desc: 'Stabilise a card', color: C.purple, icon: '\u25C6' },
            ].map(opt => (
              <button
                key={opt.type}
                onClick={() => onAction({ type: opt.type })}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  backgroundColor: C.bgCard,
                  border: `2px solid ${opt.color}40`,
                  boxShadow: `0 0 16px ${opt.color}10`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      backgroundColor: `${opt.color}15`,
                      border: `1px solid ${opt.color}40`,
                    }}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: opt.color, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ color: C.textMuted, fontSize: 11 }}>{opt.desc}</div>
                  </div>
                </div>
              </button>
            ))}

            <button
              onClick={() => onAction({ type: 'Rest_Leave' })}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                textAlign: 'center',
                marginTop: '8px',
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Leave
            </button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  // Generic event
  return (
    <ScreenShell>
      <RunHeader run={state.run} />
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="animate-slide-up"
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 700,
            fontSize: '20px',
            marginBottom: '8px',
            color: C.cyan,
          }}
        >
          EVENT
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '32px', color: C.textMuted, fontSize: 13 }}>
          {eventId}
        </div>
        <button
          onClick={() => onAction({ type: 'GoToMap' })}
          style={{
            paddingLeft: '32px',
            paddingRight: '32px',
            paddingTop: '16px',
            paddingBottom: '16px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 700,
            transition: 'all 0.15s ease',
            backgroundColor: C.cyan,
            color: '#000',
            boxShadow: `0 0 20px ${C.cyan}40`,
            fontSize: 14,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// GAME OVER SCREEN
// ============================================================
function GameOverScreen({ state, onNewRun }) {
  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="animate-slide-up" style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 700,
            marginBottom: '12px',
            color: C.red,
            fontSize: 36,
          }}
        >
          GAME OVER
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '8px', color: C.textDim, fontSize: 14 }}>
          Connection terminated
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '40px', color: C.textMuted, fontSize: 12 }}>
          Floor {state.run?.floor} {'\u00B7'} Act {state.run?.act}
        </div>
        <button
          onClick={onNewRun}
          style={{
            paddingLeft: '40px',
            paddingRight: '40px',
            paddingTop: '16px',
            paddingBottom: '16px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 700,
            fontSize: '18px',
            transition: 'all 0.15s ease',
            backgroundColor: C.cyan,
            color: '#000',
            boxShadow: `0 0 30px ${C.cyan}40`,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          New Run
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// LOADING SCREEN
// ============================================================
function LoadingScreen() {
  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, fontSize: '20px', marginBottom: '24px', color: C.cyan }}>
          INITIALIZING
        </div>
        <div style={{ width: '160px', height: '4px', borderRadius: '9999px', overflow: 'hidden', backgroundColor: '#1a1a2a' }}>
          <div
            className="animate-pulse"
            style={{ height: '100%', borderRadius: '9999px', width: '60%', backgroundColor: C.cyan, boxShadow: `0 0 10px ${C.cyan}` }}
          />
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '12px', color: C.textMuted, fontSize: 10 }}>
          Loading game data...
        </div>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// DEV TOOLS OVERLAY
// ============================================================
function DevButtons({ state, onDevAction, onToggleLog }) {
  const [collapsed, setCollapsed] = useState(true);

  const copySnapshot = () => {
    try {
      const snapshot = { run: state.run, map: state.map, combat: state.combat, log: state.log, journal: state.journal };
      navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    } catch (err) { console.error('Failed to copy snapshot', err); }
  };

  const copyRepro = () => {
    try {
      const repro = { seed: state.journal?.seed, actions: state.journal?.actions };
      navigator.clipboard.writeText(JSON.stringify(repro, null, 2));
    } catch (err) { console.error('Failed to copy reproduction script', err); }
  };

  const devBtnStyle = {
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    borderRadius: '4px',
    backgroundColor: '#333',
    border: 'none',
    cursor: 'pointer',
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '8px',
          zIndex: 50,
          width: '28px',
          height: '28px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: '12px',
          backgroundColor: '#222',
          color: '#0ff',
          opacity: 0.5,
          border: `1px solid #333`,
          cursor: 'pointer',
        }}
      >
        D
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: '80px', right: '8px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: 100 }}>
      <button
        onClick={() => setCollapsed(true)}
        style={{ ...devBtnStyle, alignSelf: 'flex-start', backgroundColor: '#333', color: '#f66' }}
      >
        {'\u2715'} Close
      </button>
      {[
        { label: '+100 HP', color: '#0ff', action: { type: 'Dev_AddHP', amount: 100 } },
        { label: '+100 Gold', color: '#ff0', action: { type: 'Dev_AddGold', amount: 100 } },
        { label: '+5 RAM', color: '#0f0', action: { type: 'Dev_AddRAM', amount: 5 } },
      ].map(btn => (
        <button
          key={btn.label}
          onClick={() => onDevAction(btn.action)}
          style={{ ...devBtnStyle, color: btn.color }}
        >
          {btn.label}
        </button>
      ))}
      <button onClick={copySnapshot} style={{ ...devBtnStyle, color: '#0af' }}>
        Snapshot
      </button>
      <button onClick={copyRepro} style={{ ...devBtnStyle, color: '#f0a' }}>
        Repro
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_StartTurn' })} style={{ ...devBtnStyle, color: '#0cf' }}>
        StartTurn
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_EndTurn' })} style={{ ...devBtnStyle, color: '#0cf' }}>
        EndTurn
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_Simulate', maxTurns: 1 })} style={{ ...devBtnStyle, color: '#0c6' }}>
        Sim 1
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_Simulate', maxTurns: 10 })} style={{ ...devBtnStyle, color: '#0c6' }}>
        Sim 10
      </button>
      <button onClick={onToggleLog} style={{ ...devBtnStyle, color: '#f60' }}>
        Log
      </button>
    </div>
  );
}

function LogOverlay({ log }) {
  const entries = (log || []).slice(-30).reverse();
  return (
    <div
      className="safe-area-bottom"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '256px',
        overflowY: 'auto',
        zIndex: 50,
        padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        borderTop: `1px solid ${C.border}`,
      }}
    >
      <div style={{ marginBottom: '8px', fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", textAlign: 'right', color: C.textMuted }}>
        Recent Log
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", textAlign: 'center', color: C.textMuted }}>
          No log entries
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px', listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((e, i) => (
            <li key={i} style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
              <span style={{ color: C.cyan }}>{e.t || 'Info'}:</span>{' '}
              <span style={{ color: C.text }}>{e.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// SAVE DIRECTORY — IndexedDB persistence for File System Access API handle
// ============================================================
const IDB_DB    = 'cardbattler-prefs';
const IDB_STORE = 'settings';
const IDB_KEY   = 'saveDirHandle';

function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = () => rej(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

// ============================================================
// CUSTOM RUN CONFIG — defaults (module-level so they can be referenced as a stable object)
// ============================================================
const CUSTOM_CONFIG_DEFAULTS = {
  playerMaxHP:       null,
  startingGold:      null,
  playerMaxRAM:      null,
  playerRamRegen:    null,
  drawPerTurnDelta:  null,
  enemyHpMult:       null,
  enemyDmgMult:      null,
  actOverride:       null,
  encounterKind:     null,
  enemyCount:        null,
  startingCardIds:   null,
};

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);

  // ── URL params: read from global captured in index.html before React loaded ──
  const _up = (key) => window.__launchParams?.[key] ?? null;

  // ── AI auto-play debug state ──────────────────────────────────────────────
  const [aiEnabled, setAiEnabled]       = useState(() => _up('ai') === 'true');
  const [aiPaused, setAiPaused]         = useState(false);
  const [aiSpeed, setAiSpeed]           = useState(() => {

    const v = parseInt(_up('speed'), 10);
    return (!isNaN(v) && v >= 150 && v <= 1500) ? v : 300;
  });
  // ── Custom run config: explicit per-field overrides ─────────────────────
  // Each value is null (not set) or a concrete override.
  // lockedFields: Set of keys whose values survive AI randomise-each-run.
  const [customConfig,  setCustomConfig]  = useState(CUSTOM_CONFIG_DEFAULTS);
  const [lockedFields,  setLockedFields]  = useState(new Set());

  // Build the customOverrides object to pass to NewRun (strip null values)
  function buildCustomOverrides(cfg) {
    const out = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // Clear any unlocked fields before a randomised run, keeping locked ones
  function customConfigForRandomRun(cfg, locked) {
    const out = { ...cfg };
    for (const k of Object.keys(out)) {
      if (!locked.has(k)) out[k] = null;
    }
    return out;
  }

  const [runHistory, setRunHistory]     = useState([]);
  const runIndexRef  = useRef(0);        // increments each completed run
  const prevModeRef  = useRef(null);     // detects mode transitions for stats
  const combatStatsRef = useRef(null);   // per-combat scratch data
  // ── Per-run accumulator refs (all cleared on GameOver) ───────────────────
  const pendingEncountersRef  = useRef([]);   // finalised combat entries
  const pendingCardEventsRef  = useRef([]);   // reward offers + picks
  const pendingFloorEventsRef = useRef([]);   // rest/shop/event outcomes
  const deckSnapshotsRef      = useRef([]);   // deck state at each floor change
  const lastFloorRef          = useRef(null); // previous floor for change detection

  // ── Save directory (File System Access API, persisted via IndexedDB) ─────
  const saveDirHandle = useRef(null);
  const [saveDirName, setSaveDirName] = useState(null);

  // Restore handle from IndexedDB on mount
  useEffect(() => {
    idbGet(IDB_KEY).then(async handle => {
      if (!handle) return;
      try {
        await handle.queryPermission({ mode: 'readwrite' }); // throws if stale
        saveDirHandle.current = handle;
        setSaveDirName(handle.name);
      } catch { /* stale handle, ignore */ }
    }).catch(() => {});
  }, []);

  async function pickSaveDir() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
      saveDirHandle.current = handle;
      setSaveDirName(handle.name);
      await idbSet(IDB_KEY, handle);
    } catch { /* user cancelled */ }
  }

  async function writeToSaveDir(filename, jsonStr) {
    const handle = saveDirHandle.current;
    if (!handle) return false;
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const fh  = await handle.getFileHandle(filename, { create: true });
      const w   = await fh.createWritable();
      await w.write(jsonStr);
      await w.close();
      return true;
    } catch (e) {
      console.error('writeToSaveDir failed:', e);
      return false;
    }
  }

  function fallbackDownload(filename, jsonStr) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Debug seed state ─────────────────────────────────────────────────────
  const [debugSeedInput, setDebugSeedInput]         = useState(() => _up('seed') ?? '');
  const [randomizeDebugSeed, setRandomizeDebugSeed] = useState(() => _up('randomize') === 'true');
  // 'wild' | 'sensible' — which decoder to use for the current seed / each-run randomise
  const [seedMode, setSeedMode] = useState(() => {
    const sm = _up('seedMode');
    return (sm === 'wild' || sm === 'sensible') ? sm : 'wild';
  });

  // ── AI Playstyle ──────────────────────────────────────────────────────────
  const [aiPlaystyle, setAiPlaystyle] = useState(() => {
    const ps = _up('playstyle');
    return (ps && AI_PLAYSTYLES[ps]) ? ps : 'balanced';
  });

  useEffect(() => {
    loadGameData()
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (data && !state) {
      startNewRun();
    }
  }, [data]);

  // ── AI effect: fires on every state change when AI is enabled ─────────────
  useEffect(() => {
    if (!aiEnabled || aiPaused || !data || !state) return;

    const timer = setTimeout(() => {
      const mode     = state.mode;
      const prevMode = prevModeRef.current;
      prevModeRef.current = mode;

      // ── Deck snapshot on floor change (run start = first floor seen) ────────
      const curFloor = state.run?.floor ?? null;
      if (curFloor !== null && curFloor !== lastFloorRef.current && state.deck?.master) {
        lastFloorRef.current = curFloor;
        deckSnapshotsRef.current.push({
          act:   state.run.act,
          floor: curFloor,
          cards: state.deck.master.map(c => c.defId),
        });
      }

      // ── Combat ended: finalise encounter entry ───────────────────────────────
      if (prevMode === 'Combat' && mode !== 'Combat' && combatStatsRef.current) {
        const cs = combatStatsRef.current;
        // result captured below when combatOver fires; fall back to state if missed
        if (cs.result === null) cs.result = state.combat?.victory ? 'win' : 'loss';
        cs.hpAfter = state.run?.hp ?? 0;
        const { _lastPlayerHp, _lastEnemyHp, _logOffset, ...encounter } = cs; // strip scratch fields
        pendingEncountersRef.current.push(encounter);
        combatStatsRef.current = null;
      }

      // ── Combat entered: initialise scratch data ──────────────────────────────
      if (mode === 'Combat' && prevMode !== 'Combat') {
        const initEnemyHp = (state.combat?.enemies || []).reduce((s, e) => s + (e.hp ?? 0), 0);
        combatStatsRef.current = {
          act:                 state.run?.act   ?? 1,
          floor:               state.run?.floor ?? '?',
          enemies:             (state.combat?.enemies || []).map(e => e.enemyDefId).filter(Boolean),
          hpBefore:            state.run?.hp    ?? 0,
          turns:               0,
          result:              null,
          hpAfter:             null,
          totalDamageDealt:    0,
          totalDamageReceived: 0,
          totalCardsPlayed:    0,
          totalRAMSpent:       0,
          mutationEvents:      [],
          // Detailed damage breakdown (populated from DamageDealt log events)
          damageBreakdown: {
            playerDealt: {
              total:          0,  // final HP damage dealt to enemies
              totalBlocked:   0,  // blocked by enemy block
              weakenedHits:   0,  // hits where player had Weak (reduced dmg)
              vulnerableHits: 0,  // hits where enemy had Vulnerable (boosted dmg)
            },
            playerReceived: {
              total:          0,  // final HP damage received by player
              totalBlocked:   0,  // blocked by player's block
              weakenedHits:   0,  // hits where enemy had Weak (reduced enemy dmg)
              vulnerableHits: 0,  // hits where player had Vulnerable (boosted enemy dmg)
            },
          },
          _lastPlayerHp:       state.run?.hp    ?? 0,
          _lastEnemyHp:        initEnemyHp,
          _logOffset:          (state.log ?? []).length,
        };
      }

      // ── Combat active: track damage deltas + capture result when combatOver ──
      if (mode === 'Combat' && state.combat && combatStatsRef.current) {
        const cs = combatStatsRef.current;
        cs.turns = state.combat.turn ?? 0;

        // Fix: capture result here while state.combat is guaranteed non-null
        if (state.combat.combatOver && cs.result === null)
          cs.result = state.combat.victory ? 'win' : 'loss';

        const curPlayerHp = state.run?.hp ?? 0;
        const curEnemyHp  = (state.combat.enemies || []).reduce((s, e) => s + (e.hp ?? 0), 0);
        const dmgReceived = cs._lastPlayerHp - curPlayerHp;
        const dmgDealt    = cs._lastEnemyHp  - curEnemyHp;
        if (dmgReceived > 0) cs.totalDamageReceived += dmgReceived;
        if (dmgDealt    > 0) cs.totalDamageDealt    += dmgDealt;
        cs._lastPlayerHp = curPlayerHp;
        cs._lastEnemyHp  = curEnemyHp;

        // Scan new log entries for structured events since combat started
        const log       = state.log ?? [];
        const logOffset = cs._logOffset ?? 0;
        for (let li = logOffset; li < log.length; li++) {
          const entry = log[li];

          if (entry.t === 'DamageDealt' && entry.data) {
            const d = entry.data;
            if (d.isPlayerSource) {
              cs.damageBreakdown.playerDealt.total          += d.finalDamage;
              cs.damageBreakdown.playerDealt.totalBlocked   += d.blocked;
              if (d.weakened)    cs.damageBreakdown.playerDealt.weakenedHits++;
              if (d.vulnerable)  cs.damageBreakdown.playerDealt.vulnerableHits++;
            } else {
              cs.damageBreakdown.playerReceived.total          += d.finalDamage;
              cs.damageBreakdown.playerReceived.totalBlocked   += d.blocked;
              if (d.weakened)    cs.damageBreakdown.playerReceived.weakenedHits++;
              if (d.vulnerable)  cs.damageBreakdown.playerReceived.vulnerableHits++;
            }
          } else if (entry.t === 'MutationApplied') {
            cs.mutationEvents.push({
              turn:           state.combat.turn ?? 0,
              type:           'mutation',
              cardInstanceId: entry.data?.cardInstanceId ?? null,
              tier:           entry.data?.tier ?? null,
              mutationId:     entry.msg?.replace('Mutation ', '') ?? null,
            });
          } else if (entry.t === 'FinalMutation') {
            const isBrick = entry.msg?.includes('BRICK');
            cs.mutationEvents.push({
              turn:           state.combat.turn ?? 0,
              type:           'final',
              cardInstanceId: entry.data?.cardInstanceId ?? null,
              outcome:        isBrick ? 'brick' : 'rewrite',
              newDefId:       !isBrick && entry.msg?.includes('->') ? entry.msg.split('-> ')[1]?.trim() : null,
            });
          }
        }
        cs._logOffset = log.length;
      }

      // ── GameOver: record run and start a new one ─────────────────────────────
      if (mode === 'GameOver') {
        const idx    = ++runIndexRef.current;
        const runDbg = state.run?.debugOverrides;
        const summary = {
          runIndex:       idx,
          seed:           state.run?.seed      ?? null,
          debugSeed:      state.run?.debugSeed ?? null,
          debugSeedMode:  runDbg?._mode        ?? seedMode,
          aiPlaystyle,
          aiPlaystyleLabel: AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle,
          debugOverrides: runDbg ? {
            playerMaxHP:       runDbg.playerMaxHP,
            startingCardCount: runDbg.startingCardCount,
            enemyHpMult:       runDbg.enemyHpMult,
            enemyDmgMult:      runDbg.enemyDmgMult,
            playerMaxRAM:      runDbg.playerMaxRAM,
            drawPerTurnDelta:  runDbg.drawPerTurnDelta,
            actOverride:       runDbg.actOverride,
            encounterKind:     runDbg.encounterKind,
          } : null,
          endTime:        new Date().toISOString(),
          outcome:        'defeat',
          finalAct:       state.run?.act   ?? 1,
          finalFloor:     state.run?.floor ?? 0,
          finalHp:        state.run?.hp    ?? 0,
          maxHp:          state.run?.maxHP ?? 0,
          finalGold:      state.run?.gold  ?? 0,
          deckSize:       state.deck?.master?.length ?? 0,
          encounters:     pendingEncountersRef.current.slice(),
          deckSnapshots:  deckSnapshotsRef.current.slice(),
          cardEvents:     pendingCardEventsRef.current.slice(),
          floorEvents:    pendingFloorEventsRef.current.slice(),
        };
        pendingEncountersRef.current  = [];
        pendingCardEventsRef.current  = [];
        pendingFloorEventsRef.current = [];
        deckSnapshotsRef.current      = [];
        lastFloorRef.current          = null;
        setRunHistory(prev => [...prev, summary]);

        // Resolve debug seed for the next run.
        // Custom config values are NEVER auto-cleared here — the user clears them manually.
        // Locked fields always beat the seed; unlocked fields yield to the seed
        // (but still apply as defaults when the seed doesn't override that field).
        let nextDebugSeed = null;
        if (randomizeDebugSeed) {
          nextDebugSeed = randomDebugSeed();
        } else if (debugSeedInput.trim()) {
          const parsed = parseInt(debugSeedInput.trim(), 10);
          if (!isNaN(parsed)) nextDebugSeed = parsed;
        }

        const initial = createInitialState();
        const seed    = Date.now();
        const next    = dispatchWithJournal(initial, data, {
          type: 'NewRun', seed, debugSeed: nextDebugSeed, debugSeedMode: seedMode,
          customOverrides: buildCustomOverrides(customConfig),
          lockedKeys: [...lockedFields],
        });
        setState(next);
        prevModeRef.current = null;
        return;
      }

      // ── AI action: intercept for stats, then dispatch ─────────────────────────
      const action = getAIAction(state, data, aiPlaystyle);
      if (action) {
        // Card plays — count + sum RAM cost
        if (action.type === 'Combat_PlayCard' && combatStatsRef.current) {
          combatStatsRef.current.totalCardsPlayed++;
          const hand = state.combat?.player?.piles?.hand ?? [];
          const inst = hand.find(c => c.instanceId === action.instanceId);
          const cost = (inst?.defId && data.cards?.[inst.defId]?.costRAM) ?? 0;
          combatStatsRef.current.totalRAMSpent += cost;
        }

        // Card acquisition (reward screen)
        if (action.type === 'Reward_PickCard') {
          pendingCardEventsRef.current.push({
            act:     state.run?.act,
            floor:   state.run?.floor,
            offered: (state.reward?.cardChoices ?? []).slice(),
            taken:   action.defId,
          });
        }
        if (action.type === 'Reward_Skip') {
          pendingCardEventsRef.current.push({
            act:     state.run?.act,
            floor:   state.run?.floor,
            offered: (state.reward?.cardChoices ?? []).slice(),
            taken:   null,
          });
        }

        // Rest site choices
        if (['Rest_Heal', 'Rest_Repair', 'Rest_Stabilise'].includes(action.type)) {
          pendingFloorEventsRef.current.push({
            act:    state.run?.act,
            floor:  state.run?.floor,
            type:   'Rest',
            choice: action.type,
          });
        }

        // Shop purchases
        if (action.type === 'Shop_BuyOffer') {
          const offer = state.shop?.offers?.[action.index];
          if (offer) pendingFloorEventsRef.current.push({
            act:       state.run?.act,
            floor:     state.run?.floor,
            type:      'Shop',
            purchased: { kind: offer.kind, defId: offer.defId ?? offer.serviceId, price: offer.price },
          });
        }

        setState(prev => {
          try { return dispatchWithJournal(prev, data, action); }
          catch (e) { console.error('[AI] action failed', action, e); return prev; }
        });
      }
    }, aiSpeed);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, aiEnabled, aiPaused, aiSpeed]);

  // ── Auto-export every 5 completed runs ────────────────────────────────────
  useEffect(() => {
    if (runHistory.length === 0 || runHistory.length % 5 !== 0) return;
    const batchEnd   = runHistory.length;
    const batchStart = batchEnd - 4;
    const batch      = runHistory.slice(batchStart - 1); // last 5 runs
    const pad        = n => String(n).padStart(3, '0');
    const psLabel    = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const filename   = `ai_runs_${psLabel}_${pad(batchStart)}-${pad(batchEnd)}_${Date.now()}.json`;
    const jsonStr    = JSON.stringify(batch, null, 2);
    writeToSaveDir(filename, jsonStr).then(ok => {
      if (!ok) fallbackDownload(filename, jsonStr);
    });
  }, [runHistory]);

  function buildInProgressSnapshot() {
    if (!state?.run) return null;
    const runDbg = state.run?.debugOverrides;
    return {
      runIndex:       (runIndexRef.current + 1),
      seed:           state.run?.seed      ?? null,
      debugSeed:      state.run?.debugSeed ?? null,
      debugSeedMode:  runDbg?._mode        ?? seedMode,
      aiPlaystyle,
      aiPlaystyleLabel: AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle,
      debugOverrides: runDbg ? {
        playerMaxHP:       runDbg.playerMaxHP,
        startingCardCount: runDbg.startingCardCount,
        enemyHpMult:       runDbg.enemyHpMult,
        enemyDmgMult:      runDbg.enemyDmgMult,
        playerMaxRAM:      runDbg.playerMaxRAM,
        drawPerTurnDelta:  runDbg.drawPerTurnDelta,
        actOverride:       runDbg.actOverride,
        encounterKind:     runDbg.encounterKind,
      } : null,
      endTime:        new Date().toISOString(),
      outcome:        'in_progress',
      finalAct:       state.run?.act   ?? 1,
      finalFloor:     state.run?.floor ?? 0,
      finalHp:        state.run?.hp    ?? 0,
      maxHp:          state.run?.maxHP ?? 0,
      finalGold:      state.run?.gold  ?? 0,
      deckSize:       state.deck?.master?.length ?? 0,
      encounters:     pendingEncountersRef.current.slice(),
      deckSnapshots:  deckSnapshotsRef.current.slice(),
      cardEvents:     pendingCardEventsRef.current.slice(),
      floorEvents:    pendingFloorEventsRef.current.slice(),
    };
  }

  async function exportRunData() {
    const pad      = n => String(n).padStart(3, '0');
    const total    = runHistory.length;
    const psLabel  = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const filename = total > 0
      ? `ai_runs_${psLabel}_${pad(1)}-${pad(total)}_${Date.now()}.json`
      : `ai_runs_${psLabel}_empty_${Date.now()}.json`;

    // Include current in-progress run if one exists
    const inProgressSnap = buildInProgressSnapshot();
    const allRuns = inProgressSnap
      ? [...runHistory, inProgressSnap]
      : runHistory;

    const jsonStr  = JSON.stringify(allRuns, null, 2);
    const ok = await writeToSaveDir(filename, jsonStr);
    if (!ok) fallbackDownload(filename, jsonStr);
  }

  // Keep window.exportGameData fresh so close-ai-grid.ps1 can trigger it via CDP
  useEffect(() => { window.exportGameData = exportRunData; });

  const startNewRun = (overrideDebugSeed) => {
    if (!data) return;
    const initial = createInitialState();
    const seed = Date.now();
    let debugSeed = null;
    if (overrideDebugSeed !== undefined) {
      debugSeed = overrideDebugSeed;
    } else if (debugSeedInput.trim()) {
      const parsed = parseInt(debugSeedInput.trim(), 10);
      if (!isNaN(parsed)) debugSeed = parsed;
    }
    const newState = dispatchWithJournal(initial, data, {
      type: 'NewRun', seed, debugSeed, debugSeedMode: seedMode,
      customOverrides: buildCustomOverrides(customConfig),
      lockedKeys: [...lockedFields],
    });
    setState(newState);
  };

  const handleAction = (action) => {
    if (action.type === 'Dev_AddHP') {
      setState(prev => {
        if (!prev?.run) return prev;
        const hp = Math.min(prev.run.hp + (action.amount || 0), prev.run.maxHP);
        return { ...prev, run: { ...prev.run, hp } };
      });
      return;
    }
    if (action.type === 'Dev_AddGold') {
      setState(prev => {
        if (!prev?.run) return prev;
        const gold = (prev.run.gold || 0) + (action.amount || 0);
        return { ...prev, run: { ...prev.run, gold } };
      });
      return;
    }
    if (action.type === 'Dev_AddRAM') {
      setState(prev => {
        if (!prev?.combat?.player) return prev;
        const current = (prev.combat.player.ram || 0) + (action.amount || 0);
        const max = (prev.combat.player.maxRAM || 0) + (action.amount || 0);
        return {
          ...prev,
          combat: {
            ...prev.combat,
            player: { ...prev.combat.player, ram: current, maxRAM: max }
          }
        };
      });
      return;
    }
    setState(prev => {
      try {
        return dispatchWithJournal(prev, data, action);
      } catch (err) {
        console.error('Action failed:', action, err);
        return prev;
      }
    });
  };

  // Error state
  if (error) {
    return (
      <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, fontSize: '20px', marginBottom: '16px', color: C.red }}>ERROR</div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '24px', color: C.textDim, fontSize: 13 }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              paddingLeft: '24px',
              paddingRight: '24px',
              paddingTop: '12px',
              paddingBottom: '12px',
              borderRadius: '12px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontWeight: 700,
              transition: 'all 0.15s ease',
              backgroundColor: C.red,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </ScreenShell>
    );
  }

  // Loading state
  if (!data || !state) {
    return <LoadingScreen />;
  }

  let content;
  switch (state.mode) {
    case 'Combat':
      content = <CombatScreen state={state} data={data} onAction={handleAction} aiPaused={aiPaused} />;
      break;
    case 'Map':
      content = <MapScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Reward':
      content = <RewardScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Shop':
      content = <ShopScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Event':
      content = <EventScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'GameOver':
      content = <GameOverScreen state={state} onNewRun={startNewRun} />;
      break;
    default:
      content = (
        <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.text }}>Unknown mode: {state.mode}</div>
        </ScreenShell>
      );
  }

  return (
    <>
      {content}
      {state.run && (
        <>
          <DevButtons state={state} onDevAction={handleAction} onToggleLog={() => setShowLog(prev => !prev)} />
          {showLog && <LogOverlay log={state.log} />}
        </>
      )}
      <AIDebugPanel
        enabled={aiEnabled}              onToggle={() => setAiEnabled(v => !v)}
        paused={aiPaused}                onTogglePause={() => setAiPaused(v => !v)}
        speed={aiSpeed}                  onSpeedChange={setAiSpeed}
        runHistory={runHistory}          onExport={exportRunData}
        currentState={state}
        debugSeed={debugSeedInput}       onDebugSeedChange={setDebugSeedInput}
        seedMode={seedMode}              onSeedModeChange={setSeedMode}
        randomize={randomizeDebugSeed}   onRandomizeToggle={setRandomizeDebugSeed}
        onRandomizeSeed={() => { setSeedMode('wild');     setDebugSeedInput(String(randomDebugSeed())); }}
        onRandomizeSensibleSeed={() => { setSeedMode('sensible'); setDebugSeedInput(String(randomDebugSeed())); }}
        aiPlaystyle={aiPlaystyle}        onPlaystyleChange={setAiPlaystyle}
        saveDirName={saveDirName}        onSetSaveDir={pickSaveDir}
        customConfig={customConfig}      lockedFields={lockedFields}
        onSetCustomField={(key, val) => setCustomConfig(prev => ({ ...prev, [key]: val }))}
        onToggleLock={(key) => setLockedFields(prev => {
          const next = new Set(prev);
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        })}
        onClearCustomConfig={() => setCustomConfig(CUSTOM_CONFIG_DEFAULTS)}
        gameData={data}
      />
    </>
  );
}

export default App;
