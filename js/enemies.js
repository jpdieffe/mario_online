// ============================================================
//  enemies.js  –  Goomba and Koopa entities
// ============================================================

import { GRAVITY, MAX_FALL, TILE } from './constants.js';
import { resolveEntity } from './physics.js';
import { Sprites } from './sprites.js';

const GOOMBA_SPD  = 1.2;
const KOOPA_SPD   = 1.5;
const SHELL_SPD   = 7;
const STOMP_SCORE = 100;
const SHELL_SCORE = 200;

let _nextId = 1;

// ── Base enemy ────────────────────────────────────────────

class Enemy {
  constructor(x, y, w, h) {
    this.id       = _nextId++;
    this.x        = x;
    this.y        = y;
    this.vx       = -GOOMBA_SPD;
    this.vy       = 0;
    this.w        = w;
    this.h        = h;
    this.dead     = false;
    this.remove   = false;   // flag to remove from list after death anim
    this.onGround = false;
    this.hitWall  = false;
    this._anim    = 0;
    this._animTimer = 0;
    this._deathTimer = 0;
  }

  _baseUpdate(level, dt) {
    this._animTimer += dt;
    if (this._animTimer >= 8) { this._anim ^= 1; this._animTimer = 0; }

    if (this.dead) {
      this._deathTimer += dt;
      if (this._deathTimer > 60) this.remove = true;
      return false; // skip physics
    }
    return true; // do physics
  }

  _physics(level) {
    this.onGround = false;
    this.hitWall  = false;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    resolveEntity(this, level);

    if (this.hitWall) this.vx = -this.vx;  // turn around at walls

    // Turn around at tile edges (don't walk off platforms)
    if (this.onGround && this.vx !== 0) {
      const checkX = this.vx > 0 ? this.x + this.w + 1 : this.x - 1;
      const checkCol = Math.floor(checkX / TILE);
      const checkRow = Math.floor((this.y + this.h + 1) / TILE);
      if (!level.isSolid(checkCol, checkRow)) {
        this.vx = -this.vx;
      }
    }

    // Fall off level
    if (this.y > level.heightPx + 64) this.remove = true;
  }

  serialize() {
    return {
      id:   this.id,
      type: this.constructor.name,
      x:    Math.round(this.x),
      y:    Math.round(this.y),
      vx:   +this.vx.toFixed(2),
      dead: this.dead,
      remove: this.remove,
    };
  }

  applyState(s) {
    this.x      = s.x;
    this.y      = s.y;
    this.vx     = s.vx ?? this.vx;
    this.dead   = s.dead;
    this.remove = s.remove;
  }
}

// ── Goomba ────────────────────────────────────────────────

export class Goomba extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 28);
    this.vx = -GOOMBA_SPD;
    this.type = 'Goomba';
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = (this.vx < 0 ? -GOOMBA_SPD : GOOMBA_SPD);
    this._physics(level);
  }

  /** Called when stomped from above. Returns score awarded. */
  stomp() {
    if (this.dead) return 0;
    this.dead = true;
    this.vx   = 0;
    this.vy   = 0;
    return STOMP_SCORE;
  }

  /** Called when hit by fireball or shell. */
  kill() {
    if (this.dead) return 0;
    this.dead = true;
    this.vy   = -6;
    return STOMP_SCORE;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    let spr;
    if (this.dead) {
      spr = Sprites.GOOMBA_FLAT();
    } else {
      spr = this._anim === 0 ? Sprites.GOOMBA_1() : Sprites.GOOMBA_2();
    }
    ctx.drawImage(spr, sx, sy);
  }
}

// ── Koopa ─────────────────────────────────────────────────

export class Koopa extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 36);
    this.vx     = -KOOPA_SPD;
    this.type   = 'Koopa';
    this.shelled = false;  // in shell (not moving)
    this.shellMoving = false;
    this._shellKickTimer = 0;
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;

    if (this.shellMoving) {
      // Fast moving shell
      this._physics(level);
    } else if (!this.shelled) {
      this.vx = (this.vx < 0 ? -KOOPA_SPD : KOOPA_SPD);
      this._physics(level);
    } else {
      // Shell at rest, just gravity
      this.onGround = false;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      resolveEntity(this, level);
    }
  }

  stomp(player) {
    if (this.dead) return 0;
    if (!this.shelled) {
      // First stomp → enter shell
      this.shelled     = true;
      this.shellMoving = false;
      this.vx = 0;
      this.vy = 0;
      this.h  = 24;
      this.y += 12;
      return STOMP_SCORE;
    } else {
      // Kick shell
      const dir = player.x + player.w / 2 < this.x + this.w / 2 ? 1 : -1;
      this.shellMoving = true;
      this.vx = dir * SHELL_SPD;
      return 0;
    }
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true;
    this.vy   = -7;
    return SHELL_SCORE;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    let spr;
    if (this.shelled) {
      spr = Sprites.KOOPA_SHELL();
    } else {
      spr = this._anim === 0 ? Sprites.KOOPA_1() : Sprites.KOOPA_2();
    }
    ctx.drawImage(spr, sx, sy);
  }
}

// ── Factory ───────────────────────────────────────────────

export function createEnemy(type, col, row) {
  const x = col * TILE + 2;
  const y = (row - 1) * TILE;   // spawn one tile above the marker row
  switch (type) {
    case 'G': return new Goomba(x, y);
    case 'K': return new Koopa(x, y);
    default:  return null;
  }
}
