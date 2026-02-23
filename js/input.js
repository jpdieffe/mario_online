// ============================================================
//  input.js  –  keyboard + mouse input handler
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

    // Mouse state
    this.mouseX     = 0;   // canvas-space X (after scale conversion)
    this.mouseY     = 0;   // canvas-space Y
    this.mouseDown  = false;
    this.mouseClicked = false;  // true for one frame on press
    this._mouseWasDown = false;
    this.mouseAngle = 0;   // set externally by game (player-to-mouse angle)

    // Inventory slot (0-4)
    this.slot = 0;

    // Chat
    this.chatMode   = false;   // true while user is typing
    this.chatBuffer = '';      // current typed text
    this.onChatSubmit = null;  // callback(text) set by game

    this._canvas = null;

    this._onDown = (e) => {
      if (this.chatMode) {
        // Intercept all keys while typing
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          const txt = this.chatBuffer.trim();
          if (txt && this.onChatSubmit) this.onChatSubmit(txt);
          this.chatMode   = false;
          this.chatBuffer = '';
        } else if (e.key === 'Escape') {
          this.chatMode   = false;
          this.chatBuffer = '';
        } else if (e.key === 'Backspace') {
          this.chatBuffer = this.chatBuffer.slice(0, -1);
        } else if (e.key.length === 1 && this.chatBuffer.length < 80) {
          this.chatBuffer += e.key;
        }
        return; // don't pass to game keys
      }
      if (!e.repeat) this._held.add(e.code);
      // Y opens chat
      if (e.code === 'KeyY' && !e.repeat) {
        this.chatMode   = true;
        this.chatBuffer = '';
        return;
      }
      // Number keys 1-5 for slot selection
      if (e.code >= 'Digit1' && e.code <= 'Digit5') {
        this.slot = parseInt(e.code.slice(-1)) - 1;
      }
    };
    this._onUp = (e) => { this._held.delete(e.code); };

    this._onMouseMove = (e) => { this._updateMouse(e); };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this._updateMouse(e); }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onWheel = (e) => {
      if (e.deltaY > 0)      this.slot = (this.slot + 1) % 5;
      else if (e.deltaY < 0) this.slot = (this.slot + 4) % 5;
    };

    window.addEventListener('keydown',   this._onDown);
    window.addEventListener('keyup',     this._onUp);

    // Touch virtual keys (populated by UI if needed)
    this._touch = { left: false, right: false, jump: false, run: false };
  }

  /** Call once game canvas is available so mouse coords work correctly. */
  attachCanvas(canvas) {
    this._canvas = canvas;
    canvas.addEventListener('mousemove',  this._onMouseMove);
    canvas.addEventListener('mousedown',  this._onMouseDown);
    canvas.addEventListener('mouseup',    this._onMouseUp);
    canvas.addEventListener('wheel',      this._onWheel, { passive: true });
    // Prevent right-click context menu on canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _updateMouse(e) {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    this.mouseX = (e.clientX - rect.left) * scaleX;
    this.mouseY = (e.clientY - rect.top)  * scaleY;
  }

  update() {
    this._prev = new Set(this._held);

    // Suppress all movement while chat is open
    if (this.chatMode) {
      this.left = false; this.right = false;
      this.jump = false; this.run   = false; this.fire = false;
      this.mouseClicked  = false;
      this._mouseWasDown = this.mouseDown;
      return;
    }

    this.left  = this._held.has('ArrowLeft')  || this._held.has('KeyA') || this._touch.left;
    this.right = this._held.has('ArrowRight') || this._held.has('KeyD') || this._touch.right;
    this.jump  = this._held.has('ArrowUp') || this._held.has('KeyW')
              || this._held.has('Space')   || this._touch.jump;
    this.run   = this._held.has('ShiftLeft') || this._held.has('ShiftRight')
              || this._held.has('KeyZ')    || this._touch.run;
    this.fire  = this._held.has('KeyX') || this._touch.run;

    // mouseClicked is true only on the first frame of a mouse press
    this.mouseClicked  = this.mouseDown && !this._mouseWasDown;
    this._mouseWasDown = this.mouseDown;
  }

  /** Returns serialisable snapshot for networking. */
  snapshot() {
    return {
      left:  this.left,
      right: this.right,
      jump:  this.jump,
      run:   this.run,
      fire:  this.fire,
      mouseAngle:   this.mouseAngle,
      mouseDown:    this.mouseDown,
      mouseClicked: this.mouseClicked,
      slot:         this.slot,
    };
  }

  /** Apply a remote snapshot (received over network). */
  applySnapshot(snap) {
    this.left  = snap.left  ?? false;
    this.right = snap.right ?? false;
    this.jump  = snap.jump  ?? false;
    this.run   = snap.run   ?? false;
    this.fire  = snap.fire  ?? false;
    this.mouseAngle   = snap.mouseAngle   ?? 0;
    this.mouseDown    = snap.mouseDown    ?? false;
    this.mouseClicked = snap.mouseClicked ?? false;
    this.slot         = snap.slot         ?? 0;
  }

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup',   this._onUp);
    if (this._canvas) {
      this._canvas.removeEventListener('mousemove',   this._onMouseMove);
      this._canvas.removeEventListener('mousedown',   this._onMouseDown);
      this._canvas.removeEventListener('mouseup',     this._onMouseUp);
      this._canvas.removeEventListener('wheel',       this._onWheel);
    }
  }
}

