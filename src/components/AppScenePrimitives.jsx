import React from 'react';
import RuntimeArt from './RuntimeArt.jsx';
import { C, UI_MONO } from '../app/uiTheme.js';
import { getCardImage } from '../data/cardImages.js';

const CARD_TYPE_COLORS = {
  Attack: C.red,
  Skill: C.green,
  Power: C.purple,
  Defense: C.cyan,
  Support: C.green,
  Utility: C.yellow,
  default: C.cyan,
};

const MONO = UI_MONO;

export const MENU_CARD_RATIO = '13 / 18';
export const MENU_CARD_MIN_W = 156;
export const MENU_CARD_MAX_W = 188;

function getCardColor(type) {
  return CARD_TYPE_COLORS[type] || CARD_TYPE_COLORS.default;
}

function formatMutationCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.ceil(numeric));
}

function isCoreCard(card) {
  return (card?.tags || []).includes('Core');
}

function describeEffects(effects) {
  if (!effects?.length) return '';
  return effects.map((effect) => {
    if (effect.op === 'DealDamage') return `Deal ${effect.amount} dmg`;
    if (effect.op === 'GainBlock') return `+${effect.amount} Firewall`;
    if (effect.op === 'Heal') return `Heal ${effect.amount} HP`;
    if (effect.op === 'DrawCards') return `Draw ${effect.amount}`;
    if (effect.op === 'GainRAM') return `+${effect.amount} RAM`;
    if (effect.op === 'ApplyStatus' && effect.statusId === 'Firewall' && effect.target === 'Self') return `+${effect.stacks} Firewall`;
    if (effect.op === 'ApplyStatus') return `Apply ${effect.statusId}x${effect.stacks}`;
    if (effect.op === 'RawText') return effect.text;
    return effect.op;
  }).join(' · ');
}

function NodeSceneChip({ accent = C.cyan, children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${accent}2f`,
        background: `${accent}12`,
        color: accent,
        fontFamily: UI_MONO,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

export function getSecondaryActionButtonStyle(accent = C.cyan, overrides = {}) {
  return {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    fontFamily: UI_MONO,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    transition: 'all 0.15s ease',
    background: `linear-gradient(180deg, ${accent}18 0%, rgba(10,10,15,0.94) 100%)`,
    border: `1px solid ${accent}60`,
    boxShadow: `0 0 18px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.06)`,
    color: accent,
    cursor: 'pointer',
    ...overrides,
  };
}

export function getNodeScenePanelStyle(accent = C.cyan, overrides = {}) {
  return {
    borderRadius: 20,
    border: `1px solid ${accent}2c`,
    background: `
      linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 22%, transparent 78%, rgba(255,255,255,0.018) 100%),
      radial-gradient(circle at 18% 18%, ${accent}16 0%, transparent 30%),
      linear-gradient(180deg, rgba(9, 13, 22, 0.96) 0%, rgba(5, 8, 14, 0.99) 100%)
    `,
    boxShadow: '0 20px 42px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)',
    padding: 18,
    ...overrides,
  };
}

export function NodeSceneIntro({
  accent = C.cyan,
  eyebrow = 'NODE',
  title = '',
  body = '',
  chips = [],
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.18em', color: accent, textTransform: 'uppercase' }}>
        {eyebrow}
      </div>
      <div style={{ fontFamily: "'Rajdhani', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontSize: 34, fontWeight: 700, lineHeight: 0.94, color: C.text }}>
        {title}
      </div>
      <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.7, color: C.textDim, maxWidth: 760 }}>
        {body}
      </div>
      {chips.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((chip) => (
            <NodeSceneChip key={`${chip.accent}-${chip.label}`} accent={chip.accent}>
              {chip.label}
            </NodeSceneChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function getCardLifecycleDisplay(card, instance) {
  const core = isCoreCard(card);
  const nextValue = core ? 'N/A' : formatMutationCounter(instance?.useCounter);
  const finalValue = core ? 'N/A' : formatMutationCounter(instance?.finalMutationCountdown);
  const isDecaying = !core
    && !instance?.finalMutationId
    && instance?.finalMutationCountdown != null
    && instance.finalMutationCountdown <= 5;
  return { core, nextValue, finalValue, isDecaying };
}

export function getCardUseCounterLimit(card, instance, data) {
  let maxUse = Number(card?.defaultUseCounter ?? 12);
  for (const mutationId of instance?.appliedMutations || []) {
    maxUse += Number(data?.mutations?.[mutationId]?.useCounterDelta ?? 0);
  }
  return Math.max(1, Number.isFinite(maxUse) ? maxUse : 12);
}

export function CardChoiceTile({
  cardId,
  card,
  instance = null,
  onClick,
  disabled = false,
  price = null,
  statusLabel = null,
  statusColor = C.textMuted,
  selected = false,
}) {
  if (!card) return null;

  const color = getCardColor(card.type);
  const imgSrc = getCardImage(cardId);
  const tags = (card.tags || []).filter((tag) => !['Core', 'EnemyCard'].includes(tag));
  const mutations = instance?.appliedMutations || [];
  const isBricked = instance?.finalMutationId === 'J_BRICK';
  const isRewritten = instance?.finalMutationId === 'J_REWRITE';
  const isCompiled = Number(instance?.compileLevel || 0) > 0;
  const displayedCost = Math.max(0, Number(card.costRAM ?? 0) + Number(instance?.ramCostDelta || 0));
  const {
    nextValue: visibleUseCounter,
    finalValue: visibleFinalCounter,
    isDecaying,
  } = getCardLifecycleDisplay(card, instance);
  const effectText = describeEffects(card.effects);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        maxWidth: `${MENU_CARD_MAX_W}px`,
        aspectRatio: MENU_CARD_RATIO,
        minHeight: 216,
        borderRadius: 16,
        overflow: 'hidden',
        textAlign: 'left',
        position: 'relative',
        justifySelf: 'center',
        alignSelf: 'start',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        padding: 0,
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundColor: C.bgCard,
        border: `2px solid ${selected ? C.yellow : isBricked ? C.red : isDecaying ? C.orange : color}55`,
        boxShadow: selected
          ? `0 0 24px ${C.yellow}35, 0 14px 28px rgba(0,0,0,0.45)`
          : `0 0 18px ${color}18, 0 10px 24px rgba(0,0,0,0.36)`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
      }}
    >
      <RuntimeArt
        src={imgSrc}
        alt={card.name}
        accent={color}
        label={card.name}
        loading="eager"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        imageStyle={{
          objectFit: 'cover',
          objectPosition: 'center center',
          transform: 'scale(1.02)',
          filter: 'saturate(1.04) contrast(1.02) brightness(0.92)',
        }}
        fallbackStyle={{
          background: `linear-gradient(145deg, ${color}22 0%, ${C.bgCard} 48%, ${color}0c 100%)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 24% 16%, ${color}28 0%, transparent 34%),
            linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.24) 24%, rgba(8,10,16,0.78) 58%, rgba(8,10,16,0.95) 100%)
          `,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: `inset 0 0 0 1px ${color}14`,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 30,
          height: 30,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
          color: '#000',
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 14,
          zIndex: 2,
          boxShadow: `0 0 10px ${color}55`,
        }}
      >
        {displayedCost}
      </div>

      {(statusLabel || price != null) && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            borderRadius: 999,
            backgroundColor: statusLabel ? `${statusColor}16` : `${C.yellow}18`,
            border: `1px solid ${statusLabel ? `${statusColor}40` : `${C.yellow}45`}`,
            color: statusLabel ? statusColor : C.yellow,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 11,
            zIndex: 2,
          }}
        >
          {statusLabel || `${price}g`}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: 0,
          padding: '0 10px 10px',
        }}
      >
        <div
          style={{
            padding: '12px 10px 10px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(8,10,16,0.14) 0%, rgba(8,10,16,0.72) 14%, rgba(8,10,16,0.92) 100%)',
            border: `1px solid ${color}22`,
            boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: '47%',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                color: C.text,
                fontSize: 13,
                lineHeight: 1.25,
                marginBottom: 3,
                textShadow: '0 1px 10px rgba(0,0,0,0.55)',
              }}
            >
              {card.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                color,
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              {card.type}
            </div>
          </div>

          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#b7bcc6',
              lineHeight: 1.45,
              minHeight: 42,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 8px rgba(0,0,0,0.45)',
            }}
          >
            {effectText}
          </div>

          {(tags.length > 0 || isCompiled) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {isCompiled && (
                <span
                  style={{
                    padding: '2px 5px',
                    borderRadius: 4,
                    fontFamily: MONO,
                    fontSize: 8,
                    backgroundColor: `${C.orange}16`,
                    color: C.orange,
                    border: `1px solid ${C.orange}30`,
                    boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  COMPILED
                </span>
              )}
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 4,
                    fontFamily: MONO,
                    fontSize: 8,
                    backgroundColor: `${color}14`,
                    color,
                    border: `1px solid ${color}28`,
                    boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  {tag.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {(mutations.length > 0 || instance?.useCounter != null || instance?.finalMutationCountdown != null) && (
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 8,
                borderTop: `1px solid ${color}22`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {mutations.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {mutations.slice(0, 4).map((mutationId) => (
                    <span
                      key={mutationId}
                      style={{
                        padding: '1px 4px',
                        borderRadius: 4,
                        fontFamily: MONO,
                        fontSize: 8,
                        color,
                        backgroundColor: `${color}10`,
                        border: `1px solid ${color}28`,
                      }}
                    >
                      {mutationId}
                    </span>
                  ))}
                  {mutations.length > 4 && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: C.textMuted }}>
                      +{mutations.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.textMuted,
                  letterSpacing: '0.04em',
                }}
              >
                <span>
                  {visibleUseCounter != null ? `NEXT ${visibleUseCounter}` : (isBricked ? 'BRICKED' : isRewritten ? 'REWRITTEN' : '')}
                </span>
                <span>
                  {visibleFinalCounter != null ? `FINAL ${visibleFinalCounter}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
