import type { GameState, Player, Tile, Facing } from './types.ts';
import { TILE_SIZE, INITIAL_PLATE_STOCK } from './constants.ts';
import { getLevel, parseLayout } from './data/levels.ts';

const PLAYER_COLORS = ['#3a7be0', '#ff9933']; // P1 blue, P2 orange
const INTRO_COUNTDOWN = 3.0; // seconds of "3-2-1-GO" before gameplay starts

export function createInitialState(levelId: string): GameState {
  const level = getLevel(levelId);
  const tiles = parseLayout(level.layout);
  const players: Player[] = level.spawns.map((spawn, i) => ({
    id: i,
    color: PLAYER_COLORS[i] ?? '#bbb',
    x: (spawn.col + 0.5) * TILE_SIZE,
    y: (spawn.row + 0.5) * TILE_SIZE,
    facing: 'down' as Facing,
    held: null,
    interacting: false,
  }));

  return {
    levelId,
    tiles,
    players,
    orders: [],
    nextOrderId: 1,
    spawnCooldown: 2.0,
    score: 0,
    timeLeft: level.duration,
    phase: 'playing',
    plateStock: level.initialPlateStock ?? INITIAL_PLATE_STOCK,
    dirtyPlateQueue: 0,
    countdown: INTRO_COUNTDOWN,
    projectiles: [],
    floorItems: [],
  };
}

// === Tile accessors ===

export function tileAt(tiles: Tile[][], col: number, row: number): Tile | null {
  if (row < 0 || row >= tiles.length) return null;
  const r = tiles[row]!;
  if (col < 0 || col >= r.length) return null;
  return r[col]!;
}

export function isPassable(tile: Tile | null): boolean {
  return tile?.kind === 'floor' || tile?.kind === 'conveyor';
}

export function pixelToTile(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) };
}

export function facedTile(
  px: number,
  py: number,
  facing: Facing
): { col: number; row: number } {
  const cx = px / TILE_SIZE;
  const cy = py / TILE_SIZE;
  switch (facing) {
    case 'up':    return { col: Math.floor(cx), row: Math.floor(cy - 0.5) };
    case 'down':  return { col: Math.floor(cx), row: Math.floor(cy + 0.5) };
    case 'left':  return { col: Math.floor(cx - 0.5), row: Math.floor(cy) };
    case 'right': return { col: Math.floor(cx + 0.5), row: Math.floor(cy) };
  }
}
