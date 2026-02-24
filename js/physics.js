// ============================================================
//  physics.js  –  AABB tile collision  (axis-separated sweep)
// ============================================================

import { TILE, SOLID_TILES, T } from './constants.js';

/**
 * Resolve an entity against the tile map.
 * Modifies entity in-place: x, y, vx, vy, onGround, hitCeiling, hitWall.
 * Returns an array of {col, row} for any blocks that were hit from below.
 */
export function resolveEntity(entity, level) {
  const blocksHit = [];

  if (entity.vy < 0) {
    // Moving upward: resolve vertical first so ceiling block-hits register
    // before horizontal movement can push entity away from the tile.
    entity.y += entity.vy;
    resolveAxis(entity, level, 'y', blocksHit);
    entity.x += entity.vx;
    resolveAxis(entity, level, 'x', blocksHit);
  } else {
    // Falling or horizontal: horizontal first, then vertical
    entity.x += entity.vx;
    resolveAxis(entity, level, 'x', blocksHit);
    entity.y += entity.vy;
    resolveAxis(entity, level, 'y', blocksHit);
  }

  return blocksHit;
}

function resolveAxis(ent, level, axis, blocksHit) {
  const colMin = Math.floor(ent.x / TILE);
  const colMax = Math.floor((ent.x + ent.w - 0.01) / TILE);
  const rowMin = Math.floor(ent.y / TILE);
  const rowMax = Math.floor((ent.y + ent.h - 0.01) / TILE);

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const tile = level.get(col, row);
      if (!SOLID_TILES.has(tile)) continue;

      const tx = col * TILE;
      const ty = row * TILE;

      if (axis === 'x') {
        if (ent.vx > 0) {
          ent.x = tx - ent.w;
        } else if (ent.vx < 0) {
          ent.x = tx + TILE;
        }
        ent.vx = 0;
        ent.hitWall = true;
      } else {
        if (ent.vy > 0) {
          // Hit floor
          ent.y = ty - ent.h;
          ent.vy = 0;
          ent.onGround = true;
        } else if (ent.vy < 0) {
          // Hit ceiling
          ent.y = ty + TILE;
          ent.vy = 0;
          ent.hitCeiling = true;
          blocksHit.push({ col, row });
        }
      }
    }
  }
}

/**
 * AABB overlap test.
 */
export function overlaps(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

/**
 * Check if entity A is stomping entity B:
 * A must be falling (vy > 0) and A's bottom must be
 * in the TOP HALF of B after overlap is confirmed.
 * No prevY needed – simpler and more reliable.
 */
export function stompCheck(player, enemy) {
  if (player.vy <= 0) return false;
  const playerBottom = player.y + player.h;
  const enemyMid     = enemy.y + enemy.h * 0.5;
  return playerBottom <= enemyMid &&
         player.x + player.w > enemy.x + 2 &&
         player.x < enemy.x + enemy.w - 2;
}

/**
 * Level boundary clamp (keep entity inside horizontal bounds, kill if falls below).
 * Returns true if entity fell off bottom.
 */
export function levelBoundaryCheck(entity, level) {
  // Left wall
  if (entity.x < 0) { entity.x = 0; entity.vx = 0; }

  // Right wall
  const maxX = level.widthPx - entity.w;
  if (entity.x > maxX) { entity.x = maxX; entity.vx = 0; }

  // Fell off bottom
  if (entity.y > level.heightPx + 64) return true;

  return false;
}
/**
 * Resolve an entity against a DrawObject (dynamic AABB block).
 * Modifies both entity and obj in-place.
 * Returns true if they overlapped.
 */
export function resolveEntityVsObj(entity, obj) {
  if (obj.dead) return false;
  // Broad AABB test
  if (entity.x + entity.w <= obj.x || entity.x >= obj.x + obj.w) return false;
  if (entity.y + entity.h <= obj.y || entity.y >= obj.y + obj.h) return false;

  const overlapL = (entity.x + entity.w) - obj.x;
  const overlapR = (obj.x + obj.w) - entity.x;
  const overlapT = (entity.y + entity.h) - obj.y;
  const overlapB = (obj.y + obj.h) - entity.y;

  const minX = Math.min(overlapL, overlapR);
  const minY = Math.min(overlapT, overlapB);

  if (minY <= minX) {
    if (overlapT < overlapB) {
      // Entity coming from above → land on top
      entity.y = obj.y - entity.h;
      if (entity.vy > 0) entity.vy = 0;
      entity.onGround = true;
      // Transfer a little push force to the obj
      obj.vx += entity.vx * 0.08;
    } else {
      entity.y = obj.y + obj.h;
      if (entity.vy < 0) entity.vy = 0;
    }
  } else {
    const push = (overlapL < overlapR ? -1 : 1);
    entity.x += push * minX;
    // Kick the obj in the same direction with some of entity's momentum
    obj.vx += -push * Math.abs(entity.vx) * 0.5 + entity.vx * 0.2;
    entity.vx = 0;
    entity.hitWall = true;
  }
  return true;
}