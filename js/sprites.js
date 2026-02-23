// ============================================================
//  sprites.js  –  pixel-art sprite definitions & renderer
//  Each sprite is a 16×16 grid (scaled ×2 → 32×32 on canvas)
//  Char palette maps each character to an RGBA color.
// ============================================================

import { TILE } from './constants.js';

export const SCALE = 2;   // each pixel → SCALE screen pixels
export const SPRITE_PX = 16;

// ── Colour palette (single char → CSS colour) ─────────────
const P = {
  _: null,           // transparent
  r: '#D01018',      // mario red
  R: '#FF4030',      // bright red
  s: '#FAC898',      // skin
  S: '#F09060',      // shadow skin
  b: '#7B3B00',      // brown (mustache, shoes)
  B: '#3C1800',      // dark brown
  n: '#0038AA',      // blue overalls
  N: '#001878',      // dark blue overalls
  g: '#00A820',      // green (luigi, pipes)
  G: '#006010',      // dark green
  '2': '#50C840',    // luigi light green shirt
  '3': '#287018',    // luigi dark green
  y: '#FFD800',      // yellow / coin
  Y: '#B89000',      // dark yellow
  w: '#FFFFFF',      // white
  k: '#000000',      // black
  e: '#8B8B00',      // brown enemy (goomba)
  E: '#604000',      // dark brown enemy
  t: '#E8C078',      // tan block
  T: '#C09848',      // dark tan block
  o: '#FF8800',      // orange
  c: '#00D8F8',      // cyan (sky)
  C: '#0090C8',      // dark cyan
  p: '#D800C8',      // purple (flower)
  P5: '#FF90E8',     // pink
  z: '#F0F0F0',      // near-white cloud
  Z: '#C8C8C8',      // cloud shadow
  q: '#404040',      // dark gray
  '1': '#A04000',    // koopa shell
  '4': '#D06000',    // koopa body
  '5': '#E0E000',    // koopa belly
  '6': '#202020',    // koopa dark
  m: '#E82020',      // mushroom red
  M: '#901010',      // mushroom dark red
};

// Build a canvas for a sprite frame and return an ImageBitmap promise (or null for non-browser)
// We cache the results in a Map to avoid redrawing.
const _cache = new Map();

function makeFrame(rows, opts = {}) {
  const key = rows.join('|');
  if (_cache.has(key)) return _cache.get(key);

  const sc = opts.scale ?? SCALE;
  const sz = SPRITE_PX * sc;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      const ch = rows[row][col];
      const color = P[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col * sc, row * sc, sc, sc);
    }
  }
  _cache.set(key, cv);
  return cv;
}

// ── Sprite definitions ────────────────────────────────────

// MARIO P1 – small, right idle
const MARIO_SMALL_IDLE_R = [
  '____rrrr________',
  '__rrrrrrrrrr____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '___rrbrrr_______',
  '_rrrrrrrrrr_____',
  'srrrrrrrs_______',
  'ssrrrrrss_______',
  '_nsnnnns________',
  '_nnnnnnnn_______',
  '_nn_nnnn________',
  '_bb____bb_______',
  '_bbb__bbb_______',
  '__bb__bb________',
];

// MARIO P1 – small, right walk (frame 1)
const MARIO_SMALL_WALK_R = [
  '____rrrr________',
  '__rrrrrrrrrr____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '__rrrrrr________',
  '_rrrrrrrr_______',
  'nrrrrrrrn_______',
  'nnrrrrrnn_______',
  '_nnnnnnnn_______',
  '__nnn_nn________',
  '_nnn___n________',
  '_bb_____b_______',
  '_bbb___bb_______',
  '__bbb___________',
];

// MARIO P1 – jump right
const MARIO_SMALL_JUMP_R = [
  '____rrrr________',
  '__rrrrrrrrrr____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '___rrrrrr_______',
  'nnnrrrrrrrn_____',
  'nnrrrrrrrrn_____',
  'nrrrrrrrrrn_____',
  '__nnnnnnnn______',
  '___nn__nn_______',
  '___bb__bb_______',
  '__bbb__bbb______',
  '__bb____bb______',
  '________________',
];

// LUIGI P2 – small, right idle
const LUIGI_SMALL_IDLE_R = [
  '____gggg________',
  '__gggggggggg____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '___22g222_______',
  '_222222222g_____',
  's222222222______',
  'ss2222222s______',
  '_nsnnnns________',
  '_nnnnnnnn_______',
  '_nn_nnnn________',
  '_bb____bb_______',
  '_bbb__bbb_______',
  '__bb__bb________',
];

// LUIGI P2 – jump right
const LUIGI_SMALL_JUMP_R = [
  '____gggg________',
  '__gggggggggg____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '___22222g_______',
  'nnn2222222n_____',
  'nn222222222n____',
  'n2222222222n____',
  '__nnnnnnnn______',
  '___nn__nn_______',
  '___bb__bb_______',
  '__bbb__bbb______',
  '__bb____bb______',
  '________________',
];

// BIG MARIO – 16×24 sprite area (we'll crop to 16 wide × 16+8 tall trick)
// For simplicity we use 16×16 tall big mario (slightly chunky look)
const MARIO_BIG_IDLE_R = [
  '____rrrr________',
  '__rrrrrrrrrr____',
  '__bbbsssb_______',
  '_bsbssssbbb_____',
  '_bsbbsssbbb_____',
  '__bssssb________',
  '__rrrrrrrr______',
  '_rrrrrrrrr______',
  'srrrrrrrrs______',
  'ssrrrrrrss______',
  '_ssssssss_______',
  '_nnnnnnnnn______',
  '_nnnnnnnn_______',
  '_nn____nn_______',
  '_bbb__bbb_______',
  '__bb__bb________',
];

// GOOMBA
const GOOMBA_WALK1 = [
  '________________',
  '____eeeeee______',
  '___eeeeeeeee____',
  '__eeeeeeeeeee___',
  '__EeeeeeeeeeE___',
  '__eEeEeeeEeE____',
  '__eEeEeeeEeE____',
  '__eeeeeeeeeee___',
  '__eeeeEeeeeee___',
  '__eEeeeeeeEe____',
  '___eEeeeeEe_____',
  '____eeeeee______',
  '__eee____eee____',
  '_eeeee__eeeee___',
  '_EEeee__eeeEE___',
  '_EEEe____eEEE___',
];

const GOOMBA_WALK2 = [
  '________________',
  '____eeeeee______',
  '___eeeeeeeee____',
  '__eeeeeeeeeee___',
  '__EeeeeeeeeeE___',
  '__eEeEeeeEeE____',
  '__eEeEeeeEeE____',
  '__eeeeeeeeeee___',
  '__eeeeEeeeeee___',
  '__eEeeeeeeEe____',
  '___eEeeeeEe_____',
  '____eeeeee______',
  '___eee__eee_____',
  '__eeeee__eeeee__',
  '__EEeee__eeeEE__',
  '__EEe______eEE__',
];

const GOOMBA_FLAT = [
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '__eeeeeeeeeee___',
  '__EeeeeeeeeeE___',
  '__eEeEeeeEeE____',
  '__eEeEeeeEeE____',
  '_eeeeeeeeeeee___',
  '_EEEeEEEeEEEe___',
  '________________',
];

// KOOPA (green shell + body, walking right)
const KOOPA_WALK1 = [
  '____GGgg________',
  '___GGggggG______',
  '__GgEgsssgG_____',
  '__GgEgsssgG_____',
  '___GgsssGg______',
  '____GggGg_______',
  '___11111111_____',
  '__1111511111____',
  '_111155511111___',
  '_111151111111___',
  '__11111111111___',
  '___111111111____',
  '____111111______',
  '___44__444______',
  '__4444__444_____',
  '__44____44______',
];

const KOOPA_WALK2 = [
  '____GGgg________',
  '___GGggggG______',
  '__GgEgsssgG_____',
  '__GgEgsssgG_____',
  '___GgsssGg______',
  '____GggGg_______',
  '___11111111_____',
  '__1111511111____',
  '_111155511111___',
  '_111151111111___',
  '__11111111111___',
  '___111111111____',
  '____111111______',
  '____444_44______',
  '___4444__444____',
  '____44____44____',
];

// KOOPA SHELL
const KOOPA_SHELL = [
  '________________',
  '___11111111_____',
  '__1111511111____',
  '_111155511111___',
  '_1151511515111__',
  '_1151511515111__',
  '_1115115151111__',
  '_111111111111___',
  '_111111111111___',
  '_111111111111___',
  '__11111111111___',
  '___111111111____',
  '____111111______',
  '________________',
  '________________',
  '________________',
];

// COIN
const COIN_FRAME1 = [
  '________________',
  '____yyyyyyy_____',
  '___yyyyyyyyy____',
  '__yYYyyyyyyYy___',
  '__yYYyyyyyYYy___',
  '__yyYYYYYYYyy___',
  '__yyyYYYYYyyy___',
  '__yyyYYYYYyyy___',
  '__yyyYYYYYyyy___',
  '__yyYYYYYYYyy___',
  '__yYYyyyyyYYy___',
  '__yYYyyyyyyYy___',
  '___yyyyyyyyy____',
  '____yyyyyyy_____',
  '________________',
  '________________',
];

const COIN_FRAME2 = [
  '________________',
  '_____yyyy_______',
  '____yyyyyy______',
  '___yyYYYyyy_____',
  '___yyYYYyyy_____',
  '___yyYYYyyy_____',
  '___yyYYYyyy_____',
  '___yyYYYyyy_____',
  '___yyYYYyyy_____',
  '___yyyyyyyY_____',
  '____yyyyyy______',
  '_____yyyy_______',
  '________________',
  '________________',
  '________________',
  '________________',
];

// MUSHROOM
const MUSHROOM = [
  '________________',
  '____mmmmm_______',
  '___mmmmmmm______',
  '__mmmmmwwmmm____',
  '_mmmmwwwwmmmm___',
  '_mmmwwwwwwmmm___',
  '_mmmmmmmmmmmm___',
  '_mmmmmmmmmmmm___',
  '_MmmmmMMmmmMm___',
  '__mmmMMMMMmmm___',
  '__smmmmmmmms____',
  '_ssssssssssss___',
  '_ssssssssssss___',
  '__ssssssssss____',
  '________________',
  '________________',
];

// FIRE FLOWER
const FIRE_FLOWER = [
  '________________',
  '_____ppppp______',
  '____pPPPPPp_____',
  '___pPRRRRPPp____',
  '___pPRwwRPPp____',
  '___pPPRRPPPp____',
  '____ppPPPpp_____',
  '____GpppPG______',
  '____GGgGGG______',
  '___GGGgGGGG_____',
  '___GGGgGGGG_____',
  '____GggggGG_____',
  '_____GggG_______',
  '______gg________',
  '_____ggg________',
  '________________',
];

// FIREBALL
const FIREBALL = [
  '________________',
  '________________',
  '_____rwwrr______',
  '____rRwwwwr_____',
  '___rRRwwwwRr____',
  '___rRwwwwwRr____',
  '___rRwwwwwRr____',
  '____rRwwwRr_____',
  '_____rrRrr______',
  '______rrr_______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── TILE sprites ──────────────────────────────────────────

// Ground tile
const TILE_GROUND = [
  'tttttttttttttttt',
  'tTTTTTtTTTTTtTTT',
  'tTTTTTtTTTTTtTTT',
  'tTTTTTtTTTTTtTTT',
  'tTTTTTtTTTTTtTTT',
  'tttttttttttttttt',
  'TTTtTTTTTtTTTTtT',
  'TTTtTTTTTtTTTTtT',
  'TTTtTTTTTtTTTTtT',
  'TTTtTTTTTtTTTTtT',
  'tttttttttttttttt',
  'tTTTTtTTTTtTTTTt',
  'tTTTTtTTTTtTTTTt',
  'tTTTTtTTTTtTTTTt',
  'tTTTTtTTTTtTTTTt',
  'tttttttttttttttt',
];

// Brick tile
const TILE_BRICK = [
  'oooooooooooooooo',
  'oRRRRRRoRRRRRRRo',
  'oRRRRRRoRRRRRRRo',
  'oRRRRRRoRRRRRRRo',
  'oooooooooooooooo',
  'oRRRRRRRRoRRRRRo',
  'oRRRRRRRRoRRRRRo',
  'oRRRRRRRRoRRRRRo',
  'oooooooooooooooo',
  'oRRRRRRoRRRRRRRo',
  'oRRRRRRoRRRRRRRo',
  'oRRRRRRoRRRRRRRo',
  'oooooooooooooooo',
  'oRRRRRRRRoRRRRRo',
  'oRRRRRRRRoRRRRRo',
  'oooooooooooooooo',
];

// Question block (animated)
const TILE_QBLOCK_1 = [
  'yyyyyyyyyyyyyyyY',
  'yyyyyyyyyyyyyYYY',
  'yyBBBBBBBBBBByyy',
  'yBywywywywywwwyy',
  'yBwBBBBwBBBwwyy_',
  'yBwBwwwwwBwwyyyy',
  'yBwBwBBBwBwwyyyy',
  'yBwBwBwBwBwwyyyy',
  'yBwBBBBwBBBwwyy_',
  'yBywBwwwwBwwwyy_',
  'yBywywywywywwyy_',
  'yyyBBBBBBBBByyyy',
  'yyyyyyyyyyyyyyy_',
  'yyyyyyyyyyyyyy__',
  'Yyyyyyyyyyyyyyy_',
  'YYYYYYYYYYyyyyyy',
];

const TILE_QBLOCK_2 = [
  'yyyyyyyyyyyyyyyY',
  'yyyyyyyyyyyyyYYY',
  'yyBBBBBBBBBBByyy',
  'yBywywywywywwwyy',
  'yBwBBBBwBBBwwyy_',
  'yBwBwwwwwBwwyyyy',
  'yBwBwBwBwBwwyyyy',
  'yBwBwBwBwBwwyyyy',
  'yBwBBBBwBBBwwyy_',
  'yBywBwwwwBwwwyy_',
  'yBywywywywywwyy_',
  'yyyBBBBBBBBByyyy',
  'yyyyyyyyyyyyyyy_',
  'yyyyyyyyyyyyyy__',
  'Yyyyyyyyyyyyyyy_',
  'YYYYYYYYYYyyyyyy',
];

const TILE_QUSED = [
  'BBBBBBBBBBBBBBBB',
  'BqqqqqqqqqqqqqBB',
  'BqqBBBBBBBBBqBB_',
  'BqBqqqqqqqqqBBB_',
  'BqBqBBBBBBqBBB__',
  'BqBqqqqqqqqBBB__',
  'BqBqqqqqqqBBBB__',
  'BqBBBBBBBBBqBB__',
  'BqBqqqqqqqBBBB__',
  'BqBqqqqqqqqBBB__',
  'BqBqBBBBBBqBBB__',
  'BqBqqqqqqqqqBBB_',
  'BqqBBBBBBBBBqBB_',
  'BqqqqqqqqqqqqqBB',
  'BBBBBBBBBBBBBBBB',
  '________________',
];

// Pipe sections
const TILE_PIPE_TL = [
  '_GGggggGGG______',
  '_GGggggGGGG_____',
  'GGGggggGGGG_____',
  'GGGggggGGGG_____',
  'GGGggggGGGG_____',
  'GGGgggggGGG_____',
  'GGGGGGGGGGGG____',
  'GGGGGGGGGGGG____',
  '_GGggggGgGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
];

const TILE_PIPE_TR = [
  '______GGggggGG__',
  '_____GGGGggggGG_',
  '_____GGGGggggGGG',
  '_____GGGGggggGGG',
  '_____GGGGggggGGG',
  '_____GGGgggggGGG',
  '____GGGGGGGGGGGG',
  '____GGGGGGGGGGGG',
  '_____GGgGggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
  '_____GGggggggGG_',
];

const TILE_PIPE_BL = [
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
  '_GGggggggGG_____',
];

const TILE_PIPE_BR = TILE_PIPE_BL; // same column body

// Cloud tile
const TILE_CLOUD_M = [
  '________________',
  '________________',
  '____zzzzzzz_____',
  '___zzzzzzzzz____',
  '__zzwwwwwwwzz___',
  '_zzwwwwwwwwwzz__',
  'zzwwwwwwwwwwwzz_',
  'zzwwwwwwwwwwwzz_',
  'zzwwwwwwwwwwwzz_',
  'zzzzzzzzzzzzzzzz',
  '_ZZzzzzzzzzzZZ__',
  '__ZZZzzzzzZZZ___',
  '________________',
  '________________',
  '________________',
  '________________',
];

// Star
const STAR_FRAME1 = [
  '________________',
  '______yyy_______',
  '_____yyyyy______',
  '___yyyYYyyy_____',
  '_yyyyYYYYyyy____',
  '_yyyYYYYYYyyy___',
  '___YYYYYYYYYY___',
  '____YYYYYYY_____',
  '_yyyyYYYYyyy____',
  '___yyyHHyyy_____',
  '____yyyyyy______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Exported sprite maps ─────────────────────────────────

export const Sprites = {
  // Players
  MARIO_IDLE_R:  () => makeFrame(MARIO_SMALL_IDLE_R),
  MARIO_WALK1_R: () => makeFrame(MARIO_SMALL_WALK_R),
  MARIO_JUMP_R:  () => makeFrame(MARIO_SMALL_JUMP_R),
  MARIO_BIG_R:   () => makeFrame(MARIO_BIG_IDLE_R),

  LUIGI_IDLE_R:  () => makeFrame(LUIGI_SMALL_IDLE_R),
  LUIGI_WALK1_R: () => makeFrame(LUIGI_SMALL_IDLE_R), // reuse
  LUIGI_JUMP_R:  () => makeFrame(LUIGI_SMALL_JUMP_R),
  LUIGI_BIG_R:   () => makeFrame(LUIGI_SMALL_JUMP_R), // reuse

  // Enemies
  GOOMBA_1:  () => makeFrame(GOOMBA_WALK1),
  GOOMBA_2:  () => makeFrame(GOOMBA_WALK2),
  GOOMBA_FLAT: () => makeFrame(GOOMBA_FLAT),

  KOOPA_1:   () => makeFrame(KOOPA_WALK1),
  KOOPA_2:   () => makeFrame(KOOPA_WALK2),
  KOOPA_SHELL: () => makeFrame(KOOPA_SHELL),

  // Items
  COIN_1:    () => makeFrame(COIN_FRAME1),
  COIN_2:    () => makeFrame(COIN_FRAME2),
  MUSHROOM:  () => makeFrame(MUSHROOM),
  FLOWER:    () => makeFrame(FIRE_FLOWER),
  FIREBALL:  () => makeFrame(FIREBALL),
  STAR:      () => makeFrame(STAR_FRAME1),

  // Tiles
  GROUND:    () => makeFrame(TILE_GROUND),
  BRICK:     () => makeFrame(TILE_BRICK),
  QBLOCK_1:  () => makeFrame(TILE_QBLOCK_1),
  QBLOCK_2:  () => makeFrame(TILE_QBLOCK_2),
  QUSED:     () => makeFrame(TILE_QUSED),
  PIPE_TL:   () => makeFrame(TILE_PIPE_TL),
  PIPE_TR:   () => makeFrame(TILE_PIPE_TR),
  PIPE_BL:   () => makeFrame(TILE_PIPE_BL),
  PIPE_BR:   () => makeFrame(TILE_PIPE_BR),
  CLOUD_M:   () => makeFrame(TILE_CLOUD_M),
};

/** Flip a sprite sheet canvas horizontally (for facing left). */
export function flipH(canvas) {
  const key = 'flip:' + canvas.width + ':' + canvas.height + ':' + (canvas.__id ?? (canvas.__id = Math.random()));
  if (_cache.has(key)) return _cache.get(key);
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  _cache.set(key, out);
  return out;
}

/** Pre-warm all sprites (call once at game start). */
export function preloadSprites() {
  for (const fn of Object.values(Sprites)) fn();
}
