import {
  acknowledgeTutorialStep,
  advanceTutorialState,
  createTutorialRunState,
  finalizeTutorialState,
} from '../game/tutorial.js';
import { dispatchGame } from '../game/game_core.js';

export const VISUAL_SCENE_DEFINITIONS = Object.freeze([
  {
    id: 'menu-home',
    label: 'Main Menu Home',
    kind: 'menu',
    menuView: 'home',
  },
  {
    id: 'menu-setup',
    label: 'Run Setup',
    kind: 'menu',
    menuView: 'setup',
  },
  {
    id: 'menu-tutorials',
    label: 'Tutorials',
    kind: 'menu',
    menuView: 'tutorials',
  },
  {
    id: 'menu-daily',
    label: 'Daily Run',
    kind: 'menu',
    menuView: 'daily',
  },
  {
    id: 'menu-intel-progress',
    label: 'Intel Progress',
    kind: 'menu',
    menuView: 'intel',
    intelView: 'progress',
  },
  {
    id: 'menu-intel-achievements',
    label: 'Intel Achievements',
    kind: 'menu',
    menuView: 'intel',
    intelView: 'achievements',
  },
  {
    id: 'menu-intel-bosses',
    label: 'Intel Bosses',
    kind: 'menu',
    menuView: 'intel',
    intelView: 'bosses',
  },
  {
    id: 'menu-intel-callsigns',
    label: 'Intel Callsigns',
    kind: 'menu',
    menuView: 'intel',
    intelView: 'callsigns',
  },
  {
    id: 'menu-recovery',
    label: 'Recovery Slots',
    kind: 'menu',
    menuView: 'recovery',
  },
  {
    id: 'tutorial-basics-combat',
    label: 'Combat Basics Combat',
    kind: 'tutorial',
    tutorialId: 'combat_basics',
    acknowledgeIntro: true,
  },
  {
    id: 'tutorial-run-modes-menu',
    label: 'Run Modes Briefing',
    kind: 'tutorial',
    tutorialId: 'run_modes_briefing',
  },
  {
    id: 'tutorial-boss-combat',
    label: 'Boss Protocols Combat',
    kind: 'tutorial',
    tutorialId: 'boss_protocols',
    acknowledgeIntro: true,
  },
  {
    id: 'tutorial-pressure-combat',
    label: 'Pressure Systems Combat',
    kind: 'tutorial',
    tutorialId: 'pressure_systems',
    acknowledgeIntro: true,
  },
  {
    id: 'tutorial-instability-event',
    label: 'Instability Lab Event',
    kind: 'tutorial',
    tutorialId: 'instability_lab',
    acknowledgeIntro: true,
  },
  {
    id: 'tutorial-instability-picker',
    label: 'Instability Lab Picker',
    kind: 'tutorial',
    tutorialId: 'instability_lab',
    acknowledgeIntro: true,
    actions: [
      { type: 'Compile_Open' },
    ],
  },
  {
    id: 'tutorial-complete',
    label: 'Tutorial Completion Popup',
    kind: 'tutorialComplete',
    tutorialId: 'combat_basics',
    outcome: 'victory',
  },
]);

const VISUAL_SCENE_MAP = new Map(
  VISUAL_SCENE_DEFINITIONS.map((scene) => [scene.id, scene]),
);

export const VISUAL_SCENE_CAPTURE_TARGETS = Object.freeze([
  {
    id: 'menu-home',
    label: 'Desktop Home',
    fileName: 'desktop-menu-home.png',
    viewport: { width: 1440, height: 1700 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-setup',
    label: 'Desktop Setup',
    fileName: 'desktop-menu-setup.png',
    viewport: { width: 1440, height: 2100 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-tutorials',
    label: 'Desktop Tutorials',
    fileName: 'desktop-menu-tutorials.png',
    viewport: { width: 1440, height: 2100 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-daily',
    label: 'Desktop Daily Run',
    fileName: 'desktop-menu-daily.png',
    viewport: { width: 1440, height: 1800 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-intel-bosses',
    label: 'Desktop Intel Bosses',
    fileName: 'desktop-menu-intel-bosses.png',
    viewport: { width: 1440, height: 2100 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-intel-callsigns',
    label: 'Desktop Intel Callsigns',
    fileName: 'desktop-menu-intel-callsigns.png',
    viewport: { width: 1440, height: 1800 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-run-modes-menu',
    label: 'Desktop Run Modes Briefing',
    fileName: 'desktop-tutorial-run-modes-menu.png',
    viewport: { width: 1440, height: 1700 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-boss-combat',
    label: 'Desktop Boss Combat',
    fileName: 'desktop-tutorial-boss-combat.png',
    viewport: { width: 1440, height: 1800 },
    virtualTimeBudget: 7000,
  },
  {
    id: 'tutorial-pressure-combat',
    label: 'Desktop Pressure Combat',
    fileName: 'desktop-tutorial-pressure-combat.png',
    viewport: { width: 1440, height: 1800 },
    virtualTimeBudget: 7000,
  },
  {
    id: 'tutorial-instability-event',
    label: 'Desktop Instability Event',
    fileName: 'desktop-tutorial-instability-event.png',
    viewport: { width: 1440, height: 1700 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-instability-picker',
    label: 'Desktop Instability Picker',
    fileName: 'desktop-tutorial-instability-picker.png',
    viewport: { width: 1440, height: 1600 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-complete',
    label: 'Desktop Tutorial Complete',
    fileName: 'desktop-tutorial-complete.png',
    viewport: { width: 1440, height: 1400 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'menu-home',
    label: 'Mobile Home',
    fileName: 'mobile-menu-home.png',
    viewport: { width: 430, height: 1600 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-run-modes-menu',
    label: 'Mobile Run Modes Briefing',
    fileName: 'mobile-tutorial-run-modes-menu.png',
    viewport: { width: 430, height: 1600 },
    virtualTimeBudget: 5000,
  },
  {
    id: 'tutorial-boss-combat',
    label: 'Mobile Boss Combat',
    fileName: 'mobile-tutorial-boss-combat.png',
    viewport: { width: 430, height: 1800 },
    virtualTimeBudget: 7000,
  },
  {
    id: 'tutorial-pressure-combat',
    label: 'Mobile Pressure Combat',
    fileName: 'mobile-tutorial-pressure-combat.png',
    viewport: { width: 430, height: 1800 },
    virtualTimeBudget: 7000,
  },
  {
    id: 'tutorial-instability-picker',
    label: 'Mobile Instability Picker',
    fileName: 'mobile-tutorial-instability-picker.png',
    viewport: { width: 430, height: 1600 },
    virtualTimeBudget: 5000,
  },
]);

export function getVisualSceneDefinition(sceneId) {
  if (!sceneId) return null;
  return VISUAL_SCENE_MAP.get(sceneId) ?? null;
}

export function isVisualScene(sceneId) {
  return Boolean(getVisualSceneDefinition(sceneId));
}

export function getVisualSceneMenuState(sceneId) {
  const scene = getVisualSceneDefinition(sceneId);
  if (!scene || scene.kind !== 'menu') return null;
  return {
    menuView: scene.menuView,
    intelView: scene.intelView ?? 'progress',
  };
}

export function createVisualSceneState(data, sceneId) {
  const scene = getVisualSceneDefinition(sceneId);
  if (!scene) return null;

  if (scene.kind === 'tutorial') {
    let state = createTutorialRunState(data, scene.tutorialId);
    if (scene.acknowledgeIntro) {
      state = acknowledgeTutorialStep(state);
    }
    for (const action of scene.actions || []) {
      const next = dispatchGame(state, data, action);
      state = advanceTutorialState(next, action, data);
    }
    return state;
  }

  if (scene.kind === 'tutorialComplete') {
    return finalizeTutorialState(createTutorialRunState(data, scene.tutorialId), scene.outcome ?? 'victory');
  }

  return null;
}
