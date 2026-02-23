// ============================================================
//  config.js  –  live-tweakable game parameters
//  All physics code reads from CFG so the debug panel can
//  change values at runtime without a page reload.
// ============================================================

export const CFG = {
  JUMP_VEL:         -7.0,   // initial jump velocity (negative = up)
  JUMP_HOLD_FRAMES:  12,    // frames the hold-boost extends the jump
  GRAVITY_RISE:      0.22,  // gravity while ascending
  GRAVITY_FALL:      0.46,  // gravity while descending
  WALK_SPD:          2.8,
  RUN_SPD:           4.8,
  MAX_FALL:          14,
};

// Expose globally so the debug panel (plain script in HTML) can write to it
if (typeof window !== 'undefined') window.CFG = CFG;
