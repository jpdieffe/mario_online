// ============================================================
//  input.js  –  keyboard input handler
// ============================================================

export class Input {
  constructor() {
    this._held  = new Set();
    this._prev  = new Set();

    this.left  = false;
    this.right = false;
    this.jump  = false;
    this.run   = false;
    this.fire  = false;

    this._onDown = (e) => {
      if (!e.repeat) this._held.add(e.code);
    };
    this._onUp = (e) => {
      this._held.delete(e.code);
    };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup',   this._onUp);

    // Touch virtual keys (populated by UI if needed)
    this._touch = { left: false, right: false, jump: false, run: false };
  }

  update() {
    this._prev = new Set(this._held);

    this.left  = this._held.has('ArrowLeft')  || this._held.has('KeyA') || this._touch.left;
    this.right = this._held.has('ArrowRight') || this._held.has('KeyD') || this._touch.right;
    this.jump  = this._held.has('ArrowUp') || this._held.has('KeyW')
              || this._held.has('Space')   || this._touch.jump;
    this.run   = this._held.has('ShiftLeft') || this._held.has('ShiftRight')
              || this._held.has('KeyZ')    || this._touch.run;
    this.fire  = this._held.has('KeyX') || this._touch.run; // run = fire when fire power
  }

  /** Returns serialisable snapshot for networking. */
  snapshot() {
    return {
      left:  this.left,
      right: this.right,
      jump:  this.jump,
      run:   this.run,
      fire:  this.fire,
    };
  }

  /** Apply a remote snapshot (received over network). */
  applySnapshot(snap) {
    this.left  = snap.left  ?? false;
    this.right = snap.right ?? false;
    this.jump  = snap.jump  ?? false;
    this.run   = snap.run   ?? false;
    this.fire  = snap.fire  ?? false;
  }

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup',   this._onUp);
  }
}
