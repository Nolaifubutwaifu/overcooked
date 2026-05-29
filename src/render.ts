import type {
  ConveyorDirection,
  DirtyPlate,
  GameState,
  Ingredient,
  IngredientKind,
  Item,
  Level,
  Plate,
  PlateContent,
  Player,
  Pot,
  Recipe,
  Soup,
  StationKind,
  Tile,
} from './types.ts';
import type { AppState } from './app.ts';
import { MAIN_MENU } from './app.ts';
import { LEVELS, starsForScore, getLevel, isLevelUnlocked, unlockScoreFor } from './data/levels.ts';
import { drawParticles, drawScorePopups } from './effects.ts';
import { facedTile } from './state.ts';
import {
  TILE_SIZE,
  HUD_HEIGHT,
  CANVAS_WIDTH,
  PLAYER_RADIUS,
  ORDER_TIME_LIMIT,
} from './constants.ts';
import { recipeById } from './data/recipes.ts';

// === Public API ===

export function renderApp(ctx: CanvasRenderingContext2D, app: AppState): void {
  switch (app.scene) {
    case 'menu':         renderMenu(ctx, app); return;
    case 'level-select': renderLevelSelect(ctx, app); return;
    case 'playing':
      if (app.game) renderGame(ctx, app.game, app);
      else renderWaitingForState(ctx, app);
      return;
    case 'round-end':    renderRoundEnd(ctx, app); return;
    case 'online-lobby': renderOnlineLobby(ctx, app); return;
  }
}

function renderWaitingForState(ctx: CanvasRenderingContext2D, _app: AppState): void {
  drawBackground(ctx);
  ctx.fillStyle = '#eee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 32px system-ui';
  ctx.fillText('Waiting for server…', ctx.canvas.width / 2, ctx.canvas.height / 2);
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  app?: AppState
): void {
  drawBackground(ctx);
  drawHUD(ctx, state, app);

  ctx.save();
  ctx.translate(0, HUD_HEIGHT);
  drawTiles(ctx, state);
  drawPlateStackOverlay(ctx, state);
  drawFacedHighlights(ctx, state);
  drawStationItems(ctx, state);
  drawFloorItems(ctx, state);
  drawPlayers(ctx, state);
  drawProjectiles(ctx, state);
  if (app) {
    drawParticles(ctx, app.particles.particles);
    drawScorePopups(ctx, app.particles.popups);
  }
  if (getLevel(state.levelId).tutorial) drawTutorialOverlay(ctx, state);
  ctx.restore();

  if (state.countdown > 0) drawCountdown(ctx, state.countdown);
}

// === Tutorial overlay ===

type TutorialStep = { text: string; done: boolean };

function computeTutorialSteps(state: GameState): TutorialStep[] {
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
    { text: 'Chop a TOMATO 🍅 (place on CHOP, hold Space//)', done: choppedTomato },
    { text: 'Chop a LETTUCE 🥬', done: choppedLettuce },
    { text: 'Grab a PLATE 🍽️ and combine both', done: plateReady },
    { text: 'Serve at the PASS 🛎️', done: served },
  ];
}

function drawTutorialOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const steps = computeTutorialSteps(state);
  const padding = 10;
  const lineH = 22;
  const titleH = 26;
  const w = 360;
  const h = padding * 2 + titleH + steps.length * lineH + 10;
  const x = 16;
  const y = 12;

  ctx.fillStyle = 'rgba(20,20,28,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = '#ffd54a';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('TUTORIAL · Make a Salad', x + padding, y + padding);

  ctx.font = '13px system-ui';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const sy = y + padding + titleH + i * lineH;
    ctx.fillStyle = s.done ? '#7ad26b' : '#ddd';
    ctx.fillText(`${s.done ? '✓' : '○'}  ${s.text}`, x + padding, sy);
  }

  // Once everything is checked, hint at finishing.
  if (steps.every((s) => s.done)) {
    ctx.fillStyle = '#7ad26b';
    ctx.font = 'bold 13px system-ui';
    ctx.fillText('Nice! Keep cooking — round runs until time ends.', x + padding, y + h - 24);
  }
}

function drawPlateStackOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const visible = Math.min(4, state.plateStock);
  if (visible <= 0) return;
  for (let row = 0; row < state.tiles.length; row++) {
    const r = state.tiles[row]!;
    for (let col = 0; col < r.length; col++) {
      const t = r[col]!;
      if (t.kind !== 'station' || t.station !== 'plate-stack') continue;
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const baseY = row * TILE_SIZE + TILE_SIZE / 2;
      for (let i = 0; i < visible; i++) {
        ctx.fillStyle = '#f5f5f0';
        ctx.beginPath();
        ctx.ellipse(cx, baseY + 6 - i * 4, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8b8a8';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

function drawFacedHighlights(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.players) {
    const { col, row } = facedTile(p.x, p.y, p.facing);
    if (row < 0 || row >= state.tiles.length) continue;
    const r = state.tiles[row]!;
    if (col < 0 || col >= r.length) continue;
    const t = r[col]!;
    if (t.kind === 'floor' || t.kind === 'wall' || t.kind === 'conveyor') continue;
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    // pulsing outline
    const t01 = (performance.now() / 1000) % 1;
    const a = 0.55 + 0.25 * Math.sin(t01 * Math.PI * 2);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = applyAlpha(p.color, a);
    ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.restore();
  }
}

function applyAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1]!, 16);
  return `rgba(${(v >> 16) & 0xff},${(v >> 8) & 0xff},${v & 0xff},${a})`;
}

// === Background ===

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// === HUD ===

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, _app?: AppState): void {
  const level = getLevel(state.levelId);
  const stars = starsForScore(level, state.score);

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, HUD_HEIGHT - 2, CANVAS_WIDTH, 2);

  const m = Math.floor(state.timeLeft / 60);
  const s = Math.floor(state.timeLeft % 60).toString().padStart(2, '0');
  ctx.fillStyle = '#eee';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('Time', 16, 22);
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText(`${m}:${s}`, 16, 58);

  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#bbb';
  ctx.fillText('Score', 130, 22);
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(`$${state.score}`, 130, 58);

  // Live star rating
  ctx.font = 'bold 13px system-ui';
  ctx.fillStyle = '#bbb';
  ctx.fillText('Stars', 250, 22);
  ctx.font = '22px system-ui';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(starString(stars), 250, 58);

  // Plate stock
  ctx.font = 'bold 13px system-ui';
  ctx.fillStyle = '#bbb';
  ctx.fillText('Plates', 360, 22);
  ctx.font = '18px system-ui';
  ctx.fillStyle = '#eee';
  ctx.fillText(
    `🍽️ ×${state.plateStock} (+${state.dirtyPlateQueue})`,
    360,
    52
  );

  const cardW = 100;
  const cardH = 88;
  const gap = 8;
  let x = CANVAS_WIDTH - 16;
  for (let i = state.orders.length - 1; i >= 0; i--) {
    const order = state.orders[i]!;
    x -= cardW;
    drawOrderCard(ctx, order, x, 8, cardW, cardH);
    x -= gap;
  }
}

function drawOrderCard(
  ctx: CanvasRenderingContext2D,
  order: GameState['orders'][number],
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const recipe = recipeById(order.recipeId);
  const t = Math.max(0, Math.min(1, order.timeRemaining / ORDER_TIME_LIMIT));
  const urgent = t < 0.4;
  const veryUrgent = t < 0.2;
  const pulse = veryUrgent ? 0.5 + 0.5 * Math.sin(performance.now() / 80) : 1;

  ctx.fillStyle = urgent ? '#5a2222' : '#2d2d36';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = urgent ? `rgba(255,107,107,${pulse})` : '#555';
  ctx.lineWidth = veryUrgent ? 3 : 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = '#eee';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(recipe.name, x + w / 2, y + 4);

  // Reward chip (top right)
  ctx.font = 'bold 10px system-ui';
  ctx.fillStyle = '#ffd54a';
  ctx.textAlign = 'right';
  ctx.fillText(`$${recipe.reward}`, x + w - 6, y + 5);

  // Urgency "!" badge on top-left when close to expiring
  if (urgent) {
    ctx.fillStyle = veryUrgent ? `rgba(255,107,107,${pulse})` : '#ff6b6b';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('!', x + 6, y + 4);
  }

  // Stylized plate preview
  drawRecipePreview(ctx, recipe, x + w / 2, y + 36);

  // Operation icons row
  drawOperationsRow(ctx, recipe, x + w / 2, y + 64);

  const barY = y + h - 8;
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 6, barY, w - 12, 4);
  ctx.fillStyle = urgent ? '#ff6b6b' : '#7ad26b';
  ctx.fillRect(x + 6, barY, (w - 12) * t, 4);
}

function drawOperationsRow(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  cx: number,
  cy: number
): void {
  const ops = operationsForRecipe(recipe);
  if (ops.length === 0) return;
  const spacing = 22;
  const startX = cx - (spacing * (ops.length - 1)) / 2;
  ctx.font = '16px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ops.length; i++) {
    // small dim background pill
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(startX + i * spacing, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(ops[i]!, startX + i * spacing, cy + 1);
  }
}

function operationsForRecipe(recipe: Recipe): string[] {
  let needsChop = false;
  let needsCook = false;
  let needsPot = false;
  for (const req of recipe.requirements) {
    if (req.type === 'ingredient') {
      if (req.state === 'chopped') needsChop = true;
      if (req.state === 'cooked') needsCook = true;
    } else {
      needsChop = true;
      needsPot = true;
    }
  }
  const ops: string[] = [];
  if (needsChop) ops.push('🔪');
  if (needsCook) ops.push('🔥');
  if (needsPot) ops.push('🍲');
  return ops;
}

function drawRecipePreview(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  cx: number,
  cy: number
): void {
  // Build the "ideal plate" for this recipe and draw it via drawPlate.
  const contents: PlateContent[] = recipe.requirements.map((req): PlateContent => {
    if (req.type === 'ingredient') {
      return { kind: req.kind, state: req.state, progress: 0 };
    }
    return { kind: 'soup', ingredients: req.ingredients.slice() };
  });
  drawPlate(ctx, { kind: 'plate', contents }, cx, cy);
}

// === World tiles ===

function drawTiles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (let row = 0; row < state.tiles.length; row++) {
    const r = state.tiles[row]!;
    for (let col = 0; col < r.length; col++) {
      drawTile(ctx, r[col]!, col * TILE_SIZE, row * TILE_SIZE);
    }
  }
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number
): void {
  if (tile.kind === 'floor') {
    ctx.fillStyle = '#d9c39a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    return;
  }
  if (tile.kind === 'wall') {
    ctx.fillStyle = '#3b3b46';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#2a2a32';
    ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 6);
    return;
  }
  if (tile.kind === 'conveyor') {
    drawConveyor(ctx, tile.direction, x, y);
    return;
  }
  drawStation(ctx, tile.station, x, y);
}

function drawConveyor(
  ctx: CanvasRenderingContext2D,
  dir: ConveyorDirection,
  x: number,
  y: number
): void {
  ctx.fillStyle = '#5a5a64';
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = '#3e3e48';
  // Arrow chevrons in the conveyor direction
  ctx.save();
  ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  switch (dir) {
    case 'up': break;
    case 'right': ctx.rotate(Math.PI / 2); break;
    case 'down':  ctx.rotate(Math.PI); break;
    case 'left':  ctx.rotate(-Math.PI / 2); break;
  }
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-10, i * 12 + 8);
    ctx.lineTo(0, i * 12);
    ctx.lineTo(10, i * 12 + 8);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStation(
  ctx: CanvasRenderingContext2D,
  station: StationKind,
  x: number,
  y: number
): void {
  // base counter look — wood
  ctx.fillStyle = '#a07555';
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + TILE_SIZE - 8, TILE_SIZE, 8); // shadow base

  const inset = 4;
  const ix = x + inset;
  const iy = y + inset;
  const iw = TILE_SIZE - inset * 2;
  const ih = TILE_SIZE - inset * 2;

  switch (station) {
    case 'counter':
      ctx.fillStyle = '#d4ad7b';
      ctx.fillRect(ix, iy, iw, ih);
      return;

    case 'dispenser-tomato':
      drawDispenser(ctx, x, y, '#c0392b', '🍅', 'TOMATO');
      return;
    case 'dispenser-lettuce':
      drawDispenser(ctx, x, y, '#5a8a3a', '🥬', 'LETTUCE');
      return;
    case 'dispenser-onion':
      drawDispenser(ctx, x, y, '#d4a64a', '🧅', 'ONION');
      return;
    case 'dispenser-meat':
      drawDispenser(ctx, x, y, '#a04545', '🥩', 'MEAT');
      return;
    case 'dispenser-bun':
      drawDispenser(ctx, x, y, '#c9a26a', '🍞', 'BUN');
      return;

    case 'cutting-board':
      ctx.fillStyle = '#d8b78b';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = '#a07840';
      ctx.fillRect(ix + 5, iy + 5, iw - 10, ih - 14);
      ctx.font = '30px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔪', x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 5);
      drawStationLabel(ctx, x, y, 'CHOP', '#fff');
      return;

    case 'stove':
      ctx.fillStyle = '#2e2e36';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = '#1a1a1f';
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 4, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b6b78';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawStationLabel(ctx, x, y, 'STOVE', '#fff');
      return;

    case 'plate-stack':
      // Just the base; the actual plate icons are drawn in a later overlay pass
      // because their count depends on dynamic plateStock.
      ctx.fillStyle = '#d4ad7b';
      ctx.fillRect(ix, iy, iw, ih);
      drawStationLabel(ctx, x, y, 'PLATES', '#3a2a18');
      return;

    case 'pot-stack':
      ctx.fillStyle = '#d4ad7b';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.font = '32px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍲', x + TILE_SIZE / 2 - 7, y + TILE_SIZE / 2 + 1);
      ctx.fillText('🍲', x + TILE_SIZE / 2 + 9, y + TILE_SIZE / 2 - 5);
      drawStationLabel(ctx, x, y, 'POTS', '#3a2a18');
      return;

    case 'sink':
      ctx.fillStyle = '#3a6da8';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = '#1d4a8a';
      ctx.fillRect(ix + 6, iy + 8, iw - 12, ih - 18);
      // faucet
      ctx.fillStyle = '#aaa';
      ctx.fillRect(x + TILE_SIZE / 2 - 2, y + iy - inset, 4, 14);
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💧', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      drawStationLabel(ctx, x, y, 'WASH', '#fff');
      return;

    case 'dirty-plate-return':
      ctx.fillStyle = '#7a6248';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = '#5b4a36';
      ctx.fillRect(ix + 6, iy + ih - 18, iw - 12, 10);
      drawStationLabel(ctx, x, y, 'DIRTY', '#fff');
      return;

    case 'trash':
      ctx.fillStyle = '#444';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.font = '32px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🗑️', x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 3);
      drawStationLabel(ctx, x, y, 'BIN', '#fff');
      return;

    case 'serving-window':
      ctx.fillStyle = '#e8c45a';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = '#c69a2d';
      ctx.fillRect(ix, iy + ih - 12, iw, 12);
      ctx.font = 'bold 14px system-ui';
      ctx.fillStyle = '#3a2a08';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PASS', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6);
      ctx.font = '20px system-ui';
      ctx.fillText('🛎️', x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 12);
      return;
  }
}

function drawDispenser(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  icon: string,
  label: string
): void {
  const inset = 4;
  ctx.fillStyle = color;
  ctx.fillRect(x + inset, y + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + inset, y + TILE_SIZE - 14, TILE_SIZE - inset * 2, 10);
  ctx.font = '34px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 5);
  drawStationLabel(ctx, x, y, label, '#fff');
}

function drawStationLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 4, y + TILE_SIZE - 14, TILE_SIZE - 8, 11);
  ctx.fillStyle = color;
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + TILE_SIZE / 2, y + TILE_SIZE - 8);
}

// === Items on stations ===

function drawStationItems(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (let row = 0; row < state.tiles.length; row++) {
    const r = state.tiles[row]!;
    for (let col = 0; col < r.length; col++) {
      const tile = r[col]!;
      if (tile.kind !== 'station' || tile.item === null) continue;
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const cy = row * TILE_SIZE + TILE_SIZE / 2 - 4;
      drawItem(ctx, tile.item, cx, cy);
      drawStationProgress(ctx, tile, col, row);
      drawBurnWarning(ctx, tile, col, row);
    }
  }
}

function drawFloorItems(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const fi of state.floorItems) {
    const bob = Math.sin(fi.bobPhase) * 1.5;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(fi.x, fi.y + 12, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawItem(ctx, fi.item, fi.x, fi.y - 2 + bob);
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.projectiles) {
    const t = Math.max(0, Math.min(1, p.t));
    const x = p.startX + (p.endX - p.startX) * t;
    const baseY = p.startY + (p.endY - p.startY) * t;
    // parabolic arc: max height in the middle
    const arc = -Math.sin(t * Math.PI) * 38;
    const y = baseY + arc;

    // shadow at ground level
    const shadowSize = 8 + Math.sin(t * Math.PI) * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, baseY + 14, shadowSize, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // spin: rotate a bit during flight
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * Math.PI * 2);
    drawItem(ctx, p.item, 0, 0);
    ctx.restore();
  }
}

function drawBurnWarning(
  ctx: CanvasRenderingContext2D,
  tile: Extract<Tile, { kind: 'station' }>,
  col: number,
  row: number
): void {
  if (tile.station !== 'stove' || !tile.item) return;
  const item = tile.item;
  let nearBurn = false;
  if (item.kind === 'pot') {
    nearBurn = item.state === 'cooked' && item.progress > 0.4;
  } else if (
    item.kind !== 'plate' &&
    item.kind !== 'dirty-plate' &&
    item.kind !== 'soup'
  ) {
    nearBurn = item.state === 'cooked' && item.progress > 0.4;
  }
  if (!nearBurn) return;
  const pulse = 0.45 + 0.4 * Math.sin(performance.now() / 100);
  ctx.strokeStyle = `rgba(255,80,80,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    col * TILE_SIZE + TILE_SIZE / 2,
    row * TILE_SIZE + TILE_SIZE / 2,
    TILE_SIZE / 2 - 6,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  // Warning smoke wisps
  ctx.fillStyle = `rgba(120,120,120,${0.4 + 0.3 * Math.sin(performance.now() / 200)})`;
  for (let i = 0; i < 3; i++) {
    const offset = (performance.now() / 300 + i) % 1;
    ctx.beginPath();
    ctx.arc(
      col * TILE_SIZE + TILE_SIZE / 2 + (i - 1) * 6,
      row * TILE_SIZE + 8 - offset * 16,
      4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawStationProgress(
  ctx: CanvasRenderingContext2D,
  tile: Extract<Tile, { kind: 'station' }>,
  col: number,
  row: number
): void {
  const item = tile.item;
  if (!item) return;

  let progress = -1;
  let color = '#7ad26b';

  if (
    item.kind !== 'plate' &&
    item.kind !== 'dirty-plate' &&
    item.kind !== 'pot' &&
    item.kind !== 'soup'
  ) {
    if (item.state === 'chopping') { progress = item.progress; color = '#7ad26b'; }
    else if (item.state === 'cooking') { progress = item.progress; color = '#ff8a3d'; }
    else if (item.state === 'cooked' && tile.station === 'stove') {
      progress = item.progress; color = '#ff4444';
    }
  } else if (item.kind === 'pot') {
    if (item.state === 'cooking') { progress = item.progress; color = '#ff8a3d'; }
    else if (item.state === 'cooked') { progress = item.progress; color = '#ff4444'; }
  } else if (item.kind === 'dirty-plate' && tile.station === 'sink') {
    if (item.washProgress > 0) { progress = item.washProgress; color = '#5ab8ff'; }
  }

  if (progress < 0) return;
  const barX = col * TILE_SIZE + 6;
  const barY = row * TILE_SIZE + 4;
  const barW = TILE_SIZE - 12;
  ctx.fillStyle = '#222';
  ctx.fillRect(barX, barY, barW, 5);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, progress)), 5);
}

// === Items ===

function drawItem(
  ctx: CanvasRenderingContext2D,
  item: Item,
  cx: number,
  cy: number
): void {
  switch (item.kind) {
    case 'plate':       drawPlate(ctx, item, cx, cy); return;
    case 'dirty-plate': drawDirtyPlate(ctx, item, cx, cy); return;
    case 'pot':         drawPot(ctx, item, cx, cy); return;
    case 'soup':        drawSoupOnly(ctx, item, cx, cy); return;
    default:            drawIngredient(ctx, item, cx, cy); return;
  }
}

function drawIngredient(
  ctx: CanvasRenderingContext2D,
  ing: Ingredient,
  cx: number,
  cy: number,
  size = 30
): void {
  const icon = emojiFor(ing.kind);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (ing.state === 'chopped') {
    ctx.font = `${Math.floor(size * 0.55)}px system-ui`;
    ctx.fillText(icon, cx - 9, cy);
    ctx.fillText(icon, cx, cy + 2);
    ctx.fillText(icon, cx + 9, cy);
    return;
  }
  if (ing.state === 'burnt') {
    ctx.font = `${size}px system-ui`;
    ctx.fillText('⚫', cx, cy);
    return;
  }
  ctx.font = `${size}px system-ui`;
  ctx.fillText(icon, cx, cy);

  if (ing.state === 'cooked') {
    ctx.fillStyle = 'rgba(80, 30, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  plate: Plate,
  cx: number,
  cy: number
): void {
  ctx.fillStyle = '#f5f5f0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (let i = 0; i < plate.contents.length; i++) {
    const item = plate.contents[i]!;
    const off = (i - (plate.contents.length - 1) / 2) * 10;
    drawPlateContent(ctx, item, cx + off, cy - 4);
  }
}

function drawPlateContent(
  ctx: CanvasRenderingContext2D,
  content: PlateContent,
  cx: number,
  cy: number
): void {
  if (content.kind === 'soup') {
    drawSoupOnly(ctx, content, cx, cy, 18);
  } else {
    drawIngredient(ctx, content, cx, cy, 20);
  }
}

function drawDirtyPlate(
  ctx: CanvasRenderingContext2D,
  dp: DirtyPlate,
  cx: number,
  cy: number
): void {
  ctx.fillStyle = '#a89870';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // gunk
  ctx.fillStyle = 'rgba(60, 40, 20, 0.65)';
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 1, 3, 0, Math.PI * 2);
  ctx.arc(cx + 4, cy + 1, 2, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  // wash progress, if any
  if (dp.washProgress > 0) {
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 16, cy - 14, 32, 4);
    ctx.fillStyle = '#5ab8ff';
    ctx.fillRect(cx - 16, cy - 14, 32 * Math.min(1, dp.washProgress), 4);
  }
}

function drawPot(
  ctx: CanvasRenderingContext2D,
  pot: Pot,
  cx: number,
  cy: number,
  size = 34
): void {
  // pot body
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, size * 0.55, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3a3f';
  ctx.fillRect(cx - size * 0.4, cy - 2, size * 0.8, 14);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - size * 0.4, cy - 2, size * 0.8, 14);

  // Soup color if cooking/cooked
  if (pot.state !== 'idle' && pot.state !== 'burnt') {
    ctx.fillStyle = pot.state === 'cooked' ? '#d68a3a' : '#c0772b';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pot.state === 'burnt') {
    ctx.fillStyle = '#1c1c1f';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ingredients sitting inside (raw chunks) if idle
  if (pot.state === 'idle') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '12px system-ui';
    const startX = cx - ((pot.ingredients.length - 1) * 8) / 2;
    for (let i = 0; i < pot.ingredients.length; i++) {
      ctx.fillText(emojiFor(pot.ingredients[i]!), startX + i * 8, cy - 1);
    }
  }
}

function drawSoupOnly(
  ctx: CanvasRenderingContext2D,
  soup: Soup,
  cx: number,
  cy: number,
  size = 22
): void {
  ctx.fillStyle = '#d68a3a';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8b5a1a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // tiny base ingredient marks
  ctx.font = `${Math.max(8, Math.floor(size * 0.4))}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startX = cx - ((soup.ingredients.length - 1) * 7) / 2;
  for (let i = 0; i < soup.ingredients.length; i++) {
    ctx.fillText(emojiFor(soup.ingredients[i]!), startX + i * 7, cy);
  }
}

function emojiFor(kind: IngredientKind): string {
  switch (kind) {
    case 'tomato':  return '🍅';
    case 'lettuce': return '🥬';
    case 'onion':   return '🧅';
    case 'meat':    return '🥩';
    case 'bun':     return '🍞';
  }
}

// === Players ===

function drawPlayers(ctx: CanvasRenderingContext2D, state: GameState): void {
  const sorted = [...state.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) drawPlayer(ctx, p);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player): void {
  // Continuous subtle bob, slightly offset per player so they don't sync.
  const bob = Math.sin(performance.now() / 220 + p.id * 1.7) * 1.5;
  const px = p.x;
  const py = p.y + bob;

  // shadow (uses unbobbed y so it stays grounded)
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(px, p.y + PLAYER_RADIUS - 2, PLAYER_RADIUS - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(p.color);
  ctx.lineWidth = 2;
  ctx.stroke();

  // chef hat — drawn last for layering, but compute coords now
  const hatBaseY = py - PLAYER_RADIUS + 4;

  // eyes (don't draw if facing away)
  if (p.facing !== 'up') {
    let eox = 0, eoy = 0;
    if (p.facing === 'left')  eox = -2;
    if (p.facing === 'right') eox = 2;
    if (p.facing === 'down')  eoy = 2;
    const eyeY = py - 2 + eoy;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px - 6 + eox, eyeY, 4, 0, Math.PI * 2);
    ctx.arc(px + 6 + eox, eyeY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(px - 6 + eox * 1.5, eyeY + eoy * 0.5, 2, 0, Math.PI * 2);
    ctx.arc(px + 6 + eox * 1.5, eyeY + eoy * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // back of head: tiny hair tuft
    ctx.fillStyle = darken(p.color);
    ctx.beginPath();
    ctx.arc(px, py - 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // chef hat — band + puff
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(px - 14, hatBaseY - 6, 28, 6);
  ctx.beginPath();
  ctx.ellipse(px, hatBaseY - 10, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8c8b8';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // little puffs on hat
  ctx.fillStyle = '#f5f5f0';
  ctx.beginPath();
  ctx.arc(px - 8, hatBaseY - 14, 5, 0, Math.PI * 2);
  ctx.arc(px + 8, hatBaseY - 13, 4, 0, Math.PI * 2);
  ctx.arc(px, hatBaseY - 18, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // player number badge below body
  const badgeW = 26;
  const badgeH = 12;
  const badgeY = p.y + PLAYER_RADIUS + 4;
  ctx.fillStyle = darken(p.color);
  ctx.fillRect(px - badgeW / 2, badgeY, badgeW, badgeH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`P${p.id + 1}`, px, badgeY + badgeH / 2);

  // held item — float well above the hat
  if (p.held) drawItem(ctx, p.held, px, hatBaseY - 28);
}

function darken(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#222';
  const v = parseInt(m[1]!, 16);
  const r = Math.max(0, ((v >> 16) & 0xff) - 60);
  const g = Math.max(0, ((v >> 8) & 0xff) - 60);
  const b = Math.max(0, (v & 0xff) - 60);
  return `rgb(${r},${g},${b})`;
}

// === Countdown overlay ===

function drawCountdown(ctx: CanvasRenderingContext2D, countdown: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const display =
    countdown > 2 ? '3' : countdown > 1 ? '2' : countdown > 0.4 ? '1' : 'GO!';
  ctx.fillStyle = display === 'GO!' ? '#7ad26b' : '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 140px system-ui';
  ctx.fillText(display, ctx.canvas.width / 2, ctx.canvas.height / 2);
}

// === Menu scene ===

function renderMenu(ctx: CanvasRenderingContext2D, app: AppState): void {
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = ctx.canvas.width / 2;

  ctx.font = 'bold 86px system-ui';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText('OVERCOOKED', cx, 130);

  ctx.font = 'bold 28px system-ui';
  ctx.fillStyle = '#eee';
  ctx.fillText('🔥 🍅 🥬 🧅 🥩 🍲 🍞', cx, 200);

  // Vertical menu
  const menuY = 290;
  const lineH = 60;
  for (let i = 0; i < MAIN_MENU.length; i++) {
    const item = MAIN_MENU[i]!;
    const selected = i === app.selectedMainMenuIndex;
    const y = menuY + i * lineH;
    if (selected) {
      ctx.fillStyle = '#3a3a48';
      ctx.fillRect(cx - 240, y - 22, 480, 44);
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 240 + 1, y - 22 + 1, 478, 42);
    }
    ctx.font = selected ? 'bold 24px system-ui' : '22px system-ui';
    ctx.fillStyle = selected ? '#fff' : '#aaa';
    ctx.fillText(item.label, cx, y);
  }

  ctx.font = '14px system-ui';
  ctx.fillStyle = '#666';
  ctx.fillText(
    '↑ ↓ to navigate   ·   E / Space to select',
    cx,
    ctx.canvas.height - 56
  );
  ctx.fillStyle = '#444';
  ctx.fillText(
    'P1: WASD + E + Space + Q (throw)     P2: Arrows + Shift + / + . (throw)',
    cx,
    ctx.canvas.height - 30
  );
}

function renderOnlineLobby(ctx: CanvasRenderingContext2D, app: AppState): void {
  drawBackground(ctx);
  const net = app.network;
  const cx = ctx.canvas.width / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 48px system-ui';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText('Online Room', cx, 60);

  // Status
  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#bbb';
  let status = 'Connecting…';
  if (net) {
    if (net.status === 'connected') status = 'Connected';
    if (net.status === 'closed')    status = 'Disconnected';
    if (net.status === 'room-full') status = 'Room is full';
  }
  ctx.fillText(status, cx, 100);

  // Room code chip
  ctx.font = 'bold 16px system-ui';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Room code', cx, 140);
  ctx.font = 'bold 56px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(net?.roomCode ?? '----', cx, 200);

  // Players
  ctx.font = 'bold 22px system-ui';
  ctx.fillStyle = '#eee';
  const players = net?.lobbyPlayers ?? [];
  const p1In = players.includes(0);
  const p2In = players.includes(1);
  ctx.fillText(
    `P1 ${p1In ? '✓' : '⌛'}    P2 ${p2In ? '✓' : '⌛'}`,
    cx,
    260
  );

  // Host: show selectable level. Joiner: show waiting message.
  if (net?.isHost && p1In && p2In) {
    ctx.font = 'bold 18px system-ui';
    ctx.fillStyle = '#ffd54a';
    ctx.fillText('You are the host — pick a level', cx, 310);

    const lvl = LEVELS[app.selectedLevelIndex]!;
    const w = 440;
    const cardX = cx - w / 2;
    const y = 340;
    const h = 200;
    ctx.fillStyle = '#222';
    ctx.fillRect(cardX, y, w, h);
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 3;
    ctx.strokeRect(cardX + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui';
    ctx.fillText(lvl.name, cx, y + 30);
    ctx.font = '14px system-ui';
    ctx.fillStyle = '#aaa';
    ctx.fillText(lvl.description, cx, y + 60);
    drawLayoutPreview(ctx, lvl, cardX + 20, y + 80, w - 40, 90);
    ctx.font = 'bold 14px system-ui';
    ctx.fillStyle = '#bbb';
    ctx.fillText('← →  switch level     E / Space to start', cx, y + 180);
  } else if (net?.isHost) {
    ctx.font = '16px system-ui';
    ctx.fillStyle = '#aaa';
    ctx.fillText(
      'Share the room code above with your co-op partner.',
      cx,
      310
    );
    ctx.fillText('Waiting for player 2…', cx, 340);
  } else {
    ctx.font = '16px system-ui';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Waiting for the host to start the game…', cx, 310);
  }

  if (app.netError) {
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText(app.netError, cx, ctx.canvas.height - 70);
  }

  ctx.font = '14px system-ui';
  ctx.fillStyle = '#666';
  ctx.fillText('Esc to leave', cx, ctx.canvas.height - 30);
}

// === Level-select scene ===

function renderLevelSelect(ctx: CanvasRenderingContext2D, app: AppState): void {
  drawBackground(ctx);

  ctx.fillStyle = '#ffd54a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 32px system-ui';
  ctx.fillText('Select a Level', ctx.canvas.width / 2, 40);

  const n = LEVELS.length;
  const margin = 40;
  const gap = 18;
  const availW = ctx.canvas.width - margin * 2 - gap * (n - 1);
  const cardW = Math.min(220, Math.floor(availW / n));
  const cardH = 470;
  const totalW = cardW * n + gap * (n - 1);
  const startX = (ctx.canvas.width - totalW) / 2;
  const y = 70;

  for (let i = 0; i < n; i++) {
    const lvl = LEVELS[i]!;
    const cx = startX + i * (cardW + gap);
    const selected = i === app.selectedLevelIndex;
    const unlocked = isLevelUnlocked(i, app.highScores);
    drawLevelCard(
      ctx,
      lvl,
      app.highScores[lvl.id] ?? 0,
      cx,
      y,
      cardW,
      cardH,
      selected,
      unlocked,
      i,
    );
  }

  ctx.font = '15px system-ui';
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'center';
  ctx.fillText(
    '← → / A D  to navigate     E · Space · Enter to play     Esc to menu     M mute',
    ctx.canvas.width / 2,
    ctx.canvas.height - 24
  );
}

function drawLevelCard(
  ctx: CanvasRenderingContext2D,
  lvl: Level,
  best: number,
  x: number,
  y: number,
  w: number,
  h: number,
  selected: boolean,
  unlocked: boolean,
  index: number
): void {
  ctx.fillStyle = selected ? '#3a3a48' : '#222';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? '#ffd54a' : '#444';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 11px system-ui';
  ctx.fillStyle = '#888';
  ctx.fillText(lvl.tutorial ? 'TUTORIAL' : `LEVEL ${index}`, x + w / 2, y + 10);

  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = unlocked ? '#fff' : '#666';
  ctx.fillText(lvl.name, x + w / 2, y + 28);

  ctx.font = '12px system-ui';
  ctx.fillStyle = '#aaa';
  wrappedText(ctx, lvl.description, x + 12, y + 56, w - 24, 16);

  // Layout preview
  drawLayoutPreview(ctx, lvl, x + 12, y + 110, w - 24, 130);

  const stars = starsForScore(lvl, best);
  ctx.font = '26px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(starString(stars), x + w / 2, y + 256);

  ctx.font = '13px system-ui';
  ctx.fillStyle = '#888';
  ctx.fillText(`Best: $${best}`, x + w / 2, y + 290);

  // 1-star target hint (for arcade clarity)
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#888';
  if (!lvl.tutorial) {
    ctx.fillText(
      `Beat $${lvl.starThresholds[0]} to clear · $${lvl.starThresholds[2]} for ★★★`,
      x + w / 2,
      y + 314
    );
  } else {
    ctx.fillText('Always available · learn the basics', x + w / 2, y + 314);
  }

  // Recipes available
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#bbb';
  ctx.fillText(
    `Recipes: ${lvl.recipeIds.length}`,
    x + w / 2,
    y + 340
  );

  // Locked overlay
  if (!unlocked) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#fff';
    ctx.font = '48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🔒', x + w / 2, y + h / 2 - 24);
    ctx.font = 'bold 13px system-ui';
    ctx.fillText('LOCKED', x + w / 2, y + h / 2 + 12);
    const prev = LEVELS[index - 1];
    if (prev) {
      ctx.font = '11px system-ui';
      ctx.fillStyle = '#bbb';
      ctx.fillText(
        `Earn $${unlockScoreFor(prev)} on`,
        x + w / 2,
        y + h / 2 + 36
      );
      ctx.fillText(`"${prev.name}" to unlock`, x + w / 2, y + h / 2 + 52);
    }
  }
}

function starString(n: number): string {
  return ['☆☆☆', '★☆☆', '★★☆', '★★★'][n] ?? '☆☆☆';
}

function drawLayoutPreview(
  ctx: CanvasRenderingContext2D,
  lvl: Level,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const rows = lvl.layout.trim().split('\n');
  const cellW = w / rows[0]!.length;
  const cellH = h / rows.length;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]!;
      let color = '#d9c39a'; // floor
      if (ch === '#') color = '#3b3b46';
      else if (ch === '.') color = '#d9c39a';
      else if ('<>^v'.includes(ch)) color = '#5a5a64';
      else color = '#a0866a';
      ctx.fillStyle = color;
      ctx.fillRect(x + c * cellW, y + r * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

function wrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineHeight: number
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const words = text.split(/\s+/);
  let line = '';
  let cy = y;
  for (const w of words) {
    const candidate = line ? line + ' ' + w : w;
    if (ctx.measureText(candidate).width > maxW) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// === Round-end scene ===

function renderRoundEnd(ctx: CanvasRenderingContext2D, app: AppState): void {
  drawBackground(ctx);

  // Try to keep the game render in the background, dimmed
  if (app.game) {
    ctx.globalAlpha = 0.35;
    renderGame(ctx, app.game);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const cx = ctx.canvas.width / 2;
  const cy = ctx.canvas.height / 2;
  const level = app.game ? getLevel(app.game.levelId) : null;
  const stars = level ? starsForScore(level, app.lastFinishedScore) : 0;
  const best = level ? app.highScores[level.id] ?? 0 : 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px system-ui';
  ctx.fillText('Round Over', cx, cy - 140);

  ctx.font = 'bold 64px system-ui';
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(starString(stars), cx, cy - 60);

  ctx.font = 'bold 36px system-ui';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Final Score: $${app.lastFinishedScore}`, cx, cy + 10);

  ctx.font = '20px system-ui';
  ctx.fillStyle = app.lastNewRecord ? '#7ad26b' : '#bbb';
  ctx.fillText(
    app.lastNewRecord ? `🏆 NEW RECORD!  Best: $${best}` : `Best: $${best}`,
    cx,
    cy + 60
  );

  ctx.font = 'bold 22px system-ui';
  ctx.fillStyle = '#fff';
  drawBlink(ctx, () => {
    ctx.fillText('Press E or Space to continue', cx, cy + 140);
  });
}

function drawBlink(ctx: CanvasRenderingContext2D, draw: () => void): void {
  const t = (performance.now() / 1000) % 1;
  if (t < 0.65) draw();
  void ctx;
}

