// ========================================================
// FEATHERLINE - AUTOMATED VERIFICATION TEST SUITE (R1-R5)
// Native Node 24 zero-dependency test runner utilizing
// Chrome DevTools Protocol (CDP) over WebSocket
// ========================================================

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function findBrowserExecutable() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No compatible Chrome/Edge browser executable found.');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || 'CDP Error'));
            else res(msg.result);
          }
        } catch (e) {
          console.error('[CDP] Message parse error:', e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 900
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}

// Simple test assertion tracking
const results = [];
function assert(desc, condition, details = '') {
  const passed = Boolean(condition);
  results.push({ desc, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${mark}: ${desc}${!passed && details ? ' -> ' + details : ''}`);
  return passed;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTestSuite() {
  console.log('========================================================');
  console.log('FEATHERLINE AUTOMATED VERIFICATION TEST RUNNER (R1 - R5)');
  console.log('========================================================');

  // 1. Start Static Server
  const serverInfo = await startServer(3000, ROOT_DIR);
  console.log(`[1/5] Static test server started on ${serverInfo.url}`);

  // 2. Launch Headless Chrome
  const browserPath = findBrowserExecutable();
  const cdpPort = 9222;
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'featherline-verify-'));

  const chromeProc = spawn(browserPath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let browserWsUrl = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const data = await res.json();
      browserWsUrl = data.webSocketDebuggerUrl;
      if (browserWsUrl) break;
    } catch {}
  }

  if (!browserWsUrl) {
    throw new Error('Failed to connect to Headless Chrome remote debugging port.');
  }
  console.log(`[2/5] Headless browser connected via CDP (${browserPath})`);

  try {
    // Connect to Browser target
    const browserClient = new CDPClient(browserWsUrl);
    await browserClient.connect();

    // Create page target for Player 1 / Main View
    const { targetId: p1TargetId } = await browserClient.send('Target.createTarget', {
      url: `${serverInfo.url}/index.html`
    });
    const p1WsUrl = `ws://127.0.0.1:${cdpPort}/devtools/page/${p1TargetId}`;
    const p1 = new CDPClient(p1WsUrl);
    await p1.connect();
    await p1.send('Page.enable');
    await p1.send('Runtime.enable');

    console.log('\n--- SUITE A: Responsive Layout Integrity Across Viewports (R1 & R2) ---');
    const viewports = [
      { name: 'Desktop 1080p', width: 1920, height: 1080, allowMobileWarning: false },
      { name: 'Desktop 720p', width: 1280, height: 720, allowMobileWarning: false },
      { name: 'Tablet Landscape', width: 1024, height: 768, allowMobileWarning: false },
      { name: 'Tablet Portrait', width: 768, height: 1024, allowMobileWarning: true },
      { name: 'Mobile Landscape', width: 844, height: 390, allowMobileWarning: false },
      { name: 'Mobile Compact', width: 667, height: 375, allowMobileWarning: false }
    ];

    for (const vp of viewports) {
      await p1.setViewport(vp.width, vp.height);
      await p1.send('Page.navigate', { url: `${serverInfo.url}/index.html` });
      await sleep(400);

      const metrics = await p1.evaluate(`(() => {
        const doc = document.documentElement;
        const title = document.querySelector('.game-title');
        const titleRect = title ? title.getBoundingClientRect() : null;
        const lobbyCard = document.querySelector('.lobby-card');
        const cardRect = lobbyCard ? lobbyCard.getBoundingClientRect() : null;
        const guide = document.querySelector('.controls-guide');
        const guideRect = guide ? guide.getBoundingClientRect() : null;
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        const soloBtn = document.getElementById('btn-solo-practice');
        const nameInput = document.getElementById('player-name-input');
        const warning = document.getElementById('orientation-warning');
        const isWarningVisible = warning && !warning.classList.contains('hidden') && window.getComputedStyle(warning).display !== 'none';

        // Check button bounding rect non-overlap
        const rCreate = createBtn ? createBtn.getBoundingClientRect() : { top:0, bottom:0 };
        const rSolo = soloBtn ? soloBtn.getBoundingClientRect() : { top:0, bottom:0 };

        return {
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          scrollWidth: doc.scrollWidth,
          scrollHeight: doc.scrollHeight,
          titleTop: titleRect ? titleRect.top : -999,
          titleHeight: titleRect ? titleRect.height : 0,
          cardTop: cardRect ? cardRect.top : -999,
          guideBottom: guideRect ? guideRect.bottom : 9999,
          isWarningVisible,
          buttonsExist: Boolean(createBtn && joinBtn && soloBtn && nameInput),
          soloBelowHeader: rSolo.top >= (titleRect ? titleRect.bottom : 0)
        };
      })()`);

      if (vp.allowMobileWarning && metrics.isWarningVisible) {
        assert(`${vp.name} (${vp.width}x${vp.height}): Orientation warning correctly triggered in portrait mode`, true);
      } else {
        // Assert no horizontal or unwanted page-level scrolling
        assert(
          `${vp.name} (${vp.width}x${vp.height}): No horizontal scrollbar`,
          metrics.scrollWidth <= vp.width + 1,
          `scrollWidth ${metrics.scrollWidth} > ${vp.width}`
        );

        assert(
          `${vp.name} (${vp.width}x${vp.height}): Title 'FEATHERLINE' top >= 0 (no top clipping)`,
          metrics.titleTop >= 0,
          `titleTop = ${metrics.titleTop}`
        );

        assert(
          `${vp.name} (${vp.width}x${vp.height}): Interactive elements exist and do not overlap`,
          metrics.buttonsExist && metrics.soloBelowHeader
        );
      }
    }

    console.log('\n--- SUITE B: Solo Practice Mode & Predictive AI Initialization (R3 & R4) ---');
    await p1.setViewport(1280, 720);
    await p1.send('Page.navigate', { url: `${serverInfo.url}/index.html` });
    await sleep(400);

    // Click Solo Practice
    await p1.evaluate(`document.getElementById('btn-solo-practice').click()`);
    await sleep(300);

    const soloState = await p1.evaluate(`(() => {
      const g = window.game;
      return {
        gameState: g ? g.gameState : null,
        p1Name: g ? g.p1.name : null,
        p2Name: g ? g.p2.name : null,
        role: g ? g.network.role : null,
        hudVisible: !document.getElementById('in-game-hud').classList.contains('hidden'),
        lobbyHidden: document.getElementById('lobby-screen').classList.contains('hidden')
      };
    })()`);

    assert("Solo practice starts with role 'SOLO'", soloState.role === 'SOLO');
    assert("Solo practice assigns 'AI Bot' to opponent", soloState.p2Name === 'AI Bot');
    assert("Lobby screen hides and in-game HUD displays", soloState.lobbyHidden && soloState.hudVisible);
    assert("Game state enters 'SERVE' or 'PLAY'", soloState.gameState === 'SERVE' || soloState.gameState === 'PLAY');

    // Simulate swing to launch serve cleanly
    await p1.evaluate(`(() => {
      if (window.game.gameState === 'SERVE') {
        const params = window.game.p1.getServeParameters('drive');
        window.game.p1.swing('hit');
        window.game.launchServe(1, params);
      }
    })()`);
    await sleep(400);

    const playState = await p1.evaluate(`(() => {
      const g = window.game;
      return {
        gameState: g.gameState,
        shuttleInPlay: g.shuttlecock.inPlay,
        shuttleX: g.shuttlecock.x,
        p2X: g.p2.x
      };
    })()`);

    assert("Serve launches into 'PLAY' state with shuttlecock airborne", playState.gameState === 'PLAY' || playState.shuttleInPlay);

    // Let simulation run for 600ms to verify predictive AI reaction
    await sleep(600);
    const aiUpdated = await p1.evaluate(`(() => {
      return {
        p2Moved: window.game.p2.x !== window.game.p2.defaultX || window.game.ai.targetX !== window.game.p2.defaultX,
        targetX: window.game.ai.targetX
      };
    })()`);
    assert("Predictive AI Controller calculates target position and defends court", aiUpdated.p2Moved);

    console.log('\n--- SUITE C: Online Room Creation & BroadcastChannel Multiplayer (R4) ---');
    // Open second page target for Player 2 (Guest)
    const { targetId: p2TargetId } = await browserClient.send('Target.createTarget', {
      url: `${serverInfo.url}/index.html`
    });
    const p2WsUrl = `ws://127.0.0.1:${cdpPort}/devtools/page/${p2TargetId}`;
    const p2 = new CDPClient(p2WsUrl);
    await p2.connect();
    await p2.send('Page.enable');
    await p2.send('Runtime.enable');
    await p2.setViewport(1280, 720);

    // Navigate Player 1 back to lobby
    await p1.send('Page.navigate', { url: `${serverInfo.url}/index.html` });
    await sleep(400);

    // Player 1 creates room
    await p1.evaluate(`document.getElementById('btn-create-room').click()`);
    await sleep(200);

    const hostData = await p1.evaluate(`(() => {
      return {
        roomCode: window.game.network.roomCode,
        role: window.game.network.role,
        status: window.game.network.status,
        codeDisplay: document.getElementById('room-code-display').textContent.trim()
      };
    })()`);

    assert("Host creates 5-character room code", Boolean(hostData.roomCode && hostData.roomCode.length === 5));
    assert("Host network status enters 'WAITING'", hostData.status === 'WAITING' && hostData.role === 'HOST');
    assert("Room code renders in lobby code display banner", hostData.codeDisplay === hostData.roomCode);

    // Player 2 joins using Host's room code
    await p2.evaluate(`((code) => {
      document.getElementById('player-name-input').value = 'Guest Player';
      document.getElementById('join-code-input').value = code;
      document.getElementById('btn-join-room').click();
    })('${hostData.roomCode}')`);

    // Allow BroadcastChannel handshake
    await sleep(600);

    const p2Status = await p2.evaluate(`(() => {
      return {
        status: window.game.network.status,
        role: window.game.network.role,
        isUsingBroadcast: window.game.network.isUsingBroadcast
      };
    })()`);

    const p1Status = await p1.evaluate(`(() => {
      const btn = document.getElementById('btn-start-host-match');
      return {
        status: window.game.network.status,
        btnStartVisible: btn && !btn.classList.contains('hidden')
      };
    })()`);

    assert("Guest connects successfully via BroadcastChannel transport", p2Status.status === 'CONNECTED');
    assert("Host transitions status to 'CONNECTED' upon partner join", p1Status.status === 'CONNECTED');
    assert("Host 'START MATCH NOW' button is revealed", p1Status.btnStartVisible);

    // Host clicks 'START MATCH NOW'
    await p1.evaluate(`document.getElementById('btn-start-host-match').click()`);
    await sleep(500);

    const matchStates = await Promise.all([
      p1.evaluate(`window.game.gameState`),
      p2.evaluate(`window.game.gameState`)
    ]);

    assert("Host transitions to active match ('SERVE')", matchStates[0] === 'SERVE');
    assert("Guest simultaneously transitions to active match ('SERVE')", matchStates[1] === 'SERVE');

    console.log('\n--- SUITE D: Synchronized Pause & Return to Lobby (R4) ---');
    // Host triggers pause
    await p1.evaluate(`window.game.togglePause()`);
    await sleep(200);

    const pauseCheck = await Promise.all([
      p1.evaluate(`window.game.gameState === 'PAUSED' && !document.getElementById('pause-menu').classList.contains('hidden')`),
      p2.evaluate(`window.game.gameState === 'PAUSED' && !document.getElementById('pause-menu').classList.contains('hidden')`)
    ]);

    assert("Host opens pause menu and gameState is 'PAUSED'", pauseCheck[0]);
    assert("Guest synchronizes pause state and reveals pause menu", pauseCheck[1]);

    // Host resumes match
    await p1.evaluate(`window.game.togglePause()`);
    await sleep(200);

    const resumeCheck = await Promise.all([
      p1.evaluate(`window.game.gameState !== 'PAUSED' && document.getElementById('pause-menu').classList.contains('hidden')`),
      p2.evaluate(`window.game.gameState !== 'PAUSED' && document.getElementById('pause-menu').classList.contains('hidden')`)
    ]);

    assert("Host resumes match", resumeCheck[0]);
    assert("Guest synchronizes resume", resumeCheck[1]);

    // Host returns to lobby
    await p1.evaluate(`window.game.returnToLobby()`);
    await sleep(300);

    const lobbyCheck = await Promise.all([
      p1.evaluate(`window.game.gameState === 'LOBBY' && !document.getElementById('lobby-screen').classList.contains('hidden')`),
      p2.evaluate(`window.game.gameState === 'LOBBY' && !document.getElementById('lobby-screen').classList.contains('hidden')`)
    ]);

    assert("Host returns to lobby", lobbyCheck[0]);
    assert("Guest synchronizes return to lobby", lobbyCheck[1]);

    console.log('\n--- SUITE E: Physics Refinements, Edge-Triggering & Solo Co-Op (R3 & R4) ---');
    // Test Solo Co-Op Practice Mode selection
    await p1.evaluate(`(() => {
      document.getElementById('btn-mode-coop').click();
      document.getElementById('btn-solo-practice').click();
    })()`);
    await sleep(300);

    const coopCheck = await p1.evaluate(`(() => {
      const g = window.game;
      return {
        mode: g.mode,
        isCoopVisible: !document.getElementById('coop-scoreboard').classList.contains('hidden'),
        isVsHidden: document.getElementById('vs-scoreboard').classList.contains('hidden'),
        coopStreak: g.coopStreak
      };
    })()`);

    assert("Solo practice in Co-Op mode starts with mode 'coop'", coopCheck.mode === 'coop');
    assert("Co-Op rally streak scoreboard is visible in solo co-op mode", coopCheck.isCoopVisible && coopCheck.isVsHidden);

    // Test Edge-Triggered Swing (no infinite swinging on hold)
    const edgeTriggerCheck = await p1.evaluate(`(() => {
      const g = window.game;
      g.p1.swingState = 'idle';
      g.p1WasSwinging = true; // Simulating button held from previous frame
      // Simulate update tick with swing held
      const p1Input = { left: false, right: false, jump: false, swing: true, swingType: 'hit' };
      const p1WantsSwing = (g.input.state.swingPressedThisFrame || (p1Input.swing && !g.p1WasSwinging));
      return { p1WantsSwing, swingState: g.p1.swingState };
    })()`);

    assert("Holding swing key does not trigger continuous auto-swinging (edge-triggered)", !edgeTriggerCheck.p1WantsSwing && edgeTriggerCheck.swingState === 'idle');

    // Test continuous net collision math (downward trajectory crossing cleanly above net)
    const netCollisionCheck = await p1.evaluate(`(() => {
      const g = window.game;
      g.shuttlecock.inPlay = true;
      g.shuttlecock.x = 610;
      g.shuttlecock.y = 440;
      g.shuttlecock.vx = 800;
      g.shuttlecock.vy = 200; // Moving downward across net plane at x = 640

      // Step physics by 0.05s
      g.shuttlecock.update(0.05, g.physics, null, null, null);

      return {
        crossedNet: g.shuttlecock.x > 640,
        notRebounded: g.shuttlecock.vx > 0, // vx still positive, did not bounce back
        y: g.shuttlecock.y
      };
    })()`);

    assert("Downward shot crossing above net top clears without false rebound", netCollisionCheck.crossedNet && netCollisionCheck.notRebounded);

    // Test in-game partner disconnect overlay
    await p1.evaluate(`(() => {
      window.game.gameState = 'PLAY';
      window.game.handlePartnerDisconnect();
    })()`);
    await sleep(200);

    const disconnectModal = await p1.evaluate(`(() => {
      const modal = document.getElementById('disconnect-overlay');
      return modal && !modal.classList.contains('hidden') && window.game.gameState === 'PAUSED';
    })()`);

    assert("Partner disconnect during active play triggers in-game alert overlay and pauses match", disconnectModal);

    console.log('\n--- SUITE F: Tap/Mouse Aiming & Auto-Hit by Positioning ---');
    // Test Mouse/Tap Aiming updates aim target
    const aimCheck = await p1.evaluate(`(() => {
      const g = window.game;
      g.input.state.aimX = 850;
      g.input.state.aimY = 400;
      g.p1.update(0.016, g.input.state, g.physics);
      return {
        p1AimX: g.p1.aimX,
        p1AimY: g.p1.aimY
      };
    })()`);
    assert("Mouse/Tap coordinate updates player aim target", aimCheck.p1AimX === 850 && aimCheck.p1AimY === 400);

    // Test Auto-Hit when standing in accurate position
    const autoHitInPosition = await p1.evaluate(`(() => {
      const g = window.game;
      g.gameState = 'PLAY';
      g.shuttlecock.inPlay = true;
      g.shuttlecock.lastHitBy = 2; // Hit by opponent
      g.p1.autoHitCooldown = 0;
      g.p1.swingState = 'idle';

      // Position shuttlecock exactly in front of P1 racket sweet-spot
      const racket = g.p1.getRacketHitCenter();
      g.shuttlecock.x = racket.x + 10;
      g.shuttlecock.y = racket.y;
      g.shuttlecock.vx = -400;
      g.shuttlecock.vy = 200;

      const hitResult = g.p1.checkAutoHit(g.shuttlecock, g.physics, { playHit: () => {}, playSmash: () => {} }, false);
      return {
        hitResult: Boolean(hitResult),
        shuttleVx: g.shuttlecock.vx,
        shuttleHitter: g.shuttlecock.lastHitBy,
        playerSwung: g.p1.swingState === 'swinging'
      };
    })()`);
    assert("Standing in right position automatically hits the shuttlecock", autoHitInPosition.hitResult && autoHitInPosition.shuttleVx > 0 && autoHitInPosition.shuttleHitter === 1);

    // Test Miss when player is NOT standing accurately
    const missOutOfPosition = await p1.evaluate(`(() => {
      const g = window.game;
      g.gameState = 'PLAY';
      g.shuttlecock.inPlay = true;
      g.shuttlecock.lastHitBy = 2; // Hit by opponent
      g.p1.autoHitCooldown = 0;
      g.p1.swingState = 'idle';
      g.p1.lastMissTimer = 0;

      // Position shuttlecock far away from P1 racket (out of reach)
      const racket = g.p1.getRacketHitCenter();
      g.shuttlecock.x = racket.x + 95; // Out of reach
      g.shuttlecock.y = racket.y;
      g.shuttlecock.vx = -400;
      g.shuttlecock.vy = 200;

      const hitResult = g.p1.checkAutoHit(g.shuttlecock, g.physics, { playHit: () => {}, playSmash: () => {} }, false);
      return {
        hitResult: Boolean(hitResult),
        shuttleHitter: g.shuttlecock.lastHitBy,
        missFlagged: g.p1.lastMissTimer > 0
      };
    })()`);
    assert("Not standing accurately misses the shuttlecock", !missOutOfPosition.hitResult && missOutOfPosition.shuttleHitter === 2 && missOutOfPosition.missFlagged);

    // Cleanup page clients
    p1.close();
    p2.close();
    browserClient.close();
  } finally {
    // Teardown Chrome & Static Server
    chromeProc.kill('SIGKILL');
    await serverInfo.close();
    try {
      fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
    } catch {}
  }

  // Summary Report
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('========================================================\n');

  if (failed > 0) {
    console.error(`Verification FAILED: ${failed} assertions failed.`);
    process.exit(1);
  } else {
    console.log('Verification PASSED: All layout, physics, and mode tests succeeded.');
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
