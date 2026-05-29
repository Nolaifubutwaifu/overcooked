import type {
  GameState,
  Ingredient,
  Item,
  Plate,
  Player,
  Pot,
  Projectile,
  StationKind,
  Tile,
} from './types.ts';
import type { InputFrame } from './input.ts';
import {
  TILE_SIZE,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  CHOP_DURATION,
  COOK_DURATION,
  BURN_DURATION,
  POT_COOK_DURATION,
  POT_BURN_DURATION,
  POT_MAX_INGREDIENTS,
  WASH_DURATION,
  CONVEYOR_SPEED,
  ORDER_TIME_LIMIT,
  ORDER_SPAWN_INTERVAL,
  MAX_ACTIVE_ORDERS,
  PENALTY_EXPIRED,
  THROW_MAX_RANGE,
  THROW_DURATION,
  FLOOR_PICKUP_RADIUS,
} from './constants.ts';
import { facedTile, tileAt } from './state.ts';
import { recipeById } from './data/recipes.ts';
import { getLevel } from './data/levels.ts';
import type { GameEvent } from './effects.ts';

// Module-local sink — drained once per update() call.
let pendingEvents: GameEvent[] = [];
function emit(e: GameEvent): void {
  pendingEvents.push(e);
}
function centerOfTile(col: number, row: number): { x: number; y: number } {
  return { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
}

const EMPTY_INPUT: InputFrame = {
  axis: { x: 0, y: 0 },
  interact: false,
  interactPressed: false,
  use: false,
  throwPressed: false,
};

export function update(
  state: GameState,
  inputs: InputFrame[],
  dt: number
): GameEvent[] {
  pendingEvents = [];
  if (state.phase === 'finished') return pendingEvents;

  if (state.countdown > 0) {
    const before = Math.ceil(state.countdown);
    state.countdown = Math.max(0, state.countdown - dt);
    const after = Math.ceil(state.countdown);
    if (after < before) emit({ kind: 'countdown-tick' });
    return pendingEvents;
  }

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = 'finished';
    return pendingEvents;
  }

  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i]!;
    const input = inputs[i] ?? EMPTY_INPUT;
    movePlayer(state, player, input, dt);
    updateFacing(player, input);
    if (input.interactPressed) handleInteract(state, player);
    if (input.throwPressed) handleThrow(state, player);
    player.interacting = input.interact;
  }

  updateStations(state, inputs, dt);
  updateProjectiles(state, dt);
  updateFloorItems(state, dt);
  updateDirtyPlateQueue(state);
  updateOrders(state, dt);

  return pendingEvents;
}

// === Movement ===

function movePlayer(
  state: GameState,
  player: Player,
  input: InputFrame,
  dt: number
): void {
  let vx = input.axis.x;
  let vy = input.axis.y;
  const mag = Math.hypot(vx, vy);
  if (mag > 0) {
    vx = (vx / mag) * PLAYER_SPEED;
    vy = (vy / mag) * PLAYER_SPEED;
  }

  // Conveyor push (additive on top of input)
  const onTile = tileAt(
    state.tiles,
    Math.floor(player.x / TILE_SIZE),
    Math.floor(player.y / TILE_SIZE)
  );
  if (onTile?.kind === 'conveyor') {
    switch (onTile.direction) {
      case 'up':    vy -= CONVEYOR_SPEED; break;
      case 'down':  vy += CONVEYOR_SPEED; break;
      case 'left':  vx -= CONVEYOR_SPEED; break;
      case 'right': vx += CONVEYOR_SPEED; break;
    }
  }

  const newX = player.x + vx * dt;
  if (!collides(state, player, newX, player.y)) player.x = newX;
  const newY = player.y + vy * dt;
  if (!collides(state, player, player.x, newY)) player.y = newY;
}

function collides(state: GameState, self: Player, x: number, y: number): boolean {
  const r = PLAYER_RADIUS;
  const minCol = Math.floor((x - r) / TILE_SIZE);
  const maxCol = Math.floor((x + r) / TILE_SIZE);
  const minRow = Math.floor((y - r) / TILE_SIZE);
  const maxRow = Math.floor((y + r) / TILE_SIZE);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = tileAt(state.tiles, col, row);
      if (!tile || tile.kind === 'wall' || tile.kind === 'station') {
        const minX = col * TILE_SIZE;
        const minY = row * TILE_SIZE;
        const maxX = minX + TILE_SIZE;
        const maxY = minY + TILE_SIZE;
        const closestX = Math.max(minX, Math.min(x, maxX));
        const closestY = Math.max(minY, Math.min(y, maxY));
        const dx = x - closestX;
        const dy = y - closestY;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
  }
  for (const other of state.players) {
    if (other.id === self.id) continue;
    const dx = x - other.x;
    const dy = y - other.y;
    const minDist = r + PLAYER_RADIUS;
    if (dx * dx + dy * dy < minDist * minDist) return true;
  }
  return false;
}

function updateFacing(player: Player, input: InputFrame): void {
  const { x, y } = input.axis;
  if (x === 0 && y === 0) return;
  if (Math.abs(x) >= Math.abs(y)) {
    player.facing = x > 0 ? 'right' : 'left';
  } else {
    player.facing = y > 0 ? 'down' : 'up';
  }
}

// === Interactions (tap interact) ===

function handleInteract(state: GameState, player: Player): void {
  // First: if standing near a floor item with empty hands, scoop it up.
  if (!player.held) {
    let bestIdx = -1;
    let bestDist = FLOOR_PICKUP_RADIUS * FLOOR_PICKUP_RADIUS;
    for (let i = 0; i < state.floorItems.length; i++) {
      const fi = state.floorItems[i]!;
      const dx = fi.x - player.x;
      const dy = fi.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      player.held = state.floorItems[bestIdx]!.item;
      state.floorItems.splice(bestIdx, 1);
      return;
    }
  }

  const { col, row } = facedTile(player.x, player.y, player.facing);
  const tile = tileAt(state.tiles, col, row);
  if (!tile || tile.kind !== 'station') return;

  switch (tile.station) {
    case 'dispenser-tomato':
    case 'dispenser-lettuce':
    case 'dispenser-onion':
    case 'dispenser-meat':
    case 'dispenser-bun':
      if (player.held) return;
      player.held = {
        kind: ingredientKindFromDispenser(tile.station),
        state: 'raw',
        progress: 0,
      };
      return;

    case 'plate-stack':
      if (player.held) return;
      if (state.plateStock <= 0) return;
      state.plateStock -= 1;
      player.held = { kind: 'plate', contents: [] };
      return;

    case 'pot-stack':
      if (player.held) return;
      player.held = { kind: 'pot', ingredients: [], state: 'idle', progress: 0 };
      return;

    case 'trash':
      // Trash also recovers plates: dirty plate or clean plate → back into clean stock.
      if (player.held) {
        if (player.held.kind === 'plate' || player.held.kind === 'dirty-plate') {
          state.plateStock += 1;
        }
        player.held = null;
      }
      return;

    case 'serving-window':
      if (!player.held || player.held.kind !== 'plate') return;
      tryServe(state, player);
      return;

    case 'sink':
    case 'counter':
    case 'cutting-board':
    case 'stove':
    case 'dirty-plate-return':
      handleStationItemSwap(state, tile, player);
      return;
  }
}

// === Throwing ===

function handleThrow(state: GameState, player: Player): void {
  if (!player.held) return;
  const item = player.held;
  player.held = null;

  const dx = player.facing === 'left' ? -1 : player.facing === 'right' ? 1 : 0;
  const dy = player.facing === 'up' ? -1 : player.facing === 'down' ? 1 : 0;

  const originCol = Math.floor(player.x / TILE_SIZE);
  const originRow = Math.floor(player.y / TILE_SIZE);

  // Scan along the throw direction looking for the landing target.
  let lastViableCol = originCol;
  let lastViableRow = originRow;
  let stationLandCol = -1;
  let stationLandRow = -1;
  for (let step = 1; step <= THROW_MAX_RANGE; step++) {
    const c = originCol + dx * step;
    const r = originRow + dy * step;
    const tile = tileAt(state.tiles, c, r);
    if (!tile) break;
    if (tile.kind === 'wall') break;
    if (tile.kind === 'station') {
      if (tile.item === null) { stationLandCol = c; stationLandRow = r; }
      break;
    }
    // floor or conveyor: track as fallback landing spot
    lastViableCol = c;
    lastViableRow = r;
  }

  let landing: Projectile['landing'];
  let endX: number;
  let endY: number;
  if (stationLandCol >= 0) {
    landing = { kind: 'station', col: stationLandCol, row: stationLandRow };
    endX = (stationLandCol + 0.5) * TILE_SIZE;
    endY = (stationLandRow + 0.5) * TILE_SIZE;
  } else if (lastViableCol !== originCol || lastViableRow !== originRow) {
    landing = { kind: 'floor', col: lastViableCol, row: lastViableRow };
    endX = (lastViableCol + 0.5) * TILE_SIZE;
    endY = (lastViableRow + 0.5) * TILE_SIZE;
  } else {
    // didn't move at all — just drop at the player's feet
    landing = { kind: 'floor', col: originCol, row: originRow };
    endX = player.x;
    endY = player.y;
  }

  state.projectiles.push({
    item,
    startX: player.x,
    startY: player.y,
    endX,
    endY,
    t: 0,
    duration: THROW_DURATION,
    landing,
  });
  emit({ kind: 'serve-fail', x: player.x, y: player.y }); // reuses the "whoosh-ish" cue
}

function updateProjectiles(state: GameState, dt: number): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i]!;
    p.t += dt / p.duration;
    if (p.t >= 1) {
      finalizeLanding(state, p);
      state.projectiles.splice(i, 1);
    }
  }
}

function finalizeLanding(state: GameState, p: Projectile): void {
  switch (p.landing.kind) {
    case 'station': {
      const tile = tileAt(state.tiles, p.landing.col, p.landing.row);
      if (tile?.kind === 'station' && tile.item === null) {
        tile.item = p.item;
        // pots placed on stoves should start cooking automatically
        if (tile.station === 'stove' && p.item.kind === 'pot' && p.item.state === 'idle' && p.item.ingredients.length > 0) {
          p.item.state = 'cooking';
          p.item.progress = 0;
        }
      } else {
        // station no longer empty: bounce to floor
        state.floorItems.push({
          item: p.item,
          x: p.endX,
          y: p.endY,
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
      return;
    }
    case 'floor':
      state.floorItems.push({
        item: p.item,
        x: p.endX,
        y: p.endY,
        bobPhase: Math.random() * Math.PI * 2,
      });
      return;
    case 'lost':
      return;
  }
}

function updateFloorItems(state: GameState, dt: number): void {
  for (const fi of state.floorItems) fi.bobPhase += dt * 3;
}

function handleStationItemSwap(
  state: GameState,
  tile: Extract<Tile, { kind: 'station' }>,
  player: Player
): void {
  if (player.held && tile.item === null) {
    tile.item = player.held;
    player.held = null;
    onPlaceOnStation(tile);
    return;
  }
  if (!player.held && tile.item !== null) {
    player.held = tile.item;
    tile.item = null;
    onTakeFromStation(state, tile);
    return;
  }
  if (player.held && tile.item) {
    tryCombineHeld(player, tile);
  }
}

function onPlaceOnStation(tile: Extract<Tile, { kind: 'station' }>): void {
  // Placing a pot with contents on a stove kicks off cooking immediately.
  if (tile.station === 'stove' && tile.item?.kind === 'pot') {
    const pot = tile.item;
    if (pot.state === 'idle' && pot.ingredients.length > 0) {
      pot.state = 'cooking';
      pot.progress = 0;
    }
  }
}

function onTakeFromStation(_state: GameState, _tile: Extract<Tile, { kind: 'station' }>): void {
  // Hook for future: e.g. removing an item could expose another stacked behind it.
}

// === Combine logic ===

function tryCombineHeld(
  player: Player,
  tile: Extract<Tile, { kind: 'station' }>
): boolean {
  const h = player.held;
  const t = tile.item;
  if (!h || !t) return false;

  // Soup as a standalone held item isn't really expected, but be safe.
  if (h.kind === 'soup' || t.kind === 'soup') return false;
  if (h.kind === 'dirty-plate' || t.kind === 'dirty-plate') return false;

  // Ingredient → plate
  if (isPlateableIngredient(h) && t.kind === 'plate') {
    t.contents.push(h);
    player.held = null;
    return true;
  }
  // Plate ← ingredient on tile
  if (h.kind === 'plate' && isPlateableIngredient(t)) {
    h.contents.push(t);
    tile.item = null;
    return true;
  }

  // Ingredient (chopped) → pot
  if (h.kind !== 'plate' && h.kind !== 'pot' && t.kind === 'pot') {
    if (canAddToPot(t, h)) {
      t.ingredients.push(h.kind);
      t.ingredients.sort();
      player.held = null;
      return true;
    }
  }
  // Pot ← chopped ingredient on tile
  if (h.kind === 'pot' && t.kind !== 'plate' && t.kind !== 'pot') {
    if (canAddToPot(h, t)) {
      h.ingredients.push(t.kind);
      h.ingredients.sort();
      tile.item = null;
      return true;
    }
  }

  // Cooked pot (held) → pour soup onto plate (tile)
  if (h.kind === 'pot' && h.state === 'cooked' && t.kind === 'plate') {
    t.contents.push({ kind: 'soup', ingredients: h.ingredients.slice() });
    resetPot(h);
    return true;
  }
  // Plate (held) ← cooked pot on tile
  if (h.kind === 'plate' && t.kind === 'pot' && t.state === 'cooked') {
    h.contents.push({ kind: 'soup', ingredients: t.ingredients.slice() });
    resetPot(t);
    return true;
  }

  return false;
}

function canAddToPot(pot: Pot, ing: Ingredient): boolean {
  if (pot.state !== 'idle') return false;
  if (pot.ingredients.length >= POT_MAX_INGREDIENTS) return false;
  // Only chopped, non-meat ingredients go in a pot.
  if (ing.kind === 'meat') return false;
  if (ing.state !== 'chopped') return false;
  return true;
}

function resetPot(pot: Pot): void {
  pot.ingredients = [];
  pot.state = 'idle';
  pot.progress = 0;
}

function isPlateableIngredient(item: Item): item is Ingredient {
  if (item.kind === 'plate' || item.kind === 'dirty-plate' || item.kind === 'pot' || item.kind === 'soup') {
    return false;
  }
  // Buns go on plates as-is (no prep needed).
  if (item.kind === 'bun') return item.state === 'raw';
  return item.state === 'chopped' || item.state === 'cooked';
}

function ingredientKindFromDispenser(station: StationKind): Ingredient['kind'] {
  switch (station) {
    case 'dispenser-tomato': return 'tomato';
    case 'dispenser-lettuce': return 'lettuce';
    case 'dispenser-onion': return 'onion';
    case 'dispenser-meat': return 'meat';
    case 'dispenser-bun': return 'bun';
    default: throw new Error(`Not a dispenser: ${station}`);
  }
}

// === Station per-frame updates ===

function updateStations(state: GameState, inputs: InputFrame[], dt: number): void {
  for (let row = 0; row < state.tiles.length; row++) {
    const r = state.tiles[row]!;
    for (let col = 0; col < r.length; col++) {
      const tile = r[col]!;
      if (tile.kind !== 'station' || tile.item === null) continue;
      if (tile.station === 'stove') {
        const item = tile.item;
        if (item.kind === 'pot') {
          advancePotCooking(item, dt, col, row);
        } else if (item.kind !== 'plate' && item.kind !== 'dirty-plate' && item.kind !== 'soup') {
          advanceIngredientCooking(item, dt, col, row);
        }
      }
    }
  }

  for (let i = 0; i < state.players.length; i++) {
    const input = inputs[i] ?? EMPTY_INPUT;
    if (!input.use) continue;
    const player = state.players[i]!;
    const { col, row } = facedTile(player.x, player.y, player.facing);
    const tile = tileAt(state.tiles, col, row);
    if (tile?.kind !== 'station') continue;

    if (
      tile.station === 'cutting-board' &&
      tile.item &&
      tile.item.kind !== 'plate' &&
      tile.item.kind !== 'pot' &&
      tile.item.kind !== 'dirty-plate' &&
      tile.item.kind !== 'soup'
    ) {
      advanceChopping(tile.item, dt, col, row);
    }

    if (tile.station === 'sink' && tile.item?.kind === 'dirty-plate') {
      advanceWashing(tile, dt, col, row);
    }
  }
}

function advanceChopping(ing: Ingredient, dt: number, col: number, row: number): void {
  if (ing.kind === 'bun') return; // buns don't get chopped
  if (ing.state !== 'raw' && ing.state !== 'chopping') return;
  if (ing.state === 'raw') {
    ing.state = 'chopping';
    ing.progress = 0;
  }
  const prev = ing.progress;
  ing.progress += dt / CHOP_DURATION;
  // emit a chop-tick once every ~25% progress
  if (Math.floor(prev * 4) !== Math.floor(Math.min(1, ing.progress) * 4)) {
    const p = centerOfTile(col, row);
    emit({ kind: 'chop-tick', x: p.x, y: p.y });
  }
  if (ing.progress >= 1) {
    ing.state = 'chopped';
    ing.progress = 0;
    const p = centerOfTile(col, row);
    emit({ kind: 'chop-done', x: p.x, y: p.y });
  }
}

function advanceIngredientCooking(ing: Ingredient, dt: number, col: number, row: number): void {
  if (ing.kind === 'bun') return; // buns don't get cooked
  if (ing.state === 'chopped' || ing.state === 'chopping' || ing.state === 'burnt') return;
  const wasCooking = ing.state === 'cooking';
  if (ing.state === 'raw') {
    ing.state = 'cooking';
    ing.progress = 0;
  }
  if (ing.state === 'cooking') {
    if (!wasCooking) {
      const p = centerOfTile(col, row);
      emit({ kind: 'sizzling', x: p.x, y: p.y });
    }
    ing.progress += dt / COOK_DURATION;
    if (ing.progress >= 1) {
      ing.state = 'cooked';
      ing.progress = 0;
      const p = centerOfTile(col, row);
      emit({ kind: 'cook-done', x: p.x, y: p.y });
    }
    return;
  }
  if (ing.state === 'cooked') {
    ing.progress += dt / BURN_DURATION;
    if (ing.progress >= 1) {
      ing.state = 'burnt';
      ing.progress = 0;
      const p = centerOfTile(col, row);
      emit({ kind: 'burnt', x: p.x, y: p.y });
    }
  }
}

function advancePotCooking(pot: Pot, dt: number, col: number, row: number): void {
  const wasCooking = pot.state === 'cooking';
  if (pot.state === 'idle' && pot.ingredients.length > 0) {
    pot.state = 'cooking';
    pot.progress = 0;
  }
  if (pot.state === 'cooking') {
    if (!wasCooking) {
      const p = centerOfTile(col, row);
      emit({ kind: 'sizzling', x: p.x, y: p.y });
    }
    pot.progress += dt / POT_COOK_DURATION;
    if (pot.progress >= 1) {
      pot.state = 'cooked';
      pot.progress = 0;
      const p = centerOfTile(col, row);
      emit({ kind: 'cook-done', x: p.x, y: p.y });
    }
    return;
  }
  if (pot.state === 'cooked') {
    pot.progress += dt / POT_BURN_DURATION;
    if (pot.progress >= 1) {
      pot.state = 'burnt';
      pot.progress = 0;
      const p = centerOfTile(col, row);
      emit({ kind: 'burnt', x: p.x, y: p.y });
    }
  }
}

function advanceWashing(
  tile: Extract<Tile, { kind: 'station' }>,
  dt: number,
  col: number,
  row: number
): void {
  const dp = tile.item;
  if (!dp || dp.kind !== 'dirty-plate') return;
  const prev = dp.washProgress;
  dp.washProgress += dt / WASH_DURATION;
  if (Math.floor(prev * 6) !== Math.floor(Math.min(1, dp.washProgress) * 6)) {
    const p = centerOfTile(col, row);
    emit({ kind: 'wash-tick', x: p.x, y: p.y });
  }
  if (dp.washProgress >= 1) {
    tile.item = { kind: 'plate', contents: [] };
    const p = centerOfTile(col, row);
    emit({ kind: 'wash-done', x: p.x, y: p.y });
  }
}

// === Dirty plate queue ===

function updateDirtyPlateQueue(state: GameState): void {
  if (state.dirtyPlateQueue <= 0) return;
  // Try to put dirty plates onto any empty dirty-plate-return tile.
  for (let row = 0; row < state.tiles.length; row++) {
    const r = state.tiles[row]!;
    for (let col = 0; col < r.length; col++) {
      const t = r[col]!;
      if (
        t.kind === 'station' &&
        t.station === 'dirty-plate-return' &&
        t.item === null
      ) {
        t.item = { kind: 'dirty-plate', washProgress: 0 };
        state.dirtyPlateQueue -= 1;
        if (state.dirtyPlateQueue <= 0) return;
      }
    }
  }
}

// === Orders / scoring ===

function updateOrders(state: GameState, dt: number): void {
  for (let i = state.orders.length - 1; i >= 0; i--) {
    const o = state.orders[i]!;
    o.timeRemaining -= dt;
    if (o.timeRemaining <= 0) {
      state.orders.splice(i, 1);
      state.score += PENALTY_EXPIRED;
      emit({ kind: 'order-expired', amount: PENALTY_EXPIRED });
    }
  }

  state.spawnCooldown -= dt;
  if (state.spawnCooldown <= 0 && state.orders.length < MAX_ACTIVE_ORDERS) {
    spawnOrder(state);
    state.spawnCooldown = ORDER_SPAWN_INTERVAL * (0.7 + Math.random() * 0.6);
  }
}

function spawnOrder(state: GameState): void {
  const level = getLevel(state.levelId);
  const ids = level.recipeIds;
  // Weighted pick — heavily prefer recipes not already on the active queue,
  // so the kitchen feels varied. Falls back to uniform if all are active.
  const active = new Set(state.orders.map((o) => o.recipeId));
  const fresh = ids.filter((id) => !active.has(id));
  const pool = fresh.length > 0 ? fresh : ids;
  const recipeId = pool[Math.floor(Math.random() * pool.length)]!;
  state.orders.push({
    id: state.nextOrderId++,
    recipeId,
    timeRemaining: ORDER_TIME_LIMIT,
  });
}

function tryServe(state: GameState, player: Player): void {
  const plate = player.held;
  if (!plate || plate.kind !== 'plate') return;
  for (let i = 0; i < state.orders.length; i++) {
    const order = state.orders[i]!;
    const recipe = recipeById(order.recipeId);
    if (plateMatches(plate, recipe)) {
      const tipMult = tipMultiplier(order.timeRemaining);
      const payment = Math.round(recipe.reward * tipMult);
      state.orders.splice(i, 1);
      state.score += payment;
      player.held = null;
      state.dirtyPlateQueue += 1;
      emit({
        kind: 'serve-success',
        x: player.x,
        y: player.y,
        amount: payment,
        tipped: tipMult > 1,
      });
      return;
    }
  }
  emit({ kind: 'serve-fail', x: player.x, y: player.y });
}

function tipMultiplier(timeRemaining: number): number {
  const ratio = timeRemaining / ORDER_TIME_LIMIT;
  if (ratio > 0.66) return 1.5;
  if (ratio > 0.33) return 1.2;
  return 1.0;
}

function plateMatches(
  plate: Plate,
  recipe: ReturnType<typeof recipeById>
): boolean {
  if (plate.contents.length !== recipe.requirements.length) return false;
  const used = new Array<boolean>(plate.contents.length).fill(false);
  for (const req of recipe.requirements) {
    let matchIdx = -1;
    for (let i = 0; i < plate.contents.length; i++) {
      if (used[i]) continue;
      if (matchesRequirement(plate.contents[i]!, req)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) return false;
    used[matchIdx] = true;
  }
  return true;
}

function matchesRequirement(
  pc: Plate['contents'][number],
  req: ReturnType<typeof recipeById>['requirements'][number]
): boolean {
  if (req.type === 'ingredient') {
    if (pc.kind === 'soup') return false;
    return pc.kind === req.kind && pc.state === req.state;
  }
  // soup requirement
  if (pc.kind !== 'soup') return false;
  return sameIngredients(pc.ingredients, req.ingredients);
}

function sameIngredients(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

