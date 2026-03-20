import React from 'react';
import { CombatActionButton, PileCountButton } from './combatControls.jsx';

function HeatBar({
  heat = 0,
  maxHeat = 20,
  height = 12,
  showText = true,
  theme,
  monoFont,
  getHeatVisualState,
  getHeatBarTextColor,
  heatThresholdMarkers,
}) {
  const safeMax = Math.max(1, Number(maxHeat || 20));
  const safeHeat = Math.max(0, Math.min(safeMax, Number(heat || 0)));
  const pct = Math.max(0, Math.min(100, (safeHeat / safeMax) * 100));
  const tone = getHeatVisualState(safeHeat, safeMax);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: height / 2, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: `1px solid ${tone.color}33` }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${theme.neonYellow} 0%, ${tone.color} 100%)`,
          boxShadow: `0 0 16px ${tone.glow}`,
          transition: 'width 0.2s ease',
        }}
      />
      {heatThresholdMarkers.map((marker) => (
        <div
          key={marker.label}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${marker.ratio * 100}% - 1px)`,
            width: 2,
            background: `${marker.color}66`,
            boxShadow: `0 0 8px ${marker.color}2c`,
            pointerEvents: 'none',
          }}
        />
      ))}
      {showText && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: monoFont, fontSize: Math.max(8, height - 4), fontWeight: 700, color: getHeatBarTextColor(), mixBlendMode: 'screen' }}>
          HEAT {safeHeat}/{safeMax}
        </div>
      )}
    </div>
  );
}

function CombatConditionStrip({ heat = 0, maxHeat = 20, arenaModifier = null, compact = false, theme, monoFont, getHeatVisualState }) {
  const tone = getHeatVisualState(heat, maxHeat);
  const fontSize = compact ? 8 : 9;
  const padding = compact ? '3px 7px' : '4px 8px';

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: compact ? 'flex-start' : 'center' }}>
      <div
        title={`Trace heat ${heat}/${maxHeat}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding,
          borderRadius: 999,
          fontFamily: monoFont,
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: tone.color,
          backgroundColor: `${tone.color}18`,
          border: `1px solid ${tone.color}36`,
        }}
      >
        HEAT {heat}/{maxHeat} {tone.label}
      </div>
      {arenaModifier && (
        <div
          title={arenaModifier.summary || arenaModifier.shortSummary || arenaModifier.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding,
            borderRadius: 999,
            fontFamily: monoFont,
            fontSize,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: arenaModifier.color || theme.neonOrange,
            backgroundColor: `${arenaModifier.color || theme.neonOrange}16`,
            border: `1px solid ${(arenaModifier.color || theme.neonOrange)}34`,
          }}
        >
          {arenaModifier.label}
        </div>
      )}
    </div>
  );
}

function RamBar({ ram, maxRam, compact = false, showLabel = true, theme, monoFont }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '5px' : '6px' }}>
      {showLabel && (
        <span
          style={{
            fontSize: compact ? 9 : 11,
            color: theme.neonCyan,
            fontWeight: 700,
            fontFamily: monoFont,
            letterSpacing: '0.08em',
            textShadow: `0 0 8px ${theme.neonCyan}40`,
          }}
        >
          RAM
        </span>
      )}
      <div style={{ flex: 1, display: 'flex', gap: compact ? '2px' : '3px', alignItems: 'center' }}>
        {Array.from({ length: maxRam }).map((_, index) => {
          const filled = index < ram;
          return (
            <div
              key={index}
              style={{
                flex: 1,
                height: compact ? 12 : 18,
                maxWidth: compact ? 24 : 32,
                borderRadius: 4,
                transition: 'all 0.25s ease',
                backgroundColor: filled ? theme.neonCyan : '#1a1a2a',
                boxShadow: filled ? `0 0 8px ${theme.neonCyan}70, inset 0 1px 0 rgba(255,255,255,0.2)` : 'inset 0 1px 3px rgba(0,0,0,0.4)',
                border: `1px solid ${filled ? `${theme.neonCyan}80` : '#222'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: monoFont,
                  fontSize: compact ? 6 : 7,
                  fontWeight: 700,
                  color: filled ? '#000' : '#333',
                  letterSpacing: '-0.02em',
                }}
              >
                {index + 1}
              </span>
            </div>
          );
        })}
      </div>
      <span
        style={{
          fontSize: compact ? 10 : 12,
          color: theme.neonCyan,
          fontFamily: monoFont,
          fontWeight: 700,
          textShadow: `0 0 6px ${theme.neonCyan}30`,
        }}
      >
        {ram}
        <span style={{ color: theme.textDim, fontWeight: 400 }}>/</span>
        {maxRam}
      </span>
    </div>
  );
}

function getActivePowers(powerPile = [], cardInstances = {}, data) {
  return powerPile
    .map((cid) => {
      const ci = cardInstances[cid];
      return ci ? data?.cards?.[ci.defId] : null;
    })
    .filter(Boolean);
}

export function CompactPlayerHud({
  player,
  ram = 0,
  maxRam = 0,
  heat = 0,
  maxHeat = 20,
  arenaModifier = null,
  powerPile = [],
  cardInstances = {},
  data,
  selfTargetable = false,
  selfTargetSelected = false,
  selfTargetArmed = false,
  onTargetSelf = null,
  theme,
  monoFont,
  HealthBar,
  FirewallBar,
  StatusRow,
  getHeatVisualState,
  getHeatBarTextColor,
  heatThresholdMarkers,
}) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const firewallStacks = player?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (player?.statuses || []).filter((status) => status.id !== 'Firewall');
  const activePowers = getActivePowers(powerPile, cardInstances, data);

  return (
    <div
      style={{
        flex: '1 1 280px',
        minWidth: 240,
        maxWidth: 380,
        borderRadius: 16,
        padding: '12px',
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${theme.neonCyan}34`,
        boxShadow: `0 0 28px ${theme.neonCyan}12, inset 0 1px 0 rgba(255,255,255,0.04)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: theme.textDim }}>
            PLAYER CORE
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 8, letterSpacing: '0.1em', color: theme.neonCyan }}>
            SYSTEMS ONLINE
          </span>
        </div>
        <div
          style={{
            alignSelf: 'center',
            padding: '4px 8px',
            borderRadius: 999,
            background: selfTargetArmed ? `${theme.neonYellow}18` : selfTargetSelected ? `${theme.neonGreen}16` : `${theme.neonGreen}14`,
            border: `1px solid ${selfTargetArmed ? `${theme.neonYellow}42` : `${theme.neonGreen}34`}`,
            color: selfTargetArmed ? theme.neonYellow : theme.neonGreen,
            fontFamily: monoFont,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {selfTargetable
            ? (selfTargetArmed ? 'Double tap now' : selfTargetSelected ? 'Self target ready' : 'Double tap self')
            : 'Double tap target'}
        </div>
      </div>

      <div
        role={selfTargetable ? 'button' : undefined}
        tabIndex={selfTargetable ? 0 : undefined}
        aria-pressed={selfTargetable ? selfTargetSelected : undefined}
        aria-label={selfTargetable ? 'Select yourself as the current card target' : undefined}
        onClick={selfTargetable ? (event) => {
          event.stopPropagation();
          onTargetSelf?.();
        } : undefined}
        onKeyDown={selfTargetable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onTargetSelf?.();
          }
        } : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: '10px',
          borderRadius: 14,
          background: 'rgba(3,7,14,0.72)',
          border: `1px solid ${selfTargetArmed ? `${theme.neonYellow}4a` : selfTargetable ? `${theme.neonGreen}32` : theme.borderLight}`,
          boxShadow: selfTargetArmed ? `0 0 26px ${theme.neonYellow}14, inset 0 0 0 1px ${theme.neonYellow}12` : selfTargetable ? `0 0 18px ${theme.neonGreen}10` : 'none',
          cursor: selfTargetable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: theme.textDim }}>
            CORE VITALS
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 8, color: theme.textSecondary }}>
            Firewall, HP, RAM, Heat
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: theme.neonCyan }}>FW</span>
            <span style={{ fontFamily: monoFont, fontSize: 10, color: theme.textPrimary }}>
              {firewallStacks}
              <span style={{ color: theme.textDim }}>/</span>
              {maxHp}
            </span>
          </div>
          <FirewallBar current={firewallStacks} max={maxHp} height={12} showText={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: theme.neonGreen }}>HP</span>
            <span style={{ fontFamily: monoFont, fontSize: 10, color: theme.textPrimary }}>
              {hp}
              <span style={{ color: theme.textDim }}>/</span>
              {maxHp}
            </span>
          </div>
          <HealthBar current={hp} max={maxHp} height={12} showText={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: theme.neonCyan }}>RAM</span>
            <span style={{ fontFamily: monoFont, fontSize: 10, color: theme.textPrimary }}>
              {ram}
              <span style={{ color: theme.textDim }}>/</span>
              {maxRam}
            </span>
          </div>
          <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} theme={theme} monoFont={monoFont} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: getHeatVisualState(heat, maxHeat).color }}>HEAT</span>
            <span style={{ fontFamily: monoFont, fontSize: 10, color: theme.textPrimary }}>
              {heat}
              <span style={{ color: theme.textDim }}>/</span>
              {maxHeat}
            </span>
          </div>
          <HeatBar heat={heat} maxHeat={maxHeat} height={12} showText={false} theme={theme} monoFont={monoFont} getHeatVisualState={getHeatVisualState} getHeatBarTextColor={getHeatBarTextColor} heatThresholdMarkers={heatThresholdMarkers} />
        </div>
      </div>

      <CombatConditionStrip heat={heat} maxHeat={maxHeat} arenaModifier={arenaModifier} compact={true} theme={theme} monoFont={monoFont} getHeatVisualState={getHeatVisualState} />

      {nonFirewallStatuses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 10px', borderRadius: 14, background: 'rgba(6,10,18,0.72)', border: `1px solid ${theme.borderLight}` }}>
          <span style={{ fontFamily: monoFont, fontSize: 8, letterSpacing: '0.1em', color: theme.textDim }}>STATUSES</span>
          <StatusRow statuses={nonFirewallStatuses} size="small" justify="flex-start" />
        </div>
      )}

      {activePowers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 10px', borderRadius: 14, background: 'rgba(14,8,20,0.72)', border: '1px solid #6f3fbf55' }}>
          <span style={{ fontFamily: monoFont, fontSize: 8, letterSpacing: '0.1em', color: '#aa66ff' }}>POWERS</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {activePowers.map((def, index) => (
              <div key={index} title={def.effects?.find((effect) => effect.op === 'RawText')?.text || ''} style={{ fontFamily: monoFont, fontSize: 8, color: '#cc88ff', backgroundColor: '#aa44ff12', border: '1px solid #aa44ff30', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {def.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MobilePlayerHud({
  player,
  ram = 0,
  maxRam = 0,
  heat = 0,
  maxHeat = 20,
  arenaModifier = null,
  drawCount = 0,
  discardCount = 0,
  exhaustCount = 0,
  powerPile = [],
  cardInstances = {},
  data,
  layoutMode = 'phone-portrait',
  interactionLocked = false,
  onEndTurn,
  deckMenuOpen = false,
  onToggleDeckMenu,
  onViewPile,
  deckMenuRef,
  selfTargetable = false,
  selfTargetSelected = false,
  selfTargetArmed = false,
  onTargetSelf = null,
  theme,
  monoFont,
  HealthBar,
  FirewallBar,
  StatusBadge,
  getHeatVisualState,
  getHeatBarTextColor,
  heatThresholdMarkers,
}) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const firewallStacks = player?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (player?.statuses || []).filter((status) => status.id !== 'Firewall');
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const activePowers = getActivePowers(powerPile, cardInstances, data);
  const metric = (label, value, color, bar) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontFamily: monoFont, fontSize: isPhonePortrait ? 10 : 11, fontWeight: 700, color }}>{label}</span>
        <span style={{ fontFamily: monoFont, fontSize: isPhonePortrait ? 11 : 12, color: theme.textPrimary }}>{value}</span>
      </div>
      {bar}
    </div>
  );
  const openPile = (pile) => {
    onViewPile?.(pile);
    onToggleDeckMenu?.(false);
  };
  const hasPortraitActionRail = isPhonePortrait && (onEndTurn || onToggleDeckMenu);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isPhonePortrait ? 5 : 7,
        minWidth: 0,
        borderRadius: 14,
        padding: isPhonePortrait ? '7px 8px' : '9px',
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${theme.neonCyan}28`,
        boxShadow: `0 8px 22px rgba(0,0,0,0.26), 0 0 18px ${theme.neonCyan}10`,
      }}
    >
      <div
        role={selfTargetable ? 'button' : undefined}
        tabIndex={selfTargetable ? 0 : undefined}
        aria-pressed={selfTargetable ? selfTargetSelected : undefined}
        aria-label={selfTargetable ? 'Select yourself as the current card target' : undefined}
        onClick={selfTargetable ? (event) => {
          event.stopPropagation();
          onTargetSelf?.();
        } : undefined}
        onKeyDown={selfTargetable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onTargetSelf?.();
          }
        } : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isPhonePortrait ? 4 : 5,
          padding: isPhonePortrait ? '6px 7px' : '7px 8px',
          borderRadius: 12,
          background: 'rgba(3,7,14,0.72)',
          border: `1px solid ${selfTargetArmed ? `${theme.neonYellow}48` : selfTargetable ? `${theme.neonGreen}34` : theme.borderLight}`,
          boxShadow: selfTargetArmed ? `0 0 24px ${theme.neonYellow}12, inset 0 0 0 1px ${theme.neonYellow}12` : selfTargetable ? `0 0 16px ${theme.neonGreen}10` : 'none',
          cursor: selfTargetable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: monoFont, fontSize: isPhonePortrait ? 9 : 10, fontWeight: 700, letterSpacing: '0.12em', color: theme.textDim }}>PLAYER</span>
          <span style={{ fontFamily: monoFont, fontSize: isPhonePortrait ? 9 : 10, color: selfTargetArmed ? theme.neonYellow : selfTargetable ? theme.neonGreen : theme.textSecondary }}>
            {selfTargetable
              ? (selfTargetArmed ? 'DOUBLE TAP NOW' : selfTargetSelected ? 'SELF TARGET READY' : 'DOUBLE TAP SELF')
              : 'FW / HP / RAM / HEAT'}
          </span>
        </div>

        {hasPortraitActionRail ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(88px, 1fr)', gap: 8, alignItems: 'stretch' }}>
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                {metric('FW', `${firewallStacks}/${maxHp}`, theme.neonCyan, <FirewallBar current={firewallStacks} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />)}
                {metric('HP', `${hp}/${maxHp}`, theme.neonGreen, <HealthBar current={hp} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 6, minWidth: 0 }}>
                <CombatActionButton label="End Turn" onClick={onEndTurn} disabled={interactionLocked} tone="primary" compact={true} theme={theme} monoFont={monoFont} style={{ width: '100%', minHeight: 56, padding: '8px 6px', fontSize: 10, lineHeight: 1.1 }} />
                <CombatActionButton label="Deck" onClick={() => onToggleDeckMenu?.(!deckMenuOpen)} active={deckMenuOpen} tone="orange" compact={true} theme={theme} monoFont={monoFont} style={{ width: '100%', minHeight: 40, padding: '7px 6px', fontSize: 10 }} />
              </div>
            </div>
            {metric('RAM', `${ram}/${maxRam}`, theme.neonCyan, <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} theme={theme} monoFont={monoFont} />)}
            {metric('HEAT', `${heat}/${maxHeat}`, getHeatVisualState(heat, maxHeat).color, <HeatBar heat={heat} maxHeat={maxHeat} height={isPhonePortrait ? 8 : 10} showText={false} theme={theme} monoFont={monoFont} getHeatVisualState={getHeatVisualState} getHeatBarTextColor={getHeatBarTextColor} heatThresholdMarkers={heatThresholdMarkers} />)}
            {deckMenuOpen && (
              <div ref={deckMenuRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, paddingTop: 2 }}>
                <PileCountButton label="Draw" count={drawCount} color={theme.neonCyan} onClick={() => openPile('draw')} compact={true} theme={theme} monoFont={monoFont} />
                <PileCountButton label="Discard" count={discardCount} color={theme.neonOrange} onClick={() => openPile('discard')} compact={true} theme={theme} monoFont={monoFont} />
                <PileCountButton label="Exhaust" count={exhaustCount} color={theme.neonRed} onClick={() => openPile('exhaust')} compact={true} theme={theme} monoFont={monoFont} />
              </div>
            )}
          </>
        ) : (
          <>
            {metric('FW', `${firewallStacks}/${maxHp}`, theme.neonCyan, <FirewallBar current={firewallStacks} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />)}
            {metric('HP', `${hp}/${maxHp}`, theme.neonGreen, <HealthBar current={hp} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />)}
            {metric('RAM', `${ram}/${maxRam}`, theme.neonCyan, <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} theme={theme} monoFont={monoFont} />)}
            {metric('HEAT', `${heat}/${maxHeat}`, getHeatVisualState(heat, maxHeat).color, <HeatBar heat={heat} maxHeat={maxHeat} height={isPhonePortrait ? 8 : 10} showText={false} theme={theme} monoFont={monoFont} getHeatVisualState={getHeatVisualState} getHeatBarTextColor={getHeatBarTextColor} heatThresholdMarkers={heatThresholdMarkers} />)}
          </>
        )}
      </div>

      <CombatConditionStrip heat={heat} maxHeat={maxHeat} arenaModifier={arenaModifier} compact={true} theme={theme} monoFont={monoFont} getHeatVisualState={getHeatVisualState} />

      {(nonFirewallStatuses.length > 0 || activePowers.length > 0) && (
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: 1 }}>
          {nonFirewallStatuses.map((status, index) => (
            <StatusBadge key={`${status.id}-${index}`} status={status} size="small" />
          ))}
          {activePowers.slice(0, isPhonePortrait ? 2 : 3).map((power, index) => (
            <div
              key={`${power.id || power.name}-${index}`}
              title={power.effects?.find((effect) => effect.op === 'RawText')?.text || power.name}
              style={{
                fontFamily: monoFont,
                fontSize: isPhonePortrait ? 9 : 10,
                fontWeight: 700,
                color: '#cc88ff',
                backgroundColor: '#aa44ff12',
                border: '1px solid #aa44ff30',
                borderRadius: 999,
                padding: isPhonePortrait ? '4px 8px' : '5px 9px',
                flexShrink: 0,
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {power.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
