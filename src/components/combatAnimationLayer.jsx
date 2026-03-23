import React from 'react';
import { getCardImage } from '../data/cardImages.js';
import RuntimeArt from './RuntimeArt.jsx';
import { getEnemyAnimationAnchor } from './combatPresentation.js';

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

function getActionZoneLayout(targetZone) {
  switch (targetZone) {
    case 'player':
      return {
        left: '50%',
        top: '77%',
        width: 'min(76vw, 560px)',
        height: 'min(28vh, 220px)',
      };
    case 'enemy':
      return {
        left: '69%',
        top: '19%',
        width: 'min(48vw, 360px)',
        height: 'min(22vh, 180px)',
      };
    default:
      return {
        left: '50%',
        top: '48%',
        width: 'min(58vw, 420px)',
        height: 'min(20vh, 150px)',
      };
  }
}

function getActionCaptionLayout(targetZone) {
  switch (targetZone) {
    case 'player':
      return {
        left: '50%',
        top: '67%',
      };
    case 'enemy':
      return {
        left: '69%',
        top: '27%',
      };
    default:
      return {
        left: '50%',
        top: '47%',
      };
  }
}

function getMutationAnimationInfo(mutationId, data, getMutColor, getMutLabel, getMutationDetailLines) {
  const mutation = data?.mutations?.[mutationId];
  return {
    mutation,
    color: getMutColor(mutationId || 'A-01'),
    label: mutationId ? getMutLabel(mutationId) : '?',
    name: mutation?.name || mutationId || 'Mutation',
    lines: getMutationDetailLines(mutation),
  };
}

function MutationDiscoveryOverlay({
  animation,
  data,
  theme,
  monoFont,
  getBackdropFilter,
  getMutColor,
  getMutLabel,
  getMutationDetailLines,
}) {
  const { color, label, name, lines } = getMutationAnimationInfo(
    animation.mutationId,
    data,
    getMutColor,
    getMutLabel,
    getMutationDetailLines,
  );
  const cardDef = data?.cards?.[animation.defId];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 790,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="mutation-discovery-popup"
        style={{
          width: 'min(88vw, 360px)',
          padding: '14px 16px 16px',
          borderRadius: 16,
          border: `1px solid ${color}70`,
          background: 'linear-gradient(180deg, rgba(9,10,18,0.96) 0%, rgba(12,14,24,0.98) 100%)',
          boxShadow: `0 0 30px ${color}28, 0 20px 44px rgba(0,0,0,0.55)`,
          backdropFilter: getBackdropFilter(12),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              minWidth: 32,
              height: 32,
              padding: '0 10px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${color}24`,
              border: `1px solid ${color}60`,
              color,
              fontFamily: monoFont,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </div>
          <div>
            <div style={{ fontFamily: monoFont, color, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              New Mutation
            </div>
            <div style={{ fontFamily: monoFont, color: theme.textPrimary, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {name}
            </div>
          </div>
        </div>

        {cardDef && (
          <div style={{ fontFamily: monoFont, color: '#cbd3de', fontSize: 11, marginBottom: 8 }}>
            Applied to <span style={{ color: theme.textPrimary, fontWeight: 700 }}>{cardDef.name}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {lines.slice(0, 3).map((line, index) => (
            <div key={`${animation.id}-line-${index}`} style={{ fontFamily: monoFont, color: '#b9c2cf', fontSize: 11, lineHeight: 1.5 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MutationRepeatOverlay({
  animation,
  data,
  cardInstances,
  theme,
  monoFont,
  getBackdropFilter,
  getCardColor,
  getMutColor,
  getMutLabel,
  getMutationDetailLines,
}) {
  const cardDef = data?.cards?.[animation.defId];
  const cardInstance = cardInstances?.[animation.cardInstanceId];
  const imgSrc = getCardImage(animation.defId);
  const cardColor = getCardColor(cardDef?.type);
  const { color: mutationColor, label, name } = getMutationAnimationInfo(
    animation.mutationId,
    data,
    getMutColor,
    getMutLabel,
    getMutationDetailLines,
  );

  if (!cardDef || !cardInstance) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 790,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="mutation-repeat-card"
        style={{
          position: 'relative',
          width: 'min(46vw, 188px)',
          aspectRatio: '13 / 18',
          borderRadius: 14,
          overflow: 'hidden',
          border: `2px solid ${cardColor}80`,
          backgroundColor: theme.bgCard,
          boxShadow: `0 0 40px ${mutationColor}24, 0 20px 40px rgba(0,0,0,0.58)`,
        }}
      >
        <RuntimeArt
          src={imgSrc}
          alt={cardDef?.name || 'Mutation preview'}
          accent={mutationColor}
          label={cardDef?.name || 'Mutation preview'}
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
            filter: 'saturate(1.06) brightness(0.92)',
          }}
          fallbackStyle={{
            background: `linear-gradient(145deg, ${cardColor}22 0%, ${theme.bgCard} 48%, ${cardColor}0c 100%)`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(circle at 26% 18%, ${mutationColor}26 0%, transparent 34%),
              linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.24) 24%, rgba(8,10,16,0.76) 58%, rgba(8,10,16,0.94) 100%)
            `,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 9,
            left: 9,
            width: 30,
            height: 30,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: monoFont,
            backgroundColor: cardColor,
            color: '#000',
            boxShadow: `0 0 10px ${cardColor}80`,
            fontSize: 14,
          }}
        >
          {Math.max(0, (cardDef.costRAM || 0) + (cardInstance.ramCostDelta || 0))}
        </div>

        <div
          className="mutation-symbol-pop"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            minWidth: 34,
            height: 34,
            padding: '0 8px',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${mutationColor}24`,
            border: `1px solid ${mutationColor}66`,
            color: mutationColor,
            fontFamily: monoFont,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.06em',
            boxShadow: `0 0 14px ${mutationColor}35`,
          }}
        >
          {label}
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            margin: 'auto 10px 10px',
            padding: '12px 10px 10px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(8,10,16,0.16) 0%, rgba(8,10,16,0.74) 14%, rgba(8,10,16,0.92) 100%)',
            border: `1px solid ${cardColor}22`,
            boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            backdropFilter: getBackdropFilter(4),
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: '46%',
          }}
        >
          <div style={{ fontFamily: monoFont, fontWeight: 700, color: theme.textPrimary, fontSize: 14, textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}>
            {cardDef.name}
          </div>
          <div style={{ fontFamily: monoFont, textTransform: 'uppercase', color: cardColor, fontSize: 9, letterSpacing: '0.1em' }}>
            {cardDef.type}
          </div>
          <div style={{ fontFamily: monoFont, color: mutationColor, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>
            {label} {name}
          </div>
          <div style={{ fontFamily: monoFont, color: '#c0c8d3', fontSize: 9, lineHeight: 1.45 }}>
            Mutation reapplied. Symbol added before the card is filed away.
          </div>
        </div>
      </div>
    </div>
  );
}

export function CombatPlayAnimationLayer({
  animation,
  data,
  enemies = EMPTY_ARRAY,
  cardInstances = {},
  theme,
  monoFont,
  getBackdropFilter,
  getCardColor,
  getMutColor,
  getMutLabel,
  getMutationDetailLines,
  formatEffectsLong,
  buildAnimationEffectTokens,
  getPlayAnimationMeta,
  getEnemyActionCue,
  getPlayAnimationDuration,
}) {
  if (!animation) return null;

  if (animation.kind === 'mutationPopup') {
    return (
      <MutationDiscoveryOverlay
        animation={animation}
        data={data}
        theme={theme}
        monoFont={monoFont}
        getBackdropFilter={getBackdropFilter}
        getMutColor={getMutColor}
        getMutLabel={getMutLabel}
        getMutationDetailLines={getMutationDetailLines}
      />
    );
  }

  if (animation.kind === 'mutationRepeat') {
    return (
      <MutationRepeatOverlay
        animation={animation}
        data={data}
        cardInstances={cardInstances}
        theme={theme}
        monoFont={monoFont}
        getBackdropFilter={getBackdropFilter}
        getCardColor={getCardColor}
        getMutColor={getMutColor}
        getMutLabel={getMutLabel}
        getMutationDetailLines={getMutationDetailLines}
      />
    );
  }

  const cardDef = data?.cards?.[animation.defId];
  const accentBase = animation.actor === 'player' ? cardDef?.type : animation.intentType;
  const meta = getPlayAnimationMeta(animation.actor, animation.intentType, accentBase);
  const accent = meta.accent;
  const imgSrc = getCardImage(animation.defId);
  const anchor = animation.actor === 'enemy'
    ? getEnemyAnimationAnchor(animation.enemyId, enemies)
    : { left: '74%', top: '74%' };
  const effectLines = cardDef?.effects ? formatEffectsLong(cardDef.effects) : [];
  const previewLine = effectLines[0] || (animation.actor === 'enemy' ? `${animation.intentType || 'Unknown'} action` : 'Executing card');
  const cost = Math.max(0, cardDef?.costRAM || 0);
  const bodyLabel = animation.actor === 'enemy'
    ? (animation.enemyName || 'Enemy protocol')
    : (cardDef?.type || 'Player');
  const cue = animation.actor === 'enemy'
    ? getEnemyActionCue(animation.intentType, accent)
    : null;
  const reactionTokens = buildAnimationEffectTokens(animation.effectSummary, animation.reactions);
  const cueZoneLayout = cue ? getActionZoneLayout(cue.targetZone) : null;
  const cueCaptionLayout = cue ? getActionCaptionLayout(cue.targetZone) : null;
  const playDuration = animation.duration || getPlayAnimationDuration(animation.actor, animation.intentType);
  const laneHeight = cue?.targetZone === 'player'
    ? '56vh'
    : cue?.targetZone === 'enemy'
      ? '18vh'
      : '34vh';
  const laneTop = cue?.targetZone === 'player'
    ? '18%'
    : cue?.targetZone === 'enemy'
      ? '12%'
      : '32%';
  const laneTilt = cue?.targetZone === 'player'
    ? '-3deg'
    : cue?.targetZone === 'enemy'
      ? '3deg'
      : '0deg';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 780,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {cue && (
        <>
          <div
            className="play-action-wash"
            style={{
              position: 'absolute',
              inset: 0,
              background: cue.wash,
              '--play-duration': `${playDuration}ms`,
            }}
          />
          <div
            className="play-action-lane"
            style={{
              position: 'absolute',
              left: cue.targetZone === 'neutral' ? '50%' : anchor.left,
              top: laneTop,
              width: cue.targetZone === 'player' ? 20 : 18,
              height: laneHeight,
              transform: `translateX(-50%) rotate(${laneTilt})`,
              transformOrigin: '50% 0%',
              borderRadius: 999,
              background: cue.lane,
              filter: `drop-shadow(0 0 16px ${accent}66)`,
              '--play-duration': `${playDuration}ms`,
            }}
          />
          <div
            className="play-action-zone"
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              borderRadius: 36,
              pointerEvents: 'none',
              background: cue.zone,
              border: `1px solid ${accent}38`,
              boxShadow: `0 0 26px ${accent}18`,
              '--play-duration': `${playDuration}ms`,
              ...(cueZoneLayout || EMPTY_OBJECT),
            }}
          />
          <div
            className="play-action-caption"
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              padding: '8px 12px',
              borderRadius: 14,
              border: `1px solid ${accent}4a`,
              background: `linear-gradient(180deg, ${accent}18 0%, rgba(6,9,15,0.92) 28%, rgba(6,9,15,0.98) 100%)`,
              boxShadow: `0 0 20px ${accent}18, 0 10px 24px rgba(0,0,0,0.34)`,
              backdropFilter: getBackdropFilter(6),
              pointerEvents: 'none',
              '--play-duration': `${playDuration}ms`,
              ...(cueCaptionLayout || EMPTY_OBJECT),
            }}
          >
            <div style={{ fontFamily: monoFont, color: accent, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {cue.title}
            </div>
            <div style={{ fontFamily: monoFont, color: '#d4dbe6', fontSize: 10, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {cue.targetLabel}
            </div>
          </div>
        </>
      )}
      <div
        className={`play-card-overlay ${meta.className}`}
        style={{
          position: 'absolute',
          left: anchor.left,
          top: anchor.top,
          width: 'clamp(128px, 30vw, 172px)',
          minHeight: 184,
          borderRadius: 16,
          overflow: 'hidden',
          transform: 'translate(-50%, -50%)',
          border: `2px solid ${accent}88`,
          background: 'linear-gradient(180deg, rgba(16,18,28,0.96) 0%, rgba(9,10,18,0.98) 100%)',
          boxShadow: `0 0 34px ${accent}44, 0 18px 44px rgba(0,0,0,0.58)`,
          '--play-accent': accent,
          '--play-glow': `${accent}66`,
          '--play-duration': `${playDuration}ms`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${accent}12 0%, transparent 45%, ${accent}18 100%)`,
          }}
        />

        {animation.actor === 'player' && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              width: 28,
              height: 28,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: accent,
              color: '#000',
              fontFamily: monoFont,
              fontWeight: 700,
              fontSize: 14,
              zIndex: 2,
            }}
          >
            {cost}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            borderRadius: 999,
            border: `1px solid ${meta.badgeColor}66`,
            backgroundColor: 'rgba(0,0,0,0.55)',
            color: meta.badgeColor,
            fontFamily: monoFont,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {meta.badge}
        </div>

        <div
          style={{
            height: 84,
            position: 'relative',
            overflow: 'hidden',
            borderBottom: `1px solid ${accent}30`,
            backgroundColor: `${accent}10`,
          }}
        >
          <RuntimeArt
            src={imgSrc}
            alt={cardDef?.name || 'Animated card'}
            accent={accent}
            label={cardDef?.name || 'Animated card'}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
            imageStyle={{
              objectFit: 'cover',
              objectPosition: 'top center',
              filter: animation.actor === 'enemy' ? 'saturate(0.9) brightness(0.9)' : 'none',
            }}
            fallbackStyle={{
              background: `linear-gradient(135deg, ${accent}1c 0%, ${theme.bgCard} 52%, ${accent}08 100%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 48%, rgba(9,10,18,0.94) 100%)',
            }}
          />
        </div>

        <div style={{ position: 'relative', padding: '12px 12px 14px' }}>
          <div
            style={{
              fontFamily: monoFont,
              fontWeight: 700,
              color: theme.textPrimary,
              fontSize: 13,
              lineHeight: 1.25,
              marginBottom: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cardDef?.name || (animation.actor === 'enemy' ? 'Enemy action' : 'Player action')}
          </div>
          <div
            style={{
              fontFamily: monoFont,
              color: accent,
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {meta.label}
          </div>
          {cue && (
            <div
              style={{
                marginBottom: 8,
                padding: '6px 8px',
                borderRadius: 10,
                border: `1px solid ${accent}28`,
                background: `linear-gradient(180deg, ${accent}12 0%, rgba(8,10,16,0.72) 100%)`,
              }}
            >
              <div
                style={{
                  fontFamily: monoFont,
                  color: accent,
                  fontSize: 8,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {cue.title}
              </div>
              <div
                style={{
                  fontFamily: monoFont,
                  color: '#cfd6e1',
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                {cue.targetLabel}
              </div>
            </div>
          )}
          {reactionTokens.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {reactionTokens.map((token) => (
                <div
                  key={token.label}
                  style={{
                    padding: '4px 7px',
                    borderRadius: 999,
                    border: `1px solid ${token.color}42`,
                    background: `${token.color}16`,
                    color: token.color,
                    fontFamily: monoFont,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {token.label}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              fontFamily: monoFont,
              color: theme.textSecondary,
              fontSize: 10,
              lineHeight: 1.45,
              minHeight: 28,
            }}
          >
            {previewLine}
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1px solid ${accent}24`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontFamily: monoFont,
              fontSize: 9,
              color: theme.textDim,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span>{bodyLabel}</span>
            <span>{animation.actor === 'enemy' ? (animation.intentType || 'Unknown') : 'Play'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
