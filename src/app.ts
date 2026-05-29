import type { GameState } from './types.ts';
import type { InputFrame, InputProvider } from './input.ts';
import { createInitialState } from './state.ts';
import { update as updateGame } from './update.ts';
import { LEVELS, starsForScore, getLevel, isLevelUnlocked } from './data/levels.ts';
import { AudioBus } from './audio.ts';
import { ParticleSystem, type GameEvent } from './effects.ts';
import {
  NetworkClient,
  generateRoomCode,
  normalizeRoomCode,
  getPartyHost,
  type NetStatus,
} from './network.ts';

const HS_KEY = 'overcooked-high-scores-v1';

function loadHighScores(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(HS_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveHighScore(levelId: string, score: number): boolean {
  const hs = loadHighScores();
  if ((hs[levelId] ?? -1) >= score) return false;
  hs[levelId] = score;
  try { localStorage.setItem(HS_KEY, JSON.stringify(hs)); }
  catch { /* ignore */ }
  return true;
}

export type Scene =
  | 'menu'
  | 'level-select'
  | 'playing'
  | 'round-end'
  | 'online-lobby';

export type MainMenuOption = 'local' | 'online-create' | 'online-join';

export const MAIN_MENU: { id: MainMenuOption; label: string }[] = [
  { id: 'local', label: 'Local 2-Player' },
  { id: 'online-create', label: 'Online — Create Room' },
  { id: 'online-join', label: 'Online — Join Room' },
];

export type AppState = {
  scene: Scene;
  game: GameState | null;
  selectedLevelIndex: number;
  selectedMainMenuIndex: number;
  highScores: Record<string, number>;
  lastFinishedScore: number;
  lastNewRecord: boolean;
  particles: ParticleSystem;
  muted: boolean;
  network: NetworkClient | null;
  netStatus: NetStatus | null;
  netError: string | null;
};

function initialAppState(): AppState {
  return {
    scene: 'menu',
    game: null,
    selectedLevelIndex: 0,
    selectedMainMenuIndex: 0,
    highScores: loadHighScores(),
    lastFinishedScore: 0,
    lastNewRecord: false,
    particles: new ParticleSystem(),
    muted: false,
    network: null,
    netStatus: null,
    netError: null,
  };
}

export class App {
  state: AppState = initialAppState();
  private inputs: InputProvider[];
  private audio = new AudioBus();
  private prevAnyConfirm = false;
  private prevAnyBack = false;
  private prevAnyLeft = false;
  private prevAnyRight = false;
  private prevAnyUp = false;
  private prevAnyDown = false;
  private prevMuteHeld = false;

  constructor(inputs: InputProvider[]) {
    this.inputs = inputs;
  }

  tick(dt: number): void {
    const frames = this.inputs.map((p) => p.poll());
    const ui = mergeForUI(frames);

    const muteHeld = isKeyHeld('KeyM');
    if (muteHeld && !this.prevMuteHeld) {
      this.state.muted = this.audio.toggleMute();
    }
    this.prevMuteHeld = muteHeld;

    switch (this.state.scene) {
      case 'menu':         this.updateMenu(ui); break;
      case 'level-select': this.updateLevelSelect(ui); break;
      case 'playing':      this.updatePlaying(frames, dt); break;
      case 'round-end':    this.updateRoundEnd(ui); break;
      case 'online-lobby': this.updateOnlineLobby(ui); break;
    }

    this.state.particles.update(dt);

    this.prevAnyConfirm = ui.confirm;
    this.prevAnyBack = ui.back;
    this.prevAnyLeft = ui.left;
    this.prevAnyRight = ui.right;
    this.prevAnyUp = ui.up;
    this.prevAnyDown = ui.down;
  }

  private updateMenu(ui: UIInput): void {
    if (ui.down && !this.prevAnyDown) {
      this.state.selectedMainMenuIndex =
        (this.state.selectedMainMenuIndex + 1) % MAIN_MENU.length;
      this.audio.play('click');
    }
    if (ui.up && !this.prevAnyUp) {
      this.state.selectedMainMenuIndex =
        (this.state.selectedMainMenuIndex - 1 + MAIN_MENU.length) % MAIN_MENU.length;
      this.audio.play('click');
    }
    if (ui.confirm && !this.prevAnyConfirm) {
      const choice = MAIN_MENU[this.state.selectedMainMenuIndex]!.id;
      switch (choice) {
        case 'local':
          this.audio.play('click');
          this.state.scene = 'level-select';
          break;
        case 'online-create':
          this.audio.play('click');
          this.startOnline(generateRoomCode());
          break;
        case 'online-join': {
          const raw = window.prompt('Enter room code:');
          if (!raw) return;
          const code = normalizeRoomCode(raw);
          if (code.length < 4) {
            window.alert('Code looks too short — should be 4 chars.');
            return;
          }
          this.audio.play('click');
          this.startOnline(code);
          break;
        }
      }
    }
  }

  private startOnline(roomCode: string): void {
    const net = new NetworkClient();
    this.state.network = net;
    this.state.netStatus = 'connecting';
    this.state.netError = null;
    net.onStatusChange = (s) => {
      this.state.netStatus = s;
      if (s === 'room-full') this.state.netError = 'Room is full — try another code.';
    };
    net.onLobby = () => { /* lobby render reads net.lobbyPlayers directly */ };
    net.onLobbyReset = () => {
      this.state.scene = 'online-lobby';
      this.state.game = null;
      this.state.particles.clear();
    };
    net.onState = (snap, events) => {
      this.state.game = snap;
      this.dispatchEvents(events);
      if (this.state.scene === 'online-lobby') {
        // first state snapshot — game has started
        this.state.scene = 'playing';
      }
      if (snap.phase === 'finished' && this.state.scene === 'playing') {
        this.state.lastFinishedScore = snap.score;
        this.state.lastNewRecord = saveHighScore(snap.levelId, snap.score);
        this.state.highScores = loadHighScores();
        this.state.scene = 'round-end';
        this.audio.play(this.state.lastFinishedScore > 0 ? 'ding' : 'fail');
      }
    };
    net.connect(getPartyHost(), roomCode);
    this.state.scene = 'online-lobby';
  }

  private updateLevelSelect(ui: UIInput): void {
    if (ui.left && !this.prevAnyLeft) {
      this.state.selectedLevelIndex =
        (this.state.selectedLevelIndex - 1 + LEVELS.length) % LEVELS.length;
      this.audio.play('click');
    }
    if (ui.right && !this.prevAnyRight) {
      this.state.selectedLevelIndex =
        (this.state.selectedLevelIndex + 1) % LEVELS.length;
      this.audio.play('click');
    }
    if (ui.back && !this.prevAnyBack) {
      this.state.scene = 'menu';
      this.audio.play('click');
    }
    if (ui.confirm && !this.prevAnyConfirm) {
      const idx = this.state.selectedLevelIndex;
      if (!isLevelUnlocked(idx, this.state.highScores)) {
        this.audio.play('fail');
        return;
      }
      const level = LEVELS[idx]!;
      this.state.game = createInitialState(level.id);
      this.state.particles.clear();
      this.state.scene = 'playing';
      this.audio.play('whoosh');
    }
  }

  private updateOnlineLobby(ui: UIInput): void {
    const net = this.state.network;
    if (!net) {
      this.state.scene = 'menu';
      return;
    }

    if (ui.back && !this.prevAnyBack) {
      net.disconnect();
      this.state.network = null;
      this.state.scene = 'menu';
      this.audio.play('click');
      return;
    }

    if (net.isHost && net.lobbyPlayers.length === 2 && ui.confirm && !this.prevAnyConfirm) {
      const idx = this.state.selectedLevelIndex;
      const level = LEVELS[idx] ?? LEVELS[0]!;
      net.startGame(level.id);
      this.audio.play('whoosh');
    }

    if (net.isHost && net.lobbyPlayers.length === 2) {
      if (ui.left && !this.prevAnyLeft) {
        this.state.selectedLevelIndex =
          (this.state.selectedLevelIndex - 1 + LEVELS.length) % LEVELS.length;
        this.audio.play('click');
      }
      if (ui.right && !this.prevAnyRight) {
        this.state.selectedLevelIndex =
          (this.state.selectedLevelIndex + 1) % LEVELS.length;
        this.audio.play('click');
      }
    }
  }

  private updatePlaying(frames: InputFrame[], dt: number): void {
    const net = this.state.network;
    if (net && net.status === 'connected') {
      // Online mode: send local input to server, do NOT run update locally.
      const localInput = frames[0] ?? frames[1] ?? null;
      if (localInput) net.sendInput(localInput);
      // state.game is updated by the network onState callback
      return;
    }

    const g = this.state.game;
    if (!g) return;
    const events = updateGame(g, frames, dt);
    this.dispatchEvents(events);
    if (g.phase === 'finished') {
      this.state.lastFinishedScore = g.score;
      this.state.lastNewRecord = saveHighScore(g.levelId, g.score);
      this.state.highScores = loadHighScores();
      this.state.scene = 'round-end';
      this.audio.play(this.state.lastFinishedScore > 0 ? 'ding' : 'fail');
    }
  }

  private updateRoundEnd(ui: UIInput): void {
    if (ui.confirm && !this.prevAnyConfirm) {
      this.audio.play('click');
      const finishedId = this.state.game?.levelId;
      if (finishedId) {
        const idx = LEVELS.findIndex((l) => l.id === finishedId);
        if (idx >= 0) this.state.selectedLevelIndex = idx;
      }
      const net = this.state.network;
      if (net) {
        net.backToLobby();
        this.state.scene = 'online-lobby';
      } else {
        this.state.scene = 'level-select';
      }
      this.state.game = null;
      this.state.particles.clear();
    }
  }

  private dispatchEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'chop-tick':
          this.state.particles.emit('chop', e.x, e.y, 3);
          this.audio.play('chop');
          break;
        case 'chop-done':
          this.state.particles.emit('chop', e.x, e.y, 6);
          break;
        case 'sizzling':
          this.audio.play('sizzle');
          break;
        case 'cook-done':
          this.audio.play('tick');
          break;
        case 'burnt':
          this.state.particles.emit('smoke', e.x, e.y, 10);
          this.audio.play('fail');
          this.state.particles.emitPopup('BURNT!', '#ff6b6b', e.x, e.y);
          break;
        case 'wash-tick':
          this.state.particles.emit('wash', e.x, e.y, 4);
          break;
        case 'wash-done':
          this.state.particles.emit('wash', e.x, e.y, 12);
          this.audio.play('tick');
          break;
        case 'serve-success':
          this.state.particles.emit('serve', e.x, e.y, 24);
          this.audio.play('ding');
          this.state.particles.emitPopup(
            e.tipped ? `+$${e.amount} TIP!` : `+$${e.amount}`,
            e.tipped ? '#7ad26b' : '#ffd54a',
            e.x,
            e.y - 30
          );
          break;
        case 'serve-fail':
          this.audio.play('whoosh');
          break;
        case 'order-expired':
          this.audio.play('fail');
          this.state.particles.emitPopup(
            `${e.amount > 0 ? '+' : ''}$${e.amount} late!`,
            '#ff6b6b',
            480,
            100
          );
          break;
        case 'countdown-tick':
          this.audio.play('tick');
          break;
      }
    }
  }
}

export type UIInput = {
  confirm: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

function mergeForUI(frames: InputFrame[]): UIInput {
  let confirm = false;
  let back = false;
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  for (const f of frames) {
    if (f.interact || f.use) confirm = true;
    if (f.axis.x < 0) left = true;
    if (f.axis.x > 0) right = true;
    if (f.axis.y < 0) up = true;
    if (f.axis.y > 0) down = true;
  }
  if (isKeyHeld('Escape')) back = true;
  return { confirm, back, left, right, up, down };
}

const heldKeys = new Set<string>();
window.addEventListener('keydown', (e) => heldKeys.add(e.code));
window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());
function isKeyHeld(code: string): boolean {
  return heldKeys.has(code);
}

export { LEVELS, starsForScore, getLevel, isLevelUnlocked };
