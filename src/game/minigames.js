// Minigame registry — maps EVENT_MINIGAME_* IDs to game type + config + tiered rewards.
// Three mobile-first game types:
//   memory   — flip tiles to find matching pairs
//   timing   — tap when a bar enters the target zone
//   sequence — memorise a symbol sequence then tap in order

export const MINIGAME_REGISTRY = {

  // ── Act 1 ─────────────────────────────────────────────────────────────────

  EVENT_MINIGAME_ACT1_MEMORY_021: {
    type: 'memory',
    title: 'Card Memory',
    icon: '🃏',
    desc: 'Flip pairs from memory. Fewer wrong guesses = better reward.',
    config: { pairs: 4, cols: 4, goldMisses: 1, silverMisses: 4 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 80 }, { op: 'Heal', amount: 12 }],
      silver: [{ op: 'GainGold', amount: 40 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_FIREWALL_024: {
    type: 'timing',
    title: 'Breach Layers',
    icon: '🛡️',
    desc: 'Tap when the bar hits the green zone. 3 rounds.',
    config: { rounds: 3, goldHits: 3, silverHits: 2, duration: 2500, zoneWidth: 26 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 60 }, { op: 'Heal', amount: 8 }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_DODGE_027: {
    type: 'timing',
    title: 'Signal Dodge',
    icon: '⚡',
    desc: 'Tap in the safe zone. 4 rounds, narrow window.',
    config: { rounds: 4, goldHits: 4, silverHits: 2, duration: 2200, zoneWidth: 18 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 70 }, { op: 'Heal', amount: 6 }],
      silver: [{ op: 'GainGold', amount: 35 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_PREDICT_030: {
    type: 'sequence',
    title: 'Enemy Prediction',
    icon: '🔮',
    desc: 'Memorise the symbol order. Tap them back correctly.',
    config: { length: 3, showMs: 2200, goldCorrect: 3, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 60 }, { op: 'GainMP', amount: 2 }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_LEAK_032: {
    type: 'timing',
    title: 'Leak Plug',
    icon: '💧',
    desc: 'Patch the leak — tap the zone before it floods. 4 rounds.',
    config: { rounds: 4, goldHits: 4, silverHits: 2, duration: 2800, zoneWidth: 24 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 50 }, { op: 'Heal', amount: 10 }],
      silver: [{ op: 'GainGold', amount: 25 }],
      fail:   [{ op: 'LoseHP', amount: 5 }],
    },
  },

  EVENT_MINIGAME_ACT1_CHAIN_034: {
    type: 'memory',
    title: 'Status Chain',
    icon: '🔗',
    desc: 'Match status effect pairs. 3 pairs.',
    config: { pairs: 3, cols: 3, goldMisses: 1, silverMisses: 3 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 50 }, { op: 'AccelerateSelectedCard' }],
      silver: [{ op: 'GainGold', amount: 25 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_RHYTHM_037: {
    type: 'timing',
    title: 'Pulse Rhythm',
    icon: '🎵',
    desc: 'Match the pulse — hit the beat. 5 rounds.',
    config: { rounds: 5, goldHits: 5, silverHits: 3, duration: 2000, zoneWidth: 20 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 60 }, { op: 'Heal', amount: 5 }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_RACE_039: {
    type: 'timing',
    title: 'Corrode Race',
    icon: '🏁',
    desc: 'Race the corrosion — 4 fast rounds.',
    config: { rounds: 4, goldHits: 4, silverHits: 2, duration: 1800, zoneWidth: 20 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 70 }],
      silver: [{ op: 'GainGold', amount: 35 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT1_CHASE_040: {
    type: 'sequence',
    title: 'Drone Chase',
    icon: '🚁',
    desc: 'Follow the drone path — memorise 4 signals.',
    config: { length: 4, showMs: 2000, goldCorrect: 4, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 80 }, { op: 'Heal', amount: 8 }],
      silver: [{ op: 'GainGold', amount: 40 }],
      fail:   [],
    },
  },

  // ── Act 2 ─────────────────────────────────────────────────────────────────

  EVENT_MINIGAME_ACT2_SPEED_023: {
    type: 'sequence',
    title: 'Signal Match',
    icon: '📡',
    desc: 'Match the signal pattern. 4 symbols, fast.',
    config: { length: 4, showMs: 1800, goldCorrect: 4, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 70 }, { op: 'Heal', amount: 8 }],
      silver: [{ op: 'GainGold', amount: 35 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT2_STATUS_026: {
    type: 'memory',
    title: 'Status Puzzle',
    icon: '🧩',
    desc: 'Match status pairs. 3 pairs.',
    config: { pairs: 3, cols: 3, goldMisses: 1, silverMisses: 3 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 55 }, { op: 'StabiliseSelectedCard' }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT2_RAM_028: {
    type: 'sequence',
    title: 'RAM Allocation',
    icon: '💾',
    desc: 'Route the RAM correctly — 4 symbols.',
    config: { length: 4, showMs: 2000, goldCorrect: 4, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 60 }, { op: 'GainMP', amount: 3 }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT2_RIDDLE_031: {
    type: 'sequence',
    title: 'Oracle Riddle',
    icon: '👁️',
    desc: 'Decode the oracle sequence. 4 symbols.',
    config: { length: 4, showMs: 2000, goldCorrect: 4, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 80 }],
      silver: [{ op: 'GainGold', amount: 40 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT2_MUTATION_036: {
    type: 'sequence',
    title: 'Mutation Gamble',
    icon: '🧬',
    desc: 'Sequence the mutation chain. 3 symbols.',
    config: { length: 3, showMs: 2200, goldCorrect: 3, silverCorrect: 2 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 50 }, { op: 'AccelerateSelectedCard' }],
      silver: [{ op: 'GainGold', amount: 25 }],
      fail:   [],
    },
  },

  // ── Act 3 ─────────────────────────────────────────────────────────────────

  EVENT_MINIGAME_ACT3_TIMER_022: {
    type: 'timing',
    title: 'Bomb Defuse',
    icon: '💣',
    desc: 'Cut the right wire — hit the zone before time runs out. 5 rounds.',
    config: { rounds: 5, goldHits: 5, silverHits: 3, duration: 2000, zoneWidth: 16 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 100 }, { op: 'Heal', amount: 15 }],
      silver: [{ op: 'GainGold', amount: 50 }],
      fail:   [{ op: 'LoseHP', amount: 10 }],
    },
  },

  EVENT_MINIGAME_ACT3_MAZE_025: {
    type: 'sequence',
    title: 'Vanta Maze',
    icon: '🌀',
    desc: 'Navigate the maze — memorise 5 turns.',
    config: { length: 5, showMs: 2500, goldCorrect: 5, silverCorrect: 3 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 90 }, { op: 'Heal', amount: 10 }],
      silver: [{ op: 'GainGold', amount: 45 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT3_DECK_029: {
    type: 'memory',
    title: 'Deck Sort',
    icon: '🗂️',
    desc: 'Match the deck pairs. 4 pairs.',
    config: { pairs: 4, cols: 4, goldMisses: 1, silverMisses: 4 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 80 }, { op: 'RemoveSelectedCard' }],
      silver: [{ op: 'GainGold', amount: 40 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT3_HACK_033: {
    type: 'sequence',
    title: 'Hacking Sequence',
    icon: '💻',
    desc: 'Input the exploit chain. 5 symbols, fast.',
    config: { length: 5, showMs: 1800, goldCorrect: 5, silverCorrect: 3 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 100 }],
      silver: [{ op: 'GainGold', amount: 50 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT3_PATCH_035: {
    type: 'timing',
    title: 'Patch Assembly',
    icon: '🔧',
    desc: 'Assemble the patch — 3 precision taps.',
    config: { rounds: 3, goldHits: 3, silverHits: 2, duration: 2800, zoneWidth: 20 },
    rewards: {
      gold:   [{ op: 'RepairSelectedCard' }, { op: 'GainGold', amount: 30 }],
      silver: [{ op: 'GainGold', amount: 40 }],
      fail:   [],
    },
  },

  EVENT_MINIGAME_ACT3_SCRAP_038: {
    type: 'memory',
    title: 'Scrap Recycle',
    icon: '♻️',
    desc: 'Match the salvaged parts. 3 pairs.',
    config: { pairs: 3, cols: 3, goldMisses: 1, silverMisses: 3 },
    rewards: {
      gold:   [{ op: 'GainGold', amount: 60 }, { op: 'RepairSelectedCard' }],
      silver: [{ op: 'GainGold', amount: 30 }],
      fail:   [],
    },
  },

};

// ── Reward helpers ─────────────────────────────────────────────────────────────

// Returns the reward ops array for a given eventId + tier.
// Tier: 'gold' | 'silver' | 'fail' | 'skip'
export function getMinigameRewards(eventId, tier) {
  const def = MINIGAME_REGISTRY[eventId];
  if (!def || tier === 'skip') return [];
  return def.rewards[tier] ?? [];
}

export function isMinigameEvent(eventId) {
  return typeof eventId === 'string' && eventId.startsWith('EVENT_MINIGAME_');
}
