// ============================================================
//  camera.js  –  smooth following camera
// ============================================================

import { CANVAS_W, CANVAS_H, TILE } from './constants.js';

export class Camera {
  constructor(levelWidthPx, levelHeightPx) {
    this.x = 0;
    this.y = 0;
    this.w = CANVAS_W;
    this.h = CANVAS_H;
    this.levelW = levelWidthPx;
    this.levelH = levelHeightPx;
  }

  /** Follow the average position of both players. */
  follow(players, dt = 1) {
    const active = players.filter(p => !p.dead);
    if (!active.length) return;

    // Target X: average player X, centered in viewport
    const avgX = active.reduce((s, p) => s + p.x + p.w / 2, 0) / active.length;
    const targetX = avgX - this.w / 2;

    // Lerp toward target
    this.x += (targetX - this.x) * 0.08 * dt;

    // Clamp
    this.x = Math.max(0, Math.min(this.levelW - this.w, this.x));
    this.y = 0; // for now, no vertical scrolling
  }

  /** Convert world coordinates to screen coordinates. */
  toScreen(wx, wy) {
    return { sx: wx - this.x, sy: wy - this.y };
  }

  /** Is a world rect visible on screen? */
  inView(wx, wy, ww, wh) {
    return wx + ww > this.x && wx < this.x + this.w &&
           wy + wh > this.y && wy < this.y + this.h;
  }
}
