// ========================================================
// SUPER BADMINTON 2D - REALTIME NETWORKING LAYER
// WebRTC DataChannel (PeerJS) + BroadcastChannel Fallback
// Two-Device Online Multiplayer for Static Deployment (Vercel)
// ========================================================

// Generate clean 5-character alphanumeric room code (avoiding ambiguous chars)
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Prefix for global peer discovery on free public WebRTC cloud broker
const PEER_PREFIX = 'sbadm-2d-';

export class NetworkManager {
  constructor() {
    this.role = 'SOLO'; // 'HOST' (Player 1), 'GUEST' (Player 2), 'SOLO'
    this.status = 'DISCONNECTED'; // 'DISCONNECTED', 'WAITING', 'CONNECTING', 'CONNECTED', 'RECONNECTING'
    this.roomCode = null;
    this.peer = null;
    this.connection = null;
    this.broadcastChannel = null;
    this.pingStartTime = 0;
    this.pingMs = 0;
    this.isUsingBroadcast = false;

    // Callbacks
    this.onStatusChange = null;
    this.onMessage = null;
    this.onPartnerJoin = null;
    this.onPartnerLeave = null;
    this.onConnectionError = null;

    this.connectionTimeout = null;

    // Check URL parameters for direct room joining (e.g. ?room=X8K9P or ?join=X8K9P)
    this.urlRoomCode = this.getRoomCodeFromURL();
  }

  getRoomCodeFromURL() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('room') || params.get('join');
      return code ? code.toUpperCase().trim() : null;
    } catch {
      return null;
    }
  }

  getInviteLink(code) {
    const origin = window.location.origin;
    const path = window.location.pathname;
    return `${origin}${path}?room=${code}`;
  }

  setStatus(newStatus) {
    this.status = newStatus;
    if (this.onStatusChange) {
      this.onStatusChange(newStatus, {
        role: this.role,
        roomCode: this.roomCode,
        pingMs: this.pingMs,
        isUsingBroadcast: this.isUsingBroadcast
      });
    }
  }

  // --- HOST: CREATE ROOM ---
  createRoom(customCode = null) {
    this.cleanup();
    this.role = 'HOST';
    this.roomCode = customCode || generateRoomCode();
    this.setStatus('WAITING');

    const peerId = `${PEER_PREFIX}${this.roomCode}`;

    // Setup local BroadcastChannel for same-browser testing
    this.setupBroadcastChannel(this.roomCode);

    // Initialize WebRTC Peer
    if (typeof window.Peer !== 'undefined') {
      try {
        this.peer = new window.Peer(peerId, {
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          this.setStatus('WAITING');
        });

        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
          // If peerId collision occurs, fallback to clean code or BroadcastChannel
          console.warn('[Network] PeerJS notice:', err.type);
          if (err.type === 'unavailable-id') {
            this.createRoom(generateRoomCode());
          }
        });
      } catch (err) {
        console.warn('[Network] WebRTC Init Error, using BroadcastChannel fallback:', err);
      }
    }

    return this.roomCode;
  }

  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  // --- GUEST: JOIN ROOM ---
  joinRoom(code) {
    this.cleanup();
    this.role = 'GUEST';
    this.roomCode = code.toUpperCase().trim();
    this.setStatus('CONNECTING');

    // 8-second connection timeout
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this.status !== 'CONNECTED') {
        this.setStatus('ERROR');
        if (this.onConnectionError) {
          this.onConnectionError('Connection timed out (8s). Room not found or host unreachable.');
        }
      }
    }, 8000);

    const targetPeerId = `${PEER_PREFIX}${this.roomCode}`;

    // Setup local BroadcastChannel fallback
    this.setupBroadcastChannel(this.roomCode);

    // Announce via BroadcastChannel
    this.sendBroadcast({ type: 'GUEST_ANNOUNCE', roomCode: this.roomCode });

    // Initialize WebRTC Client Peer
    if (typeof window.Peer !== 'undefined') {
      try {
        this.peer = new window.Peer({
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          const conn = this.peer.connect(targetPeerId, {
            reliable: false, // Low-latency UDP-like delivery for real-time gaming
            serialization: 'json'
          });
          this.setupDataConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.warn('[Network] Peer connection warning:', err);
          if (this.status !== 'CONNECTED') {
            this.clearConnectionTimeout();
            this.setStatus('ERROR');
            if (this.onConnectionError) {
              this.onConnectionError(`Connection error: ${err.type || 'Room unavailable'}`);
            }
          }
        });
      } catch (err) {
        console.warn('[Network] WebRTC Init Error, relying on BroadcastChannel:', err);
      }
    }
  }

  // Connection handler on Host
  handleIncomingConnection(conn) {
    if (this.connection && this.connection.open) {
      // Already connected to Player 2
      conn.close();
      return;
    }
    this.setupDataConnection(conn);
  }

  setupDataConnection(conn) {
    this.connection = conn;

    conn.on('open', () => {
      this.clearConnectionTimeout();
      this.isUsingBroadcast = false;
      this.setStatus('CONNECTED');
      if (this.onPartnerJoin) this.onPartnerJoin();

      // Start ping heartbeat
      this.startHeartbeat();
    });

    conn.on('data', (data) => {
      this.handlePacket(data);
    });

    conn.on('close', () => {
      this.setStatus('WAITING');
      if (this.onPartnerLeave) this.onPartnerLeave();
    });

    conn.on('error', (err) => {
      console.warn('[Network] DataChannel Error:', err);
    });
  }

  // BroadcastChannel for instant two-tab / local network testing
  setupBroadcastChannel(code) {
    if (typeof window.BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new window.BroadcastChannel(`sbadm_bc_${code}`);
        this.broadcastChannel.onmessage = (event) => {
          const msg = event.data;
          if (!msg || !msg.type) return;

          // If Host receives announcement from local Guest
          if (this.role === 'HOST' && msg.type === 'GUEST_ANNOUNCE' && this.status !== 'CONNECTED') {
            this.clearConnectionTimeout();
            this.isUsingBroadcast = true;
            this.setStatus('CONNECTED');
            if (this.onPartnerJoin) this.onPartnerJoin();
            this.sendBroadcast({ type: 'HOST_WELCOME' });
          } else if (this.role === 'GUEST' && msg.type === 'HOST_WELCOME' && this.status !== 'CONNECTED') {
            this.clearConnectionTimeout();
            this.isUsingBroadcast = true;
            this.setStatus('CONNECTED');
            if (this.onPartnerJoin) this.onPartnerJoin();
          } else {
            // Standard packet
            this.handlePacket(msg);
          }
        };
      } catch (e) {
        console.warn('[Network] BroadcastChannel unsupported:', e);
      }
    }
  }

  sendBroadcast(packet) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(packet);
      } catch {}
    }
  }

  // Send packet across active transport
  send(packet) {
    if (this.role === 'SOLO') return;

    if (this.connection && this.connection.open) {
      try {
        this.connection.send(packet);
      } catch (e) {
        // Fallback to broadcast
        this.sendBroadcast(packet);
      }
    } else if (this.isUsingBroadcast && this.broadcastChannel) {
      this.sendBroadcast(packet);
    }
  }

  handlePacket(data) {
    if (!data) return;

    // Handle Heartbeat Ping / Pong
    if (data.type === 'PING') {
      this.send({ type: 'PONG', t: data.t });
      return;
    }
    if (data.type === 'PONG') {
      const now = performance.now();
      this.pingMs = Math.round(now - data.t);
      return;
    }

    if (this.onMessage) {
      this.onMessage(data);
    }
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.status === 'CONNECTED') {
        this.send({ type: 'PING', t: performance.now() });
      }
    }, 2000);
  }

  sendPause(isPaused) {
    this.send({ type: 'PAUSE_STATE', isPaused });
  }

  sendReturnToLobby() {
    this.send({ type: 'RETURN_TO_LOBBY' });
  }

  sendLeaveMatch() {
    this.send({ type: 'PARTNER_LEFT' });
  }

  startSolo() {
    this.cleanup();
    this.role = 'SOLO';
    this.roomCode = null;
    this.setStatus('DISCONNECTED');
  }

  cleanup() {
    this.clearConnectionTimeout();
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.connection) {
      try { this.connection.close(); } catch {}
      this.connection = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch {}
      this.broadcastChannel = null;
    }
    this.isUsingBroadcast = false;
  }
}

export const network = new NetworkManager();
