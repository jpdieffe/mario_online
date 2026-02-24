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

    // Save direction BEFORE resolveEntity zeroes out vx on wall contact
    const prevDir = Math.sign(this.vx) || -1;
    resolveEntity(this, level);

    if (this.hitWall) {
      // Flip using the saved direction and the enemy's own walk speed
      this.vx = -prevDir * (this._spd ?? GOOMBA_SPD);
    }

    // Turn around at tile edges (don't walk off platforms)
    if (this.onGround && this.vx !== 0) {
      const lookDir = Math.sign(this.vx);
      const checkX   = lookDir > 0 ? this.x + this.w + 1 : this.x - 1;
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
      // Koopa shell state (ignored by other enemy types)
      shelled:     this.shelled     ?? false,
      shellMoving: this.shellMoving ?? false,
      h:           this.h,
    };
  }

  applyState(s) {
    this.x      = s.x;
    this.y      = s.y;
    this.vx     = s.vx ?? this.vx;
    this.dead   = s.dead;
    this.remove = s.remove;
    // Koopa-specific shell state
    if (s.shelled !== undefined)     this.shelled     = s.shelled;
    if (s.shellMoving !== undefined) this.shellMoving = s.shellMoving;
    if (s.h !== undefined)           this.h           = s.h;
  }
}

// ── Goomba ────────────────────────────────────────────────

export class Goomba extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 28);
    this.vx   = -GOOMBA_SPD;
    this._spd = GOOMBA_SPD;
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
    this._spd   = KOOPA_SPD;
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
    case 'f': return new FireBro(x, y);
    case 'i': return new IceGoomba(x, y);
    case 'l': return new Lizard(x, y);
    case 'p': return new Flyer(x, y);
    default:  return null;
  }
}

// ── FireBro ───────────────────────────────────────────────
// Stands on a platform, fires fireballs at player-height

export class FireBro extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 32);
    this.vx   = 0;
    this._spd = 0.8;
    this.type = 'FireBro';
    this._fireTimer = 80 + Math.floor(Math.random() * 60);
    this._fireballs = []; // internal projectiles
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    // Slow patrol
    this.vx = (this.vx <= 0 ? -this._spd : this._spd);
    this._physics(level);
    // Fire periodically
    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      this._fireTimer = 90 + Math.floor(Math.random() * 60);
      const dir = this.vx < 0 ? -1 : 1;
      this._fireballs.push({ x: this.x + this.w/2, y: this.y + 10, vx: dir * 4.5, vy: -2, life: 80, r: 6 });
    }
    for (const fb of this._fireballs) {
      fb.x += fb.vx; fb.y += fb.vy; fb.vy += 0.18; fb.life--;
    }
    this._fireballs = this._fireballs.filter(fb => fb.life > 0);
  }

  stomp() {
    if (this.dead) return 0;
    this.dead = true; this.vx = 0; this.vy = 0;
    this._fireballs = [];
    return 200;
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true; this.vy = -6;
    this._fireballs = [];
    return 200;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    // Body
    ctx.fillStyle = this.dead ? '#888' : '#CC2200';
    ctx.fillRect(sx + 3, sy + 8, 20, 24);
    // Head
    ctx.fillStyle = this.dead ? '#888' : '#FF6633';
    ctx.fillRect(sx + 5, sy, 16, 14);
    // Eyes
    if (!this.dead) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 8,  sy + 3, 4, 4);
      ctx.fillRect(sx + 15, sy + 3, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx + 9,  sy + 4, 2, 2);
      ctx.fillRect(sx + 16, sy + 4, 2, 2);
    }
    // Fireballs
    for (const fb of this._fireballs) {
      const fx = fb.x - camera.x;
      const fy = fb.y - camera.y;
      ctx.fillStyle = '#FF8800';
      ctx.beginPath();
      ctx.arc(fx, fy, fb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFDD00';
      ctx.beginPath();
      ctx.arc(fx, fy, fb.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Expose fireballs for game collision code
  getProjectiles() { return this._fireballs; }
}

// ── IceGoomba ─────────────────────────────────────────────
// Like a goomba but blue; freezes player on touch for 1s

export class IceGoomba extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 28);
    this.vx   = -GOOMBA_SPD * 0.8;
    this._spd = GOOMBA_SPD * 0.8;
    this.type = 'IceGoomba';
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = (this.vx < 0 ? -this._spd : this._spd);
    this._physics(level);
  }

  stomp() {
    if (this.dead) return 0;
    this.dead = true; this.vx = 0; this.vy = 0;
    return 150;
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true; this.vy = -6;
    return 150;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) {
      ctx.fillStyle = '#88BBDD';
      ctx.fillRect(sx, sy + 20, 28, 8);
      return;
    }
    // Body
    ctx.fillStyle = '#4499CC';
    ctx.fillRect(sx + 2, sy + 8, 24, 20);
    // Head
    ctx.fillStyle = '#66BBEE';
    ctx.beginPath();
    ctx.ellipse(sx + 14, sy + 8, 11, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 6, sy + 4, 5, 5);
    ctx.fillRect(sx + 17, sy + 4, 5, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 8, sy + 5, 2, 3);
    ctx.fillRect(sx + 19, sy + 5, 2, 3);
    // Ice crystal accent
    ctx.fillStyle = 'rgba(200,240,255,0.7)';
    ctx.fillRect(sx + 10, sy + 14, 3, 6);
    ctx.fillRect(sx + 15, sy + 14, 3, 6);
  }

  /** flag so game.js can apply freeze effect */
  get freezes() { return true; }
}

// ── Lizard (Rex) ─────────────────────────────────────────
// Fast green lizard; stomping once shrinks it, stomping again kills it

export class Lizard extends Enemy {
  constructor(x, y) {
    super(x, y, 30, 34);
    this.vx      = -2.2;
    this._spd    = 2.2;
    this.type    = 'Lizard';
    this._stomps = 0;
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = (this.vx < 0 ? -this._spd : this._spd);
    this._physics(level);
  }

  stomp() {
    if (this.dead) return 0;
    this._stomps++;
    if (this._stomps === 1) {
      // Shrink
      this.h = 18; this.y += 16;
      this._spd = 1.0;
      this.vx   = this.vx < 0 ? -1.0 : 1.0;
      return 100;
    }
    this.dead = true; this.vx = 0; this.vy = 0;
    return 200;
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true; this.vy = -6;
    return 200;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const small = this._stomps >= 1;
    if (this.dead) {
      ctx.fillStyle = '#558833';
      ctx.fillRect(sx + 2, sy + this.h - 10, 26, 10);
      return;
    }
    const bodyH = small ? 10 : 22;
    const headH = small ? 10 : 14;
    ctx.fillStyle = '#44AA22';
    ctx.fillRect(sx + 2, sy + headH, 26, bodyH);
    ctx.fillStyle = '#66CC33';
    ctx.fillRect(sx + 4, sy, 22, headH + 4);
    // Eyes
    if (!small) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 6, sy + 3, 5, 5);
      ctx.fillRect(sx + 19, sy + 3, 5, 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx + 8, sy + 4, 2, 3);
      ctx.fillRect(sx + 21, sy + 4, 2, 3);
    }
    // Spots
    ctx.fillStyle = '#33881A';
    ctx.fillRect(sx + 8,  sy + headH + 4, 5, 5);
    ctx.fillRect(sx + 17, sy + headH + 4, 5, 5);
  }
}

// ── Flyer (Paratroopa) ───────────────────────────────────
// Bounces up and down while moving horizontally; no ground needed

export class Flyer extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 32);
    this.vx       = -1.6;
    this._spd     = 1.6;
    this.type     = 'Flyer';
    this._flyY    = y;   // original spawn Y
    this._flyT    = Math.random() * Math.PI * 2;
    this._hasWings = true;
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    if (this._hasWings) {
      // Fly: sine-wave vertical + horizontal patrol
      this._flyT += 0.06 * dt;
      this.y = this._flyY + Math.sin(this._flyT) * 28;
      // Resolve horizontal only (zero out gravity)
      const origVy = this.vy;
      this.vy = 0;
      this.vx = (this.vx < 0 ? -this._spd : this._spd);
      this._physics(level);
      this.vy = origVy;
    } else {
      // Wings stomped off → walk like a koopa
      this.vx = (this.vx < 0 ? -this._spd : this._spd);
      this._physics(level);
    }
  }

  stomp() {
    if (this.dead) return 0;
    if (this._hasWings) {
      this._hasWings = false;
      this._spd = 1.8;
      return 100;
    }
    this.dead = true; this.vx = 0; this.vy = 0;
    return 200;
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true; this.vy = -7;
    return 200;
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) {
      ctx.fillStyle = '#886622';
      ctx.fillRect(sx + 2, sy + 22, 24, 10);
      return;
    }
    const wf = Math.sin(this._flyT * 3);
    // Shell body
    ctx.fillStyle = '#885500';
    ctx.fillRect(sx + 3, sy + 10, 22, 22);
    ctx.fillStyle = '#AA8833';
    ctx.fillRect(sx + 5, sy + 12, 18, 18);
    // Head
    ctx.fillStyle = '#CC9944';
    ctx.fillRect(sx + 5, sy, 18, 14);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 7, sy + 3, 4, 4);
    ctx.fillRect(sx + 17, sy + 3, 4, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 8, sy + 4, 2, 2);
    ctx.fillRect(sx + 18, sy + 4, 2, 2);
    // Wings
    if (this._hasWings) {
      const wing = 10 + wf * 5;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(sx - 4, sy + 14, wing * 0.5, 8, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + 32, sy + 14, wing * 0.5, 8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
