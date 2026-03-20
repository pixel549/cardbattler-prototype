import React from 'react';

const EMPTY_STYLE = Object.freeze({});

export function PileCountButton({ label, count, color, onClick, compact = false, theme, monoFont }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minWidth: 0,
        padding: compact ? '10px 12px' : '10px 14px',
        borderRadius: 10,
        fontFamily: monoFont,
        fontSize: compact ? 11 : 12,
        color: theme.textPrimary,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}32`,
        boxShadow: `0 0 14px ${color}10`,
      }}
    >
      <span style={{ color, fontWeight: 700 }}>{count}</span>
      <span style={{ color: theme.textPrimary, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

export function CombatActionButton({
  label,
  onClick,
  disabled = false,
  active = false,
  compact = false,
  tone = 'default',
  style = EMPTY_STYLE,
  theme,
  monoFont,
}) {
  const toneMap = {
    default: {
      background: 'rgba(255,255,255,0.04)',
      border: theme.borderLight,
      color: theme.textPrimary,
      shadow: 'none',
    },
    cyan: {
      background: `${theme.neonCyan}16`,
      border: `${theme.neonCyan}36`,
      color: theme.neonCyan,
      shadow: `0 0 12px ${theme.neonCyan}12`,
    },
    purple: {
      background: `${theme.neonPurple}20`,
      border: `${theme.neonPurple}42`,
      color: '#e9c9ff',
      shadow: `0 0 12px ${theme.neonPurple}16`,
    },
    orange: {
      background: `${theme.neonOrange}18`,
      border: `${theme.neonOrange}40`,
      color: theme.neonOrange,
      shadow: `0 0 12px ${theme.neonOrange}14`,
    },
    primary: {
      background: `linear-gradient(135deg, ${theme.neonCyan} 0%, #84fff5 100%)`,
      border: 'rgba(255,255,255,0.22)',
      color: '#021217',
      shadow: `0 0 18px ${theme.neonCyan}32`,
    },
  };
  const toneStyle = toneMap[tone] || toneMap.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
        padding: compact ? '11px 10px' : '12px 14px',
        borderRadius: 10,
        fontFamily: monoFont,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        transition: 'all 0.15s ease',
        background: active && tone !== 'primary'
          ? `linear-gradient(180deg, ${toneStyle.background} 0%, rgba(255,255,255,0.08) 100%)`
          : toneStyle.background,
        color: toneStyle.color,
        border: `1px solid ${toneStyle.border}`,
        boxShadow: active ? `${toneStyle.shadow}, inset 0 1px 0 rgba(255,255,255,0.08)` : toneStyle.shadow,
        fontSize: compact ? 11 : 12,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function PortraitCombatRail({
  interactionLocked,
  onEndTurn,
  deckMenuOpen = false,
  onToggleDeckMenu,
  highlightEndTurn = false,
  theme,
  monoFont,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px',
        borderRadius: 14,
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${theme.neonCyan}28`,
        boxShadow: `0 8px 22px rgba(0,0,0,0.26), 0 0 18px ${theme.neonCyan}10`,
      }}
    >
      <CombatActionButton
        label="End Turn"
        onClick={onEndTurn}
        disabled={interactionLocked}
        tone="primary"
        compact={true}
        theme={theme}
        monoFont={monoFont}
        style={{
          width: '100%',
          minHeight: 88,
          padding: '10px 7px',
          fontSize: 11,
          lineHeight: 1.1,
          ...(highlightEndTurn ? {
            border: `1px solid ${theme.neonYellow}88`,
            boxShadow: `0 0 0 1px ${theme.neonYellow}2a, 0 0 24px ${theme.neonYellow}26`,
          } : {}),
        }}
      />
      <CombatActionButton
        label="Deck"
        onClick={() => onToggleDeckMenu?.(!deckMenuOpen)}
        active={deckMenuOpen}
        tone="orange"
        compact={true}
        theme={theme}
        monoFont={monoFont}
        style={{ width: '100%', minHeight: 42, padding: '7px 6px', fontSize: 10 }}
      />
    </div>
  );
}

export function CombatUtilityPanel({
  handCount,
  drawCount,
  discardCount,
  exhaustCount,
  interactionLocked,
  onViewPile,
  onOpenSettings,
  onAuto,
  onEndTurn,
  deckMenuOpen = false,
  onToggleDeckMenu,
  layoutMode = 'phone-portrait',
  showDeckAction = true,
  showEndTurnAction = true,
  showDeckMenu = true,
  highlightActionKey = null,
  theme,
  monoFont,
}) {
  const compact = layoutMode !== 'desktop';
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const buttons = [
    { key: 'settings', label: 'Settings', onClick: onOpenSettings, tone: 'cyan', disabled: false, active: false },
    { key: 'auto', label: 'Auto', onClick: onAuto, tone: 'purple', disabled: interactionLocked, active: false },
    showDeckAction ? { key: 'deck', label: 'Deck', onClick: () => onToggleDeckMenu?.(!deckMenuOpen), tone: 'orange', disabled: false, active: deckMenuOpen } : null,
    showEndTurnAction ? { key: 'end-turn', label: 'End Turn', onClick: onEndTurn, tone: 'primary', disabled: interactionLocked, active: false } : null,
  ].filter(Boolean);
  const actionColumns = compact
    ? (isPhonePortrait ? `repeat(${Math.min(2, buttons.length)}, minmax(0, 1fr))` : `repeat(${buttons.length}, minmax(0, 1fr))`)
    : `repeat(${buttons.length}, minmax(0, 1fr))`;
  const openPile = (pile) => {
    onViewPile?.(pile);
    onToggleDeckMenu?.(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? (isPhonePortrait ? 6 : 8) : 10, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? (isPhonePortrait ? 5 : 6) : 8,
          padding: compact ? (isPhonePortrait ? '7px 8px' : '9px') : '10px 12px',
          borderRadius: compact ? 14 : 16,
          background: 'linear-gradient(180deg, rgba(8,12,20,0.96) 0%, rgba(5,8,14,0.98) 100%)',
          border: `1px solid ${theme.borderLight}`,
          boxShadow: compact ? '0 8px 22px rgba(0,0,0,0.22)' : '0 10px 24px rgba(0,0,0,0.24)',
        }}
      >
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: theme.textDim }}>
              COMBAT OPS
            </span>
            <span style={{ fontFamily: monoFont, fontSize: 8, color: theme.textSecondary }}>
              Hand {handCount} | center card arms target
            </span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: actionColumns, gap: 8 }}>
          {buttons.map((button) => (
            <CombatActionButton
              key={button.key}
              label={button.label}
              onClick={button.onClick}
              disabled={button.disabled}
              active={button.active}
              tone={button.tone}
              compact={compact}
              theme={theme}
              monoFont={monoFont}
              style={button.key === highlightActionKey ? {
                border: `1px solid ${theme.neonYellow}88`,
                boxShadow: `0 0 0 1px ${theme.neonYellow}2a, 0 0 24px ${theme.neonYellow}26`,
              } : undefined}
            />
          ))}
        </div>
        {showDeckMenu && deckMenuOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: compact ? 6 : 8, paddingTop: compact ? 2 : 4 }}>
            <PileCountButton label="Draw" count={drawCount} color={theme.neonCyan} onClick={() => openPile('draw')} compact={compact} theme={theme} monoFont={monoFont} />
            <PileCountButton label="Disc" count={discardCount} color={theme.neonOrange} onClick={() => openPile('discard')} compact={compact} theme={theme} monoFont={monoFont} />
            <PileCountButton label="Exh" count={exhaustCount} color={theme.neonRed} onClick={() => openPile('exhaust')} compact={compact} theme={theme} monoFont={monoFont} />
          </div>
        )}
      </div>
    </div>
  );
}
