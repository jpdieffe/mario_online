// ============================================================
//  main.js    entry point: lobby UI + game loop bootstrap
// ============================================================

import { Game }    from './game.js';
import { Network } from './network.js';
import { Input }   from './input.js';

//  DOM refs 

const lobbyEl       = document.getElementById('lobby');
const gameEl        = document.getElementById('game-screen');
const btnHost       = document.getElementById('btn-host');
const btnJoin       = document.getElementById('btn-join');
const btnRandom     = document.getElementById('btn-random');
const hostNameInput = document.getElementById('host-name-input');
const joinInput     = document.getElementById('join-input');
const hostStatus    = document.getElementById('host-status');
const joinStatus    = document.getElementById('join-status');
const canvas        = document.getElementById('game-canvas');

//  Globals 

let game    = null;
let net     = null;
let input   = null;
let rafId   = null;

//  Random room name 

const WORDS = [
  'APPLE','BANANA','CASTLE','DRAGON','EARTH','FALCON','GRAPE',
  'HONEY','ISLAND','JUNGLE','KOOPA','LEMON','MARIO','NOVA','OCEAN',
  'PEACH','QUEST','RIVER','STORM','TOAD','ULTRA','VISTA','WATER',
  'XENON','YOSHI','ZEBRA'
];

function randomRoom() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

// Pre-fill host name on load
hostNameInput.value = randomRoom();

btnRandom.addEventListener('click', () => {
  hostNameInput.value = randomRoom();
  hostNameInput.focus();
});

// Enter key shortcuts
hostNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnHost.click(); });
joinInput.addEventListener('keydown',     (e) => { if (e.key === 'Enter') btnJoin.click(); });

//  Lobby: Host flow 

btnHost.addEventListener('click', () => {
  const roomName = hostNameInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!roomName) { setStatus(hostStatus, 'Enter a room name first.', true); return; }

  setStatus(hostStatus, '');
  btnHost.disabled = true;
  btnJoin.disabled = true;

  net = new Network();

  // Start game immediately using the room name
  startGame(0, roomName);

  net.onConnected = () => {
    if (game) game.onPeerJoined();
  };

  net.onError = (err) => {
    console.warn('PeerJS error (non-fatal):', err.type);
    if (game) game._peerCode = 'Room: ' + roomName + ' (solo  network error)';
    else setStatus(hostStatus, 'Network error: ' + err.type, true);
  };

  net.host(roomName);
});

//  Lobby: Join flow 

btnJoin.addEventListener('click', () => {
  const roomName = joinInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!roomName) { setStatus(joinStatus, 'Enter a room name first.', true); return; }

  setStatus(joinStatus, 'Connecting to room ' + roomName + '');
  btnHost.disabled = true;
  btnJoin.disabled = true;

  net = new Network();

  net.onConnected = () => {
    setStatus(joinStatus, 'Connected! Starting');
    setTimeout(() => startGame(1, roomName), 600);
  };

  net.onError = (err) => {
    setStatus(joinStatus, 'Could not connect: ' + err.type, true);
    resetLobby();
  };

  net.onDisconnected = () => {
    if (game) showDisconnect();
  };

  net.join(roomName);
});

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

function setStatus(el, text, isError = false) {
  el.textContent = text;
  el.className   = 'status-msg' + (isError ? ' error' : '');
}

function resetLobby() {
  btnHost.disabled = false;
  btnJoin.disabled = false;
  if (net) { net.destroy?.(); net = null; }
}
