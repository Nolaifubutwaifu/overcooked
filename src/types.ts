// === Tiles ===

export type StationKind =
  | 'counter'
  | 'dispenser-tomato'
  | 'dispenser-lettuce'
  | 'dispenser-onion'
  | 'dispenser-meat'
  | 'dispenser-bun'
  | 'cutting-board'
  | 'stove'
  | 'plate-stack'
  | 'pot-stack'
  | 'sink'
  | 'dirty-plate-return'
  | 'trash'
  | 'serving-window';

export type ConveyorDirection = 'up' | 'down' | 'left' | 'right';

export type Tile =
  | { kind: 'floor' }
  | { kind: 'wall' }
  | { kind: 'station'; station: StationKind; item: Item | null }
  | { kind: 'conveyor'; direction: ConveyorDirection };

// === Ingredients ===

export type IngredientKind = 'tomato' | 'lettuce' | 'onion' | 'meat' | 'bun';

export type IngredientState =
  | 'raw'
  | 'chopping'
  | 'chopped'
  | 'cooking'
  | 'cooked'
  | 'burning'
  | 'burnt';

export type Ingredient = {
  kind: IngredientKind;
  state: IngredientState;
  progress: number;
};

// === Soup (made in a pot) ===

export type Soup = {
  kind: 'soup';
  ingredients: IngredientKind[]; // sorted canonical
};

// === Pot ===

export type PotState = 'idle' | 'cooking' | 'cooked' | 'burnt';

export type Pot = {
  kind: 'pot';
  ingredients: IngredientKind[]; // each chopped + about-to-cook
  state: PotState;
  progress: number; // 0..1 for cooking or burning
};

// === Plates ===

export type PlateContent = Ingredient | Soup;

export type Plate = {
  kind: 'plate';
  contents: PlateContent[];
};

export type DirtyPlate = {
  kind: 'dirty-plate';
  washProgress: number; // 0..1
};

// === Items (anything that can be held / placed on a station) ===

export type Item = Ingredient | Plate | DirtyPlate | Pot | Soup;

// === Player ===

export type Facing = 'up' | 'down' | 'left' | 'right';

export type Player = {
  id: number;
  color: string;
  x: number;
  y: number;
  facing: Facing;
  held: Item | null;
  interacting: boolean;
};

// === Orders / Recipes ===

export type RecipeRequirement =
  | { type: 'ingredient'; kind: IngredientKind; state: 'raw' | 'chopped' | 'cooked' }
  | { type: 'soup'; ingredients: IngredientKind[] }; // sorted canonical

export type Recipe = {
  id: string;
  name: string;
  requirements: RecipeRequirement[];
  reward: number;
};

export type Order = {
  id: number;
  recipeId: string;
  timeRemaining: number;
};

// === Levels ===

export type LevelSpawn = { col: number; row: number };

export type Level = {
  id: string;
  name: string;
  description: string;
  layout: string;
  recipeIds: string[];
  spawns: LevelSpawn[];
  duration: number;
  starThresholds: [number, number, number];
  initialPlateStock?: number;     // override the default starting plate count
  tutorial?: boolean;             // shows the in-game tutorial overlay
  unlockedByDefault?: boolean;    // bypasses the arcade gating
};

// === Thrown projectiles / floor items ===

export type FloorItem = {
  item: Item;
  x: number;
  y: number;
  bobPhase: number;
};

export type Projectile = {
  item: Item;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  t: number;       // 0..1
  duration: number; // seconds to traverse
  landing:
    | { kind: 'station'; col: number; row: number }
    | { kind: 'floor'; col: number; row: number }
    | { kind: 'lost' };
};

// === Game State ===

export type GamePhase = 'playing' | 'finished';

export type GameState = {
  levelId: string;
  tiles: Tile[][];
  players: Player[];
  orders: Order[];
  nextOrderId: number;
  spawnCooldown: number;
  score: number;
  timeLeft: number;
  phase: GamePhase;
  plateStock: number;
  dirtyPlateQueue: number;
  countdown: number;
  projectiles: Projectile[];
  floorItems: FloorItem[];
};
