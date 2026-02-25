// ============================================================
//  game.js  –  main game loop, state machine, collision logic
// ============================================================

import {
  TILE, SPAWN, POWER, PSTATE, MSG, CANVAS_W, CANVAS_H, T, HAZARD_TILES,
} from './constants.js';
import { Level, LEVEL_COUNT, SPAWN_CRATE } from './level.js';
import { Player }             from './player.js';
import { Camera }             from './camera.js';
import { Goomba, Koopa, FireBro, IceGoomba, Lizard, Flyer, createEnemy } from './enemies.js';
import {
  Coin, PowerUp, Particle, ScorePop, spawnBrickBreak,
} from './collectibles.js';
import { overlaps, stompCheck, resolveEntityVsObj } from './physics.js';
import { preloadSprites, Sprites }    from './sprites.js';
import {
  ITEM, ITEM_ICON, CRATE_DROPS,
  WeaponCrate, Bullet, Rocket, GrenadeProj, Explosion,
  GrappleHook, SwordSwing, DrawObject,
} from './items.js';

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

    // Item system state
    this.weaponCrates   = [];
    this.projectileList = [];
    this.explosions     = [];
    this.drawnObjects   = [];
    this._pencilState   = { drawing: false, pts: [], minX: 0, maxX: 0, minY: 0, maxY: 0 };

    // Chat
    this._chatLog      = [];  // [{pid, name, text, timer}]
    this._speechBubble = {};  // { [pid]: {text, timer} }
  }

  setInput(inputInstance) {
    this._localInput = inputInstance;
    inputInstance.onChatSubmit = (text) => this._sendChat(text);
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
    this.enemies   = [];
    this.platforms = [];  // moving platforms
    this.coins    = [];
    this.powerUps = [];
    this.particles = [];
    this.scorePops = [];

    // Item system – reset each level load
    this.weaponCrates   = [];
    this.projectileList = [];
    this.explosions     = [];
    this.drawnObjects   = [];
    this._pencilState   = { drawing: false, pts: [], minX: 0, maxX: 0, minY: 0, maxY: 0 };
    // Reset player item state
    for (const p of this.players ?? []) {
      p.inventory   = [];
      p.activeSlot  = 0;
      p.grappleHook = null;
      p._gunTimer   = 0;
      p._swordCooldown = 0;
    }

    if (this.isHost) {
      this._spawnLevelEntities();
    }
    // Weapon crates are visual – spawn on both sides
    this._spawnWeaponCrates();

    this._state = STATE.PLAYING;
    this._winTimer = 0;
    this._frame = 0;

    preloadSprites();
  }

  _spawnLevelEntities() {
    for (const sp of this.level.spawns) {
      switch (sp.type) {
        case SPAWN.GOOMBA:
        case SPAWN.KOOPA:
        case SPAWN.FIREBRO:
        case SPAWN.ICEGOOMBA:
        case SPAWN.LIZARD:
        case SPAWN.FLYER: {
          const e = createEnemy(sp.type, sp.col, sp.row);
          if (e) this.enemies.push(e);
          break;
        }
        case SPAWN.COIN: {
          this.coins.push(new Coin(sp.col * TILE + 8, sp.row * TILE, false));
          break;
        }
        case 'MOVING_PLATFORM': {
          const px = sp.col * TILE;
          const py = (sp.row - 1) * TILE;
          this.platforms.push({
            x:      px,
            y:      py,
            w:      72,
            h:      14,
            startX: Math.max(0, px - 96),
            endX:   Math.min(this.level.widthPx - 72, px + 96),
            speed:  1.4,
            dir:    1,
          });
          break;
        }
        // QBLOCK item spawns handled when blocks are hit
      }
    }
  }

  _spawnWeaponCrates() {
    for (const sp of this.level.spawns) {
      if (sp.type === SPAWN_CRATE) {
        this.weaponCrates.push(new WeaponCrate(sp.col * TILE + 2, (sp.row - 1) * TILE));
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
    // If dead, track the other player's position so respawn lands on them
    if (localP.dead && !remoteP.dead) {
      localP._spawnX = remoteP.x;
      localP._spawnY = remoteP.y;
    }
    localP.update(this._applyInputSnap(localP, localSnap), this.level);

    // ── Item system (local player) ──────────────────────────────
    if (this._localInput) {
      // Sync active slot (scroll / number keys)
      localP.activeSlot = Math.min(
        this._localInput.slot,
        Math.max(0, localP.inventory.length - 1),
      );
      // Compute world-space mouse angle
      const pcx = localP.x + localP.w / 2 - this.camera.x;
      const pcy = localP.y + localP.h / 2 - this.camera.y;
      this._localInput.mouseAngle = Math.atan2(
        this._localInput.mouseY - pcy,
        this._localInput.mouseX - pcx,
      );
      this._processLocalItems(localP, this._localInput);
      // Pencil drawing
      this._handlePencil(localP, this._localInput);
    }
    // Grapple hook update for local player
    if (localP.grappleHook) {
      localP.grappleHook.update(this.level);
      localP.grappleHook.applyToPlayer(localP);
      if (localP.grappleHook.dead) localP.grappleHook = null;
    }

    if (this.isHost) {
      // Host: update remote player only when someone is connected
      if (this.peerConnected) {
        // If remote is dead, respawn them on top of local player
        if (remoteP.dead && !localP.dead) {
          remoteP._spawnX = localP.x;
          remoteP._spawnY = localP.y;
        }
        remoteP.update(this._applyInputSnap(remoteP, this._remoteInput), this.level);
        // Bug fix #1: sync remote player's active slot from their input
        // (host's copy of remoteP.activeSlot was stale, causing wrong weapon to fire)
        if (this._remoteInput.slot !== undefined) {
          remoteP.activeSlot = Math.min(
            this._remoteInput.slot,
            Math.max(0, remoteP.inventory.length - 1),
          );
        }
        // Item system for remote player (host is authoritative)
        this._processRemoteItems(remoteP, this._remoteInput);
        if (remoteP.grappleHook) {
          remoteP.grappleHook.update(this.level);
          remoteP.grappleHook.applyToPlayer(remoteP);
          if (remoteP.grappleHook.dead) remoteP.grappleHook = null;
        }
      }

      // Update moving platforms
      for (const plat of this.platforms) {
        plat.x += plat.speed * plat.dir;
        if (plat.x >= plat.endX || plat.x <= plat.startX) plat.dir *= -1;
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
      // Client: simulate enemies locally + run collisions for local player.
      // Host state sync every SYNC_RATE frames corrects any drift.
      for (const e of this.enemies) e.update(this.level, 1);
      this.enemies = this.enemies.filter(e => !e.remove);
      this._handleCollisions();
      this._processPlayerEvents();
    }

    // Common: update coins, particles, score pops
    for (const c of this.coins)    c.update(1);
    for (const p of this.particles) p.update(1);
    for (const s of this.scorePops) s.update(1);

    this.coins     = this.coins.filter(c => !c.dead);
    this.particles = this.particles.filter(p => !p.dead);
    this.scorePops = this.scorePops.filter(s => !s.dead);

    // ── Item world ────────────────────────────────────────────
    this._updateProjectileList();
    for (const c of this.weaponCrates) c.update(1);
    this._checkCratePickups();
    this._updateDrawnObjects();

    // ── Chat timers ───────────────────────────────────────────
    for (const entry of this._chatLog) entry.timer--;
    this._chatLog = this._chatLog.filter(e => e.timer > 0);
    for (const pid of Object.keys(this._speechBubble)) {
      this._speechBubble[pid].timer--;
      if (this._speechBubble[pid].timer <= 0) delete this._speechBubble[pid];
    }


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
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'COIN', pid: player.id, score: player.score });
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
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'POWERUP', pid: player.id, power: pu.powerLevel });
        }
      }

      // Player ↔ moving platforms
      player._onIce = false;
      for (const plat of this.platforms) {
        const pBottom = player.y + player.h;
        const platTop = plat.y;
        if (
          player.x + player.w > plat.x &&
          player.x < plat.x + plat.w &&
          pBottom >= platTop - 4 &&
          pBottom <= platTop + 8 &&
          player.vy >= 0
        ) {
          player.y = platTop - player.h;
          player.vy = 0;
          player.onGround = true;
          player.x += plat.speed * plat.dir;
        }
      }

      // Lava hazard
      if (!player.dead && player.invuln <= 0) {
        const footX  = Math.floor((player.x + player.w / 2) / TILE);
        const footY  = Math.floor((player.y + player.h + 2) / TILE);
        const underT = this.level.get(footX, footY);
        if (HAZARD_TILES.has(underT)) {
          player.hurt();
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
        }
        // Ice friction flag
        if (underT === T.ICE || this.level.get(footX, footY - 1) === T.ICE) {
          player._onIce = true;
        }
      }

      // Player ↔ enemies
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove) continue;
        if (!overlaps(player, enemy)) continue;

        if (stompCheck(player, enemy)) {
          // Stomp
          const pts = enemy.stomp ? enemy.stomp(player) : 0;

          // IceGoomba: freeze effect on stomp
          if (enemy instanceof IceGoomba && !enemy._frozePlayer) {
            enemy._frozePlayer = true;
            player._onIce = true;
          }

          player.vy = -8;  // bounce
          player.stompGrace = 12; // ~12 frames of immunity after stomp
          if (pts > 0) {
            player.score += pts;
            this._addScorePop(enemy.x, enemy.y, String(pts));
          }
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'STOMP', eid: enemy.id, pid: player.id });
        } else if (player.stompGrace > 0) {
          // Still in post-stomp grace window – ignore contact
        } else if (enemy instanceof Koopa && enemy.shellMoving) {
          // Moving shell hurts player
          player.hurt();
        } else if (enemy instanceof Koopa && enemy.shelled) {
          // Bug fix #3: static shell — safe to stand next to, kick on next stomp
        } else if (enemy instanceof IceGoomba && !enemy.dead) {
          // IceGoomba touch freezes briefly
          player._onIce = true;
          player.hurt();
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
        } else if (!enemy.dead) {
          player.hurt();
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
        }
      }

      // FireBro fireballs ↔ player
      for (const enemy of this.enemies) {
        if (!(enemy instanceof FireBro)) continue;
        for (const fb of enemy.getProjectiles()) {
          const fbRect = { x: fb.x - fb.r, y: fb.y - fb.r, w: fb.r * 2, h: fb.r * 2 };
          if (overlaps(player, fbRect) && player.invuln <= 0 && !player.dead) {
            fb.life = 0;
            player.hurt();
            if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
          }
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

    // Projectiles ↔ enemies  (runs on both sides so client feels responsive)
    for (const proj of this.projectileList) {
      if (proj.dead) continue;
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove) continue;
        const ex = enemy.x + enemy.w / 2;
        const ey = enemy.y + enemy.h / 2;
        if (proj instanceof SwordSwing) {
          if (!proj._hitIds) proj._hitIds = new Set();
          if (proj.hitsPoint(ex, ey) && !proj._hitIds.has(enemy.id)) {
            proj._hitIds.add(enemy.id);
            const pts = enemy.kill();
            if (pts > 0) {
              this._addScorePop(enemy.x, enemy.y, String(pts));
            }
          }
        } else if (proj instanceof Bullet) {
          if (overlaps(proj, enemy)) {
            proj.dead = true;
            const pts = enemy.kill();
            if (pts > 0) this._addScorePop(enemy.x, enemy.y, String(pts));
          }
        } else if (proj instanceof Rocket || proj instanceof GrenadeProj) {
          if (overlaps(proj, enemy)) {
            proj._exploded = true;
            proj.dead = true;
            this._triggerExplosion(ex, ey);
          }
        }
      }
    }

    // Explosions ↔ enemies
    for (const expl of this.explosions) {
      if (!expl._hitIds) expl._hitIds = new Set();
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove || expl._hitIds.has(enemy.id)) continue;
        const ex = enemy.x + enemy.w / 2;
        const ey = enemy.y + enemy.h / 2;
        if (expl.overlapsPoint(ex, ey)) {
          expl._hitIds.add(enemy.id);
          const pts = enemy.kill();
          if (pts > 0) this._addScorePop(enemy.x, enemy.y, String(pts));
        }
      }
      // Explosions ↔ players — friendly fire disabled
      // (removed: player.hurt() from explosions)
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
        } else if (evt.type === 'GAME_OVER') {
          this._onGameOver();
        }
      }
    }
  }

  _onGameOver() {
    if (this._state === STATE.GAMEOVER) return;
    this._state = STATE.GAMEOVER;
    this._showMsg('Game Over!');
    if (this.net) this.net.send({ type: MSG.EVENT, event: 'GAME_OVER' });
    setTimeout(() => {
      // Reset lives and restart from level 1
      this._resetAndReload(0);
      if (this.net) this.net.send({ type: MSG.RESTART, level: 0 });
    }, 3000);
  }

  _resetAndReload(levelIndex) {
    // Preserve peerConnected state across reset
    const wasPeerConnected = this.peerConnected;
    this.load(levelIndex);
    this.peerConnected = wasPeerConnected;
    // Give both players fresh lives
    this.players[0].lives = 3;
    this.players[1].lives = 3;
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
    const next = (this._levelIndex + 1) % LEVEL_COUNT;
    setTimeout(() => {
      this._resetAndReload(next);
      if (this.net) this.net.send({ type: MSG.RESTART, level: next });
    }, 3000);
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
          if      (es.type === 'Goomba')    enemy = new Goomba(es.x, es.y);
          else if (es.type === 'Koopa')     enemy = new Koopa(es.x, es.y);
          else if (es.type === 'FireBro')   enemy = new FireBro(es.x, es.y);
          else if (es.type === 'IceGoomba') enemy = new IceGoomba(es.x, es.y);
          else if (es.type === 'Lizard')    enemy = new Lizard(es.x, es.y);
          else if (es.type === 'Flyer')     enemy = new Flyer(es.x, es.y);
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
        if (pu) {
          // Always sync position from host so mushroom visibly moves on client
          pu.x = pus.x;
          pu.y = pus.y;
          if (pus.dead) pu.dead = true;
        }
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
      case 'GAME_OVER':
        this._state = STATE.GAMEOVER;
        this._showMsg('Game Over!');
        break;
      case 'HURT':
        // Visual only on client
        break;
      case 'POWERUP': {
        // Immediately apply power-up to the correct player so sprite updates at once
        const player = this.players[msg.pid];
        if (player) player.grow(msg.power);
        break;
      }
      case 'DRAW_OBJ': {
        const obj = new DrawObject(msg.x, msg.y, msg.w, msg.h, msg.pts);
        this.drawnObjects.push(obj);
        break;
      }
      case 'CRATE_PICKUP': {
        // Mark the crate dead on client; item is applied to player via state sync
        const crate = this.weaponCrates.find(c => c.id === msg.cid);
        if (crate) crate.dead = true;
        this.weaponCrates = this.weaponCrates.filter(c => !c.dead);
        // Also tentatively add item in case state sync hasn't landed yet
        const player = this.players[msg.pid];
        if (player) player.addItem(msg.item);
        break;
      }
      case 'CHAT': {
        this._receiveChat(msg.pid, msg.text);
        break;
      }
      // Bug fix #2: host broadcasts its own projectile spawns so client can see them
      case 'PROJ_SPAWN': {
        // Don't duplicate local player's own projectiles (client already created them)
        if (!this.isHost) {
          switch (msg.projType) {
            case ITEM.MACHINE_GUN:
              this.projectileList.push(new Bullet(msg.x, msg.y, msg.angle));
              break;
            case ITEM.ROCKET:
              this.projectileList.push(new Rocket(msg.x, msg.y, msg.angle));
              break;
            case ITEM.GRENADE:
              this.projectileList.push(new GrenadeProj(msg.x, msg.y, msg.vx, msg.vy));
              break;
            case ITEM.SWORD: {
              const sw = new SwordSwing(msg.x, msg.y, msg.angle);
              this.projectileList.push(sw);
              break;
            }
            case ITEM.GRAPPLE: {
              const p = this.players[msg.pid ?? 0];
              if (p) {
                p.grappleHook = new GrappleHook(msg.x, msg.y, msg.angle);
              }
              break;
            }
          }
        }
        break;
      }
    }
  }

  // ── CHAT ─────────────────────────────────────────────────

  _sendChat(text) {
    // Add locally first
    this._receiveChat(this.localIdx, text);
    // Broadcast to peer
    if (this.net && this.peerConnected) {
      this.net.send({ type: MSG.EVENT, event: 'CHAT', pid: this.localIdx, text });
    }
  }

  _receiveChat(pid, text) {
    const names = ['Mario', 'Luigi'];
    this._chatLog.push({ pid, name: names[pid] ?? 'P' + (pid + 1), text, timer: 420 }); // 7 sec
    if (this._chatLog.length > 8) this._chatLog.shift();
    this._speechBubble[pid] = { text, timer: 240 }; // 4 sec above head
  }

  _drawSpeechBubbles(ctx, cam) {
    for (const player of this.players) {
      const bubble = this._speechBubble[player.id];
      if (!bubble) continue;
      const alpha = Math.min(1, bubble.timer / 30);  // fade out last 30 frames
      const bx = player.x - cam.x + player.w / 2;
      const by = player.y - cam.y - 10;
      const maxW = 140;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 9px sans-serif';

      // Wrap text
      const words = bubble.text.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW - 12) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);

      const lineH = 12;
      const bw = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 12);
      const bh = lines.length * lineH + 8;
      const rx = bx - bw / 2;
      const ry = by - bh - 8;

      // Bubble background
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + bw - r, ry);
      ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + r);
      ctx.lineTo(rx + bw, ry + bh - r);
      ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - r, ry + bh);
      // Tail triangle
      ctx.lineTo(bx + 5, ry + bh);
      ctx.lineTo(bx, ry + bh + 8);
      ctx.lineTo(bx - 5, ry + bh);
      ctx.lineTo(rx + r, ry + bh);
      ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - r);
      ctx.lineTo(rx, ry + r);
      ctx.quadraticCurveTo(rx, ry, rx + r, ry);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bx, ry + 10 + i * lineH);
      }
      ctx.restore();
    }
  }

  _drawChatWindow(ctx) {
    const CHAT_W = 220;
    const CHAT_X = CANVAS_W - CHAT_W - 8;
    const CHAT_Y = 8;
    const LINE_H = 16;
    const PAD    = 7;
    const FONT   = '11px monospace';

    const inputOpen = this._localInput?.chatMode;
    const lines = this._chatLog.map(e => ({ label: e.name + ': ' + e.text, pid: e.pid }));

    // Always show a small Y-hint when idle and no log
    if (!inputOpen && lines.length === 0) {
      ctx.save();
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText('[Y] chat', CANVAS_W - 8, 22);
      ctx.restore();
      return;
    }

    const totalLines = lines.length + (inputOpen ? 1 : 0);
    const boxH = totalLines * LINE_H + PAD * 2;

    ctx.save();

    // Dark background
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(CHAT_X, CHAT_Y, CHAT_W, boxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(CHAT_X, CHAT_Y, CHAT_W, boxH);

    ctx.font = FONT;
    ctx.textAlign = 'left';
    const colors = ['#60AAFF', '#66EE88'];

    for (let i = 0; i < lines.length; i++) {
      const { label, pid } = lines[i];
      ctx.fillStyle = colors[pid] ?? '#eee';
      ctx.fillText(label, CHAT_X + PAD, CHAT_Y + PAD + (i + 1) * LINE_H - 4);
    }

    // Chat input line
    if (inputOpen) {
      const iy = CHAT_Y + PAD + lines.length * LINE_H;
      // Slightly lighter bg for the input row
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(CHAT_X + 1, iy - LINE_H + 3, CHAT_W - 2, LINE_H);
      const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '█' : ' ';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('> ' + this._localInput.chatBuffer + cursor, CHAT_X + PAD, iy + LINE_H - 8);
    }

    ctx.restore();
  }

  // ── ITEM SYSTEM ───────────────────────────────────────────

  _processLocalItems(player, input) {
    this._tickItemCooldowns(player);
    const slot = player.getActiveSlot();
    if (!slot) return;
    const angle = input.mouseAngle ?? 0;
    if (slot.type === ITEM.MACHINE_GUN) {
      if (input.mouseDown && player._gunTimer <= 0) {
        this._fireItem(player, slot, angle);
        player._gunTimer = 4;
      }
    } else if (slot.type === ITEM.PENCIL) {
      // handled by _handlePencil
    } else {
      if (input.mouseClicked) this._fireItem(player, slot, angle);
    }
  }

  _processRemoteItems(player, remoteInput) {
    this._tickItemCooldowns(player);
    const slot = player.getActiveSlot();
    if (!slot) return;
    const angle = remoteInput.mouseAngle ?? 0;
    if (slot.type === ITEM.MACHINE_GUN) {
      if (remoteInput.mouseDown && player._gunTimer <= 0) {
        // _broadcastOk=false: client already created this locally via _processLocalItems
        this._fireItem(player, slot, angle, false);
        player._gunTimer = 4;
      }
    } else if (slot.type !== ITEM.PENCIL) {
      if (remoteInput.mouseClicked) this._fireItem(player, slot, angle, false);
    }
  }

  _tickItemCooldowns(player) {
    if (player._gunTimer > 0)   player._gunTimer--;
    if (player._swordCooldown > 0) player._swordCooldown--;
  }

  _fireItem(player, slot, angle, _broadcastOk = true) {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    // Bug fix #2: broadcast this event to the peer so they see the visual.
    // Only the HOST broadcasts (for its own weapons only — remote player's weapons
    // are already created locally on the client via _processLocalItems).
    const shouldBroadcast = _broadcastOk && this.isHost && this.peerConnected && this.net
                            && player.id === this.localIdx;

    switch (slot.type) {
      case ITEM.MACHINE_GUN: {
        const b = new Bullet(cx, cy, angle);
        this.projectileList.push(b);
        slot.consume();
        if (slot.ammo <= 0) player.inventory.splice(player.activeSlot, 1);
        if (shouldBroadcast) this.net.send({ type: MSG.EVENT, event: 'PROJ_SPAWN',
          projType: ITEM.MACHINE_GUN, x: cx, y: cy, angle });
        break;
      }
      case ITEM.ROCKET: {
        const r = new Rocket(cx, cy, angle);
        this.projectileList.push(r);
        slot.consume();
        if (slot.ammo <= 0) player.inventory.splice(player.activeSlot, 1);
        if (shouldBroadcast) this.net.send({ type: MSG.EVENT, event: 'PROJ_SPAWN',
          projType: ITEM.ROCKET, x: cx, y: cy, angle });
        break;
      }
      case ITEM.GRENADE: {
        const speed = 8;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const g = new GrenadeProj(cx, cy, vx, vy);
        this.projectileList.push(g);
        slot.consume();
        if (slot.ammo <= 0) player.inventory.splice(player.activeSlot, 1);
        if (shouldBroadcast) this.net.send({ type: MSG.EVENT, event: 'PROJ_SPAWN',
          projType: ITEM.GRENADE, x: cx, y: cy, vx, vy });
        break;
      }
      case ITEM.GRAPPLE: {
        // Re-fire while hook is alive = detach
        if (player.grappleHook && !player.grappleHook.dead) {
          player.grappleHook.dead = true;
          player.grappleHook = null;
        } else {
          const hook = new GrappleHook(cx, cy, angle);
          player.grappleHook = hook;
          // Don't add to projectileList; updated manually per-player
          if (shouldBroadcast) this.net.send({ type: MSG.EVENT, event: 'PROJ_SPAWN',
            projType: ITEM.GRAPPLE, x: cx, y: cy, angle, pid: player.id });
        }
        break;
      }
      case ITEM.SWORD: {
        if (player._swordCooldown > 0) break;
        const swing = new SwordSwing(cx, cy, angle);
        this.projectileList.push(swing);
        player._swordCooldown = 28;
        if (shouldBroadcast) this.net.send({ type: MSG.EVENT, event: 'PROJ_SPAWN',
          projType: ITEM.SWORD, x: cx, y: cy, angle });
        break;
      }
    }
  }

  _triggerExplosion(x, y) {
    const expl = new Explosion(x, y);
    this.explosions.push(expl);
  }

  _handlePencil(player, input) {
    if (player.getActiveSlot()?.type !== ITEM.PENCIL) {
      if (this._pencilState.drawing) {
        this._finishPencilStroke(player);
      }
      return;
    }
    const worldMX = input.mouseX + this.camera.x;
    const worldMY = input.mouseY + this.camera.y;

    if (input.mouseDown) {
      if (!this._pencilState.drawing) {
        this._pencilState = {
          drawing: true,
          pts: [[worldMX, worldMY]],
          minX: worldMX, maxX: worldMX,
          minY: worldMY, maxY: worldMY,
        };
      } else {
        const ps = this._pencilState;
        // Only add a point if moved enough (4 px threshold)
        const last = ps.pts[ps.pts.length - 1];
        const dx = worldMX - last[0];
        const dy = worldMY - last[1];
        if (dx * dx + dy * dy >= 16) {
          ps.pts.push([worldMX, worldMY]);
          ps.minX = Math.min(ps.minX, worldMX);
          ps.maxX = Math.max(ps.maxX, worldMX);
          ps.minY = Math.min(ps.minY, worldMY);
          ps.maxY = Math.max(ps.maxY, worldMY);
        }
      }
    } else if (this._pencilState.drawing) {
      this._finishPencilStroke(player);
    }
  }

  _finishPencilStroke(player) {
    const ps = this._pencilState;
    if (ps.pts.length >= 2) {
      const w = Math.max(ps.maxX - ps.minX, 4);
      const h = Math.max(ps.maxY - ps.minY, 4);
      const relPts = ps.pts.map(([x, y]) => [x - ps.minX, y - ps.minY]);
      const obj = new DrawObject(ps.minX, ps.minY, w, h, relPts);
      this.drawnObjects.push(obj);
      // Broadcast to peer
      if (this.net && this.peerConnected) {
        this.net.send({
          type: MSG.EVENT, event: 'DRAW_OBJ',
          x: ps.minX, y: ps.minY, w, h, pts: relPts,
        });
      }
    }
    this._pencilState.drawing = false;
    this._pencilState.pts = [];
  }

  _updateProjectileList() {
    for (const p of this.projectileList) {
      p.update(this.level);
      // Rockets and grenades that exploded → spawn explosion
      if ((p instanceof Rocket || p instanceof GrenadeProj) && p._exploded && !p._blastTriggered) {
        p._blastTriggered = true;
        this._triggerExplosion(p.x + (p.w ?? 0) / 2, p.y + (p.h ?? 0) / 2);
      }
    }
    this.projectileList = this.projectileList.filter(p => !p.dead);

    for (const e of this.explosions) e.update(1);
    this.explosions = this.explosions.filter(e => !e.dead);
  }

  _checkCratePickups() {
    // Only the host is authoritative for drops – client just marks dead via event
    const activePlayers = this.peerConnected ? this.players : [this.players[this.localIdx]];
    for (const player of activePlayers) {
      if (player.dead) continue;
      for (const crate of this.weaponCrates) {
        if (crate.dead) continue;
        if (overlaps(player, crate)) {
          crate.dead = true;
          if (this.isHost) {
            const item = CRATE_DROPS[Math.floor(Math.random() * CRATE_DROPS.length)];
            player.addItem(item);
            this._addScorePop(crate.x, crate.y, ITEM_ICON[item] ?? '📦');
            if (this.net && this.peerConnected) {
              this.net.send({
                type: MSG.EVENT, event: 'CRATE_PICKUP',
                cid: crate.id, pid: player.id, item,
              });
            }
          }
        }
      }
    }
    this.weaponCrates = this.weaponCrates.filter(c => !c.dead);
  }

  _updateDrawnObjects() {
    for (const obj of this.drawnObjects) obj.update(this.level);
    const activePlayers = this.peerConnected ? this.players : [this.players[this.localIdx]];
    for (const obj of this.drawnObjects) {
      for (const player of activePlayers) {
        resolveEntityVsObj(player, obj);
      }
    }
    // Keep drawn objects around until they fall out of bounds
    this.drawnObjects = this.drawnObjects.filter(o => o.y < this.level.heightPx + 300);
  }

  _drawHotbar(ctx) {
    const player = this.players[this.localIdx];
    const slots  = player.inventory;
    const active = player.activeSlot;
    const N = 5;
    const slotW = 44, slotH = 44, gap = 6;
    const totalW = N * slotW + (N - 1) * gap;
    const startX = (CANVAS_W - totalW) / 2;
    const y = CANVAS_H - slotH - 8;

    ctx.save();
    for (let i = 0; i < N; i++) {
      const sx = startX + i * (slotW + gap);
      const slot = slots[i];
      const isActive = (i === active);

      // Background
      ctx.fillStyle = isActive ? 'rgba(232,200,74,0.92)' : 'rgba(0,0,0,0.60)';
      ctx.fillRect(sx, y, slotW, slotH);
      ctx.strokeStyle = isActive ? '#FFD700' : '#777';
      ctx.lineWidth   = isActive ? 3 : 1;
      ctx.strokeRect(sx, y, slotW, slotH);

      if (slot) {
        // Icon
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ITEM_ICON[slot.type] ?? '?', sx + slotW / 2, y + slotH / 2 + 7);
        // Ammo
        if (!slot.infinite) {
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(slot.ammo, sx + slotW / 2, y + slotH - 3);
        }
      }
      // Slot number
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = isActive ? '#000' : '#bbb';
      ctx.textAlign = 'left';
      ctx.fillText(i + 1, sx + 3, y + 11);
    }

    // Pencil preview (if drawing)
    if (this._pencilState.drawing && this._pencilState.pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#3A86FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const cam = this.camera;
      for (let i = 0; i < this._pencilState.pts.length; i++) {
        const [wx, wy] = this._pencilState.pts[i];
        const sx2 = wx - cam.x;
        const sy2 = wy - cam.y;
        if (i === 0) ctx.moveTo(sx2, sy2); else ctx.lineTo(sx2, sy2);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
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

    // Moving platforms
    for (const plat of this.platforms) {
      const px = plat.x - cam.x;
      const py = plat.y - cam.y;
      ctx.fillStyle = '#885522';
      ctx.fillRect(px, py, plat.w, plat.h);
      ctx.fillStyle = '#AA7744';
      ctx.fillRect(px + 2, py + 2, plat.w - 4, 5);
      // Grain lines
      ctx.strokeStyle = '#663311';
      ctx.lineWidth = 1;
      for (let i = 12; i < plat.w; i += 14) {
        ctx.beginPath();
        ctx.moveTo(px + i, py);
        ctx.lineTo(px + i, py + plat.h);
        ctx.stroke();
      }
    }

    // Drawn physics objects (pencil creations)
    for (const o of this.drawnObjects) o.draw(ctx, cam);

    // Weapon crates
    for (const c of this.weaponCrates) c.draw(ctx, cam);

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

    // Grapple hook ropes
    for (const pl of this.players) {
      if (pl.grappleHook) {
        const pcx = pl.x + pl.w / 2;
        const pcy = pl.y + pl.h / 2;
        pl.grappleHook.draw(ctx, cam, pcx, pcy);
      }
    }

    // Projectiles + sword swings
    for (const p of this.projectileList) p.draw(ctx, cam);

    // Explosions
    for (const e of this.explosions) e.draw(ctx, cam);

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

    // Speech bubbles above players
    this._drawSpeechBubbles(ctx, cam);

    // Chat window (top right)
    this._drawChatWindow(ctx);

    // Hotbar HUD (drawn on-canvas so it scales with the game)
    if (this._state === STATE.PLAYING) {
      this._drawHotbar(ctx);
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
