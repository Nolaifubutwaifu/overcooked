export const TILE_SIZE = 64;
export const GRID_COLS = 15;
export const GRID_ROWS = 9;

export const HUD_HEIGHT = 96;

export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE;          // 960
export const CANVAS_HEIGHT = HUD_HEIGHT + GRID_ROWS * TILE_SIZE; // 672

export const PLAYER_RADIUS = 22;
export const PLAYER_SPEED = 260; // pixels per second

export const CHOP_DURATION = 2.0;     // seconds of held E to fully chop
export const COOK_DURATION = 5.0;     // seconds for an item on a stove to finish cooking
export const BURN_DURATION = 5.0;     // additional seconds before cooked food burns

export const ROUND_DURATION = 180;    // seconds (3 minutes)

export const ORDER_TIME_LIMIT = 60;   // seconds before an order expires
export const ORDER_SPAWN_INTERVAL = 12; // average seconds between new orders
export const MAX_ACTIVE_ORDERS = 4;

export const REWARD_CORRECT = 20;     // baseline; recipes override per difficulty
export const PENALTY_EXPIRED = -20;   // bigger sting for missed orders

// Phase 3 additions
export const POT_COOK_DURATION = 8.0;   // seconds for pot contents to cook through
export const POT_BURN_DURATION = 8.0;   // seconds after cooked before burning
export const POT_MAX_INGREDIENTS = 3;   // max ingredients a pot can hold
export const WASH_DURATION = 2.5;       // seconds of held use to wash a dirty plate
export const INITIAL_PLATE_STOCK = 4;   // clean plates at round start
export const CONVEYOR_SPEED = 110;      // pixels/second that conveyors push players

// Throwing
export const THROW_MAX_RANGE = 6;   // tiles
export const THROW_DURATION = 0.32; // seconds in-flight
export const FLOOR_PICKUP_RADIUS = 36; // pixels
