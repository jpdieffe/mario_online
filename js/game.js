// ============================================================
//  game.js  –  main game loop, state machine, collision logic
// ============================================================

import {
  TILE, SPAWN, POWER, PSTATE, MSG, CANVAS_W, CANVAS_H,
} from './constants.js';
import { Level, LEVEL_COUNT } from './level.js';
import { Player }             from './player.js';
import { Camera }             from './camera.js';
import { Goomba, Koopa, createEnemy } from './enemies.js';
import {
  Coin, PowerUp, Particle, ScorePop, spawnBrickBreak,
} from './collectibles.js';
import { overlaps, stompCheck }       from './physics.js';
import { preloadSprites, Sprites }    from './sprites.js';

const STATE = {
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED:  'paused',
  WIN:     'win',
  GAMEOVER:'gameover',
};

const SYNC_RATE = 3;   // send state every N frames (host only)

export class Game {
  constructor(canvas, network, localPlayerIndex) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.net      = network;
    this.localIdx = localPlayerIndex;  // 0 = P1 (Mario/host), 1 = P2 (Luigi/client)
    this.isHost   = localPlayerIndex === 0;

    this._state       = STATE.LOADING;
    this._levelIndex  = 0;
    this._frame       = 0;
    this._syncTimer   = 0;
    this._rafId       = null;
    this._winTimer    = 0;

    this._localInput  = null;  // Input instance set by main.js
    this._remoteInput = {      // Last received input from peer
      left: false, right: false, jump: false, run: false, fire: false,
    };

    // Host starts solo – P2 activates on connection
    // Client is always connected (they joined to get here)
    this.peerConnected = !this.isHost;
    this._peerCode     = null;  // shown on-canvas while waiting

    this._canvas_scale = 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Set up network message handler
    if (this.net) {
      this.net.onMessage = (msg) => this._handleNetMsg(msg);
    }
  }

  setInput(inputInstance) {
    this._localInput = inputInstance;
  }

  /** Attach (or replace) the network after game has already started. */
  setNet(network) {
    this.net = network;
    if (network) network.onMessage = (msg) => this._handleNetMsg(msg);
  }

  /** Call when a peer connects mid-game (host only). */
  onPeerJoined() {
    this.peerConnected = true;
    this._peerCode     = null;
    // Respawn P2 at spawn point
    const p2 = this.players[1];
    p2.respawn();
    // Immediately send full state so client can sync
    if (this.net) this._sendStateSync();
    this._showMsg('Player 2 joined! 👋');
  }

  /** Load a level (or reload current one). */
  load(levelIndex) {
    this._levelIndex = levelIndex;
    this.level   = new Level(levelIndex);
    this.camera  = new Camera(this.level.widthPx, this.level.heightPx);

    const sp1 = this.level.p1Spawn;
    const sp2 = this.level.p2Spawn;

    this.players = [
      new Player(0, false, sp1.col * TILE, sp1.row * TILE),
      new Player(1, true,  sp2.col * TILE, sp2.row * TILE),
    ];

    // Only host spawns enemies (authoritative)
    this.enemies  = [];
    this.coins    = [];
    this.powerUps = [];
    this.particles = [];
    this.scorePops = [];

    if (this.isHost) {
      this._spawnLevelEntities();
    }

    this._state = STATE.PLAYING;
    this._winTimer = 0;
    this._frame = 0;

    preloadSprites();
  }

  _spawnLevelEntities() {
    for (const sp of this.level.spawns) {
      switch (sp.type) {
        case SPAWN.GOOMBA:
        case SPAWN.KOOPA: {
          const e = createEnemy(sp.type, sp.col, sp.row);
          if (e) this.enemies.push(e);
          break;
        }
        case SPAWN.COIN: {
          this.coins.push(new Coin(sp.col * TILE + 8, sp.row * TILE, false));
          break;
        }
        // QBLOCK item spawns handled when blocks are hit
      }
    }
  }

  /** Main update tick – call each animation frame. */
  update() {
    if (this._state !== STATE.PLAYING) return;

    this._frame++;

    // Update input
    if (this._localInput) this._localInput.update();

    // Determine which player this client controls
    const localP  = this.players[this.localIdx];
    const remoteP = this.players[1 - this.localIdx];

    const localSnap = this._localInput ? this._localInput.snapshot() : {};

    // Send local input to remote peer (every frame, only when connected)
    if (this.net && this.peerConnected) {
      this.net.send({ type: MSG.INPUT, frame: this._frame, keys: localSnap });
    }

    // Update local player with local input
    localP.update(this._applyInputSnap(localP, localSnap), this.level);

    if (this.isHost) {
      // Host: update remote player only when someone is connected
      if (this.peerConnected) {
        remoteP.update(this._applyInputSnap(remoteP, this._remoteInput), this.level);
      }

      // Update enemies
      for (const e of this.enemies) e.update(this.level, 1);
      this.enemies = this.enemies.filter(e => !e.remove);

      // Update power-ups
      for (const pu of this.powerUps) pu.update(this.level, 1);
      this.powerUps = this.powerUps.filter(pu => !pu.dead);

      // Collisions
      this._handleCollisions();

      // Drain events from players (block hits, hurts, etc.)
      this._processPlayerEvents();

      // Periodic full-state sync to client
      if (this.peerConnected) {
        this._syncTimer++;
        if (this._syncTimer >= SYNC_RATE) {
          this._syncTimer = 0;
          this._sendStateSync();
        }
      }

      // Win condition (P2 only counts if connected)
      const p2AtGoal = this.peerConnected && remoteP.x / TILE > this.level.goalCol;
      if (this.level.goalCol > 0 &&
          (localP.x / TILE > this.level.goalCol || p2AtGoal)) {
        this._winTimer++;
        if (this._winTimer > 90) this._onLevelClear();
      }

    } else {
      // Client: just animate remote player (host will correct state)
      // Client doesn't simulate enemies / physics for remote entities
    }

    // Common: update coins, particles, score pops
    for (const c of this.coins)    c.update(1);
    for (const p of this.particles) p.update(1);
    for (const s of this.scorePops) s.update(1);

    this.coins     = this.coins.filter(c => !c.dead);
    this.particles = this.particles.filter(p => !p.dead);
    this.scorePops = this.scorePops.filter(s => !s.dead);

    this.level.update(1);
    // Only follow active players (don't let inactive P2 drag camera)
    const activePlayers = this.peerConnected
      ? this.players
      : [this.players[this.localIdx]];
    this.camera.follow(activePlayers);

    // Update HUD
    this._updateHUD();
  }

  _applyInputSnap(player, snap) {
    // Returns a lightweight input-like object
    return {
      left:  snap.left  ?? false,
      right: snap.right ?? false,
      jump:  snap.jump  ?? false,
      run:   snap.run   ?? false,
      fire:  snap.fire  ?? false,
    };
  }

  _handleCollisions() {
    const activePlayers = this.peerConnected
      ? this.players
      : [this.players[this.localIdx]];
    for (const player of activePlayers) {
      if (player.dead) continue;

      // Player ↔ coins
      for (const coin of this.coins) {
        if (!coin.dead && !coin._floating && overlaps(player, coin)) {
          coin.dead = true;
          player.coins++;
          player.score += 200;
          this._addScorePop(coin.x, coin.y, '200');
          if (player.coins % 100 === 0) player.lives++;
          if (this.net) this.net.send({ type: MSG.EVENT, event: 'COIN', pid: player.id, score: player.score });
        }
      }

      // Player ↔ power-ups
      for (const pu of this.powerUps) {
        if (!pu.dead && overlaps(player, pu)) {
          pu.dead = true;
          player.grow(pu.powerLevel);
          const pts = 1000;
          player.score += pts;
          this._addScorePop(pu.x, pu.y, '+' + pts);
          if (this.net) this.net.send({ type: MSG.EVENT, event: 'POWERUP', pid: player.id, power: pu.powerLevel });
        }
      }

      // Player ↔ enemies
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove) continue;
        if (!overlaps(player, enemy)) continue;

        const prevY = player._prevY ?? player.y;
        if (stompCheck(player, enemy, prevY)) {
          // Stomp
          let pts = 0;
          if (enemy instanceof Goomba) pts = enemy.stomp();
          else if (enemy instanceof Koopa) pts = enemy.stomp(player);

          player.vy = -8;  // bounce
          if (pts > 0) {
            player.score += pts;
            this._addScorePop(enemy.x, enemy.y, String(pts));
          }
          if (this.net) this.net.send({ type: MSG.EVENT, event: 'STOMP', eid: enemy.id, pid: player.id });
        } else if (enemy instanceof Koopa && enemy.shellMoving) {
          // Shell hurts player
          player.hurt();
        } else if (!enemy.dead) {
          player.hurt();
          if (this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
        }
      }

      // Player ↔ fireballs hitting enemies
      for (const fb of player._fireballs) {
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          if (overlaps(fb, enemy)) {
            const pts = enemy.kill();
            fb.dead = true;
            if (pts > 0) {
              player.score += pts;
              this._addScorePop(enemy.x, enemy.y, String(pts));
            }
          }
        }
      }
    }

    // Shell ↔ enemies
    for (const koopa of this.enemies) {
      if (!(koopa instanceof Koopa) || !koopa.shellMoving) continue;
      for (const enemy of this.enemies) {
        if (enemy === koopa || enemy.dead) continue;
        if (overlaps(koopa, enemy)) enemy.kill();
      }
    }
  }

  _processPlayerEvents() {
    const activePlayers = this.peerConnected
      ? this.players
      : [this.players[this.localIdx]];
    for (const player of activePlayers) {
      const evts = player.drainEvents();
      for (const evt of evts) {
        if (evt.type === 'BLOCK_HIT') {
          this._onBlockHit(evt.item, evt.col, evt.row, player);
        }
      }
    }
  }

  _onBlockHit(item, col, row, player) {
    if (item === 'BRICK') {
      if (player.big) {
        // Break brick
        this.level.tiles[row][col] = 0;
        const parts = spawnBrickBreak(col, row);
        this.particles.push(...parts);
        if (this.net) this.net.send({ type: MSG.EVENT, event: 'BRICK_BREAK', col, row });
      }
    } else if (item === SPAWN.COIN) {
      const cx = col * TILE + TILE / 4;
      const cy = row * TILE;
      this.coins.push(new Coin(cx, cy, true));
      player.coins++;
      player.score += 200;
      this._addScorePop(cx, cy, '200');
    } else if (item === SPAWN.MUSHROOM || item === SPAWN.FLOWER) {
      const type = (item === SPAWN.FLOWER && player.power >= POWER.BIG)
        ? SPAWN.FLOWER : SPAWN.MUSHROOM;
      this.powerUps.push(new PowerUp(col * TILE, (row - 1) * TILE, type));
      if (this.net) this.net.send({ type: MSG.EVENT, event: 'POWERUP_SPAWN', col, row, putype: type });
    }
    if (this.net) this.net.send({ type: MSG.EVENT, event: 'BLOCK_HIT', col, row, item });
  }

  _addScorePop(x, y, text) {
    this.scorePops.push(new ScorePop(x, y, text));
  }

  _onLevelClear() {
    this._state = STATE.WIN;
    this._showMsg('Level Clear! 🎉');
    if (this.net) this.net.send({ type: MSG.EVENT, event: 'WIN' });
    setTimeout(() => this._nextLevel(), 3000);
  }

  _nextLevel() {
    const next = (this._levelIndex + 1) % LEVEL_COUNT;
    this.load(next);
    if (this.net) this.net.send({ type: MSG.RESTART, level: next });
  }

  _sendStateSync() {
    const msg = {
      type:     MSG.STATE,
      frame:    this._frame,
      players:  this.players.map(p => p.serialize()),
      enemies:  this.enemies.map(e => e.serialize()),
      coins:    this.coins.filter(c => !c._floating).map(c => ({ id: c.id, dead: c.dead })),
      powerUps: this.powerUps.map(pu => ({ id: pu.id, x: pu.x, y: pu.y, dead: pu.dead, type: pu.type })),
      tiles:    this._changedTiles(),
    };
    this.net.send(msg);
  }

  _changedTiles() {
    // Very simple: just send all QUSED tiles (after first hit, they stay spent)
    // In production, delta-compress this.
    return [];
  }

  _handleNetMsg(msg) {
    switch (msg.type) {
      case MSG.INPUT:
        this._remoteInput = msg.keys;
        break;

      case MSG.STATE:
        if (!this.isHost) this._applyStateSync(msg);
        break;

      case MSG.EVENT:
        this._applyEvent(msg);
        break;

      case MSG.RESTART:
        this.load(msg.level ?? 0);
        break;
    }
  }

  _applyStateSync(msg) {
    // Apply player states
    for (const ps of msg.players) {
      const player = this.players[ps.id];
      if (player) {
        // Don't override local player (except for authoritative corrections)
        if (ps.id !== this.localIdx) {
          player.applyState(ps);
        } else {
          // Accept authoritative corrections for local player
          player.applyState(ps);
        }
      }
    }

    // Apply enemy states (client just mirrors host)
    if (msg.enemies) {
      for (const es of msg.enemies) {
        let enemy = this.enemies.find(e => e.id === es.id);
        if (!enemy) {
          // Create new enemy
          if (es.type === 'Goomba') enemy = new Goomba(es.x, es.y);
          else if (es.type === 'Koopa') enemy = new Koopa(es.x, es.y);
          if (enemy) { enemy.id = es.id; this.enemies.push(enemy); }
        }
        if (enemy) enemy.applyState(es);
      }
      // Remove enemies not in host list
      const hostIds = new Set(msg.enemies.map(e => e.id));
      this.enemies = this.enemies.filter(e => hostIds.has(e.id));
    }

    // Apply coin dead states
    if (msg.coins) {
      for (const cs of msg.coins) {
        const coin = this.coins.find(c => c.id === cs.id);
        if (coin && cs.dead) coin.dead = true;
      }
    }

    // Apply power-up states
    if (msg.powerUps) {
      for (const pus of msg.powerUps) {
        let pu = this.powerUps.find(p => p.id === pus.id);
        if (!pu && !pus.dead) {
          pu = new PowerUp(pus.x, pus.y, pus.type);
          pu.id = pus.id;
          pu._emerging = false;
          this.powerUps.push(pu);
        }
        if (pu && pus.dead) pu.dead = true;
      }
      const hostIds = new Set(msg.powerUps.map(p => p.id));
      this.powerUps = this.powerUps.filter(p => hostIds.has(p.id) || p.dead);
    }
  }

  _applyEvent(msg) {
    switch (msg.event) {
      case 'BRICK_BREAK': {
        const { col, row } = msg;
        this.level.tiles[row][col] = 0;
        const parts = spawnBrickBreak(col, row);
        this.particles.push(...parts);
        break;
      }
      case 'WIN':
        this._state = STATE.WIN;
        this._showMsg('Level Clear! 🎉');
        break;
      case 'HURT':
        // Visual only on client
        break;
    }
  }

  // ── RENDERING ────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const cam = this.camera;
    const w   = this.canvas.width;
    const h   = this.canvas.height;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, this.level?.bgTop    ?? '#5C94FC');
    grad.addColorStop(1, this.level?.bgBottom ?? '#5C94FC');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (this._state === STATE.LOADING) {
      ctx.fillStyle = '#fff';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading…', w / 2, h / 2);
      return;
    }

    if (!this.level) return;

    // Tiles
    this.level.draw(ctx, cam);

    // Waiting-for-P2 overlay (host solo mode)
    if (this.isHost && !this.peerConnected && this._peerCode) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, 56);
      ctx.fillStyle = '#E8C84A';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Waiting for P2 — Share code:', 12, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(this._peerCode, 12, 46);
    }

    // Coins
    for (const c of this.coins) c.draw(ctx, cam);

    // Power-ups
    for (const pu of this.powerUps) pu.draw(ctx, cam);

    // Enemies
    for (const e of this.enemies) e.draw(ctx, cam);

    // Players (only draw P2 if peer is connected)
    this.players[this.localIdx].draw(ctx, cam);
    if (this.peerConnected) this.players[1 - this.localIdx].draw(ctx, cam);

    // Particles
    for (const p of this.particles) p.draw(ctx, cam);

    // Score pops
    for (const s of this.scorePops) s.draw(ctx, cam);

    // Goal flag pole
    if (this.level.goalCol > 0) {
      const fx = this.level.goalCol * TILE - cam.x;
      const fy = cam.y;
      ctx.fillStyle = '#B0B0B0';
      ctx.fillRect(fx + 14, 0, 4, h);
      ctx.fillStyle = '#E8C84A';
      ctx.fillRect(fx + 4, 8, 20, 14);
    }

    // Overlay for win/gameover states
    if (this._state === STATE.WIN || this._state === STATE.GAMEOVER) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  _showMsg(text) {
    const el = document.getElementById('game-msg');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }

  _updateHUD() {
    const p1 = this.players[0];
    const p2 = this.players[1];
    const totalScore = p1.score + (this.peerConnected ? p2.score : 0);

    const safe = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    safe('p1-coins', p1.coins);
    safe('p1-lives', p1.lives);
    safe('p1-power', ['', '🍄', '🔥'][p1.power] ?? '');
    if (this.peerConnected) {
      safe('p2-coins', p2.coins);
      safe('p2-lives', p2.lives);
      safe('p2-power', ['', '🍄', '🔥'][p2.power] ?? '');
    } else {
      safe('p2-coins', '—');
      safe('p2-lives', '—');
      safe('p2-power', '');
    }
    safe('score-val', totalScore);
  }

  _resize() {
    const ar = CANVAS_W / CANVAS_H;
    const winW = window.innerWidth;
    const winH = window.innerHeight - 42; // minus HUD height
    let cw = winW;
    let ch = winW / ar;
    if (ch > winH) { ch = winH; cw = winH * ar; }
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.width  = cw + 'px';
    this.canvas.style.height = ch + 'px';
  }

  /** Called each animation frame by main.js. */
  tick() {
    this.update();
    this.render();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resize);
  }
}
