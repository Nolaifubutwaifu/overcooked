// Client-side networking: thin wrapper around PartySocket that exposes a tiny
// event-driven API for the App to drive online play.

import PartySocket from 'partysocket';
import type { GameState } from './types.ts';
import type { InputFrame } from './input.ts';
import type { GameEvent } from './effects.ts';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return s;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export type ServerMessage =
  | { type: 'joined'; slot: number; roomCode: string; isHost: boolean }
  | { type: 'room-full' }
  | { type: 'lobby'; players: number[]; roomCode: string; levelId: string }
  | { type: 'state'; state: GameState; events: GameEvent[] }
  | { type: 'lobby-reset' };

export type NetStatus = 'connecting' | 'connected' | 'closed' | 'room-full';

export class NetworkClient {
  private socket: PartySocket | null = null;
  private inputSeq = 0;
  private inputThrottleMs = 33; // ~30 Hz
  private lastInputSent = 0;

  status: NetStatus = 'connecting';
  mySlot = -1;
  roomCode = '';
  isHost = false;
  lobbyPlayers: number[] = [];
  lastLobbyLevelId = 'first-kitchen';

  onState: ((state: GameState, events: GameEvent[]) => void) | null = null;
  onLobby: ((players: number[]) => void) | null = null;
  onStatusChange: ((s: NetStatus) => void) | null = null;
  onLobbyReset: (() => void) | null = null;

  connect(host: string, roomCode: string): void {
    this.roomCode = roomCode;
    this.status = 'connecting';
    this.onStatusChange?.(this.status);
    this.socket = new PartySocket({
      host,
      room: roomCode,
      party: 'main',
    });
    this.socket.addEventListener('open', () => {
      this.status = 'connected';
      this.onStatusChange?.(this.status);
    });
    this.socket.addEventListener('close', () => {
      if (this.status !== 'room-full') {
        this.status = 'closed';
        this.onStatusChange?.(this.status);
      }
    });
    this.socket.addEventListener('message', (ev: MessageEvent) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      let data: ServerMessage | null = null;
      try {
        data = JSON.parse(text) as ServerMessage;
      } catch {
        return;
      }
      this.handle(data);
    });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined':
        this.mySlot = msg.slot;
        this.roomCode = msg.roomCode;
        this.isHost = msg.isHost;
        break;
      case 'room-full':
        this.status = 'room-full';
        this.onStatusChange?.(this.status);
        this.socket?.close();
        break;
      case 'lobby':
        this.lobbyPlayers = msg.players;
        this.lastLobbyLevelId = msg.levelId;
        this.onLobby?.(msg.players);
        break;
      case 'state':
        this.onState?.(msg.state, msg.events);
        break;
      case 'lobby-reset':
        this.onLobbyReset?.();
        break;
    }
  }

  sendInput(input: InputFrame): void {
    if (!this.socket || this.status !== 'connected') return;
    const now = performance.now();
    if (now - this.lastInputSent < this.inputThrottleMs) return;
    this.lastInputSent = now;
    this.socket.send(
      JSON.stringify({ type: 'input', input, seq: this.inputSeq++ })
    );
  }

  startGame(levelId: string): void {
    this.socket?.send(JSON.stringify({ type: 'start-game', levelId }));
  }

  backToLobby(): void {
    this.socket?.send(JSON.stringify({ type: 'back-to-lobby' }));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.status = 'closed';
  }
}

// Resolve the PartyKit host: dev fallback is localhost; in prod, set VITE_PARTY_HOST.
export function getPartyHost(): string {
  const env = (import.meta as unknown as {
    env?: { VITE_PARTY_HOST?: string };
  }).env;
  return env?.VITE_PARTY_HOST ?? 'localhost:1999';
}
