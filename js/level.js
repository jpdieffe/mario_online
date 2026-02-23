// ============================================================
//  level.js  –  level data, tile rendering, spawns
// ============================================================

import { T, SPAWN, SOLID_TILES, TILE } from './constants.js';
import { Sprites } from './sprites.js';

// ── Level string format ───────────────────────────────────
// Each level is described as an array of strings (rows, top→bottom).
// Width is determined by the length of the longest row.
// Characters:
//  ' ' | '.' = air
//  'G'        = ground (solid)
//  'B'        = brick
//  'Q'        = question block (coin)
//  'M'        = question block (mushroom)
//  'F'        = question block (fire flower)
//  '5' '6'    = pipe top-left / top-right
//  '7' '8'    = pipe body-left / body-right
//  'g'        = goomba spawn (drawn as air, entity placed)
//  'k'        = koopa spawn
//  'c'        = coin spawn
//  'X'        = goal flag (invisible tile column)
//  '%'        = solid invisible tile (ceiling/wall)

const LEVELS = [

  // ── LEVEL  1 ─────────────────────────────────────────────
  {
    bgTop:    '#5C94FC',
    bgBottom: '#5C94FC',
    music:    'overworld',
    map: [
      // col: 0         1         2         3         4         5         6         7         8         9         10        11        12        13        14        15
      //      0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789
      /*r0*/  '                                                                                                                                                        ',
      /*r1*/  '                                                                                                                                                        ',
      /*r2*/  '                                                                                                                                                        ',
      /*r3*/  '                                                                                                            BBBB         BBB              BBBBB        ',
      /*r4*/  '                                                                                                                                                        ',
      /*r5*/  '                  BQBQB                    BBBB              MBBQB                         QBQ                   BBBB                                  ',
      /*r6*/  '                                                                                                                                          BBBBB        ',
      /*r7*/  '                                                                                                                                                        ',
      /*r8*/  '                                                          BBB                                        BQB                  BBB                          ',
      /*r9*/  '                                                                                                                                                        ',
      /*r10*/ '          56                  56          5666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      /*r11*/ '   g g    78      g  g        78          7888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888',
      /*r12*/ 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccg   X',
      /*r13*/ 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      /*r14*/ 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    ],
    p1Spawn: { col: 2,  row: 11 },
    p2Spawn: { col: 4,  row: 11 },
  },

  // ── LEVEL  2 ─────────────────────────────────────────────
  {
    bgTop:    '#000080',
    bgBottom: '#000040',
    music:    'underground',
    map: [
      /*r0*/  '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%',
      /*r1*/  '%                                                                           %',
      /*r2*/  '%                  BBBB       Q                                            %',
      /*r3*/  '%                                                                           %',
      /*r4*/  '%      56     56               BQBQB                   BBB                 %',
      /*r5*/  '%   g  78  g  78    g g                                                    %',
      /*r6*/  '%  GGGG  GGG  GGGGGGGGGGGG   GGGGG  GGG      GGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r7*/  '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r8*/  '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r9*/  '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r10*/ '%GGGGGGGGGGG c c c c c c cGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGgGGGGGGG%',
      /*r11*/ '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r12*/ '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r13*/ '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG%',
      /*r14*/ '%GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG k   k    k  GGGGGgGGGXG%',
    ],
    p1Spawn: { col: 2, row: 5 },
    p2Spawn: { col: 3, row: 5 },
  },
];

// ── Parse a level string map into tiles + spawn list ──────

function parseLevel(levelDef) {
  const rows   = levelDef.map;
  const height = rows.length;
  const width  = Math.max(...rows.map(r => r.length));

  const tiles  = [];
  const spawns = [];
  let goalCol  = -1;

  for (let row = 0; row < height; row++) {
    const rowArr = new Uint8Array(width); // defaults to 0 (AIR)
    for (let col = 0; col < rows[row].length; col++) {
      const ch = rows[row][col];
      switch (ch) {
        case 'G': rowArr[col] = T.GROUND; break;
        case 'B': rowArr[col] = T.BRICK;  break;
        case 'Q': rowArr[col] = T.QBLOCK; break;
        case 'M': rowArr[col] = T.QBLOCK; break; // qblock w/ mushroom (flagged below)
        case 'F': rowArr[col] = T.QBLOCK; break; // qblock w/ flower
        case '5': rowArr[col] = T.PIPE_TL; break;
        case '6': rowArr[col] = T.PIPE_TR; break;
        case '7': rowArr[col] = T.PIPE_BL; break;
        case '8': rowArr[col] = T.PIPE_BR; break;
        case '%': rowArr[col] = T.SOLID_INVISIBLE; break;
        // Spawn markers → air tile + spawn entry
        case 'g': spawns.push({ type: SPAWN.GOOMBA, col, row }); break;
        case 'k': spawns.push({ type: SPAWN.KOOPA,  col, row }); break;
        case 'c': spawns.push({ type: SPAWN.COIN,   col, row }); break;
        case 'X': goalCol = col; break;
        default:  break; // air
      }
      // Detect mushroom / flower blocks
      if (ch === 'M') spawns.push({ type: 'QBLOCK_MUSHROOM', col, row });
      if (ch === 'F') spawns.push({ type: 'QBLOCK_FLOWER',   col, row });
    }
    tiles.push(rowArr);
  }

  return {
    tiles,
    spawns,
    goalCol,
    width,
    height,
    bgTop:    levelDef.bgTop,
    bgBottom: levelDef.bgBottom,
    p1Spawn:  levelDef.p1Spawn,
    p2Spawn:  levelDef.p2Spawn,
  };
}

// ── Level class ───────────────────────────────────────────

export class Level {
  constructor(index) {
    const def = LEVELS[index % LEVELS.length];
    const parsed = parseLevel(def);

    this.tiles    = parsed.tiles;
    this.spawns   = parsed.spawns;
    this.goalCol  = parsed.goalCol;
    this.cols     = parsed.width;
    this.rows     = parsed.height;
    this.bgTop    = parsed.bgTop;
    this.bgBottom = parsed.bgBottom;
    this.p1Spawn  = parsed.p1Spawn;
    this.p2Spawn  = parsed.p2Spawn;
    this.widthPx  = this.cols * TILE;
    this.heightPx = this.rows * TILE;

    // Per-block state (for question blocks: contents remaining)
    // Map: "col,row" → item type or null if spent
    this.blockItems = new Map();
    for (const sp of this.spawns) {
      if (sp.type === 'QBLOCK_MUSHROOM') this.blockItems.set(`${sp.col},${sp.row}`, SPAWN.MUSHROOM);
      if (sp.type === 'QBLOCK_FLOWER')   this.blockItems.set(`${sp.col},${sp.row}`, SPAWN.FLOWER);
    }

    // Question block animation frame
    this._qframe = 0;
    this._qtimer = 0;
  }

  get(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return T.AIR;
    return this.tiles[row][col];
  }

  isSolid(col, row) {
    return SOLID_TILES.has(this.get(col, row));
  }

  /** Hit a question / brick block from below. Returns item type spawned (or null). */
  hitBlock(col, row) {
    const tile = this.get(col, row);
    if (tile === T.QBLOCK) {
      this.tiles[row][col] = T.QUSED;
      const key = `${col},${row}`;
      const item = this.blockItems.get(key) ?? SPAWN.COIN;
      this.blockItems.delete(key);
      return item;
    }
    if (tile === T.BRICK) {
      // Brick breaks (for big Mario it will be removed by the caller)
      return 'BRICK';
    }
    return null;
  }

  update(dt) {
    this._qtimer += dt;
    if (this._qtimer > 8) { this._qframe ^= 1; this._qtimer = 0; }
  }

  /** Draw tiles visible within the camera rect. */
  draw(ctx, camera) {
    const startCol = Math.max(0, Math.floor(camera.x / TILE));
    const endCol   = Math.min(this.cols - 1, Math.ceil((camera.x + camera.w) / TILE));
    const startRow = Math.max(0, Math.floor(camera.y / TILE));
    const endRow   = Math.min(this.rows - 1, Math.ceil((camera.y + camera.h) / TILE));

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const tile = this.get(col, row);
        if (tile === T.AIR) continue;

        const sx = col * TILE - camera.x;
        const sy = row * TILE - camera.y;

        this._drawTile(ctx, tile, sx, sy);
      }
    }
  }

  _drawTile(ctx, tile, sx, sy) {
    let spr = null;
    switch (tile) {
      case T.GROUND:   spr = Sprites.GROUND(); break;
      case T.BRICK:    spr = Sprites.BRICK();  break;
      case T.QBLOCK:   spr = this._qframe === 0 ? Sprites.QBLOCK_1() : Sprites.QBLOCK_2(); break;
      case T.QUSED:    spr = Sprites.QUSED();  break;
      case T.PIPE_TL:  spr = Sprites.PIPE_TL(); break;
      case T.PIPE_TR:  spr = Sprites.PIPE_TR(); break;
      case T.PIPE_BL:  spr = Sprites.PIPE_BL(); break;
      case T.PIPE_BR:  spr = Sprites.PIPE_BR(); break;
      case T.CLOUD_M:   spr = Sprites.CLOUD_M(); break;
      case T.SOLID_INVISIBLE: return; // invisible
      default: return;
    }
    if (spr) ctx.drawImage(spr, sx, sy);
  }
}

export const LEVEL_COUNT = LEVELS.length;
