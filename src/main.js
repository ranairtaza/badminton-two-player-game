// ========================================================
// FEATHERLINE - MAIN GAME ENGINE
// Two-Device Online Multiplayer, Guided Serve System & State Sync
// ========================================================

import { audio } from './audio.js';
import { COURT, PhysicsEngine, Shuttlecock } from './physics.js';
import { Player, AIController, drawBadmintonCourt } from './entities.js';
import { input } from './input.js';
import { network } from './network.js';

class FeatherLineGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.width = COURT.width;
    this.height = COURT.height;

    // Subsystems
    this.physics = new PhysicsEngine();
    this.shuttlecock = new Shuttlecock();
    this.p1 = new Player(1, 'Player 1', false);
    this.p2 = new Player(2, 'Player 2', false);
    this.ai = new AIController(this.p2);
    this.network = network;
    this.input = input;

    // Modes & Configuration
    this.mode = 'vs'; // 'vs' or 'coop'
    this.targetScore = 11; // First to 11, win by 2

    // Local Player Configuration
    this.localPlayerName = localStorage.getItem('featherline_player_name') || 'Player 1';
    this.localAssistBoost = localStorage.getItem('featherline_player_assist') === 'true';

    // Game States: 'LOBBY', 'SERVE', 'PLAY', 'POINT_SCORED', 'GAME_OVER', 'PAUSED'
    this.gameState = 'LOBBY';
    this.previousState = 'LOBBY';
    this.serverSide = 1;
    this.scores = { p1: 0, p2: 0 };
    this.serveTimer = 0;
    this.pointDelayTimer = 0;

    // Co-Op Streak
    this.coopStreak = 0;
    this.coopBestStreak = parseInt(localStorage.getItem('featherline_coop_best') || '0', 10);
    this.lastMilestoneAnnounced = 0;
    this.milestoneTimer = 0;

    // Match Stats
    this.matchStats = {
      startTime: 0,
      elapsedTime: 0,
      longestRally: 0,
      currentRally: 0,
      totalSmashes: 0,
      totalPoints: 0,
      winner: null,
    };

    // Remote Guest Input buffer (for Host)
    this.remoteGuestInput = { left: false, right: false, jump: false, swing: false, swingType: 'hit' };

    // Edge-triggered swing state & solo side routing
    this.soloSwapped = false;
    this.p1WasSwinging = false;
    this.p2WasSwinging = false;

    // Expose instance for programmatic testing
    window.game = this;

    // Timing
    this.lastTime = performance.now();

    // DOM UI Elements
    this.initDOM();
    this.bindEvents();
    this.initNetworking();
    this.checkOrientation();

    // Check if opened via invite link ?room=XXXXX
    if (network.urlRoomCode) {
      if (this.dom.joinCodeInput) {
        this.dom.joinCodeInput.value = network.urlRoomCode;
      }
      this.dom.joinRoomCard?.scrollIntoView({ behavior: 'smooth' });
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  initDOM() {
    this.dom = {
      lobbyScreen: document.getElementById('lobby-screen'),
      pauseMenu: document.getElementById('pause-menu'),
      gameOverScreen: document.getElementById('game-over-screen'),
      hud: document.getElementById('in-game-hud'),
      
      // Lobby inputs
      playerNameInput: document.getElementById('player-name-input'),
      playerAssistToggle: document.getElementById('player-assist-toggle'),
      btnModeVs: document.getElementById('btn-mode-vs'),
      btnModeCoop: document.getElementById('btn-mode-coop'),
      btnCreateRoom: document.getElementById('btn-create-room'),
      joinCodeInput: document.getElementById('join-code-input'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      btnSoloPractice: document.getElementById('btn-solo-practice'),
      
      // Host room box
      hostRoomBox: document.getElementById('host-room-box'),
      roomCodeDisplay: document.getElementById('room-code-display'),
      btnCopyLink: document.getElementById('btn-copy-link'),
      copyFeedback: document.getElementById('copy-feedback'),
      waitingPartnerMsg: document.getElementById('waiting-partner-msg'),
      btnStartHostMatch: document.getElementById('btn-start-host-match'),

      // HUD Badges
      hudStatusPill: document.getElementById('hud-status-pill'),
      hudStatusDot: document.getElementById('hud-status-dot'),
      hudStatusText: document.getElementById('hud-status-text'),
      hudPingText: document.getElementById('hud-ping-text'),
      hudP1Name: document.getElementById('hud-p1-name'),
      hudP2Name: document.getElementById('hud-p2-name'),
      hudP1AssistBadge: document.getElementById('hud-p1-assist-badge'),
      hudP2AssistBadge: document.getElementById('hud-p2-assist-badge'),
      hudP1Serve: document.getElementById('hud-p1-serve'),
      hudP2Serve: document.getElementById('hud-p2-serve'),
      vsScoreboard: document.getElementById('vs-scoreboard'),
      coopScoreboard: document.getElementById('coop-scoreboard'),
      hudP1Score: document.getElementById('hud-p1-score'),
      hudP2Score: document.getElementById('hud-p2-score'),
      coopStreakCount: document.getElementById('coop-streak-count'),
      coopBestCount: document.getElementById('coop-best-count'),
      rallyCounter: document.getElementById('rally-counter'),
      rallyCount: document.getElementById('rally-count'),
      matchPointBanner: document.getElementById('match-point-banner'),
      coopMilestoneBanner: document.getElementById('coop-milestone-banner'),
      btnAudio: document.getElementById('btn-audio-toggle'),
      btnTouch: document.getElementById('btn-touch-toggle'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnQuitPause: document.getElementById('btn-quit-pause'),
      
      // Game Over Summary
      btnRematch: document.getElementById('btn-rematch'),
      btnSwapSides: document.getElementById('btn-swap-sides'),
      btnMenu: document.getElementById('btn-menu'),
      winnerTitle: document.getElementById('winner-text'),
      winnerTag: document.getElementById('winner-tag'),
      trophyIcon: document.getElementById('summary-trophy-icon'),
      vsSummaryScorebox: document.getElementById('vs-summary-scorebox'),
      coopSummaryScorebox: document.getElementById('coop-summary-scorebox'),
      summaryP1Score: document.getElementById('summary-p1-score'),
      summaryP2Score: document.getElementById('summary-p2-score'),
      summaryP1Label: document.getElementById('summary-p1-label'),
      summaryP2Label: document.getElementById('summary-p2-label'),
      summaryCoopFinal: document.getElementById('summary-coop-final'),
      summaryCoopBest: document.getElementById('summary-coop-best'),
      statLongestRally: document.getElementById('stat-longest-rally'),
      statRallyLabel: document.getElementById('stat-rally-label'),
      statTotalSmashes: document.getElementById('stat-total-smashes'),
      statMatchTime: document.getElementById('stat-match-time'),
      statTotalPoints: document.getElementById('stat-total-points'),
      statPointsLabel: document.getElementById('stat-points-label'),
      orientationWarning: document.getElementById('orientation-warning'),

      // Network Alerts & Disconnect
      networkErrorBanner: document.getElementById('network-error-banner'),
      networkErrorText: document.getElementById('network-error-text'),
      btnDismissError: document.getElementById('btn-dismiss-error'),
      guestStatusBanner: document.getElementById('guest-status-banner'),
      guestStatusText: document.getElementById('guest-status-text'),
      disconnectOverlay: document.getElementById('disconnect-overlay'),
      btnDisconnectLobby: document.getElementById('btn-disconnect-lobby'),
      pauseTitle: document.getElementById('pause-title'),
      pauseIndicator: document.getElementById('pause-indicator'),
    };

    if (this.dom.playerNameInput) {
      this.dom.playerNameInput.value = this.localPlayerName;
    }
    if (this.dom.playerAssistToggle) {
      this.dom.playerAssistToggle.checked = this.localAssistBoost;
    }
  }

  bindEvents() {
    this.dom.playerNameInput?.addEventListener('input', (e) => {
      this.localPlayerName = e.target.value.trim() || 'Player';
      localStorage.setItem('featherline_player_name', this.localPlayerName);
      this.syncProfile();
    });

    this.dom.playerAssistToggle?.addEventListener('change', (e) => {
      this.localAssistBoost = !!e.target.checked;
      localStorage.setItem('featherline_player_assist', this.localAssistBoost);
      this.syncProfile();
    });

    this.dom.btnModeVs?.addEventListener('click', () => {
      audio.playClick();
      this.mode = 'vs';
      this.dom.btnModeVs.classList.add('active');
      this.dom.btnModeCoop.classList.remove('active');
    });

    this.dom.btnModeCoop?.addEventListener('click', () => {
      audio.playClick();
      this.mode = 'coop';
      this.dom.btnModeCoop.classList.add('active');
      this.dom.btnModeVs.classList.remove('active');
    });

    this.dom.btnCreateRoom?.addEventListener('click', () => {
      audio.init();
      audio.playClick();
      this.createOnlineRoom();
    });

    this.dom.btnCopyLink?.addEventListener('click', () => {
      if (!network.roomCode) return;
      const link = network.getInviteLink(network.roomCode);
      navigator.clipboard.writeText(link).then(() => {
        audio.playClick();
        if (this.dom.copyFeedback) {
          this.dom.copyFeedback.classList.remove('hidden');
          setTimeout(() => this.dom.copyFeedback.classList.add('hidden'), 2200);
        }
      }).catch(() => {
        prompt('Copy this invite link:', link);
      });
    });

    this.dom.btnJoinRoom?.addEventListener('click', () => {
      const code = this.dom.joinCodeInput?.value.trim();
      if (!code) {
        alert('Please enter a 5-character Room Code.');
        return;
      }
      audio.init();
      audio.playClick();
      this.joinOnlineRoom(code);
    });

    this.dom.btnSoloPractice?.addEventListener('click', () => {
      audio.init();
      audio.playClick();
      this.startSoloPractice();
    });

    this.dom.btnStartHostMatch?.addEventListener('click', () => {
      audio.playClick();
      if (network.status === 'CONNECTED') {
        this.startMatch(this.mode);
        network.send({
          type: 'START_MATCH',
          mode: this.mode,
          p1Name: this.p1.name,
          p2Name: this.p2.name,
          p1Assist: this.p1.assistBoost,
          p2Assist: this.p2.assistBoost
        });
      }
    });

    this.dom.btnAudio?.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      this.dom.btnAudio.textContent = isMuted ? '🔇' : '🔊';
    });

    this.dom.btnTouch?.addEventListener('click', () => {
      audio.playClick();
      const visible = input.toggleTouchControls();
      this.dom.btnTouch.style.opacity = visible ? '1' : '0.5';
    });

    this.dom.btnPause?.addEventListener('click', () => this.togglePause());
    this.dom.btnResume?.addEventListener('click', () => this.togglePause());

    this.dom.btnQuitPause?.addEventListener('click', () => {
      audio.playClick();
      this.returnToLobby();
    });

    this.dom.btnDismissError?.addEventListener('click', () => {
      this.clearNetworkError();
    });

    this.dom.btnDisconnectLobby?.addEventListener('click', () => {
      audio.playClick();
      this.returnToLobby();
    });

    this.dom.btnRematch?.addEventListener('click', () => {
      audio.playClick();
      if (network.role === 'HOST' || network.role === 'SOLO') {
        this.startMatch(this.mode);
        network.send({ type: 'START_MATCH', mode: this.mode });
      } else {
        network.send({ type: 'REQUEST_REMATCH' });
      }
    });

    this.dom.btnSwapSides?.addEventListener('click', () => {
      audio.playClick();
      this.swapSides();
      network.send({
        type: 'SWAP_SIDES',
        p1Name: this.p1.name,
        p2Name: this.p2.name,
        p1Assist: this.p1.assistBoost,
        p2Assist: this.p2.assistBoost
      });
      if (network.role === 'HOST' || network.role === 'SOLO') {
        this.startMatch(this.mode);
      }
    });

    this.dom.btnMenu?.addEventListener('click', () => {
      audio.playClick();
      this.returnToLobby();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && (this.gameState === 'PLAY' || this.gameState === 'SERVE' || this.gameState === 'PAUSED')) {
        this.togglePause();
      }
    });

    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());
  }

  initNetworking() {
    network.onStatusChange = (status, info) => {
      this.updateNetworkUI(status, info);
    };

    network.onPartnerJoin = () => {
      audio.playWhistle();
      if (this.dom.waitingPartnerMsg) {
        this.dom.waitingPartnerMsg.textContent = 'Partner connected! Ready to play.';
        this.dom.waitingPartnerMsg.style.color = 'var(--green)';
      }
      if (this.dom.btnStartHostMatch) {
        this.dom.btnStartHostMatch.classList.remove('hidden');
      }

      if (network.role === 'GUEST') {
        if (this.dom.guestStatusBanner && this.dom.guestStatusText) {
          this.dom.guestStatusText.textContent = `Connected to Room ${network.roomCode}! Waiting for Host to start match...`;
          this.dom.guestStatusBanner.classList.remove('hidden');
        }
      }

      network.send({
        type: 'HELLO',
        name: this.localPlayerName,
        assist: this.localAssistBoost,
        mode: this.mode
      });
    };

    network.onPartnerLeave = () => {
      if (this.dom.waitingPartnerMsg) {
        this.dom.waitingPartnerMsg.textContent = 'Partner disconnected. Waiting to reconnect...';
        this.dom.waitingPartnerMsg.style.color = 'var(--gold)';
      }
      if (this.dom.guestStatusBanner) {
        this.dom.guestStatusBanner.classList.add('hidden');
      }
      if (this.gameState === 'PLAY' || this.gameState === 'SERVE' || this.gameState === 'POINT_SCORED') {
        this.handlePartnerDisconnect();
      }
    };

    network.onConnectionError = (errMsg) => {
      this.showNetworkError(errMsg);
      if (this.dom.guestStatusBanner) {
        this.dom.guestStatusBanner.classList.add('hidden');
      }
    };

    network.onMessage = (data) => {
      this.handleNetworkMessage(data);
    };
  }

  showNetworkError(message) {
    if (this.dom.networkErrorBanner && this.dom.networkErrorText) {
      this.dom.networkErrorText.textContent = message;
      this.dom.networkErrorBanner.classList.remove('hidden');
    }
  }

  clearNetworkError() {
    if (this.dom.networkErrorBanner) {
      this.dom.networkErrorBanner.classList.add('hidden');
    }
  }

  handlePartnerDisconnect() {
    this.previousState = this.gameState;
    this.gameState = 'PAUSED';
    if (this.dom.disconnectOverlay) {
      this.dom.disconnectOverlay.classList.remove('hidden');
    }
  }

  updateNetworkUI(status, info) {
    if (!this.dom.hudStatusPill) return;

    if (status === 'CONNECTED') {
      this.dom.hudStatusDot.style.background = 'var(--green)';
      this.dom.hudStatusText.textContent = `ROOM: ${info.roomCode}`;
      this.dom.hudPingText.textContent = `${info.pingMs || 24}ms`;
    } else if (status === 'WAITING' || status === 'CONNECTING') {
      this.dom.hudStatusDot.style.background = 'var(--gold)';
      this.dom.hudStatusText.textContent = status === 'WAITING' ? `WAITING (${info.roomCode})` : 'CONNECTING...';
      this.dom.hudPingText.textContent = '';
    } else {
      this.dom.hudStatusDot.style.background = '#64748b';
      this.dom.hudStatusText.textContent = info.role === 'SOLO' ? 'SOLO' : 'OFFLINE';
      this.dom.hudPingText.textContent = '';
    }
  }

  createOnlineRoom() {
    this.clearNetworkError();
    const code = network.createRoom();
    this.p1.name = this.localPlayerName;
    this.p1.assistBoost = this.localAssistBoost;

    if (this.dom.hostRoomBox) this.dom.hostRoomBox.classList.remove('hidden');
    if (this.dom.roomCodeDisplay) this.dom.roomCodeDisplay.textContent = code;
    if (this.dom.waitingPartnerMsg) {
      this.dom.waitingPartnerMsg.textContent = 'Share code or invite link. Waiting for partner...';
      this.dom.waitingPartnerMsg.style.color = 'var(--gold)';
    }
    if (this.dom.btnStartHostMatch) this.dom.btnStartHostMatch.classList.add('hidden');
  }

  joinOnlineRoom(code) {
    this.clearNetworkError();
    this.p2.name = this.localPlayerName;
    this.p2.assistBoost = this.localAssistBoost;
    network.joinRoom(code);
  }

  startSoloPractice() {
    this.clearNetworkError();
    if (this.dom.guestStatusBanner) this.dom.guestStatusBanner.classList.add('hidden');
    network.startSolo();
    this.p1.name = this.localPlayerName;
    this.p1.assistBoost = this.localAssistBoost;
    this.p2.name = 'AI Bot';
    this.p2.assistBoost = false;
    this.startMatch(this.mode); // Supports both 'vs' and 'coop' mode
  }

  syncProfile() {
    if (network.role === 'HOST') {
      this.p1.name = this.localPlayerName;
      this.p1.assistBoost = this.localAssistBoost;
    } else if (network.role === 'GUEST') {
      this.p2.name = this.localPlayerName;
      this.p2.assistBoost = this.localAssistBoost;
    }
    network.send({
      type: 'PROFILE_UPDATE',
      name: this.localPlayerName,
      assist: this.localAssistBoost
    });
  }

  handleNetworkMessage(msg) {
    switch (msg.type) {
      case 'HELLO':
        if (network.role === 'HOST') {
          this.p2.name = msg.name || 'Player 2';
          this.p2.assistBoost = !!msg.assist;
          network.send({
            type: 'WELCOME',
            name: this.p1.name,
            assist: this.p1.assistBoost,
            mode: this.mode
          });
        }
        break;

      case 'WELCOME':
        if (network.role === 'GUEST') {
          this.p1.name = msg.name || 'Player 1';
          this.p1.assistBoost = !!msg.assist;
          if (msg.mode) this.mode = msg.mode;
        }
        break;

      case 'PROFILE_UPDATE':
        if (network.role === 'HOST') {
          this.p2.name = msg.name;
          this.p2.assistBoost = msg.assist;
        } else {
          this.p1.name = msg.name;
          this.p1.assistBoost = msg.assist;
        }
        this.updateHUD();
        break;

      case 'START_MATCH':
        if (msg.mode) this.mode = msg.mode;
        if (msg.p1Name) this.p1.name = msg.p1Name;
        if (msg.p2Name) this.p2.name = msg.p2Name;
        if (msg.p1Assist !== undefined) this.p1.assistBoost = msg.p1Assist;
        if (msg.p2Assist !== undefined) this.p2.assistBoost = msg.p2Assist;
        this.startMatch(this.mode);
        break;

      case 'INPUT':
        if (network.role === 'HOST' && msg.input) {
          this.remoteGuestInput = msg.input;
        }
        break;

      case 'STATE':
        if (network.role === 'GUEST') {
          this.applyHostState(msg);
        }
        break;

      case 'AUDIO':
        if (msg.audioType === 'hit') audio.playHit(msg.power || 1.0);
        else if (msg.audioType === 'smash') audio.playSmash();
        else if (msg.audioType === 'net') audio.playNetClip();
        else if (msg.audioType === 'whistle') audio.playWhistle();
        else if (msg.audioType === 'point') audio.playPointCheer(msg.arg);
        else if (msg.audioType === 'milestone') audio.playStreakMilestone();
        break;

      case 'EFFECT':
        if (msg.effectType === 'shake') this.physics.addScreenShake(msg.intensity || 8);
        else if (msg.effectType === 'hitStop') this.physics.triggerHitStop(msg.duration || 0.030);
        else if (msg.effectType === 'confetti') this.physics.createConfetti(msg.count || 80);
        else if (msg.effectType === 'sparks') this.physics.createHitSparks(msg.x, msg.y, msg.count, msg.color);
        break;

      case 'REQUEST_REMATCH':
        if (network.role === 'HOST') {
          this.startMatch(this.mode);
          network.send({ type: 'START_MATCH', mode: this.mode });
        }
        break;

      case 'PAUSE_STATE':
        if (msg.isPaused && this.gameState !== 'PAUSED') {
          this.previousState = this.gameState;
          this.gameState = 'PAUSED';
          if (this.dom.pauseTitle) this.dom.pauseTitle.textContent = 'MATCH PAUSED';
          if (this.dom.pauseIndicator) {
            this.dom.pauseIndicator.textContent = 'PAUSED BY PARTNER';
            this.dom.pauseIndicator.classList.remove('hidden');
          }
          if (this.dom.pauseMenu) this.dom.pauseMenu.classList.remove('hidden');
        } else if (!msg.isPaused && this.gameState === 'PAUSED') {
          this.resumeGame();
        }
        break;

      case 'RETURN_TO_LOBBY':
        this.returnToLobby(false);
        this.showNetworkError('Partner returned to lobby.');
        break;

      case 'PARTNER_LEFT':
        this.handlePartnerDisconnect();
        break;

      case 'SWAP_SIDES':
        this.swapSides();
        break;
    }
  }

  swapSides() {
    this.soloSwapped = !this.soloSwapped;
    const tempName = this.p1.name;
    const tempAssist = this.p1.assistBoost;

    this.p1.name = this.p2.name;
    this.p1.assistBoost = this.p2.assistBoost;

    this.p2.name = tempName;
    this.p2.assistBoost = tempAssist;

    this.p1.reset();
    this.p2.reset();
    this.updateHUD();
  }

  checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
    if (this.dom.orientationWarning) {
      if (isPortrait) {
        this.dom.orientationWarning.classList.remove('hidden');
      } else {
        this.dom.orientationWarning.classList.add('hidden');
      }
    }
  }

  startMatch(mode = 'vs') {
    this.mode = mode;
    this.scores = { p1: 0, p2: 0 };
    this.serverSide = 1;
    this.coopStreak = 0;
    this.lastMilestoneAnnounced = 0;
    this.milestoneTimer = 0;

    this.matchStats = {
      startTime: performance.now(),
      elapsedTime: 0,
      longestRally: 0,
      currentRally: 0,
      totalSmashes: 0,
      totalPoints: 0,
      winner: null,
    };

    this.dom.hudP1Name.textContent = this.p1.name;
    this.dom.hudP2Name.textContent = this.p2.name;

    if (this.p1.assistBoost) this.dom.hudP1AssistBadge.classList.remove('hidden');
    else this.dom.hudP1AssistBadge.classList.add('hidden');

    if (this.p2.assistBoost) this.dom.hudP2AssistBadge.classList.remove('hidden');
    else this.dom.hudP2AssistBadge.classList.add('hidden');

    if (mode === 'vs') {
      this.dom.vsScoreboard.classList.remove('hidden');
      this.dom.coopScoreboard.classList.add('hidden');
      this.dom.rallyCounter.classList.remove('hidden');
    } else {
      this.dom.vsScoreboard.classList.add('hidden');
      this.dom.coopScoreboard.classList.remove('hidden');
      this.dom.rallyCounter.classList.add('hidden');
      this.dom.matchPointBanner.classList.add('hidden');
      this.dom.coopBestCount.textContent = this.coopBestStreak;
    }

    this.dom.lobbyScreen.classList.add('hidden');
    this.dom.pauseMenu.classList.add('hidden');
    this.dom.gameOverScreen.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');

    if (this.dom.guestStatusBanner) this.dom.guestStatusBanner.classList.add('hidden');
    if (this.dom.networkErrorBanner) this.dom.networkErrorBanner.classList.add('hidden');
    if (this.dom.disconnectOverlay) this.dom.disconnectOverlay.classList.add('hidden');

    this.updateHUD();
    this.setupServe(this.serverSide);
  }

  returnToLobby(notifyNetwork = true) {
    if (notifyNetwork && network.role !== 'SOLO') {
      network.sendReturnToLobby();
    }
    this.gameState = 'LOBBY';
    this.dom.lobbyScreen.classList.remove('hidden');
    this.dom.pauseMenu.classList.add('hidden');
    this.dom.gameOverScreen.classList.add('hidden');
    this.dom.hud.classList.add('hidden');
    if (this.dom.disconnectOverlay) {
      this.dom.disconnectOverlay.classList.add('hidden');
    }
  }

  togglePause(sync = true) {
    if (this.gameState === 'PAUSED') {
      this.gameState = this.previousState || 'PLAY';
      this.dom.pauseMenu.classList.add('hidden');
      if (sync && network.role !== 'SOLO') {
        network.sendPause(false);
      }
    } else if (this.gameState === 'PLAY' || this.gameState === 'SERVE' || this.gameState === 'POINT_SCORED') {
      audio.playClick();
      this.previousState = this.gameState;
      this.gameState = 'PAUSED';
      if (this.dom.pauseTitle) this.dom.pauseTitle.textContent = 'GAME PAUSED';
      if (this.dom.pauseIndicator) this.dom.pauseIndicator.classList.add('hidden');
      this.dom.pauseMenu.classList.remove('hidden');
      if (sync && network.role !== 'SOLO') {
        network.sendPause(true);
      }
    }
  }

  resumeGame() {
    if (this.gameState === 'PAUSED') {
      this.gameState = this.previousState || 'PLAY';
      this.dom.pauseMenu.classList.add('hidden');
    }
  }

  setupServe(servingSide) {
    this.serverSide = servingSide;
    this.gameState = 'SERVE';
    this.serveTimer = 0;
    this.matchStats.currentRally = 0;

    this.p1.reset();
    this.p2.reset();

    if (servingSide === 1) {
      this.p1.aimX = 940;
      this.p1.aimY = 480;
      this.shuttlecock.reset(this.p1.x + 36, this.p1.y + 40, 1);
    } else {
      this.p2.aimX = 340;
      this.p2.aimY = 480;
      this.shuttlecock.reset(this.p2.x - 36, this.p2.y + 40, 2);
    }

    this.updateHUD();
  }

  // Launch Guided Serve
  launchServe(servingSide, serveParams) {
    const vx = serveParams.vx;
    const vy = serveParams.vy;

    this.shuttlecock.launch(vx, vy, servingSide, false);

    // Audio cue: crisp string pop with extra presence on perfect timing
    audio.playHit(serveParams.isPerfect ? 1.15 : 0.9);
    network.send({ type: 'AUDIO', audioType: 'hit', power: serveParams.isPerfect ? 1.15 : 0.9 });

    this.physics.createHitSparks(this.shuttlecock.x, this.shuttlecock.y, serveParams.isPerfect ? 16 : 8, serveParams.isPerfect ? '#ffbe0b' : '#ffffff');
    this.gameState = 'PLAY';
  }

  checkCoopMilestone(streak) {
    const milestones = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
    if (milestones.includes(streak) && streak > this.lastMilestoneAnnounced) {
      this.lastMilestoneAnnounced = streak;
      this.milestoneTimer = 2.0;

      audio.playStreakMilestone();
      network.send({ type: 'AUDIO', audioType: 'milestone' });

      this.physics.createConfetti(45);
      network.send({ type: 'EFFECT', effectType: 'confetti', count: 45 });

      if (this.dom.coopMilestoneBanner) {
        this.dom.coopMilestoneBanner.textContent = `STREAK: ${streak}! 🔥`;
        this.dom.coopMilestoneBanner.classList.remove('hidden');
      }
    }
  }

  onPointEnd(scorerSide, isFloorDrop = true) {
    if (this.gameState !== 'PLAY' && this.gameState !== 'SERVE') return;

    this.gameState = 'POINT_SCORED';
    this.pointDelayTimer = 1.3;

    if (this.mode === 'vs') {
      if (scorerSide === 1) this.scores.p1++;
      else this.scores.p2++;

      this.matchStats.totalPoints++;
      if (this.matchStats.currentRally > this.matchStats.longestRally) {
        this.matchStats.longestRally = this.matchStats.currentRally;
      }

      audio.playWhistle();
      audio.playPointCheer(scorerSide);
      network.send({ type: 'AUDIO', audioType: 'whistle' });
      network.send({ type: 'AUDIO', audioType: 'point', arg: scorerSide });

      this.updateHUD();

      // Win Condition: First to 11, win by 2, or cap at 15
      const p1Score = this.scores.p1;
      const p2Score = this.scores.p2;
      const isWon = (p1Score >= this.targetScore && p1Score - p2Score >= 2) ||
                    (p2Score >= this.targetScore && p2Score - p1Score >= 2) ||
                    (p1Score === 15 || p2Score === 15);

      if (isWon) {
        this.matchStats.winner = p1Score > p2Score ? 1 : 2;
        this.matchStats.elapsedTime = Math.floor((performance.now() - this.matchStats.startTime) / 1000);
        this.matchStats.totalSmashes = this.p1.smashesLanded + this.p2.smashesLanded;
        setTimeout(() => this.triggerGameOver(), 1100);
      } else {
        this.serverSide = scorerSide;
      }
    } else {
      // Co-Op Mode
      audio.playWhistle();
      network.send({ type: 'AUDIO', audioType: 'whistle' });

      if (this.coopStreak > this.coopBestStreak) {
        this.coopBestStreak = this.coopStreak;
        localStorage.setItem('featherline_coop_best', this.coopBestStreak.toString());
      }

      if (this.matchStats.currentRally > this.matchStats.longestRally) {
        this.matchStats.longestRally = this.matchStats.currentRally;
      }

      this.matchStats.totalPoints++;
      this.updateHUD();

      if (this.coopStreak >= 10 || this.matchStats.totalPoints >= 5) {
        this.matchStats.elapsedTime = Math.floor((performance.now() - this.matchStats.startTime) / 1000);
        this.matchStats.totalSmashes = this.p1.smashesLanded + this.p2.smashesLanded;
        setTimeout(() => this.triggerGameOver(), 1100);
      } else {
        this.coopStreak = 0;
        this.serverSide = this.serverSide === 1 ? 2 : 1;
      }
    }
  }

  updateHUD() {
    if (this.mode === 'vs') {
      this.dom.hudP1Score.textContent = this.scores.p1;
      this.dom.hudP2Score.textContent = this.scores.p2;
      this.dom.rallyCount.textContent = this.matchStats.currentRally;

      const p1MP = this.scores.p1 >= this.targetScore - 1 && this.scores.p1 > this.scores.p2;
      const p2MP = this.scores.p2 >= this.targetScore - 1 && this.scores.p2 > this.scores.p1;
      if (p1MP || p2MP) this.dom.matchPointBanner.classList.remove('hidden');
      else this.dom.matchPointBanner.classList.add('hidden');
    } else {
      this.dom.coopStreakCount.textContent = this.coopStreak;
      this.dom.coopBestCount.textContent = Math.max(this.coopBestStreak, this.coopStreak);
    }

    if (this.serverSide === 1) {
      this.dom.hudP1Serve.classList.remove('hidden');
      this.dom.hudP2Serve.classList.add('hidden');
    } else {
      this.dom.hudP1Serve.classList.add('hidden');
      this.dom.hudP2Serve.classList.remove('hidden');
    }
  }

  triggerGameOver() {
    this.gameState = 'GAME_OVER';
    this.physics.createConfetti(120);

    if (this.mode === 'vs') {
      const winner = this.matchStats.winner;
      const winnerName = winner === 1 ? this.p1.name : this.p2.name;

      this.dom.winnerTitle.textContent = `${winnerName.toUpperCase()} WINS!`;
      this.dom.winnerTitle.style.color = winner === 1 ? 'var(--p1-color)' : 'var(--p2-color)';
      this.dom.winnerTag.textContent = 'CHAMPIONSHIP MATCH POINT';
      this.dom.trophyIcon.textContent = '🏆';

      this.dom.vsSummaryScorebox.classList.remove('hidden');
      this.dom.coopSummaryScorebox.classList.add('hidden');

      this.dom.summaryP1Score.textContent = this.scores.p1;
      this.dom.summaryP2Score.textContent = this.scores.p2;
      this.dom.summaryP1Label.textContent = this.p1.name;
      this.dom.summaryP2Label.textContent = this.p2.name;

      this.dom.statRallyLabel.textContent = 'Longest Rally';
      this.dom.statPointsLabel.textContent = 'Points Scored';
      this.dom.statLongestRally.textContent = this.matchStats.longestRally;
      this.dom.statTotalPoints.textContent = this.matchStats.totalPoints;
    } else {
      this.dom.winnerTitle.textContent = 'RALLY SESSION COMPLETED';
      this.dom.winnerTitle.style.color = 'var(--green)';
      this.dom.winnerTag.textContent = 'PARTNER CO-OP DUO';
      this.dom.trophyIcon.textContent = '🤝';

      this.dom.vsSummaryScorebox.classList.add('hidden');
      this.dom.coopSummaryScorebox.classList.remove('hidden');

      this.dom.summaryCoopFinal.textContent = this.coopStreak;
      this.dom.summaryCoopBest.textContent = this.coopBestStreak;

      this.dom.statRallyLabel.textContent = 'Best Streak';
      this.dom.statPointsLabel.textContent = 'Rallies Played';
      this.dom.statLongestRally.textContent = this.matchStats.longestRally;
      this.dom.statTotalPoints.textContent = this.matchStats.totalPoints;
    }

    this.dom.statTotalSmashes.textContent = this.matchStats.totalSmashes;

    const mins = Math.floor(this.matchStats.elapsedTime / 60).toString().padStart(2, '0');
    const secs = (this.matchStats.elapsedTime % 60).toString().padStart(2, '0');
    this.dom.statMatchTime.textContent = `${mins}:${secs}`;

    this.dom.gameOverScreen.classList.remove('hidden');
  }

  applyHostState(packet) {
    if (this.gameState !== packet.gameState) {
      this.gameState = packet.gameState;
      if (this.gameState === 'GAME_OVER') {
        this.matchStats = packet.matchStats;
        this.scores = packet.scores;
        this.triggerGameOver();
      }
    }

    this.scores = packet.scores;
    this.serverSide = packet.serverSide;
    this.coopStreak = packet.coopStreak;
    this.mode = packet.mode;
    this.matchStats.currentRally = packet.currentRally;
    this.matchStats.longestRally = packet.longestRally;

    this.p1.applyNetworkState(packet.p1, 0.016);
    this.p2.applyNetworkState(packet.p2, 0.016);

    const s = packet.shuttle;
    this.shuttlecock.x = s.x;
    this.shuttlecock.y = s.y;
    this.shuttlecock.vx = s.vx;
    this.shuttlecock.vy = s.vy;
    this.shuttlecock.rotation = s.rotation;
    this.shuttlecock.isSmash = s.isSmash;
    this.shuttlecock.inPlay = s.inPlay;
    this.shuttlecock.lastHitBy = s.lastHitBy;

    this.updateHUD();
  }

  update(dt) {
    if (this.physics.hitStopTimer > 0) {
      this.physics.hitStopTimer -= dt;
      return;
    }

    this.physics.update(dt);

    if (this.milestoneTimer > 0) {
      this.milestoneTimer -= dt;
      if (this.milestoneTimer <= 0 && this.dom.coopMilestoneBanner) {
        this.dom.coopMilestoneBanner.classList.add('hidden');
      }
    }

    if (this.gameState === 'PAUSED' || this.gameState === 'LOBBY' || this.gameState === 'GAME_OVER') {
      return;
    }

    if (network.role === 'GUEST') {
      network.send({
        type: 'INPUT',
        input: {
          left: input.state.left,
          right: input.state.right,
          jump: input.state.jumpPressedThisFrame || input.state.jump,
          swing: input.state.swingPressedThisFrame,
          swingType: input.state.swingType,
          aimX: input.state.aimX,
          aimY: input.state.aimY
        }
      });
      input.clearFrameFlags();
      return;
    }

    // Host or Solo authoritative logic
    let p1Input, p2Input;

    if (network.role === 'SOLO') {
      if (this.soloSwapped) {
        p2Input = input.state;
        p1Input = this.ai.update(dt, this.shuttlecock);
      } else {
        p1Input = input.state;
        p2Input = this.ai.update(dt, this.shuttlecock);
      }
    } else {
      p1Input = input.state;
      p2Input = this.remoteGuestInput;
    }

    // Edge-triggered swing determination
    const p1WantsSwing = (network.role === 'SOLO' && this.soloSwapped)
      ? p1Input.swing
      : (input.state.swingPressedThisFrame || (p1Input.swing && !this.p1WasSwinging));

    const p2WantsSwing = (network.role === 'SOLO' && !this.soloSwapped)
      ? p2Input.swing
      : (network.role === 'SOLO'
          ? (input.state.swingPressedThisFrame || (p2Input.swing && !this.p2WasSwinging))
          : (p2Input.swing && !this.p2WasSwinging));

    // --- State: SERVE (Guided Serve System) ---
    if (this.gameState === 'SERVE') {
      this.serveTimer += dt;

      // Allow aiming by moving Left/Right and aiming with mouse/tap
      this.p1.update(dt, { left: p1Input.left, right: p1Input.right, aimX: p1Input.aimX, aimY: p1Input.aimY }, this.physics);
      this.p2.update(dt, { left: p2Input.left, right: p2Input.right, aimX: p2Input.aimX, aimY: p2Input.aimY }, this.physics);

      if (this.serverSide === 1) {
        this.shuttlecock.x = this.p1.x + 36;
        this.shuttlecock.y = this.p1.y + 36;

        // Launch serve on HIT key, touch button, or mouse click / court tap
        const p1ServeTrigger = p1WantsSwing || (network.role !== 'GUEST' && input.state.pointerDownThisFrame);
        if (p1ServeTrigger || this.serveTimer > 4.5) {
          const params = this.p1.getServeParameters(p1Input.swingType || 'drive');
          this.p1.swing(p1Input.swingType || 'hit');
          this.launchServe(1, params);
        }
      } else {
        this.shuttlecock.x = this.p2.x - 36;
        this.shuttlecock.y = this.p2.y + 36;

        const p2ServeTrigger = p2WantsSwing || (network.role === 'SOLO' && this.soloSwapped && input.state.pointerDownThisFrame);
        if (p2ServeTrigger || this.serveTimer > 4.5) {
          const params = this.p2.getServeParameters(p2Input.swingType || 'drive');
          this.p2.swing(p2Input.swingType || 'hit');
          this.launchServe(2, params);
        }
      }

      this.p1WasSwinging = p1Input.swing;
      this.p2WasSwinging = p2Input.swing;
      this.broadcastHostState();
      input.clearFrameFlags();
      return;
    }

    // --- State: PLAY ---
    if (this.gameState === 'PLAY') {
      if (p1Input.jump && this.p1.isGrounded) this.p1.jump(this.physics);
      if (p1WantsSwing) this.p1.swing(p1Input.swingType);
      this.p1.update(dt, p1Input, this.physics);

      if (p2Input.jump && this.p2.isGrounded) this.p2.jump(this.physics);
      if (p2WantsSwing) this.p2.swing(p2Input.swingType);
      this.p2.update(dt, p2Input, this.physics);

      this.p1WasSwinging = p1Input.swing;
      this.p2WasSwinging = p2Input.swing;

      const isCoop = this.mode === 'coop';

      // 1. AUTO-HIT: Automatically hits if player is standing in accurate position
      const p1AutoHit = this.p1.checkAutoHit(this.shuttlecock, this.physics, audio, isCoop);
      if (p1AutoHit) {
        this.matchStats.currentRally++;
        if (isCoop) {
          this.coopStreak++;
          this.checkCoopMilestone(this.coopStreak);
        }
        network.send({ type: 'AUDIO', audioType: p1AutoHit.isJumpSmash ? 'smash' : 'hit', power: 1.0 });
        this.updateHUD();
      }

      const p2AutoHit = this.p2.checkAutoHit(this.shuttlecock, this.physics, audio, isCoop);
      if (p2AutoHit) {
        this.matchStats.currentRally++;
        if (isCoop) {
          this.coopStreak++;
          this.checkCoopMilestone(this.coopStreak);
        }
        network.send({ type: 'AUDIO', audioType: p2AutoHit.isJumpSmash ? 'smash' : 'hit', power: 1.0 });
        this.updateHUD();
      }

      // 2. MANUAL SWING OVERRIDE: If player also manually triggered swing
      if (p1WantsSwing && !p1AutoHit) {
        const p1HitRes = this.p1.checkHit(this.shuttlecock, this.physics, audio, isCoop);
        if (p1HitRes) {
          this.matchStats.currentRally++;
          if (isCoop) {
            this.coopStreak++;
            this.checkCoopMilestone(this.coopStreak);
          }
          network.send({ type: 'AUDIO', audioType: p1HitRes.isJumpSmash ? 'smash' : 'hit', power: 1.0 });
          this.updateHUD();
        }
      }

      if (p2WantsSwing && !p2AutoHit) {
        const p2HitRes = this.p2.checkHit(this.shuttlecock, this.physics, audio, isCoop);
        if (p2HitRes) {
          this.matchStats.currentRally++;
          if (isCoop) {
            this.coopStreak++;
            this.checkCoopMilestone(this.coopStreak);
          }
          network.send({ type: 'AUDIO', audioType: p2HitRes.isJumpSmash ? 'smash' : 'hit', power: 1.0 });
          this.updateHUD();
        }
      }

      this.shuttlecock.update(
        dt,
        this.physics,
        audio,
        (landX, landY, lastHitter, isOut) => {
          if (this.mode === 'vs') {
            const landedOnP1Side = landX < COURT.netX;
            let pointWinner;
            if (isOut) {
              pointWinner = lastHitter === 1 ? 2 : 1;
            } else {
              pointWinner = landedOnP1Side ? 2 : 1;
            }
            this.onPointEnd(pointWinner, true);
          } else {
            this.onPointEnd(1, true);
          }
        },
        () => {
          this.physics.addScreenShake(4);
          network.send({ type: 'AUDIO', audioType: 'net' });
        }
      );

      this.broadcastHostState();
    }

    // --- State: POINT_SCORED ---
    if (this.gameState === 'POINT_SCORED') {
      this.p1.update(dt, { left: false, right: false }, this.physics);
      this.p2.update(dt, { left: false, right: false }, this.physics);

      this.pointDelayTimer -= dt;
      if (this.pointDelayTimer <= 0) {
        this.setupServe(this.serverSide);
      }
      this.broadcastHostState();
    }

    input.clearFrameFlags();
  }

  broadcastHostState() {
    if (network.role !== 'HOST') return;

    network.send({
      type: 'STATE',
      gameState: this.gameState,
      mode: this.mode,
      serverSide: this.serverSide,
      scores: this.scores,
      coopStreak: this.coopStreak,
      currentRally: this.matchStats.currentRally,
      longestRally: this.matchStats.longestRally,
      p1: this.p1.exportState(),
      p2: this.p2.exportState(),
      shuttle: {
        x: Math.round(this.shuttlecock.x),
        y: Math.round(this.shuttlecock.y),
        vx: Math.round(this.shuttlecock.vx),
        vy: Math.round(this.shuttlecock.vy),
        rotation: parseFloat(this.shuttlecock.rotation.toFixed(2)),
        isSmash: this.shuttlecock.isSmash,
        inPlay: this.shuttlecock.inPlay,
        lastHitBy: this.shuttlecock.lastHitBy
      },
      matchStats: this.matchStats
    });
  }

  render() {
    this.ctx.save();

    if (this.physics.cameraShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.physics.cameraShake;
      const shakeY = (Math.random() - 0.5) * this.physics.cameraShake;
      this.ctx.translate(shakeX, shakeY);
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    drawBadmintonCourt(this.ctx);

    // Render Players
    this.p1.draw(this.ctx);
    this.p2.draw(this.ctx);

    // Guided Serve Preview Arc & Timing Ring during SERVE state
    if (this.gameState === 'SERVE') {
      const isLocalHost = network.role === 'HOST' || network.role === 'SOLO';
      if (this.serverSide === 1) {
        this.p1.drawServeGuide(this.ctx, this.shuttlecock, isLocalHost);
      } else {
        this.p2.drawServeGuide(this.ctx, this.shuttlecock, !isLocalHost);
      }
    } else if (this.gameState === 'PLAY') {
      // Render interactive Aim Reticle & Dotted Direction Indicator on Court
      const isLocalHost = network.role === 'HOST' || network.role === 'SOLO';
      if (isLocalHost) {
        if (network.role === 'SOLO' && this.soloSwapped) {
          this.p2.drawAimTarget(this.ctx, true);
        } else {
          this.p1.drawAimTarget(this.ctx, true);
        }
      } else {
        this.p2.drawAimTarget(this.ctx, true);
      }
    }

    // Render Shuttlecock & Feather Arrow Indicator
    this.shuttlecock.draw(this.ctx);

    // Render Particles
    this.physics.drawParticles(this.ctx);

    this.ctx.restore();
  }

  gameLoop(currentTime) {
    const rawDt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    const dt = Math.min(rawDt, 0.05);

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new FeatherLineGame();
});
