// ============================================================
//  player.js  –  Mario / Luigi player entity
// ============================================================

import {
  TILE, GRAVITY, MAX_FALL, WALK_SPD, RUN_SPD,
  JUMP_VEL, JUMP_HOLD_FRAMES, GRAVITY_RISE, GRAVITY_FALL, POWER, PSTATE,
} from './constants.js';
import { resolveEntity, levelBoundaryCheck } from './physics.js';
import { Sprites, flipH } from './sprites.js';
import { InventorySlot } from './items.js';

const SMALL_W = 24;
const SMALL_H = 28;
const BIG_W   = 24;
const BIG_H   = 28;  // same height – sprite stays on ground, no floating
const INVULN_FRAMES = 120;
const WALK_ANIM_SPD = 6;  // frames per step
const FIRE_COOLDOWN = 24;

export class Player {
  constructor(id, isLuigi, spawnX, spawnY) {
    this.id       = id;       // 0 = P1 Mario, 1 = P2 Luigi
    this.isLuigi  = isLuigi;
    this.power    = POWER.SMALL;
    this.lives    = 3;
    this.coins    = 0;
    this.score    = 0;

    this.x  = spawnX;
    this.y  = spawnY;
    this.vx = 0;
    this.vy = 0;

    this.w = SMALL_W;
    this.h = SMALL_H;

    this.facingRight = true;
    this.state       = PSTATE.IDLE;
    this.onGround    = false;
    this.hitCeiling  = false;
    this.hitWall     = false;

    this.dead         = false;
    this.deadTimer    = 0;
    this.invuln       = 0;
    this.stompGrace   = 0;  // brief immunity after a stomp
    this.flashOn      = false;
    this.jumpHold     = 0;
    this.animFrame    = 0;
    this.animTimer    = 0;
    this.isRunning    = false;
    this.fireCooldown = 0;

    this._fireballs   = [];  // owned fireballs
    this._prevY       = 0;
    this._spawnX      = spawnX;
    this._spawnY      = spawnY;

    // Inventory (max 5 slots)
    this.inventory   = [];   // array of InventorySlot
    this.activeSlot  = 0;
    // Grapple state (hook instance managed by game.js)
    this.grappleHook = null;
    // Sword cooldown
    this._swordCooldown = 0;
    // Machine gun rapid-fire timer
    this._gunTimer = 0;
  }

  /** Add an item to inventory. Returns true if added (false if full). */
  addItem(type) {
    if (this.inventory.length >= 5) return false;
    this.inventory.push(new InventorySlot(type));
    return true;
  }

  /** Get active inventory slot object, or null. */
  getActiveSlot() {
    return this.inventory[this.activeSlot] ?? null;
  }

  /** Consume one ammo from active slot; removes slot if depleted. Returns consumed item type or null. */
  consumeActiveAmmo() {
    const slot = this.getActiveSlot();
    if (!slot) return null;
    const type = slot.type;
    if (!slot.infinite) {
      slot.ammo--;
      if (slot.ammo <= 0) {
        this.inventory.splice(this.activeSlot, 1);
        if (this.activeSlot >= this.inventory.length) this.activeSlot = Math.max(0, this.inventory.length - 1);
      }
    }
    return type;
  }

  get big() { return this.power >= POWER.BIG; }

  /** Update with local input (Input snapshot object). */
  update(input, level, dt = 1) {
    if (this.dead) {
      this._updateDead(level, dt);
      return;
    }

    this._prevY = this.y;
    this._updateInvuln(dt);
    if (this.stompGrace > 0) this.stompGrace -= dt;
    this._handleInput(input, dt);
    this._applyGravity(dt);
    this._resolveCollisions(level);
    this._updateState();
    this._updateAnimation(dt);
    this._updateFireballs(level, dt);

    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // Fell off level
    if (levelBoundaryCheck(this, level)) {
      this.kill(false);
    }
  }

  _handleInput(input, dt) {
    const spd = input.run ? RUN_SPD : WALK_SPD;
    const airControl = 0.85;

    if (input.left) {
      const target = -spd;
      if (this.onGround) {
        this.vx += (target - this.vx) * 0.25;
      } else {
        this.vx += (target - this.vx) * 0.12 * airControl;
      }
      this.facingRight = false;
    } else if (input.right) {
      const target = spd;
      if (this.onGround) {
        this.vx += (target - this.vx) * 0.25;
      } else {
        this.vx += (target - this.vx) * 0.12 * airControl;
      }
      this.facingRight = true;
    } else {
      // Friction / deceleration
      if (this.onGround) {
        this.vx *= 0.72;
      } else {
        this.vx *= 0.96;
      }
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
    }

    // Jump
    if (input.jump) {
      if (this.onGround) {
        this.vy       = JUMP_VEL;
        this.onGround = false;
        this.jumpHold = JUMP_HOLD_FRAMES;
      } else if (this.jumpHold > 0) {
        // Hold jump for higher arc
        this.vy += JUMP_VEL * 0.06;
        this.jumpHold -= dt;
      }
    } else {
      this.jumpHold = 0;
      // Cut jump short
      if (this.vy < -4) this.vy = Math.max(this.vy, -4);
    }

    // Fire
    if (input.fire && this.power === POWER.FIRE && this.fireCooldown <= 0) {
      this._spawnFireball();
      this.fireCooldown = FIRE_COOLDOWN;
    }

    this.isRunning = input.run;
  }

  _applyGravity(dt) {
    // Asymmetric gravity: floaty on the way up, snappier on the way down
    const g = this.vy < 0 ? GRAVITY_RISE : GRAVITY_FALL;
    this.vy = Math.min(this.vy + g * dt, MAX_FALL);
  }

  _resolveCollisions(level) {
    this.onGround   = false;
    this.hitCeiling = false;
    this.hitWall    = false;

    const blocksHit = resolveEntity(this, level);

    // Block hits from below (question blocks, bricks)
    for (const { col, row } of blocksHit) {
      const item = level.hitBlock(col, row);
      if (item) this._onBlockHit(item, col, row, level);
    }
  }

  _onBlockHit(item, col, row, level) {
    // Emit event to game for item spawning – we use a queued event
    this._events = this._events || [];
    this._events.push({ type: 'BLOCK_HIT', item, col, row });
  }

  _updateState() {
    if (this.onGround) {
      if (Math.abs(this.vx) < 0.2)  this.state = PSTATE.IDLE;
      else if (this.isRunning)       this.state = PSTATE.RUN;
      else                           this.state = PSTATE.WALK;
    } else {
      this.state = this.vy < 0 ? PSTATE.JUMP : PSTATE.FALL;
    }
  }

  _updateAnimation(dt) {
    this.animTimer += dt;
    if (this.animTimer >= WALK_ANIM_SPD) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 3;
    }
    this.flashOn = Math.floor(this.invuln / 5) % 2 === 0;
  }

  _updateInvuln(dt) {
    if (this.invuln > 0) this.invuln -= dt;
  }

  _updateFireballs(level, dt) {
    this._fireballs = this._fireballs.filter(fb => {
      fb.update(level, dt);
      return !fb.dead;
    });
  }

  _spawnFireball() {
    const dir = this.facingRight ? 1 : -1;
    this._fireballs.push(new Fireball(
      this.x + (this.facingRight ? this.w : -8),
      this.y + this.h / 2,
      dir
    ));
  }

  /** Called when hit by enemy or hazard. */
  hurt() {
    if (this.invuln > 0 || this.dead) return;
    if (this.power === POWER.SMALL) {
      this.kill(false);
    } else {
      this.power = POWER.SMALL;
      this.w = SMALL_W;
      this.h = SMALL_H;  // no y-shift needed (same height)
      this.invuln = INVULN_FRAMES;
      this._events = this._events || [];
      this._events.push({ type: 'HURT' });
    }
  }

  kill(fallen = false) {
    if (this.dead) return;
    this.dead     = true;
    this.deadTimer = 0;
    this._deathHandled = false;
    this.vx = 0;
    this.vy = fallen ? 0 : -10;
    this._events = this._events || [];
    this._events.push({ type: 'DIED' });
  }

  _updateDead(level, dt) {
    this.deadTimer += dt;
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    this.y += this.vy;
    if (this.deadTimer > 180 && !this._deathHandled) {
      this._deathHandled = true;
      if (this.lives > 1) {
        this.lives--;
        this.respawn();
      } else {
        this.lives = 0;
        this._events = this._events || [];
        this._events.push({ type: 'GAME_OVER' });
      }
    }
  }

  respawn() {
    this.dead    = false;
    this.deadTimer = 0;
    this._deathHandled = false;
    this.x       = this._spawnX;
    this.y       = this._spawnY;
    this.vx      = 0;
    this.vy      = 0;
    this.power   = POWER.SMALL;
    this.w       = SMALL_W;
    this.h       = SMALL_H;
    this.invuln  = INVULN_FRAMES;
    this.onGround = false;
  }

  grow(newPower) {
    if (newPower <= this.power) return;
    this.power = newPower;
    // w/h stay the same (BIG_H === SMALL_H); sprite changes visually
    this.w = BIG_W;
    this.h = BIG_H;
  }

  drainEvents() {
    const evts = this._events || [];
    this._events = [];
    return evts;
  }

  /** === DRAWING === */
  draw(ctx, camera) {
    if (this.dead && this.deadTimer > 180) return;
    if (this.invuln > 0 && !this.flashOn) return;

    const sx = this.x - camera.x;
    const sy = this.y - camera.y;

    const bigOff = 0; // hitbox and sprite are the same height now

    let sprFn;
    if (this.isLuigi) {
      if (this.dead)                        sprFn = Sprites.LUIGI_IDLE_R;
      else if (this.state === PSTATE.JUMP || this.state === PSTATE.FALL)
                                            sprFn = Sprites.LUIGI_JUMP_R;
      else if (this.animFrame === 1 && this.state !== PSTATE.IDLE)
                                            sprFn = Sprites.LUIGI_WALK1_R;
      else                                  sprFn = Sprites.LUIGI_IDLE_R;
    } else {
      if (this.dead)                        sprFn = Sprites.MARIO_IDLE_R;
      else if (this.state === PSTATE.JUMP || this.state === PSTATE.FALL)
                                            sprFn = this.big ? Sprites.MARIO_BIG_R : Sprites.MARIO_JUMP_R;
      else if (this.animFrame === 1 && this.state !== PSTATE.IDLE)
                                            sprFn = this.big ? Sprites.MARIO_BIG_R : Sprites.MARIO_WALK1_R;
      else                                  sprFn = this.big ? Sprites.MARIO_BIG_R : Sprites.MARIO_IDLE_R;
    }

    let spr = sprFn();
    if (!this.facingRight) spr = flipH(spr);

    // Center sprite on entity bounding box
    const drawX = sx + (this.w - spr.width)  / 2;
    const drawY = sy + (this.h - spr.height) / 2 + bigOff;
    ctx.drawImage(spr, Math.round(drawX), Math.round(drawY));

    // Player label
    ctx.fillStyle = this.isLuigi ? '#50C840' : '#D01018';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.isLuigi ? 'P2' : 'P1', sx + this.w / 2, sy - 4);

    // Draw fireballs
    for (const fb of this._fireballs) fb.draw(ctx, camera);
  }

  /** Serialise for network sync. */
  serialize() {
    return {
      id:    this.id,
      x:     Math.round(this.x),
      y:     Math.round(this.y),
      vx:    +this.vx.toFixed(2),
      vy:    +this.vy.toFixed(2),
      state: this.state,
      power: this.power,
      facingRight: this.facingRight,
      onGround:    this.onGround,
      dead:        this.dead,
      invuln:      Math.round(this.invuln),
      coins:       this.coins,
      lives:       this.lives,
      score:       this.score,
      activeSlot:  this.activeSlot,
      inventory:   this.inventory.map(s => ({ type: s.type, ammo: s.ammo })),
    };
  }

  /** Apply auth state from host.
   * Hard-snap non-position fields; lerp x/y to avoid tab-switch teleporting. */
  applyState(s) {
    // Position: lerp if close, snap if far (tab was hidden = large gap)
    const dx = s.x - this.x;
    const dy = s.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 120) {
      // Far off – hard snap (first sync or respawn)
      this.x = s.x;
      this.y = s.y;
    } else {
      // Smooth correction
      this.x += dx * 0.25;
      this.y += dy * 0.25;
    }
    this.vx   = s.vx;
    this.vy   = s.vy;
    this.state = s.state;
    if (s.power !== undefined && s.power !== this.power) {
      this.power = s.power;
      this.w = BIG_W;  // same for both states
      this.h = BIG_H;
    }
    this.facingRight = s.facingRight;
    this.onGround    = s.onGround;
    this.dead        = s.dead;
    this.invuln      = s.invuln ?? this.invuln;
    this.coins       = s.coins  ?? this.coins;
    this.lives       = s.lives  ?? this.lives;
    this.score       = s.score  ?? this.score;
    if (s.inventory) {
      this.inventory  = s.inventory.map(i => { const sl = new InventorySlot(i.type); sl.ammo = i.ammo; return sl; });
      this.activeSlot = s.activeSlot ?? this.activeSlot;
    }
  }
}

// ── Fireball ──────────────────────────────────────────────

class Fireball {
  constructor(x, y, dir) {
    this.x   = x;
    this.y   = y;
    this.vx  = dir * 8;
    this.vy  = -3;
    this.w   = 12;
    this.h   = 12;
    this.dead     = false;
    this.onGround = false;
    this.hitWall  = false;
    this.hitCeiling = false;
    this._anim = 0;
  }

  update(level, dt) {
    this._anim += dt;
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);

    // Reset collision flags before resolve
    this.onGround   = false;
    this.hitWall    = false;
    this.hitCeiling = false;

    resolveEntity(this, level);

    // Bounce off floor
    if (this.onGround)   { this.vy = -6; this.onGround = false; }
    if (this.hitWall || this.hitCeiling) { this.dead = true; }

    // Timeout
    if (this.x < 0 || this.x > 9999) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    let spr = Sprites.FIREBALL();
    ctx.drawImage(spr, sx, sy);
  }

  get bounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
