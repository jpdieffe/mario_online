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
  // Horizontal move first
  entity.x += entity.vx;
  const blocksHit = [];
  resolveAxis(entity, level, 'x', blocksHit);

  // Vertical move
  entity.y += entity.vy;
  resolveAxis(entity, level, 'y', blocksHit);

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
 * Check if entity A is landing on top of entity B
 * (A falling down, bottom edge previously above B top edge).
 */
export function stompCheck(player, enemy, prevPlayerY) {
  if (player.vy <= 0) return false;
  const prevBottom = prevPlayerY + player.h;
  const currBottom = player.y  + player.h;
  return prevBottom <= enemy.y + 6 &&
         currBottom >= enemy.y     &&
         player.x + player.w > enemy.x + 4 &&
         player.x < enemy.x + enemy.w - 4;
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
