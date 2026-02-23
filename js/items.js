// ============================================================
//  items.js  –  inventory items, pickups, projectiles
// ============================================================

import { GRAVITY, MAX_FALL, TILE } from './constants.js';
import { resolveEntity } from './physics.js';

// ── Item type keys ────────────────────────────────────────

export const ITEM = {
  MACHINE_GUN: 'machine_gun',
  ROCKET:      'rocket',
  GRENADE:     'grenade',
  GRAPPLE:     'grapple',
  SWORD:       'sword',
  PENCIL:      'pencil',
};

export const ITEM_MAX_AMMO = {
  [ITEM.MACHINE_GUN]: 40,
  [ITEM.ROCKET]:      5,
  [ITEM.GRENADE]:     4,
  [ITEM.GRAPPLE]:     Infinity,
  [ITEM.SWORD]:       Infinity,
  [ITEM.PENCIL]:      Infinity,
};

export const ITEM_ICON = {
  [ITEM.MACHINE_GUN]: '🔫',
  [ITEM.ROCKET]:      '🚀',
  [ITEM.GRENADE]:     '💣',
  [ITEM.GRAPPLE]:     '🪝',
  [ITEM.SWORD]:       '⚔️',
  [ITEM.PENCIL]:      '✏️',
};

// Weapon crate drop table – drawn randomly when crate is picked up
export const CRATE_DROPS = [
  ITEM.MACHINE_GUN, ITEM.MACHINE_GUN,
  ITEM.ROCKET,
  ITEM.GRENADE, ITEM.GRENADE,
  ITEM.GRAPPLE,
  ITEM.SWORD,
  ITEM.PENCIL,
];

let _nid = 8000;

// ── Inventory slot ────────────────────────────────────────

export class InventorySlot {
  constructor(type) {
    this.type = type;
    this.ammo = ITEM_MAX_AMMO[type];
  }
  get infinite() { return this.ammo === Infinity; }
  consume(n = 1) {
    if (this.ammo !== Infinity) this.ammo -= n;
    return this.ammo <= 0;  // true = depleted
  }
}

// ── World pick-up crate ───────────────────────────────────

export class WeaponCrate {
  constructor(x, y) {
    this.id   = _nid++;
    this.x    = x;
    this.y    = y;
    this.w    = 28;
    this.h    = 28;
    this.dead = false;
    this._bob = 0;
  }

  update(dt) { this._bob = (this._bob + dt * 0.08) % (Math.PI * 2); }

  draw(ctx, cam) {
    if (this.dead) return;
    const x = this.x - cam.x;
    const y = this.y - cam.y + Math.sin(this._bob) * 3;
    // Crate body
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, this.w, this.h);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, this.w - 2, this.h - 2);
    // Cross straps
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + this.h / 2); ctx.lineTo(x + this.w, y + this.h / 2);
    ctx.moveTo(x + this.w / 2, y); ctx.lineTo(x + this.w / 2, y + this.h);
    ctx.stroke();
    // Question mark
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('?', x + this.w / 2, y + this.h - 8);
  }
}

// ── Bullet (machine gun) ──────────────────────────────────

export class Bullet {
  constructor(x, y, angle, ownerId) {
    this.id = _nid++;
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 15;
    this.vy = Math.sin(angle) * 15;
    this.w  = 5; this.h = 5;
    this.dead = false;
    this.ownerId = ownerId;
    this._life = 55;
  }

  update(level) {
    if (this.dead) return;
    if (--this._life <= 0) { this.dead = true; return; }
    this.x += this.vx;
    this.y += this.vy;
    const col = Math.floor((this.x + 2) / TILE);
    const row = Math.floor((this.y + 2) / TILE);
    if (level.isSolid(col, row)) this.dead = true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    ctx.fillStyle = '#FFE44A';
    ctx.fillRect(this.x - cam.x, this.y - cam.y, this.w, this.h);
  }
}

// ── Rocket ────────────────────────────────────────────────

export class Rocket {
  constructor(x, y, angle, ownerId) {
    this.id = _nid++;
    this.x  = x; this.y = y;
    this.angle = angle;
    this.vx = Math.cos(angle) * 5;
    this.vy = Math.sin(angle) * 5;
    this.w  = 12; this.h = 8;
    this.dead = false;
    this._exploded = false;
    this.ownerId = ownerId;
    this._trail = [];
    this._life = 220;
  }

  update(level) {
    if (this.dead) return;
    if (--this._life <= 0) { this._triggerExplode(); return; }
    this._trail.push({ x: this.x + this.w / 2, y: this.y + this.h / 2 });
    if (this._trail.length > 10) this._trail.shift();
    this.x += this.vx;
    this.y += this.vy;
    const col = Math.floor((this.x + this.w / 2) / TILE);
    const row = Math.floor((this.y + this.h / 2) / TILE);
    if (level.isSolid(col, row)) this._triggerExplode();
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  _triggerExplode() { this.dead = true; this._exploded = true; }

  draw(ctx, cam) {
    if (this.dead) return;
    // Trail
    for (let i = 0; i < this._trail.length; i++) {
      const t = this._trail[i];
      ctx.globalAlpha = (i / this._trail.length) * 0.6;
      ctx.fillStyle = '#FF6600';
      const r = 1 + 3 * (i / this._trail.length);
      ctx.beginPath();
      ctx.arc(t.x - cam.x, t.y - cam.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(this.x - cam.x + this.w / 2, this.y - cam.y + this.h / 2);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#CC3300';
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 + 7, -4);
    ctx.lineTo(this.w / 2 + 7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ── Grenade ───────────────────────────────────────────────

export class GrenadeProj {
  constructor(x, y, vx, vy, ownerId) {
    this.id = _nid++;
    this.x  = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.w  = 10; this.h = 10;
    this.onGround = false;
    this.hitWall  = false;
    this.dead      = false;
    this._exploded = false;
    this.ownerId   = ownerId;
    this._fuse     = 180;  // 3 sec @ 60fps
  }

  update(level) {
    if (this.dead) return;
    if (--this._fuse <= 0) { this._triggerExplode(); return; }
    this.onGround = false;
    this.hitWall  = false;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    // X move
    this.x += this.vx;
    let col = Math.floor((this.x + this.w / 2) / TILE);
    let row = Math.floor((this.y + this.h / 2) / TILE);
    if (level.isSolid(col, row)) { this.x -= this.vx; this.vx *= -0.55; }
    // Y move
    this.y += this.vy;
    const rowBot = Math.floor((this.y + this.h) / TILE);
    col = Math.floor((this.x + this.w / 2) / TILE);
    if (level.isSolid(col, rowBot)) {
      this.y = rowBot * TILE - this.h;
      this.vy *= -0.4;
      this.vx *= 0.8;
      this.onGround = true;
    }
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  _triggerExplode() { this.dead = true; this._exploded = true; }

  draw(ctx, cam) {
    if (this.dead) return;
    const flash = this._fuse < 60 && Math.floor(this._fuse / 5) % 2 === 0;
    ctx.fillStyle = flash ? '#FF4400' : '#333333';
    ctx.beginPath();
    ctx.arc(this.x - cam.x + this.w / 2, this.y - cam.y + this.h / 2, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FF8800'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - cam.x + this.w / 2, this.y - cam.y);
    ctx.lineTo(this.x - cam.x + this.w / 2 + 3, this.y - cam.y - 7);
    ctx.stroke();
  }
}

// ── Explosion ─────────────────────────────────────────────

export class Explosion {
  constructor(x, y, radius = 80) {
    this.id        = _nid++;
    this.cx        = x; this.cy = y;
    this.maxRadius = radius;
    this.radius    = 0;
    this.timer     = 22;
    this.dead      = false;
    // For overlap checks – expose as AABB
    this.x = x - radius; this.y = y - radius;
    this.w = radius * 2; this.h = radius * 2;
  }

  overlapsPoint(px, py) {
    const dx = px - this.cx, dy = py - this.cy;
    return Math.sqrt(dx * dx + dy * dy) <= this.radius;
  }

  update() {
    this.timer--;
    this.radius = this.maxRadius * (1 - this.timer / 22);
    if (this.timer <= 0) this.dead = true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const alpha = Math.max(0, this.timer / 22);
    ctx.globalAlpha = alpha * 0.85;
    const grd = ctx.createRadialGradient(
      this.cx - cam.x, this.cy - cam.y, 0,
      this.cx - cam.x, this.cy - cam.y, this.radius
    );
    grd.addColorStop(0,   '#FFFFFF');
    grd.addColorStop(0.25, '#FFDD00');
    grd.addColorStop(0.6,  '#FF4400');
    grd.addColorStop(1,    'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(this.cx - cam.x, this.cy - cam.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── Grapple Hook ─────────────────────────────────────────

export class GrappleHook {
  constructor(x, y, angle, ownerId) {
    this.id = _nid++;
    this.x  = x; this.y = y;
    this.vx = Math.cos(angle) * 18;
    this.vy = Math.sin(angle) * 18;
    this.w  = 8; this.h = 8;
    this.attached  = false;
    this.attachX   = 0;
    this.attachY   = 0;
    this.ropeLength = 0;
    this.dead      = false;
    this.ownerId   = ownerId;
    this._life     = 70;
  }

  update(level) {
    if (this.attached || this.dead) return;
    if (--this._life <= 0) { this.dead = true; return; }
    this.x += this.vx;
    this.y += this.vy;
    const col = Math.floor((this.x + this.w / 2) / TILE);
    const row = Math.floor((this.y + this.h / 2) / TILE);
    if (level.isSolid(col, row)) {
      this.attached = true;
      this.attachX  = col * TILE + TILE / 2;
      this.attachY  = row * TILE + TILE / 2;
      this.x = this.attachX - this.w / 2;
      this.y = this.attachY - this.h / 2;
    }
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  applyToPlayer(player) {
    if (!this.attached) return;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    const dx  = this.attachX - pcx;
    const dy  = this.attachY - pcy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    this.ropeLength = this.ropeLength || dist;
    if (dist > this.ropeLength) {
      const tension = (dist - this.ropeLength) * 0.1;
      player.vx += (dx / dist) * tension;
      player.vy += (dy / dist) * tension;
    }
  }

  draw(ctx, cam, playerX, playerY) {
    if (this.dead) return;
    ctx.strokeStyle = '#CD853F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playerX - cam.x, playerY - cam.y);
    ctx.lineTo(this.x - cam.x + this.w / 2, this.y - cam.y + this.h / 2);
    ctx.stroke();
    ctx.fillStyle = this.attached ? '#FFD700' : '#AAAAAA';
    ctx.beginPath();
    ctx.arc(this.x - cam.x + this.w / 2, this.y - cam.y + this.h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Sword Swing ───────────────────────────────────────────

export class SwordSwing {
  constructor(x, y, angle, ownerId) {
    this.id       = _nid++;
    this.x        = x; this.y = y;
    this.angle    = angle;
    this.range    = 58;
    this.arc      = Math.PI * 0.8;
    this.timer    = 14;
    this.dead     = false;
    this.ownerId  = ownerId;
    this._hitIds  = new Set();
  }

  update() { if (!this.dead && --this.timer <= 0) this.dead = true; }

  hitsPoint(px, py) {
    if (this.dead) return false;
    const dx = px - this.x, dy = py - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.range) return false;
    let a = Math.atan2(dy, dx) - this.angle;
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) <= this.arc / 2;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const alpha = this.timer / 14;
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#A0E0FF';
    ctx.beginPath();
    ctx.moveTo(this.x - cam.x, this.y - cam.y);
    ctx.arc(this.x - cam.x, this.y - cam.y, this.range,
      this.angle - this.arc / 2, this.angle + this.arc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - cam.x, this.y - cam.y);
    ctx.lineTo(
      this.x + Math.cos(this.angle) * this.range - cam.x,
      this.y + Math.sin(this.angle) * this.range - cam.y
    );
    ctx.stroke();
  }
}

// ── Drawn Object (pencil stroke becomes physics blob) ─────

export class DrawObject {
  constructor(worldX, worldY, w, h, strokePts) {
    this.id = _nid++;
    // Position is the bounding box top-left in world coords
    this.x = worldX; this.y = worldY;
    this.w = Math.max(w, 8); this.h = Math.max(h, 8);
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.hitWall  = false;
    this.dead = false;
    // strokePts: [[relX, relY],...] relative to (worldX, worldY) at time of creation
    this.strokePts = strokePts;
  }

  update(level) {
    this.onGround = false; this.hitWall = false;
    this.vy = Math.min(this.vy + GRAVITY * 0.6, MAX_FALL);
    this.vx *= 0.92; // friction
    resolveEntity(this, level);
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x - cam.x, this.y - cam.y);
    ctx.strokeStyle = '#5B2C00';
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    const pts = this.strokePts;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    } else {
      // Dot
      ctx.fillStyle = '#5B2C00';
      ctx.beginPath();
      ctx.arc(this.w / 2, this.h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  serialize() {
    return { id: this.id, x: Math.round(this.x), y: Math.round(this.y), vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(2) };
  }

  applyState(s) {
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
  }
}
