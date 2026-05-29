// Game events emitted by update() so the App can drive sound + particles
// without coupling game logic to either system.

export type GameEvent =
  | { kind: 'chop-tick'; x: number; y: number }
  | { kind: 'chop-done'; x: number; y: number }
  | { kind: 'cook-done'; x: number; y: number }
  | { kind: 'burnt'; x: number; y: number }
  | { kind: 'sizzling'; x: number; y: number }
  | { kind: 'wash-tick'; x: number; y: number }
  | { kind: 'wash-done'; x: number; y: number }
  | { kind: 'serve-success'; x: number; y: number; amount: number; tipped: boolean }
  | { kind: 'serve-fail'; x: number; y: number }
  | { kind: 'order-expired'; amount: number }
  | { kind: 'countdown-tick' };

// === Particles ===

export type ParticleKind = 'chop' | 'serve' | 'smoke' | 'wash';

export type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // seconds remaining
  maxLife: number;
  size: number;
};

export type ScorePopup = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
};

export class ParticleSystem {
  particles: Particle[] = [];
  popups: ScorePopup[] = [];

  emit(kind: ParticleKind, x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push(spawnParticle(kind, x, y));
    }
  }

  emitPopup(text: string, color: string, x: number, y: number): void {
    this.popups.push({ text, color, x, y, life: 1.3, maxLife: 1.3 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.vy -= 30 * dt;
      else if (p.kind === 'serve') p.vy += 40 * dt;
      else if (p.kind === 'chop') p.vy += 220 * dt;
      else if (p.kind === 'wash') p.vy += 320 * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.y -= 40 * dt;
      p.life -= dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.popups.length = 0;
  }
}

function spawnParticle(kind: ParticleKind, x: number, y: number): Particle {
  switch (kind) {
    case 'chop': {
      const angle = Math.random() * Math.PI - Math.PI; // upward arc
      const speed = 60 + Math.random() * 80;
      return {
        kind,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.6,
        size: 2 + Math.random() * 2,
      };
    }
    case 'serve': {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 80;
      return {
        kind,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.7 + Math.random() * 0.3,
        maxLife: 1.0,
        size: 3 + Math.random() * 2,
      };
    }
    case 'smoke': {
      return {
        kind,
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 30,
        life: 0.9 + Math.random() * 0.4,
        maxLife: 1.3,
        size: 6 + Math.random() * 6,
      };
    }
    case 'wash': {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 100 + Math.random() * 60;
      return {
        kind,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.6,
        size: 2 + Math.random() * 1,
      };
    }
  }
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
): void {
  for (const p of particles) {
    const t = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = t;
    ctx.fillStyle = colorFor(p.kind);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawScorePopups(
  ctx: CanvasRenderingContext2D,
  popups: ScorePopup[]
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const t = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = t;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function colorFor(kind: ParticleKind): string {
  switch (kind) {
    case 'chop':  return '#e8d99a';
    case 'serve': return '#ffd54a';
    case 'smoke': return 'rgba(80,80,80,0.7)';
    case 'wash':  return '#7acfff';
  }
}
