// ============================================================
//  main.js  –  entry point: lobby UI + game loop bootstrap
// ============================================================

import { Game }    from './game.js';
import { Network } from './network.js';
import { Input }   from './input.js';

// ── DOM refs ─────────────────────────────────────────────

const lobbyEl       = document.getElementById('lobby');
const gameEl        = document.getElementById('game-screen');
const btnHost       = document.getElementById('btn-host');
const btnJoin       = document.getElementById('btn-join');
const btnCopy       = document.getElementById('btn-copy');
const joinInput     = document.getElementById('join-input');
const peerIdDisplay = document.getElementById('peer-id-display');
const hostCodeArea  = document.getElementById('host-code-area');
const waitingMsg    = document.getElementById('waiting-msg');
const lobbyStatus   = document.getElementById('lobby-status');
const canvas        = document.getElementById('game-canvas');

// ── Globals ───────────────────────────────────────────────

let game    = null;
let net     = null;
let input   = null;
let rafId   = null;

// ── Lobby: Host flow ──────────────────────────────────────

btnHost.addEventListener('click', () => {
  setStatus('');
  btnHost.disabled = true;
  btnJoin.disabled = true;

  net = new Network();

  net.onPeerId = (id) => {
    peerIdDisplay.textContent = id;
    hostCodeArea.classList.remove('hidden');
  };

  net.onConnected = () => {
    waitingMsg.textContent = 'Player 2 connected! Starting…';
    setTimeout(() => startGame(0), 800);
  };

  net.onError = (err) => {
    setStatus('Connection error: ' + err.type, true);
    resetLobby();
  };

  net.host();
});

// ── Lobby: Join flow ─────────────────────────────────────

btnJoin.addEventListener('click', () => {
  const hostId = joinInput.value.trim();
  if (!hostId) { setStatus('Please enter a host code.', true); return; }

  setStatus('Connecting…');
  btnHost.disabled = true;
  btnJoin.disabled = true;

  net = new Network();

  net.onConnected = () => {
    setStatus('Connected! Starting…');
    setTimeout(() => startGame(1), 800);
  };

  net.onError = (err) => {
    setStatus('Could not connect: ' + err.type, true);
    resetLobby();
  };

  net.onDisconnected = () => {
    if (game) showDisconnect();
  };

  net.join(hostId);
});

// ── Copy code button ──────────────────────────────────────

btnCopy.addEventListener('click', () => {
  const code = peerIdDisplay.textContent;
  navigator.clipboard?.writeText(code).then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy Code'; }, 1500);
  });
});

// Also allow pressing Enter in the join input
joinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

// ── Game start ────────────────────────────────────────────

function startGame(playerIndex) {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');

  input = new Input();
  game  = new Game(canvas, net, playerIndex);

  // Forward disconnect after game start
  net.onDisconnected = () => showDisconnect();

  game.setInput(input);
  game.load(0);

  // Game loop
  function loop() {
    rafId = requestAnimationFrame(loop);
    game.tick();
  }
  loop();
}

// ── Solo / dev mode (no network — for testing) ───────────

/** Expose a solo test mode via URL param: ?solo=1 */
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

// ── Helper: show disconnect overlay ──────────────────────

function showDisconnect() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  const msg = document.getElementById('game-msg');
  if (msg) {
    msg.textContent = '⚠️ Peer disconnected. Refresh to play again.';
    msg.classList.remove('hidden');
  }
}

// ── Helper: lobby status text ─────────────────────────────

function setStatus(text, isError = false) {
  lobbyStatus.textContent = text;
  lobbyStatus.className   = 'status-msg' + (isError ? ' error' : '');
}

function resetLobby() {
  btnHost.disabled = false;
  btnJoin.disabled = false;
  hostCodeArea.classList.add('hidden');
  if (net) { net.destroy(); net = null; }
}
