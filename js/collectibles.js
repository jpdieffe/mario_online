// ============================================================
//  collectibles.js  –  Coins, Power-ups, Particles, Score Pops
// ============================================================

import { TILE, GRAVITY, MAX_FALL, SPAWN, POWER } from './constants.js';
import { resolveEntity } from './physics.js';
import { Sprites } from './sprites.js';

let _nextId = 1000;

// ── Coin ─────────────────────────────────────────────────

export class Coin {
  constructor(x, y, fromBlock = false) {
    this.id   = _nextId++;
    this.x    = x;
    this.y    = y;
    this.w    = 16;
    this.h    = 16;
    this.dead      = false;
    this._anim     = 0;
    this._animTimer = 0;
    this.vy        = 0;
    this._floating = false;
    this._floatTimer = 0;
    // Block coins bounce up briefly
    if (fromBlock) {
      this.vy = -10;
      this._floating = true;
      this._floatTimer = 40;
    }
  }

  update(dt) {
    this._animTimer += dt;
    if (this._animTimer >= 8) { this._anim = (this._anim + 1) % 2; this._animTimer = 0; }
    if (this._floating) {
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      this.y += this.vy;
      this._floatTimer -= dt;
      if (this._floatTimer <= 0) this.dead = true;
    }
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const spr = this._anim === 0 ? Sprites.COIN_1() : Sprites.COIN_2();
    ctx.drawImage(spr, sx, sy);
  }
}

// ── Power-Up ─────────────────────────────────────────────

export class PowerUp {
  constructor(x, y, type) {
    this.id   = _nextId++;
    this.x    = x;
    this.y    = y;
    this.w    = 28;
    this.h    = 28;
    this.type = type;  // SPAWN.MUSHROOM | SPAWN.FLOWER
    this.dead = false;
    this.onGround = false;
    this.vx = type === SPAWN.MUSHROOM ? 1.5 : 0;
    this.vy = 0;
    this._emerging = true;
    this._emergeTimer = 0;
    this._emergeStartY = y;
  }

  get powerLevel() {
    return this.type === SPAWN.FLOWER ? POWER.FIRE : POWER.BIG;
  }

  update(level, dt) {
    if (this._emerging) {
      this._emergeTimer += dt;
      this.y -= 1;
      if (this._emergeTimer >= TILE) { this._emerging = false; }
      return;
    }

    if (this.type === SPAWN.MUSHROOM) {
      this.onGround = false;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      resolveEntity(this, level);
      if (this.onGround && this.vx === 0) this.vx = 1.5; // unstick
      // Fall off
      if (this.y > level.heightPx + 64) this.dead = true;
    }
    // Flower stays in place
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const spr = this.type === SPAWN.FLOWER ? Sprites.FLOWER() : Sprites.MUSHROOM();
    ctx.drawImage(spr, sx, sy);
  }
}

// ── Particle ─────────────────────────────────────────────
// Used for brick break, score pops, etc.

export class Particle {
  constructor(x, y, vx, vy, color, life = 40) {
    this.x    = x;
    this.y    = y;
    this.vx   = vx;
    this.vy   = vy;
    this.color = color;
    this.life  = life;
    this.maxLife = life;
    this.dead  = false;
    this.w     = 6;
    this.h     = 6;
  }

  update(dt) {
    this.vy += GRAVITY * 0.5 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.fillRect(
      Math.round(this.x - camera.x),
      Math.round(this.y - camera.y),
      this.w, this.h
    );
    ctx.globalAlpha = 1;
  }
}

// ── Score Pop ─────────────────────────────────────────────

export class ScorePop {
  constructor(x, y, text) {
    this.x    = x;
    this.y    = y;
    this.text = text;
    this.life = 50;
    this.dead = false;
  }

  update(dt) {
    this.y -= 0.7 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const alpha = Math.min(1, this.life / 20);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFD800';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, Math.round(this.x - camera.x), Math.round(this.y - camera.y));
    ctx.globalAlpha = 1;
  }
}

// ── Brick break helper ────────────────────────────────────

export function spawnBrickBreak(col, row) {
  const cx = col * TILE + TILE / 2;
  const cy = row * TILE + TILE / 2;
  const parts = [];
  const dirs = [[-2.5, -6], [2.5, -6], [-1.5, -8], [1.5, -8]];
  for (const [vx, vy] of dirs) {
    parts.push(new Particle(cx, cy, vx, vy, '#D01018', 50));
  }
  return parts;
}
