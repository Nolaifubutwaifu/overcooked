import type { Level, Tile, StationKind, ConveyorDirection } from '../types.ts';

// === Layout parser ===

const STATION_FROM_CHAR: Record<string, StationKind> = {
  C: 'counter',
  T: 'dispenser-tomato',
  L: 'dispenser-lettuce',
  O: 'dispenser-onion',
  M: 'dispenser-meat',
  N: 'dispenser-bun',
  X: 'cutting-board',
  S: 'stove',
  P: 'plate-stack',
  Q: 'pot-stack',
  K: 'sink',
  D: 'dirty-plate-return',
  B: 'trash',
  R: 'serving-window',
};

const CONVEYOR_FROM_CHAR: Record<string, ConveyorDirection> = {
  '^': 'up',
  v: 'down',
  '<': 'left',
  '>': 'right',
};

export function parseLayout(layout: string): Tile[][] {
  const rows = layout.trim().split('\n');
  return rows.map((row) =>
    [...row].map((ch): Tile => {
      if (ch === '#') return { kind: 'wall' };
      if (ch === '.') return { kind: 'floor' };
      const conv = CONVEYOR_FROM_CHAR[ch];
      if (conv) return { kind: 'conveyor', direction: conv };
      const station = STATION_FROM_CHAR[ch];
      if (!station) throw new Error(`Unknown tile char: '${ch}'`);
      return { kind: 'station', station, item: null };
    })
  );
}

// === Level definitions ===

export const LEVELS: Level[] = [
  {
    id: 'tutorial',
    name: 'Tutorial',
    description: 'Learn the basics — make a salad.',
    layout: `
###############
#TLCCCCCCCCCCC#
#.............#
#.............#
#.............#
#.............#
#.............#
#XXCPCBCCCCCRC#
###############
    `,
    recipeIds: ['salad'],
    spawns: [
      { col: 4, row: 4 },
      { col: 10, row: 4 },
    ],
    duration: 240,
    starThresholds: [20, 40, 80],
    initialPlateStock: 99,
    tutorial: true,
    unlockedByDefault: true,
  },

  {
    id: 'first-kitchen',
    name: 'First Kitchen',
    description: 'A roomy kitchen — get the basics down.',
    layout: `
###############
#TOLMNCCCCCCCC#
#.............#
#.............#
#.............#
#.............#
#.............#
#XXCKPSSBQCCRD#
###############
    `,
    recipeIds: ['salad', 'steak', 'steak-salad', 'onion-soup', 'burger'],
    spawns: [
      { col: 5, row: 4 },
      { col: 9, row: 4 },
    ],
    duration: 180,
    starThresholds: [80, 150, 240],
  },

  {
    id: 'conveyor-chaos',
    name: 'Conveyor Chaos',
    description: 'Twin conveyor belts shove you around the kitchen.',
    layout: `
###############
#TOLMNCCCCCCCC#
#.............#
#.>>>>>>>>>>..#
#.............#
#.<<<<<<<<<<..#
#.............#
#XXCKPSSBQCCRD#
###############
    `,
    recipeIds: ['salad', 'steak', 'steak-salad', 'onion-soup', 'tomato-soup', 'burger'],
    spawns: [
      { col: 2, row: 4 },
      { col: 12, row: 4 },
    ],
    duration: 180,
    starThresholds: [100, 180, 280],
  },

  {
    id: 'split-kitchen',
    name: 'Split Kitchen',
    description: 'A wall divides the kitchen. Hand off through the pass.',
    layout: `
###############
#TOLMNCCCCCCCC#
#.....C.......#
#.....C.......#
#.....C.......#
#.....C.......#
#.....C.......#
#XXCKPCSSBQCRD#
###############
    `,
    recipeIds: ['salad', 'steak-salad', 'onion-soup', 'tomato-soup', 'veggie-soup', 'burger'],
    spawns: [
      { col: 2, row: 4 },
      { col: 9, row: 4 },
    ],
    duration: 180,
    starThresholds: [120, 220, 340],
  },
];

export function getLevel(id: string): Level {
  const lvl = LEVELS.find((l) => l.id === id);
  if (!lvl) throw new Error(`Unknown level: ${id}`);
  return lvl;
}

export function starsForScore(level: Level, score: number): 0 | 1 | 2 | 3 {
  const [s1, s2, s3] = level.starThresholds;
  if (score >= s3) return 3;
  if (score >= s2) return 2;
  if (score >= s1) return 1;
  return 0;
}

// Score needed to unlock the *next* level after this one. Use 1-star threshold.
export function unlockScoreFor(level: Level): number {
  return level.starThresholds[0];
}

// Index in LEVELS array → unlocked or not, given high scores.
export function isLevelUnlocked(
  index: number,
  highScores: Record<string, number>
): boolean {
  const lvl = LEVELS[index];
  if (!lvl) return false;
  if (lvl.unlockedByDefault) return true;
  if (index === 0) return true;
  const prev = LEVELS[index - 1]!;
  return (highScores[prev.id] ?? -Infinity) >= unlockScoreFor(prev);
}
