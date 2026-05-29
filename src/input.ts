// Abstract input layer so we can later plug in arrows / phone / gamepad / net.

export type InputFrame = {
  axis: { x: number; y: number };
  interact: boolean;
  interactPressed: boolean;
  use: boolean;
  throwPressed: boolean;          // throw-key edge (Q for P1, . for P2)
};

export interface InputProvider {
  poll(): InputFrame;
}

// Bindings use KeyboardEvent.code (physical key, modifier-independent).
// Multiple codes per action are OR'd together (e.g. ShiftLeft OR ShiftRight).
export type KeyBindings = {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  interact: string[];
  use: string[];
  throw: string[];
};

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Tab',
]);

export class KeyboardInputProvider implements InputProvider {
  private codes = new Set<string>();
  private prevInteract = false;
  private prevThrow = false;
  private bindings: KeyBindings;

  constructor(bindings: KeyBindings) {
    this.bindings = bindings;
    window.addEventListener('keydown', (e) => {
      this.codes.add(e.code);
      if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.codes.delete(e.code);
    });
    window.addEventListener('blur', () => this.codes.clear());
  }

  poll(): InputFrame {
    const has = (codes: string[]) => codes.some((c) => this.codes.has(c));
    let x = 0;
    let y = 0;
    if (has(this.bindings.left)) x -= 1;
    if (has(this.bindings.right)) x += 1;
    if (has(this.bindings.up)) y -= 1;
    if (has(this.bindings.down)) y += 1;

    const interact = has(this.bindings.interact);
    const interactPressed = interact && !this.prevInteract;
    this.prevInteract = interact;
    const use = has(this.bindings.use);

    const throwHeld = has(this.bindings.throw);
    const throwPressed = throwHeld && !this.prevThrow;
    this.prevThrow = throwHeld;

    return { axis: { x, y }, interact, interactPressed, use, throwPressed };
  }
}

export const WASD_BINDINGS: KeyBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  interact: ['KeyE'],
  use: ['Space'],
  throw: ['KeyQ'],
};

export const ARROW_BINDINGS: KeyBindings = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  interact: ['ShiftLeft', 'ShiftRight'],
  use: ['Slash'],
  throw: ['Period'],
};
