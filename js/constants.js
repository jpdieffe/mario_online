// ============================================================
//  constants.js  –  shared game constants
// ============================================================

export const TILE     = 32;          // px per tile
export const GRAVITY  = 0.55;
export const MAX_FALL = 14;
export const WALK_SPD = 2.8;
export const RUN_SPD  = 4.8;
export const JUMP_VEL = -7.5;       // initial jump velocity
export const JUMP_HOLD_FRAMES = 8;  // frames jump force is extended

export const CANVAS_W = 832;        // 26 tiles wide (viewport)
export const CANVAS_H = 480;        // 15 tiles tall

// Tile IDs
export const T = {
  AIR:    0,
  GROUND: 1,
  BRICK:  2,
  QBLOCK: 3,  // question block (with item)
  QUSED:  4,  // spent question block
  PIPE_TL: 5,
  PIPE_TR: 6,
  PIPE_BL: 7,
  PIPE_BR: 8,
  CLOUD_L: 9,
  CLOUD_M: 10,
  CLOUD_R: 11,
  SKY:    12, // decorative sky tile (non-solid)
  SOLID_INVISIBLE: 13,
};

// Which tiles are solid
export const SOLID_TILES = new Set([T.GROUND, T.BRICK, T.QBLOCK, T.QUSED,
  T.PIPE_TL, T.PIPE_TR, T.PIPE_BL, T.PIPE_BR, T.SOLID_INVISIBLE]);

// Spawn types in level data
export const SPAWN = {
  GOOMBA:   'G',
  KOOPA:    'K',
  COIN:     'C',
  MUSHROOM: 'M',
  FLOWER:   'F',
};

// Player states
export const PSTATE = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN:  'run',
  JUMP: 'jump',
  FALL: 'fall',
  DEAD: 'dead',
  WIN:  'win',
};

// Power levels
export const POWER = {
  SMALL: 0,
  BIG:   1,
  FIRE:  2,
};

// Network message types
export const MSG = {
  INPUT:   'input',
  STATE:   'state',
  EVENT:   'event',
  READY:   'ready',
  RESTART: 'restart',
};
