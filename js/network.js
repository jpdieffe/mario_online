// ============================================================
//  network.js  –  PeerJS wrapper for host ↔ client messaging
// ============================================================

import { MSG } from './constants.js';

/** Wraps PeerJS and exposes simple callbacks. */
export class Network {
  constructor() {
    this.peer   = null;
    this.conn   = null;
    this.isHost = false;
    this.peerId = null;

    // Callbacks set by Game
    this.onConnected    = null;  // () => {}
    this.onMessage      = null;  // (msg) => {}
    this.onDisconnected = null;  // () => {}
    this.onError        = null;  // (err) => {}

    this._pending = [];  // queued outbound messages before conn is open
  }

  /** Normalise a room name to a valid, namespaced PeerJS id. */
  static roomToPeerId(roomName) {
    return 'marioonline-' + roomName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /** Create a new Peer using roomName as the peer ID, then wait for a remote to connect (host mode). */
  host(roomName) {
    this.isHost = true;
    const peerId = Network.roomToPeerId(roomName);
    this.peer = new Peer(peerId, { debug: 0 });

    this.peer.on('open', (id) => {
      this.peerId = id;
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this._setupConn(conn);
    });

    this.peer.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  /** Connect to a host identified by roomName (client mode). */
  join(roomName) {
    this.isHost = false;
    const hostId = Network.roomToPeerId(roomName);
    this.peer = new Peer(undefined, { debug: 0 });

    this.peer.on('open', () => {
      const conn = this.peer.connect(hostId, { reliable: false, serialization: 'json' });
      this.conn = conn;
      this._setupConn(conn);
    });

    this.peer.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  _setupConn(conn) {
    conn.on('open', () => {
      // Flush pending
      for (const m of this._pending) conn.send(m);
      this._pending = [];
      if (this.onConnected) this.onConnected();
    });

    conn.on('data', (data) => {
      if (this.onMessage) this.onMessage(data);
    });

    conn.on('close', () => {
      if (this.onDisconnected) this.onDisconnected();
    });

    conn.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    } else {
      this._pending.push(msg);
    }
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.conn = null;
  }
}
