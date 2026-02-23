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

  /** Create a new Peer and wait for a remote to connect (host mode). */
  host() {
    this.isHost = true;
    this.peer = new Peer(undefined, { debug: 0 });

    this.peer.on('open', (id) => {
      this.peerId = id;
      // Expose ID to lobby UI
      if (typeof this.onPeerId === 'function') this.onPeerId(id);
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this._setupConn(conn);
    });

    this.peer.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  /** Connect to a remote host (client mode). */
  join(hostId) {
    this.isHost = false;
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
