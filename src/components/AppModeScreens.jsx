import React from 'react';
import { getServiceOfferPreview } from '../game/game_core.js';
import { createBasicEventRegistry } from '../game/events.js';
import { isMinigameEvent } from '../game/minigames.js';
import { getEventImage } from '../data/eventImages.js';
import { scoreRunForDaily } from '../game/dailyRun.js';
import { DIFFICULTY_PROFILES } from '../game/runProfiles.js';
import { deriveCauseOfDeath } from '../app/deathAnalysis.js';
import { C, UI_MONO } from '../app/uiTheme.js';
import { ScreenShell, RunHeader } from './AppShellScreens.jsx';
import RuntimeArt from './RuntimeArt.jsx';
import {
  CardChoiceTile,
  MENU_CARD_MAX_W,
  MENU_CARD_MIN_W,
  NodeSceneIntro,
  getNodeScenePanelStyle,
  getSecondaryActionButtonStyle,
} from './AppScenePrimitives.jsx';

const EVENT_REG_UI = createBasicEventRegistry();
const MONO = UI_MONO;

const SHOP_SERVICE_INFO = {
  RemoveCard: { icon: '🗑️', label: 'Remove Card', color: C.red },
  Remove: { icon: '🗑️', label: 'Remove Card', color: C.red },
  Repair: { icon: '🔧', label: 'Repair', color: C.cyan },
  Stabilise: { icon: '◆', label: 'Stabilise', color: C.purple },
  Accelerate: { icon: '⚡', label: 'Accelerate', color: C.orange },
  Heal: { icon: '💊', label: 'Heal', color: C.green },
  Forge: { icon: 'F', label: 'Forge', color: C.orange },
};

const DEATH_QUIPS = [
  'Connection terminated.',
  'Process killed.',
  'Signal lost.',
  'System failure.',
  'Neural link severed.',
  'Firewall breach - fatal.',
  'Memory corrupted beyond repair.',
  'Runtime exception: fatal.',
];

function getOfferCurrency(offer) {
  return offer?.currency === 'scrap' ? 'scrap' : 'gold';
}

function getRunCurrencyAmount(run, currency = 'gold') {
  if (!run) return 0;
  return currency === 'scrap' ? (run.scrap ?? 0) : (run.gold ?? 0);
}

function formatOfferPrice(amount, currency = 'gold') {
  return currency === 'scrap' ? `${amount} scrap` : `${amount}g`;
}

function getCurrencyBadgeStyle(color) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '8px',
    fontFamily: UI_MONO,
    fontWeight: 700,
    backgroundColor: `${color}15`,
    border: `1px solid ${color}40`,
    color,
    fontSize: 14,
  };
}

function formatMinigameRewardOp(op) {
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

function summarizeEventChoiceOps(ops = []) {
  if (!Array.isArray(ops) || ops.length === 0) return 'Leave without changing your run.';
  return ops
    .slice(0, 3)
    .map(formatMinigameRewardOp)
    .join(' · ');
}

function getEventTutorialActionId(eventId, tutorialStep) {
  if (!tutorialStep || tutorialStep.mode !== 'Event') return null;
  if (eventId === 'CompileStation') return 'Compile_Open';
  if (eventId !== 'RestSite') return null;
  if (tutorialStep.id === 'rest_scrap') return 'Rest_Forge';
  if (tutorialStep.id === 'stabilise_open') return 'Rest_Stabilise';
  return null;
}

function escapeTranscriptRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prettifyTranscriptId(rawId) {
  if (rawId == null) return null;
  const cleaned = String(rawId).trim();
  if (!cleaned) return null;
  if (/^player$/i.test(cleaned)) return 'Player';
  return cleaned
    .replace(/^enemy[_:-]?/i, 'host ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceTranscriptEntityIds(text, knownNames) {
  let output = String(text || '');
  const replacements = [...knownNames.entries()]
    .filter(([id, name]) => id && name)
    .sort((a, b) => String(b[0]).length - String(a[0]).length);
  for (const [id, name] of replacements) {
    output = output.replace(new RegExp(`\\b${escapeTranscriptRegExp(id)}\\b`, 'g'), name);
  }
  return output.replace(/\s+/g, ' ').trim();
}

function resolveTranscriptEntityLabel(entityId, knownNames, playerId = 'player') {
  if (!entityId) return 'System';
  if (entityId === 'player' || entityId === playerId) return 'Player';
  return knownNames.get(entityId) || prettifyTranscriptId(entityId) || String(entityId);
}

function buildDeathTranscript(state, causeOfDeath = null) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const run = state?.run || {};
  if (!log.length) return null;

  const playerId = state?.combat?.player?.id ?? 'player';
  const finalOutcomeIndex = [...log].reverse().findIndex((entry) => {
    const msg = entry?.msg || '';
    return entry?.t === 'Info' && (
      /^Run ended:/i.test(msg)
      || /Player defeated/i.test(msg)
      || /Combat victory/i.test(msg)
    );
  });
  const endIndex = finalOutcomeIndex >= 0 ? (log.length - 1 - finalOutcomeIndex) : (log.length - 1);

  let startIndex = -1;
  for (let index = endIndex; index >= 0; index -= 1) {
    const entry = log[index];
    if (entry?.t === 'Info' && /^Combat started\b/i.test(entry.msg || '')) {
      startIndex = index;
      break;
    }
  }
  if (startIndex < 0) {
    for (let index = endIndex; index >= 0; index -= 1) {
      const entry = log[index];
      if (entry?.t === 'CardPlayed' || entry?.t === 'EnemyCardPlayed') {
        startIndex = Math.max(0, index - 6);
        break;
      }
    }
  }
  if (startIndex < 0) {
    startIndex = Math.max(0, endIndex - 42);
  }

  const combatEntries = log.slice(startIndex, endIndex + 1);
  const knownNames = new Map([
    ['player', 'Player'],
    [playerId, 'Player'],
  ]);
  for (const enemy of state?.combat?.enemies || []) {
    if (enemy?.id) knownNames.set(enemy.id, enemy.name || prettifyTranscriptId(enemy.id));
  }

  const registerSnapshot = (snapshot) => {
    if (!snapshot || !snapshot.id) return;
    knownNames.set(snapshot.id, snapshot.name || prettifyTranscriptId(snapshot.id));
  };
  const registerEntryNames = (entryData) => {
    if (!entryData) return;
    registerSnapshot(entryData.playerBefore);
    registerSnapshot(entryData.enemyBefore);
    registerSnapshot(entryData.targetBefore);
    for (const snapshot of entryData.enemiesBefore || []) registerSnapshot(snapshot);
    if (entryData.enemyId && entryData.enemyName) knownNames.set(entryData.enemyId, entryData.enemyName);
  };

  const lines = [];
  for (const entry of combatEntries) {
    const data = entry?.data || null;
    registerEntryNames(data);

    if (entry?.t === 'CardPlayed' && data) {
      const targetLabel = data.targetSelf
        ? 'self'
        : (data.targetBefore?.name || resolveTranscriptEntityLabel(data.targetEnemyId, knownNames, playerId));
      const ramBefore = Number.isFinite(Number(data.ramBefore)) ? data.ramBefore : '?';
      const ramAfter = Number.isFinite(Number(data.ramAfter)) ? data.ramAfter : '?';
      lines.push({
        kind: 'player',
        prefix: 'user',
        text: `exec ${data.name || data.defId || 'card'} -> ${targetLabel} | ram ${ramBefore}->${ramAfter}`,
      });
      continue;
    }

    if (entry?.t === 'EnemyCardPlayed' && data) {
      lines.push({
        kind: 'host',
        prefix: 'host',
        text: `${data.enemyName || resolveTranscriptEntityLabel(data.enemyId, knownNames, playerId)} :: ${data.name || data.defId || 'routine'} [${data.intentType || 'Unknown'}]`,
      });
      continue;
    }

    if (entry?.t === 'DamageDealt' && data) {
      const sourceLabel = resolveTranscriptEntityLabel(data.sourceId, knownNames, playerId);
      const targetLabel = resolveTranscriptEntityLabel(data.targetId, knownNames, playerId);
      const absorbed = Number(data.protectionAbsorbed ?? data.firewallAbsorbed ?? data.blocked ?? 0);
      const damage = Number(data.finalDamage ?? 0);
      const segments = [];
      if (damage > 0) segments.push(`hp -${damage}`);
      if (absorbed > 0) segments.push(`fw ${absorbed} absorbed`);
      if (!segments.length) segments.push('no penetration');
      lines.push({
        kind: damage > 0 ? 'damage' : 'shield',
        prefix: damage > 0 ? 'dmg' : 'shield',
        text: `${sourceLabel} -> ${targetLabel} | ${segments.join(' | ')}`,
      });
      continue;
    }

    if (entry?.t === 'MutationApplied') {
      lines.push({
        kind: 'mutation',
        prefix: 'mut',
        text: `${data?.cardDefId || data?.cardInstanceId || 'card'} <= ${data?.mutationName || data?.mutationId || 'mutation'}`,
      });
      continue;
    }

    if (entry?.t === 'MutPatch') {
      lines.push({
        kind: 'mutation',
        prefix: 'patch',
        text: replaceTranscriptEntityIds(entry.msg || 'mutation patch queued', knownNames),
      });
      continue;
    }

    if (entry?.t === 'Warn') {
      lines.push({
        kind: 'warn',
        prefix: 'warn',
        text: replaceTranscriptEntityIds(entry.msg || 'warning', knownNames),
      });
      continue;
    }

    if (entry?.t === 'Info' && entry.msg) {
      if (/^[A-Za-z0-9_:-]+\s+plays\s+/i.test(entry.msg)) continue;
      lines.push({
        kind: /defeated|fatal|killed/i.test(entry.msg) ? 'damage' : 'system',
        prefix: /^Combat started\b/i.test(entry.msg)
          ? 'boot'
          : /^Turn \d+ start$/i.test(entry.msg)
            ? 'tick'
            : /^Run ended:/i.test(entry.msg)
              ? 'exit'
              : 'sys',
        text: replaceTranscriptEntityIds(entry.msg, knownNames),
      });
    }
  }

  let transcriptLines = lines.filter((line) => line && line.text);
  if (transcriptLines.length > 34) {
    const omitted = transcriptLines.length - 31;
    transcriptLines = [
      ...transcriptLines.slice(0, 3),
      { kind: 'warn', prefix: 'trim', text: `${omitted} earlier events omitted from the terminal tail` },
      ...transcriptLines.slice(-28),
    ];
  }

  if (!transcriptLines.length) {
    transcriptLines = [{
      kind: 'system',
      prefix: 'sys',
      text: causeOfDeath?.summary || 'No combat transcript could be reconstructed from the terminal log.',
    }];
  }

  return {
    title: causeOfDeath?.category === 'combat' ? 'FINAL COMBAT TRANSCRIPT' : 'INCIDENT TRACE',
    subtitle: `seed ${run.seed ?? 'unknown'} // act ${run.act ?? '?'} // floor ${run.floor ?? '?'} // ${run.starterProfileName || 'runner unknown'}`,
    lines: transcriptLines,
  };
}

export function RewardScreen({ state, data, onAction }) {
  const choices = state.reward?.cardChoices || [];
  const relicChoices = state.reward?.relicChoices || [];
  const hasRelics = relicChoices.length > 0;
  const rewardAccent = hasRelics ? C.yellow : C.green;
  const rewardChips = [
    { accent: rewardAccent, label: hasRelics ? `${relicChoices.length} relic routes` : 'Card reward' },
    { accent: C.green, label: `${choices.length} card options` },
  ];

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={data} mode="Reward" />
      <div style={{ flex: 1, padding: '18px 16px 24px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 'min(1120px, 100%)', display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="animate-slide-up" style={getNodeScenePanelStyle(rewardAccent, { padding: 20 })}>
            <NodeSceneIntro
              accent={rewardAccent}
              eyebrow="Victory Cache"
              title={hasRelics ? 'Secure The Relic, Then Patch The Deck' : 'Route One Reward Into The Deck'}
              body={hasRelics
                ? 'This node resolved cleanly. Lock in one relic package first, then select the card payload that best stabilises the next floor.'
                : 'This node resolved cleanly. Choose one card package before dropping back onto the route grid.'}
              chips={rewardChips}
            />
          </div>

          {hasRelics && (
            <div style={getNodeScenePanelStyle(C.yellow, { padding: 18, display: 'grid', gap: 12 })}>
              <div style={{ fontFamily: UI_MONO, fontSize: 11, color: C.yellow, letterSpacing: '0.14em', marginBottom: '4px', textTransform: 'uppercase' }}>
                Relic Reward - pick one
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
                Pick one relic package before moving on to the card reward.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {relicChoices.map((relicId) => {
                  const relic = data.relics?.[relicId];
                  const tier = relic?.rarity || relic?.tier || 'common';
                  const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
                  const color = tierColors[tier] || C.cyan;
                  return (
                    <button
                      key={relicId}
                      onClick={() => onAction({ type: 'Reward_PickRelic', relicId })}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        textAlign: 'left',
                        backgroundColor: `${color}10`,
                        border: `2px solid ${color}50`,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontFamily: MONO, fontWeight: 700, color, fontSize: 13, marginBottom: '3px' }}>
                        {relic?.icon ? <span style={{ marginRight: 5 }}>{relic.icon}</span> : null}
                        {relic?.name || relicId}
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, opacity: 0.7, textTransform: 'uppercase' }}>
                          [{tier}]
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, lineHeight: 1.45 }}>
                        {relic?.description || ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={getNodeScenePanelStyle(C.green, { padding: 18, display: 'grid', gap: 14 })}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.green, textTransform: 'uppercase' }}>
                Card Reward
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
                Select one card package to take forward into the next node.
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(${MENU_CARD_MIN_W}px, ${MENU_CARD_MAX_W}px))`,
                gap: '12px',
                alignContent: 'start',
                justifyContent: 'center',
              }}
            >
              {choices.map((defId) => {
                const card = data.cards?.[defId];
                return (
                  <CardChoiceTile
                    key={defId}
                    cardId={defId}
                    card={card}
                    onClick={() => onAction({ type: 'Reward_PickCard', defId })}
                  />
                );
              })}
            </div>
          </div>

          <div className="safe-area-bottom" style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
            <button
              onClick={() => onAction({ type: 'Reward_Skip' })}
              style={getSecondaryActionButtonStyle(C.green, {
                width: 'min(280px, 100%)',
                fontSize: 13,
              })}
            >
              Skip Reward
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

export function ShopScreen({ state, data, onAction }) {
  const offers = state.shop?.offers || [];
  const gold = state.run?.gold || 0;
  const scrap = state.run?.scrap || 0;
  const cardOfferCount = offers.filter((offer) => offer.kind === 'Card').length;
  const serviceOfferCount = offers.filter((offer) => offer.kind === 'Service').length;
  const relicOfferCount = offers.filter((offer) => offer.kind === 'Relic').length;

  return (
    <ScreenShell>
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
        <div style={{ fontFamily: MONO, fontWeight: 700, color: C.yellow, fontSize: 16 }}>
          Market
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: MONO, color: C.textMuted, fontSize: 12 }}>
            ACT {state.run?.act} · FLOOR {state.run?.floor}
          </span>
          <div style={getCurrencyBadgeStyle(C.yellow)}>
            {gold}g
          </div>
          <div style={getCurrencyBadgeStyle(C.orange)}>
            {scrap} scrap
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px', paddingBottom: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...getNodeScenePanelStyle(C.yellow, { padding: 18, marginBottom: 18 }) }}>
          <NodeSceneIntro
            accent={C.yellow}
            eyebrow="Market Access"
            title="Scan Offers, Services, And Patch Kits"
            body="Tune the deck here before the next route branch. Cards, services, and relics all use the same market lane now, so the key question is whether you are buying stability, damage, or a long-run engine."
            chips={[
              { accent: C.yellow, label: `${gold}g on hand` },
              { accent: C.orange, label: `${scrap} scrap` },
              { accent: C.cyan, label: `${cardOfferCount} cards` },
              { accent: C.green, label: `${serviceOfferCount} services` },
              { accent: C.purple, label: `${relicOfferCount} relics` },
            ]}
          />
        </div>

        {offers.some((offer) => offer.kind === 'Card') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              CARDS FOR SALE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${MENU_CARD_MIN_W}px, ${MENU_CARD_MAX_W}px))`, gap: '12px', justifyContent: 'center' }}>
              {offers.map((offer, index) => {
                if (offer.kind !== 'Card') return null;
                const card = data.cards?.[offer.defId];
                const soldOut = offer.sold === true;
                const canAfford = !soldOut && gold >= offer.price;
                return (
                  <CardChoiceTile
                    key={index}
                    cardId={offer.defId}
                    card={card}
                    price={soldOut ? null : offer.price}
                    statusLabel={soldOut ? 'SOLD' : null}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index })}
                    disabled={!canAfford}
                  />
                );
              })}
            </div>
          </div>
        )}

        {offers.some((offer) => offer.kind === 'Service') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              SERVICES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offers.map((offer, index) => {
                if (offer.kind !== 'Service') return null;
                const currency = getOfferCurrency(offer);
                const canAfford = getRunCurrencyAmount(state.run, currency) >= offer.price;
                const service = SHOP_SERVICE_INFO[offer.serviceId] || { icon: '⚙', label: offer.serviceId, color: C.cyan };
                const preview = getServiceOfferPreview(offer.serviceId, state, data);
                const canUse = preview.available !== false;
                const canBuy = canAfford && canUse;
                const metaTone = !canAfford ? C.textMuted : (canUse ? service.color : C.orange);
                return (
                  <button
                    key={index}
                    onClick={() => canBuy && onAction({ type: 'Shop_BuyOffer', index })}
                    disabled={!canBuy}
                    title={!canAfford ? `Costs ${formatOfferPrice(offer.price, currency)}` : (preview.detail || preview.summary || '')}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      opacity: !canAfford ? 0.45 : (canUse ? 1 : 0.72),
                      backgroundColor: canBuy ? `${service.color}08` : C.bgCard,
                      border: `2px solid ${canBuy ? `${service.color}40` : (canUse ? C.border : `${C.orange}35`)}`,
                      cursor: canBuy ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: '10px',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          backgroundColor: `${service.color}18`,
                          border: `1px solid ${service.color}40`,
                        }}
                      >
                        {service.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: MONO, fontWeight: 700, color: canAfford ? service.color : C.textMuted, fontSize: 14 }}>
                            {service.label}
                          </div>
                          <div
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontFamily: MONO,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              border: `1px solid ${metaTone}40`,
                              color: metaTone,
                              backgroundColor: `${metaTone}12`,
                            }}
                          >
                            {preview.targeted ? 'CHOOSE 1 CARD' : 'INSTANT'}
                          </div>
                          {preview.targeted && (
                            <div
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontFamily: MONO,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                border: `1px solid ${(canUse ? service.color : C.orange)}35`,
                                color: canUse ? service.color : C.orange,
                                backgroundColor: `${canUse ? service.color : C.orange}10`,
                              }}
                            >
                              {preview.eligibleCount} ELIGIBLE
                            </div>
                          )}
                          {!canUse && (
                            <div
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontFamily: MONO,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                border: `1px solid ${C.orange}35`,
                                color: C.orange,
                                backgroundColor: `${C.orange}10`,
                              }}
                            >
                              UNAVAILABLE
                            </div>
                          )}
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                          {preview.summary}
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 6, color: metaTone, fontSize: 10, lineHeight: 1.45, letterSpacing: '0.04em' }}>
                          {preview.detail}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontFamily: MONO,
                          fontWeight: 700,
                          backgroundColor: canAfford ? `${currency === 'scrap' ? C.orange : C.yellow}18` : 'transparent',
                          border: `1px solid ${canAfford ? `${currency === 'scrap' ? C.orange : C.yellow}50` : C.border}`,
                          color: canAfford ? (currency === 'scrap' ? C.orange : C.yellow) : C.textMuted,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {formatOfferPrice(offer.price, currency)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {offers.some((offer) => offer.kind === 'Relic') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              RELICS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offers.map((offer, index) => {
                if (offer.kind !== 'Relic') return null;
                const relic = data.relics?.[offer.relicId];
                const tier = relic?.rarity || relic?.tier || 'common';
                const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
                const color = tierColors[tier] || C.cyan;
                const soldOut = offer.sold === true;
                const canAfford = !soldOut && gold >= offer.price;
                return (
                  <button
                    key={index}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index })}
                    disabled={!canAfford}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      opacity: !canAfford ? 0.45 : 1,
                      backgroundColor: canAfford ? `${color}10` : C.bgCard,
                      border: `2px solid ${canAfford ? `${color}50` : C.border}`,
                      boxShadow: canAfford ? `0 0 20px ${color}14` : 'none',
                      cursor: canAfford ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: '10px',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '22px',
                          backgroundColor: `${color}18`,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {relic?.icon || '◆'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: MONO, fontWeight: 700, color: canAfford ? color : C.textMuted, fontSize: 14 }}>
                            {relic?.name || offer.relicId}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            [{tier}]
                          </span>
                          {soldOut && (
                            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              [sold]
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                          {relic?.description || ''}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontFamily: MONO,
                          fontWeight: 700,
                          backgroundColor: canAfford ? `${C.yellow}18` : 'transparent',
                          border: `1px solid ${canAfford ? `${C.yellow}50` : C.border}`,
                          color: canAfford ? C.yellow : C.textMuted,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {offer.price}g
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="safe-area-bottom"
        style={{
          flexShrink: 0,
          padding: '10px 16px',
          borderTop: `1px solid ${C.border}`,
          backgroundColor: C.bgBar,
          display: 'flex',
          gap: '8px',
        }}
      >
        {(() => {
          const rerollsUsed = state.shop?.rerollsUsed || 0;
          const hasSysKey = (state.run?.relicIds || []).includes('SystemAdminKey');
          const rerollCost = hasSysKey && rerollsUsed === 0 ? 0 : 30 + rerollsUsed * 10;
          const canAffordReroll = (state.run?.gold || 0) >= rerollCost;
          return (
            <button
              onClick={() => onAction({ type: 'Shop_Reroll' })}
              disabled={!canAffordReroll}
              title={hasSysKey && rerollsUsed === 0 ? 'Free reroll (SystemAdminKey)' : `Reroll shop (${rerollCost}g)`}
              style={{
                flex: '0 0 auto',
                padding: '14px 18px',
                borderRadius: '12px',
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 700,
                backgroundColor: canAffordReroll ? `${C.cyan}12` : 'transparent',
                border: `1px solid ${canAffordReroll ? `${C.cyan}40` : C.border}`,
                color: canAffordReroll ? C.cyan : C.textMuted,
                cursor: canAffordReroll ? 'pointer' : 'default',
                opacity: canAffordReroll ? 1 : 0.45,
                transition: 'all 0.15s ease',
              }}
            >
              Reroll {rerollCost === 0 ? 'Free' : `${rerollCost}g`}
            </button>
          );
        })()}
        <button
          onClick={() => onAction({ type: 'Shop_Exit' })}
          style={getSecondaryActionButtonStyle(C.yellow, {
            flex: 1,
            fontFamily: MONO,
            fontSize: 13,
          })}
        >
          Leave Market
        </button>
      </div>
    </ScreenShell>
  );
}

export function EventScreen({ state, data, onAction, tutorialStep = null, MinigameScreen = null }) {
  const eventId = state.event?.eventId;
  const highlightedEventAction = getEventTutorialActionId(eventId, tutorialStep);
  const eventTutorialActive = tutorialStep?.mode === 'Event';
  const eventViewportStyle = {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 'clamp(36px, 8vh, 104px)',
    paddingBottom: 'clamp(28px, 6vh, 72px)',
  };

  if (isMinigameEvent(eventId) && MinigameScreen) {
    return <MinigameScreen state={state} onAction={onAction} />;
  }

  if (eventId === 'RestSite') {
    const restScrap = state.run?.scrap || 0;
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={data} mode="Event" />
        <div style={eventViewportStyle}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: UI_MONO,
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '8px',
              color: C.green,
            }}
          >
            REST SITE
          </div>
          <div style={{ fontFamily: UI_MONO, marginBottom: '32px', color: C.textMuted, fontSize: 12 }}>
            Choose an action
          </div>

          <div
            style={{
              width: '100%',
              maxWidth: '320px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: eventTutorialActive ? '10px' : 0,
              borderRadius: eventTutorialActive ? 20 : 0,
              border: eventTutorialActive ? `1px solid ${C.cyan}20` : 'none',
              boxShadow: eventTutorialActive ? `0 0 0 1px ${C.cyan}10, 0 18px 36px rgba(0,0,0,0.18)` : 'none',
              background: eventTutorialActive ? 'linear-gradient(180deg, rgba(3,8,14,0.32) 0%, rgba(3,6,12,0.08) 100%)' : 'transparent',
            }}
          >
            {[
              { type: 'Rest_Heal', label: 'Rest', desc: 'Heal 30% HP', color: C.green, icon: '♥' },
              { type: 'Rest_Repair', label: 'Repair', desc: 'Restore a card', color: C.cyan, icon: '🔧' },
              { type: 'Rest_Stabilise', label: 'Stabilise', desc: 'Stabilise a card', color: C.purple, icon: '◆' },
              { type: 'Rest_Forge', label: 'Reforge', desc: 'Spend 3 scrap to rebuild a card', color: C.orange, icon: '⚒', disabled: restScrap < 3 },
            ].map((option) => {
              const highlighted = highlightedEventAction === option.type;
              return (
                <button
                  key={option.type}
                  onClick={() => !option.disabled && onAction({ type: option.type })}
                  disabled={option.disabled}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '12px',
                    fontFamily: UI_MONO,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    backgroundColor: C.bgCard,
                    border: `2px solid ${highlighted ? `${option.color}cc` : `${option.color}40`}`,
                    boxShadow: highlighted
                      ? `0 0 0 1px ${option.color}26, 0 0 24px ${option.color}32`
                      : `0 0 16px ${option.color}10`,
                    cursor: option.disabled ? 'default' : 'pointer',
                    opacity: option.disabled ? 0.45 : 1,
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
                        backgroundColor: `${option.color}15`,
                        border: `1px solid ${option.color}40`,
                      }}
                    >
                      {option.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: option.color, fontSize: 14 }}>{option.label}</div>
                      <div style={{ color: C.textMuted, fontSize: 11 }}>{option.desc}</div>
                    </div>
                  </div>
                  {highlighted ? (
                    <div style={{ marginTop: 10, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.1em', color: option.color, textTransform: 'uppercase' }}>
                      Training target
                    </div>
                  ) : null}
                </button>
              );
            })}

            <button
              onClick={() => onAction({ type: 'Rest_Leave' })}
              style={getSecondaryActionButtonStyle(C.green, {
                textAlign: 'center',
                marginTop: '8px',
              })}
            >
              Leave
            </button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (eventId === 'CompileStation') {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={data} mode="Event" />
        <div style={eventViewportStyle}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: UI_MONO,
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '8px',
              color: C.orange,
            }}
          >
            COMPILE STATION
          </div>
          <div style={{ fontFamily: UI_MONO, marginBottom: '24px', color: C.textMuted, fontSize: 12, maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
            Spend this node to deliberately upgrade one card. Compiled cards cost 1 less RAM and gain a permanent typed bonus when played.
          </div>

          <div
            style={{
              width: '100%',
              maxWidth: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: eventTutorialActive ? '10px' : 0,
              borderRadius: eventTutorialActive ? 20 : 0,
              border: eventTutorialActive ? `1px solid ${C.orange}22` : 'none',
              boxShadow: eventTutorialActive ? `0 0 0 1px ${C.orange}10, 0 18px 36px rgba(0,0,0,0.18)` : 'none',
              background: eventTutorialActive ? 'linear-gradient(180deg, rgba(18,8,3,0.2) 0%, rgba(3,6,12,0.08) 100%)' : 'transparent',
            }}
          >
            <button
              onClick={() => onAction({ type: 'Compile_Open' })}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                fontFamily: UI_MONO,
                textAlign: 'left',
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `2px solid ${highlightedEventAction === 'Compile_Open' ? `${C.orange}cc` : `${C.orange}40`}`,
                boxShadow: highlightedEventAction === 'Compile_Open'
                  ? `0 0 0 1px ${C.orange}26, 0 0 24px ${C.orange}32`
                  : `0 0 16px ${C.orange}10`,
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
                    backgroundColor: `${C.orange}15`,
                    border: `1px solid ${C.orange}40`,
                  }}
                >
                  {'⚙'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: C.orange, fontSize: 14 }}>Compile</div>
                  <div style={{ color: C.textMuted, fontSize: 11 }}>Choose a card and permanently enhance it for this run.</div>
                </div>
              </div>
              {highlightedEventAction === 'Compile_Open' ? (
                <div style={{ marginTop: 10, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.1em', color: C.orange, textTransform: 'uppercase' }}>
                  Training target
                </div>
              ) : null}
            </button>

            <button
              onClick={() => onAction({ type: 'Compile_Leave' })}
              style={getSecondaryActionButtonStyle(C.orange, {
                textAlign: 'center',
                marginTop: '8px',
              })}
            >
              Leave
            </button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  const baseDef = EVENT_REG_UI.events[eventId];
  const eventDef = baseDef
    ? { ...baseDef, image: baseDef.image || getEventImage(eventId) }
    : baseDef;

  if (!eventDef) {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={data} mode="Event" />
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: '20px', marginBottom: '8px', color: C.cyan }}>
            UNKNOWN EVENT
          </div>
          <div style={{ fontFamily: MONO, marginBottom: '32px', color: C.textMuted, fontSize: 13 }}>{eventId}</div>
          <button
            onClick={() => onAction({ type: 'GoToMap' })}
            style={{ padding: '16px 32px', borderRadius: '12px', fontFamily: MONO, fontWeight: 700, backgroundColor: C.cyan, color: '#000', border: 'none', cursor: 'pointer' }}
          >
            Continue
          </button>
        </div>
      </ScreenShell>
    );
  }

  const choiceColor = (choice) => {
    const ops = choice.ops.map((op) => op.op);
    if (ops.includes('LoseHP')) return C.red;
    if (ops.includes('GainMaxHP')) return C.purple;
    if (ops.includes('DuplicateSelectedCard')) return C.purple;
    if (ops.includes('GainCard')) return C.cyan;
    if (ops.includes('AccelerateSelectedCard')) return C.orange;
    if (ops.includes('RemoveSelectedCard')) return C.red;
    if (ops.includes('RepairSelectedCard')) return C.cyan;
    if (ops.includes('StabiliseSelectedCard')) return C.purple;
    if (ops.includes('GainGold')) return C.yellow;
    if (ops.includes('GainMP')) return C.cyan;
    if (ops.includes('Heal')) return C.green;
    if (choice.ops.length === 0) return C.textMuted;
    return C.text;
  };

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={data} mode="Event" />
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        <div
          className="animate-slide-up"
          style={{
            borderRadius: '16px',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.cyan}30`,
            boxShadow: `0 0 40px ${C.cyan}08`,
            marginBottom: '24px',
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          {eventDef.image && (
            <RuntimeArt
              src={eventDef.image}
              alt={eventDef.title}
              accent={C.cyan}
              label={eventDef.title}
              style={{
                width: '100%',
                height: '150px',
                display: 'block',
                borderBottom: `1px solid ${C.cyan}20`,
                position: 'relative',
              }}
              imageStyle={{
                objectFit: 'cover',
              }}
              fallbackContent={(
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 20px',
                    background: `
                      radial-gradient(circle at 20% 18%, ${C.cyan}26 0%, transparent 34%),
                      linear-gradient(135deg, rgba(0,240,255,0.12) 0%, rgba(9,13,22,0.94) 48%, rgba(9,13,22,1) 100%)
                    `,
                  }}
                >
                  <div style={{ fontSize: 40, lineHeight: 1 }}>{eventDef.icon || '◆'}</div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: C.cyan,
                    }}
                  >
                    Event Art Loading
                  </div>
                </div>
              )}
            />
          )}
          <div style={{ padding: '20px 24px 24px' }}>
            {!eventDef.image && (
              <div style={{ fontSize: '52px', lineHeight: 1, marginBottom: '12px' }}>{eventDef.icon}</div>
            )}
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: '18px',
                color: C.cyan,
                letterSpacing: '0.05em',
                marginBottom: '12px',
              }}
            >
              {eventDef.icon && eventDef.image ? `${eventDef.icon}  ` : ''}{eventDef.title.toUpperCase()}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '12px',
                color: C.textDim,
                fontStyle: 'italic',
                lineHeight: 1.6,
                maxWidth: '360px',
                margin: '0 auto',
              }}
            >
              "{eventDef.text}"
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          {eventDef.choices.map((choice) => {
            const color = choiceColor(choice);
            const isLeave = choice.ops.length === 0;
            return (
              <button
                key={choice.id}
                onClick={() => onAction({ type: 'Event_Choose', choiceId: choice.id })}
                style={isLeave
                  ? getSecondaryActionButtonStyle(C.cyan, {
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontFamily: MONO,
                  })
                  : {
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    textAlign: 'left',
                    fontFamily: MONO,
                    fontWeight: 600,
                    fontSize: 13,
                    transition: 'all 0.15s ease',
                    backgroundColor: `${color}10`,
                    border: `2px solid ${color}50`,
                    boxShadow: `0 0 12px ${color}0a`,
                    color,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
              >
                {!isLeave && (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '6px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      backgroundColor: `${color}20`,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    {choice.ops.some((op) => op.op === 'GainGold') ? '💰'
                      : choice.ops.some((op) => op.op === 'Heal') ? '💊'
                        : choice.ops.some((op) => op.op === 'GainMaxHP') ? '⬆'
                          : choice.ops.some((op) => op.op === 'RemoveSelectedCard') ? '🗑'
                            : choice.ops.some((op) => op.op === 'RepairSelectedCard') ? '🔧'
                              : choice.ops.some((op) => op.op === 'StabiliseSelectedCard') ? '◆'
                                : choice.ops.some((op) => op.op === 'AccelerateSelectedCard') ? '⚡'
                                  : choice.ops.some((op) => op.op === 'GainMP') ? '💾'
                                    : choice.ops.some((op) => op.op === 'LoseHP') ? '⚠'
                                      : '▶'}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 0 }}>
                  <span>{choice.label}</span>
                  <span style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.45, color: C.textDim }}>
                    {summarizeEventChoiceOps(choice.ops)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}

export function GameOverScreen({ state, onNewRun, recentUnlocks = [] }) {
  const run = state.run || {};
  const deck = state.deck || {};
  const quip = DEATH_QUIPS[(run.floor ?? 0) % DEATH_QUIPS.length];
  const hpPct = run.maxHP ? Math.round(((run.hp ?? 0) / run.maxHP) * 100) : 0;
  const isVictory = !!run.victory;
  const causeOfDeath = deriveCauseOfDeath(state);
  const deathTranscript = !isVictory ? buildDeathTranscript(state, causeOfDeath) : null;
  const highestActReached = Math.max(run.act ?? 1, run.telemetry?.highestActReached ?? 1);
  const endlessActive = Array.isArray(run.challengeIds) && run.challengeIds.includes('endless_protocol');
  const dailyScore = run.runMode === 'daily' ? scoreRunForDaily(run) : null;
  const transcriptToneByKind = {
    player: C.cyan,
    host: '#7bffb8',
    damage: C.red,
    shield: C.cyan,
    system: '#9fb6cb',
    mutation: C.purple,
    warn: C.yellow,
  };

  const stats = [
    { label: 'ACT', value: run.act ?? 1 },
    { label: 'FLOOR', value: run.floor ?? 0 },
    { label: 'HP', value: `${run.hp ?? 0}/${run.maxHP ?? 0}`, color: hpPct > 30 ? C.green : C.red },
    { label: 'GOLD', value: `${run.gold ?? 0}g`, color: C.yellow },
    { label: 'SCRAP', value: `${run.scrap ?? 0}`, color: C.orange },
    { label: 'DECK SIZE', value: deck.master?.length ?? 0 },
    { label: 'MP', value: `${run.mp ?? 0}mp`, color: C.cyan },
  ];

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      {!isVictory && deathTranscript?.lines?.length > 0 && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `
                radial-gradient(circle at 18% 12%, rgba(0,240,255,0.12) 0%, transparent 30%),
                radial-gradient(circle at 82% 18%, rgba(0,255,107,0.08) 0%, transparent 28%),
                linear-gradient(180deg, rgba(4,8,14,0.18) 0%, rgba(4,8,14,0.68) 42%, rgba(4,8,14,0.9) 100%)
              `,
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              padding: 'clamp(18px, 3vw, 32px)',
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: 'min(1100px, 100%)',
                margin: '0 auto',
                display: 'grid',
                gap: 6,
                alignContent: 'start',
                opacity: 0.92,
                transform: 'perspective(1100px) rotateX(8deg)',
                transformOrigin: 'top center',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: C.cyan, textShadow: `0 0 20px ${C.cyan}22` }}>
                  {deathTranscript.title}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: 'rgba(191, 213, 229, 0.55)' }}>
                  {deathTranscript.subtitle}
                </span>
              </div>
              <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(0,240,255,0.3) 0%, rgba(0,255,107,0.18) 52%, transparent 100%)', marginBottom: 4 }} />
              {deathTranscript.lines.map((line, index) => {
                const tone = transcriptToneByKind[line.kind] || C.cyan;
                return (
                  <div
                    key={`${line.prefix}-${index}-${line.text}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '38px 58px minmax(0, 1fr)',
                      gap: 10,
                      alignItems: 'baseline',
                      fontFamily: MONO,
                      fontSize: 'clamp(10px, 0.95vw, 12px)',
                      lineHeight: 1.38,
                      color: 'rgba(225, 235, 242, 0.68)',
                    }}
                  >
                    <span style={{ color: 'rgba(155, 176, 193, 0.42)' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span style={{ color: tone, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textShadow: `0 0 16px ${tone}20` }}>
                      {line.prefix}
                    </span>
                    <span style={{ color: 'rgba(230, 238, 244, 0.72)', textShadow: '0 0 14px rgba(0,0,0,0.24)' }}>
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div
        className="animate-slide-up"
        style={{
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          width: 'min(420px, 100%)',
          padding: '24px 22px 28px',
          borderRadius: 24,
          border: `1px solid ${(isVictory ? C.green : C.red)}2e`,
          background: 'linear-gradient(180deg, rgba(8,12,20,0.84) 0%, rgba(5,8,14,0.94) 100%)',
          boxShadow: '0 26px 60px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {isVictory ? (
          <>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 900,
                fontSize: 38,
                color: C.green,
                marginBottom: 8,
                letterSpacing: '0.1em',
                textShadow: `0 0 40px ${C.green}80`,
              }}
            >
              RUN COMPLETE
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 32, fontStyle: 'italic' }}>
              All three acts cleared. The network is silent.
            </div>
          </>
        ) : (
          <>
            <div
              className="glitch-text"
              data-text="GAME OVER"
              style={{ fontFamily: MONO, fontWeight: 700, fontSize: 40, color: C.red, marginBottom: 8, textShadow: `0 0 40px ${C.red}80` }}
            >
              GAME OVER
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 32, fontStyle: 'italic' }}>
              {quip}
            </div>
            {causeOfDeath?.summary && (
              <div
                style={{
                  marginBottom: 24,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${C.red}35`,
                  background: `${C.red}10`,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.red, marginBottom: 6 }}>
                  CAUSE OF DEATH
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: C.text }}>
                  {causeOfDeath.summary}
                </div>
                {causeOfDeath.logMessage && causeOfDeath.logMessage !== causeOfDeath.summary && (
                  <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.45, color: C.textDim, marginTop: 6 }}>
                    {causeOfDeath.logMessage}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
          {(run.starterProfileName || 'Kernel Runner')} · {(DIFFICULTY_PROFILES[run.difficultyId || 'standard']?.name || 'Standard')}
        </div>
        {(run.runMode === 'daily' || endlessActive) && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${(run.runMode === 'daily' ? C.cyan : C.purple)}35`,
              background: `${run.runMode === 'daily' ? C.cyan : C.purple}10`,
              textAlign: 'left',
            }}
          >
            {run.runMode === 'daily' && (
              <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.55, color: C.text, marginBottom: endlessActive ? 8 : 0 }}>
                Daily Run {run.dailyRunId || ''} · score {dailyScore ?? 0}
              </div>
            )}
            {endlessActive && (
              <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.55, color: C.text }}>
                Endless Protocol depth reached: Act {highestActReached}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            marginBottom: 32,
            padding: '16px',
            borderRadius: 14,
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
          }}
        >
          {stats.map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center', padding: '8px 4px' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', marginBottom: 4 }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, color: stat.color || C.text }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {recentUnlocks.length > 0 && (
          <div
            style={{
              marginBottom: 24,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${C.green}35`,
              background: `${C.green}10`,
              textAlign: 'left',
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.green, marginBottom: 6 }}>
              NEW UNLOCKS
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: C.text }}>
              {recentUnlocks.map((unlock) => unlock.name).join(' · ')}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 32 }}>
          <div style={{ height: 4, borderRadius: 9999, backgroundColor: '#1a1a2a', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 9999,
                width: `${hpPct}%`,
                backgroundColor: hpPct > 50 ? C.green : hpPct > 20 ? C.orange : C.red,
                boxShadow: `0 0 8px ${hpPct > 50 ? C.green : C.red}`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 4 }}>
            {hpPct}% HP remaining
          </div>
        </div>

        <button
          onClick={onNewRun}
          style={{
            padding: '16px 48px',
            borderRadius: '12px',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 18,
            transition: 'all 0.15s ease',
            backgroundColor: C.cyan,
            color: '#000',
            boxShadow: `0 0 30px ${C.cyan}50`,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          NEW RUN
        </button>
      </div>
    </ScreenShell>
  );
}
