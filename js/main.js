// ============================================================
//  main.js  –  entry point: lobby UI + game loop bootstrap
// ============================================================

import { Game }    from './game.js';
import { Network } from './network.js';
import { Input }   from './input.js';

// ── DOM refs ─────────────────────────────────────────────

const lobbyEl    = document.getElementById('lobby');
const gameEl     = document.getElementById('game-screen');
const lobbyStatus = document.getElementById('lobby-status');
const canvas     = document.getElementById('game-canvas');

// ── Globals ───────────────────────────────────────────────

let game  = null;
let net   = null;
let input = null;
let rafId = null;

// ── Room cards ────────────────────────────────────────────

document.querySelectorAll('.room-card').forEach(card => {
  card.addEventListener('click', () => {
    const roomName = card.dataset.room;
    joinOrHost(roomName);
  });
});

// ── Join-or-host logic ────────────────────────────────────
//
// Try to JOIN first. If the room is empty (peer-unavailable),
// automatically become the HOST instead.

function joinOrHost(roomName) {
  document.querySelectorAll('.room-card').forEach(b => b.disabled = true);
  setStatus('Connecting to ' + roomName + '…');

  net = new Network();

  // ── Attempt to join as Player 2 ──
  net.onConnected = () => {
    setStatus('Joined! Starting…');
    setTimeout(() => startGame(1, roomName), 600);
  };

  net.onError = (err) => {
    if (err.type === 'peer-unavailable') {
      // Room is empty — destroy the failed attempt and host instead
      net.destroy();
      net = new Network();

      net.onConnected = () => {
        if (game) game.onPeerJoined();
      };

      net.onError = (e) => {
        console.warn('Host network error:', e.type);
        if (game) game._peerCode = 'Room: ' + roomName + ' (network error)';
      };

      setStatus('Room is empty — you are the host!');
      startGame(0, roomName);
      net.host(roomName);
    } else {
      setStatus('Error: ' + err.type, true);
      resetLobby();
    }
  };

  net.join(roomName);
}

//  Game start 

function startGame(playerIndex, roomName = null) {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');

  input = new Input();
  game  = new Game(canvas, net, playerIndex);

  // Show human-readable room name on canvas
  game._peerCode = roomName ? 'Room: ' + roomName : '';

  net.onDisconnected = () => showDisconnect();

  game.setInput(input);
  game.load(0);

  // Pause RAF when tab is hidden to prevent position-jump on refocus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      if (!rafId) loop();
    }
  });

  function loop() {
    rafId = requestAnimationFrame(loop);
    game.tick();
  }
  loop();
}

//  Solo / dev mode (URL param ?solo=1) 

if (new URLSearchParams(location.search).get('solo') === '1') {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');

  input = new Input();
  game  = new Game(canvas, null, 0);
  game.setInput(input);
  game.load(0);

  (function loop() {
    rafId = requestAnimationFrame(loop);
    game.tick();
  })();
}

//  Helpers 

function showDisconnect() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  const msg = document.getElementById('game-msg');
  if (msg) {
    msg.textContent = 'Peer disconnected. Refresh to play again.';
    msg.classList.remove('hidden');
  }
}

function setStatus(text, isError = false) {
  lobbyStatus.textContent = text;
  lobbyStatus.className   = 'status-msg' + (isError ? ' error' : '');
}

function resetLobby() {
  document.querySelectorAll('.room-card').forEach(b => b.disabled = false);
  if (net) { net.destroy(); net = null; }
}
