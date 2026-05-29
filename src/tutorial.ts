import type { GameState, Item } from './types.ts';
import { getLevel } from './data/levels.ts';

export type TutorialStep = { text: string; done: boolean };

export function computeTutorialSteps(state: GameState): TutorialStep[] {
  let choppedTomato = false;
  let choppedLettuce = false;
  let plateReady = false;

  const scanItem = (item: Item): void => {
    if (item.kind === 'tomato' && item.state === 'chopped') choppedTomato = true;
    if (item.kind === 'lettuce' && item.state === 'chopped') choppedLettuce = true;
    if (item.kind === 'plate') {
      const hasT = item.contents.some(
        (x) => x.kind === 'tomato' && x.state === 'chopped'
      );
      const hasL = item.contents.some(
        (x) => x.kind === 'lettuce' && x.state === 'chopped'
      );
      if (hasT) choppedTomato = true;
      if (hasL) choppedLettuce = true;
      if (hasT && hasL) plateReady = true;
    }
  };

  for (const row of state.tiles) {
    for (const t of row) {
      if (t.kind === 'station' && t.item) scanItem(t.item);
    }
  }
  for (const p of state.players) {
    if (p.held) scanItem(p.held);
  }

  const served = state.score > 0;
  return [
    { text: 'Chop a TOMATO 🍅', done: choppedTomato },
    { text: 'Chop a LETTUCE 🥬', done: choppedLettuce },
    { text: 'Combine on a PLATE 🍽️', done: plateReady },
    { text: 'Serve at the PASS 🛎️', done: served },
  ];
}

export function isTutorial(state: GameState | null): boolean {
  if (!state) return false;
  return getLevel(state.levelId).tutorial === true;
}

const banner = (): HTMLElement | null => document.getElementById('tutorial-banner');

let lastSig = '';

export function syncTutorialBanner(state: GameState | null): void {
  const el = banner();
  if (!el) return;
  if (!isTutorial(state) || !state) {
    if (!el.hidden) el.hidden = true;
    lastSig = '';
    return;
  }
  el.hidden = false;

  const steps = computeTutorialSteps(state);
  const sig = steps.map((s) => (s.done ? '1' : '0')).join('');
  if (sig === lastSig) return;
  lastSig = sig;

  const allDone = steps.every((s) => s.done);
  const tip = '(Tip: hold Space (P1) or / (P2) on the CHOP board to chop.)';

  el.innerHTML = [
    `<div class="title">TUTORIAL · Make a Salad</div>`,
    `<div class="steps">`,
    ...steps.map(
      (s) =>
        `<div class="step${s.done ? ' done' : ''}"><span class="check">${s.done ? '✓' : '○'}</span><span>${s.text}</span></div>`
    ),
    `</div>`,
    allDone
      ? `<div class="footer">🎉 Salad delivered! Keep cooking until the timer ends.</div>`
      : `<div class="footer" style="color:#888;">${tip}</div>`,
  ].join('');
}
