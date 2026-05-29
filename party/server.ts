import type * as Party from 'partykit/server';
import type { GameState } from '../src/types.ts';
import type { InputFrame } from '../src/input.ts';
import type { GameEvent } from '../src/effects.ts';
import { createInitialState } from '../src/state.ts';
import { update } from '../src/update.ts';

type SlotInfo = { slot: number; lastInput: InputFrame };

const EMPTY_INPUT: InputFrame = {
  axis: { x: 0, y: 0 },
  interact: false,
  interactPressed: false,
  use: false,
  throwPressed: false,
};

const TICK_HZ = 30;

export default class GameServer implements Party.Server {
  state: GameState | null = null;
  slots = new Map<string, SlotInfo>();
  inputs: InputFrame[] = [EMPTY_INPUT, EMPTY_INPUT];
  tickTimer: ReturnType<typeof setInterval> | null = null;
  levelId = 'first-kitchen';
  room: Party.Room;

  constructor(room: Party.Room) {
    this.room = room;
  }

  onConnect(conn: Party.Connection): void {
    const used = new Set([...this.slots.values()].map((s) => s.slot));
    let slot = -1;
    if (!used.has(0)) slot = 0;
    else if (!used.has(1)) slot = 1;

    if (slot === -1) {
      conn.send(JSON.stringify({ type: 'room-full' }));
      conn.close();
      return;
    }

    this.slots.set(conn.id, { slot, lastInput: EMPTY_INPUT });
    conn.send(
      JSON.stringify({
        type: 'joined',
        slot,
        roomCode: this.room.id,
        isHost: slot === 0,
      })
    );
    this.broadcastLobby();

    // If we're already mid-game, send a fresh snapshot to the joiner immediately.
    if (this.state) {
      conn.send(JSON.stringify({ type: 'state', state: this.state, events: [] }));
    }
  }

  onMessage(message: string, conn: Party.Connection): void {
    let data: unknown;
    try { data = JSON.parse(message); } catch { return; }
    if (!data || typeof data !== 'object') return;
    const info = this.slots.get(conn.id);
    if (!info) return;
    const d = data as Record<string, unknown>;

    if (d['type'] === 'input' && d['input']) {
      info.lastInput = sanitizeInput(d['input']);
      this.inputs[info.slot] = info.lastInput;
      return;
    }

    if (d['type'] === 'start-game' && typeof d['levelId'] === 'string') {
      if (info.slot !== 0) return; // only host starts
      this.levelId = d['levelId'];
      this.state = createInitialState(this.levelId);
      this.startTick();
      this.broadcastState([]);
      return;
    }

    if (d['type'] === 'back-to-lobby') {
      if (info.slot !== 0) return;
      this.stopTick();
      this.state = null;
      this.room.broadcast(JSON.stringify({ type: 'lobby-reset' }));
      this.broadcastLobby();
    }
  }

  onClose(conn: Party.Connection): void {
    const info = this.slots.get(conn.id);
    this.slots.delete(conn.id);
    if (info) this.inputs[info.slot] = EMPTY_INPUT;
    if (this.slots.size === 0) {
      this.stopTick();
      this.state = null;
    } else {
      this.broadcastLobby();
    }
  }

  private broadcastLobby(): void {
    const players = [...this.slots.values()]
      .map((s) => s.slot)
      .sort((a, b) => a - b);
    this.room.broadcast(
      JSON.stringify({
        type: 'lobby',
        players,
        roomCode: this.room.id,
        levelId: this.levelId,
      })
    );
  }

  private startTick(): void {
    if (this.tickTimer) return;
    const dt = 1 / TICK_HZ;
    this.tickTimer = setInterval(() => {
      if (!this.state) return;
      if (this.state.phase === 'finished') {
        // hold a final snapshot, then stop
        this.broadcastState([]);
        this.stopTick();
        return;
      }
      const events = update(this.state, this.inputs, dt);
      this.broadcastState(events);
    }, 1000 / TICK_HZ);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private broadcastState(events: GameEvent[]): void {
    if (!this.state) return;
    this.room.broadcast(
      JSON.stringify({ type: 'state', state: this.state, events })
    );
  }
}

function sanitizeInput(input: unknown): InputFrame {
  const d = (input ?? {}) as Record<string, unknown>;
  const axis = (d['axis'] ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return {
    axis: { x: num(axis['x']), y: num(axis['y']) },
    interact: !!d['interact'],
    interactPressed: !!d['interactPressed'],
    use: !!d['use'],
    throwPressed: !!d['throwPressed'],
  };
}
