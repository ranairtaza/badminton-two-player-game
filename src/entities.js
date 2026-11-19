// ========================================================
// FEATHERLINE - ENTITIES ENGINE
// Player, Guided Serve System, Trajectory Preview & Dynamic Racket
// ========================================================

import { COURT, predictTrajectory } from './physics.js';

export class Player {
  constructor(side = 1, name = 'Player 1', assistBoost = false) {
    this.side = side; // 1 = Left, 2 = Right
    this.name = name;
    this.assistBoost = assistBoost;
    this.width = 44;
    this.height = 96;
    this.smashesLanded = 0;

    this.configureSideBounds();
    this.reset();
  }

  configureSideBounds() {
    if (this.side === 1) {
      this.minX = COURT.leftBound + 10;
      this.maxX = COURT.netX - 45;
      this.defaultX = COURT.leftBound + 160;
    } else {
      this.minX = COURT.netX + 45;
      this.maxX = COURT.rightBound - 10;
      this.defaultX = COURT.rightBound - 160;
    }
  }

  setSide(newSide) {
    this.side = newSide;
    this.configureSideBounds();
    this.reset();
  }

  reset() {
    this.x = this.defaultX;
    this.y = COURT.floorY - this.height;
    this.vx = 0;
    this.vy = 0;
    this.speed = 470;
    this.jumpForce = -720;
    this.isGrounded = true;

    this.swingState = 'idle'; // 'idle', 'swinging', 'cooldown'
    this.swingTimer = 0;
    this.swingDuration = this.assistBoost ? 0.22 : 0.18;
    this.swingType = 'hit';
    this.hasConnectedHit = false;

    this.facing = this.side === 1 ? 1 : -1;
    this.animTime = 0;
    this.armAngle = 0;

    // Guided Serve Timing Ring
    this.serveTimingPhase = 0;
  }

  jump(physicsEngine) {
    if (this.isGrounded) {
      this.vy = this.jumpForce;
      this.isGrounded = false;
      if (physicsEngine) {
        physicsEngine.createDust(this.x, COURT.floorY);
      }
    }
  }

  swing(type = 'hit') {
    if (this.swingState !== 'idle') return false;

    this.swingState = 'swinging';
    this.swingTimer = 0;
    this.swingType = type;
    this.hasConnectedHit = false;
    return true;
  }

  update(dt, inputState, physicsEngine) {
    this.animTime += dt;
    this.serveTimingPhase = (this.serveTimingPhase + dt * 2.8) % (Math.PI * 2);

    let moveDir = 0;
    if (inputState.left) moveDir -= 1;
    if (inputState.right) moveDir += 1;

    if (moveDir !== 0) {
      this.vx = moveDir * this.speed;
      this.facing = moveDir;
    } else {
      this.vx *= 0.72;
      if (Math.abs(this.vx) < 10) this.vx = 0;
    }

    this.x += this.vx * dt;

    if (this.x < this.minX) {
      this.x = this.minX;
      this.vx = 0;
    } else if (this.x > this.maxX) {
      this.x = this.maxX;
      this.vx = 0;
    }

    if (!this.isGrounded) {
      this.vy += COURT.gravity * dt;
      this.y += this.vy * dt;

      if (this.y >= COURT.floorY - this.height) {
        this.y = COURT.floorY - this.height;
        this.vy = 0;
        this.isGrounded = true;
        if (physicsEngine) {
          physicsEngine.createDust(this.x, COURT.floorY);
        }
      }
    }

    if (this.swingState === 'swinging') {
      this.swingTimer += dt;
      if (this.swingTimer >= this.swingDuration) {
        this.swingState = 'cooldown';
        this.swingTimer = 0;
      }
    } else if (this.swingState === 'cooldown') {
      this.swingTimer += dt;
      if (this.swingTimer >= 0.08) {
        this.swingState = 'idle';
        this.swingTimer = 0;
        this.hasConnectedHit = false;
      }
    }

    if (this.swingState === 'swinging') {
      const progress = this.swingTimer / this.swingDuration;
      this.armAngle = (1 - progress) * (-1.4) + progress * 1.5;
    } else {
      const restAngle = Math.sin(this.animTime * 4) * 0.15;
      this.armAngle = restAngle;
    }
  }

  // Smooth network interpolation for remote player
  applyNetworkState(remoteData, dt) {
    if (!remoteData) return;
    const lerp = Math.min(1.0, 18 * dt);
    this.x += (remoteData.x - this.x) * lerp;
    this.y += (remoteData.y - this.y) * lerp;
    this.vx = remoteData.vx;
    this.vy = remoteData.vy;
    this.isGrounded = remoteData.isGrounded;
    this.swingState = remoteData.swingState;
    this.swingTimer = remoteData.swingTimer;
    this.swingType = remoteData.swingType;
    this.facing = remoteData.facing || (this.side === 1 ? 1 : -1);
    this.assistBoost = remoteData.assistBoost;
    this.smashesLanded = remoteData.smashesLanded || 0;
    if (remoteData.name) this.name = remoteData.name;

    this.animTime += dt;
    if (this.swingState === 'swinging') {
      const progress = this.swingTimer / (this.assistBoost ? 0.22 : 0.18);
      this.armAngle = (1 - progress) * (-1.4) + progress * 1.5;
    } else {
      this.armAngle = Math.sin(this.animTime * 4) * 0.15;
    }
  }

  exportState() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
      isGrounded: this.isGrounded,
      swingState: this.swingState,
      swingTimer: parseFloat(this.swingTimer.toFixed(3)),
      swingType: this.swingType,
      facing: this.facing,
      assistBoost: this.assistBoost,
      smashesLanded: this.smashesLanded,
      name: this.name,
      side: this.side
    };
  }

  getRacketHitCenter() {
    const forward = this.side === 1 ? 1 : -1;
    const reachX = this.x + forward * (this.assistBoost ? 44 : 38);
    const reachY = this.y + (this.isGrounded ? 22 : 8);
    const baseRadius = 46;
    const radius = this.assistBoost ? baseRadius * 1.45 : baseRadius;
    return { x: reachX, y: reachY, radius };
  }

  // Calculate guided serve launch parameters based on player position and timing ring
  getServeParameters(type = 'drive') {
    const dir = this.side === 1 ? 1 : -1;
    // Aiming factor: closer to net = steeper angle, further back = flatter drive
    const netDist = Math.abs(COURT.netX - this.x);
    const aimRatio = Math.max(0.2, Math.min(1.0, (netDist - 50) / 400));

    // Timing ring precision bonus: when sine is at top peak (scale ~ 1.0)
    const timingBonus = Math.abs(Math.sin(this.serveTimingPhase)) > 0.85;

    let vx, vy;
    if (type === 'lob') {
      vx = dir * (580 + aimRatio * 120);
      vy = -740;
    } else {
      vx = dir * (680 + (timingBonus ? 80 : 0) + aimRatio * 90);
      vy = -(320 + (1 - aimRatio) * 60);
    }

    return { vx, vy, isPerfect: timingBonus };
  }

  // Draw Guided Serve Preview Arc & Timing Ring
  drawServeGuide(ctx, shuttlecock, isLocalServer = true) {
    const serveParams = this.getServeParameters('drive');
    const startX = shuttlecock.x;
    const startY = shuttlecock.y;

    // Predict landing arc points
    const points = predictTrajectory(startX, startY, serveParams.vx, serveParams.vy, false, 24, 0.038);

    if (points.length > 1) {
      ctx.save();
      // 1. Dotted Trajectory Arc
      ctx.strokeStyle = this.side === 1 ? 'rgba(0, 242, 254, 0.65)' : 'rgba(255, 65, 108, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // 2. Projected Landing Target Ring on Floor
      const landingPt = points[points.length - 1];
      ctx.fillStyle = this.side === 1 ? 'rgba(0, 242, 254, 0.25)' : 'rgba(255, 65, 108, 0.25)';
      ctx.strokeStyle = this.side === 1 ? '#00f2fe' : '#ff416c';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(landingPt.x, COURT.floorY - 2, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Target Crosshair
      ctx.beginPath();
      ctx.moveTo(landingPt.x - 12, COURT.floorY - 2);
      ctx.lineTo(landingPt.x + 12, COURT.floorY - 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Subtle Timing Ring around Shuttlecock for extra pace
    ctx.save();
    const ringScale = 1.0 + Math.abs(Math.sin(this.serveTimingPhase)) * 0.9;
    const isSweetSpot = ringScale > 1.65;
    ctx.strokeStyle = isSweetSpot ? '#ffbe0b' : (this.side === 1 ? '#00f2fe' : '#ff416c');
    ctx.lineWidth = isSweetSpot ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(shuttlecock.x, shuttlecock.y, 14 * ringScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 4. Guided Serve Control Hint
    if (isLocalServer) {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 16, 28, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      const hintY = this.y - 32;
      ctx.beginPath();
      ctx.roundRect(this.x - 84, hintY, 168, 24, 12);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tap HIT to serve • Move to aim', this.x, hintY + 12);
      ctx.restore();
    }
  }

  checkHit(shuttlecock, physicsEngine, audioEngine, isCoop = false) {
    if (this.swingState !== 'swinging' || this.hasConnectedHit) return false;

    const racket = this.getRacketHitCenter();
    const dist = Math.hypot(shuttlecock.x - racket.x, shuttlecock.y - racket.y);

    if (dist <= racket.radius + shuttlecock.radius) {
      this.hasConnectedHit = true;

      const isAirborne = !this.isGrounded;
      const isAboveNet = shuttlecock.y < COURT.netTopY + 30;
      const isJumpSmash = isAirborne && isAboveNet && this.swingType === 'hit';

      let outVx, outVy;
      const targetSideDir = this.side === 1 ? 1 : -1;

      if (isJumpSmash) {
        this.smashesLanded++;

        if (isCoop) {
          outVx = targetSideDir * (840 + Math.random() * 60);
          outVy = 260 + Math.random() * 50;
        } else {
          outVx = targetSideDir * (940 + Math.random() * 80);
          outVy = 380 + Math.random() * 60;
        }

        physicsEngine.createSmashTrail(shuttlecock.x, shuttlecock.y, outVx, outVy);
        physicsEngine.createHitSparks(shuttlecock.x, shuttlecock.y, 24, '#ffaa00');
        physicsEngine.triggerHitStop(0.030); // 30ms hit-stop
        physicsEngine.addScreenShake(9);
        audioEngine.playSmash();

        shuttlecock.launch(outVx, outVy, this.side, true);
      } else if (this.swingType === 'lob') {
        outVx = targetSideDir * (600 + Math.random() * 40);
        outVy = -(780 + Math.random() * 60);

        physicsEngine.createHitSparks(shuttlecock.x, shuttlecock.y, 10, '#00f2fe');
        audioEngine.playHit(0.9);

        shuttlecock.launch(outVx, outVy, this.side, false);
      } else {
        outVx = targetSideDir * (740 + Math.random() * 50);
        outVy = -(240 + Math.random() * 80);

        physicsEngine.createHitSparks(shuttlecock.x, shuttlecock.y, 12, '#ffffff');
        audioEngine.playHit(1.0);

        shuttlecock.launch(outVx, outVy, this.side, false);
      }

      return { hit: true, isJumpSmash, swingType: this.swingType };
    }

    return false;
  }

  draw(ctx) {
    const isP1 = this.side === 1;
    const bodyColor = isP1 ? '#38bdf8' : '#f43f5e';
    const trimColor = isP1 ? '#0284c7' : '#be123c';
    const skinColor = '#fcd34d';

    ctx.save();

    // 1. Floor Shadow
    const shadowScale = Math.max(0.4, 1 - (COURT.floorY - (this.y + this.height)) / 250);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(this.x, COURT.floorY - 2, 26 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Reach Assist dashed indicator
    if (this.assistBoost) {
      const racket = this.getRacketHitCenter();
      ctx.save();
      ctx.strokeStyle = isP1 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(244, 63, 94, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(racket.x, racket.y, racket.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.translate(this.x, this.y);

    const facingDir = this.side === 1 ? 1 : -1;
    const runCycle = this.isGrounded ? Math.sin(this.animTime * 14) * (Math.abs(this.vx) / this.speed) : 0;

    // 3. Legs & Shoes
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-6, 52);
    ctx.lineTo(-10 + runCycle * 8, 80);
    ctx.lineTo(-8 + runCycle * 10, 92);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(6, 52);
    ctx.lineTo(10 - runCycle * 8, 80);
    ctx.lineTo(8 - runCycle * 10, 92);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-8 + runCycle * 10, 93, 4, 0, Math.PI * 2);
    ctx.arc(8 - runCycle * 10, 93, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4. Torso & Jersey
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(-14, 18, 28, 38, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Teko, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.side === 1 ? '1' : '2', 0, 42);

    // 5. Head & Headband
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 8, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, 4, 12, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = trimColor;
    ctx.fillRect(-12, 4, 24, 4);

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(facingDir * 5, 8, 2, 0, Math.PI * 2);
    ctx.fill();

    // 6. Arm & Racket
    ctx.save();
    ctx.translate(facingDir * 10, 24);
    
    const baseArmRot = facingDir === 1 ? (this.armAngle - 0.4) : (-this.armAngle + 0.4);
    ctx.rotate(baseArmRot);

    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(facingDir * 18, -10);
    ctx.stroke();

    ctx.translate(facingDir * 18, -10);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(facingDir * 28, -14);
    ctx.stroke();

    const headX = facingDir * 38;
    const headY = -18;
    ctx.strokeStyle = isP1 ? '#38bdf8' : '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(headX, headY, 14, 20, facingDir * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headX - 6, headY - 14);
    ctx.lineTo(headX + 6, headY + 14);
    ctx.moveTo(headX - 10, headY);
    ctx.lineTo(headX + 10, headY);
    ctx.stroke();

    if (this.swingState === 'swinging') {
      ctx.strokeStyle = this.swingType === 'hit' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 190, 11, 0.8)';
      if (!this.isGrounded && this.swingType === 'hit') {
        ctx.strokeStyle = 'rgba(255, 80, 0, 0.9)';
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 52, -Math.PI / 3, Math.PI / 4, facingDir < 0);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }
}

// AI Controller for Solo Practice Mode
export class AIController {
  constructor(player) {
    this.player = player;
    this.targetX = player.defaultX;
    this.reactionTimer = 0;
  }

  update(dt, shuttlecock) {
    this.reactionTimer += dt;
    const input = { left: false, right: false, jump: false, swing: false, swingType: 'hit' };

    if (!shuttlecock.inPlay && shuttlecock.lastHitBy === this.player.side) {
      if (this.reactionTimer > 1.0) {
        this.reactionTimer = 0;
        input.swing = true;
        input.swingType = 'hit';
        return input;
      }
    }

    if (this.reactionTimer > 0.12) {
      this.reactionTimer = 0;
      if (shuttlecock.inPlay && shuttlecock.vx > 0) {
        this.targetX = Math.max(this.player.minX + 20, Math.min(this.player.maxX - 20, shuttlecock.x + 20));
      } else {
        this.targetX = this.player.defaultX;
      }
    }

    const dx = this.targetX - this.player.x;
    if (dx < -16) input.left = true;
    else if (dx > 16) input.right = true;

    if (shuttlecock.inPlay && shuttlecock.x > COURT.netX) {
      const racket = this.player.getRacketHitCenter();
      const dist = Math.hypot(shuttlecock.x - racket.x, shuttlecock.y - racket.y);

      if (this.player.isGrounded && shuttlecock.y < COURT.netTopY - 20 && Math.abs(shuttlecock.x - this.player.x) < 65) {
        input.jump = true;
      }

      if (dist < racket.radius + shuttlecock.radius + 14) {
        input.swing = true;
        input.swingType = (!this.player.isGrounded && shuttlecock.y < COURT.netTopY + 20) ? 'hit' : (shuttlecock.y > COURT.floorY - 100 ? 'lob' : 'hit');
      }
    }

    return input;
  }
}

// Court Renderer
export function drawBadmintonCourt(ctx) {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, COURT.floorY);
  bgGrad.addColorStop(0, '#0c121e');
  bgGrad.addColorStop(1, '#182436');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, COURT.width, COURT.floorY);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let x = 60; x < COURT.width; x += 140) {
    ctx.fillRect(x, 40, 60, COURT.floorY - 40);
  }

  // Tournament Court Green Mat
  ctx.fillStyle = '#1e5f38';
  ctx.fillRect(COURT.leftBound, COURT.floorY - 8, COURT.rightBound - COURT.leftBound, 18);

  // Parquet wood floor
  const floorGrad = ctx.createLinearGradient(0, COURT.floorY, 0, COURT.height);
  floorGrad.addColorStop(0, '#92400e');
  floorGrad.addColorStop(0.15, '#b45309');
  floorGrad.addColorStop(1, '#451a03');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, COURT.floorY, COURT.width, COURT.height - COURT.floorY);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1.5;
  for (let y = COURT.floorY; y < COURT.height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(COURT.width, y);
    ctx.stroke();
  }

  // Boundary lines
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(COURT.leftBound, COURT.floorY);
  ctx.lineTo(COURT.rightBound, COURT.floorY);
  ctx.stroke();

  const drawCourtMark = (x) => {
    ctx.beginPath();
    ctx.moveTo(x, COURT.floorY);
    ctx.lineTo(x, COURT.floorY + 8);
    ctx.stroke();
  };

  drawCourtMark(COURT.leftBound);
  drawCourtMark(COURT.leftBound + 80);
  drawCourtMark(COURT.netX - 160);
  drawCourtMark(COURT.netX + 160);
  drawCourtMark(COURT.rightBound - 80);
  drawCourtMark(COURT.rightBound);

  // Net & Posts
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(COURT.netX - 5, COURT.netTopY - 6, 10, COURT.floorY - COURT.netTopY + 6);

  ctx.fillStyle = 'rgba(20, 20, 20, 0.55)';
  ctx.fillRect(COURT.netX - 4, COURT.netTopY, 8, COURT.floorY - COURT.netTopY);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  for (let y = COURT.netTopY; y < COURT.floorY; y += 8) {
    ctx.beginPath();
    ctx.moveTo(COURT.netX - 4, y);
    ctx.lineTo(COURT.netX + 4, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(COURT.netX - 6, COURT.netTopY - 2, 12, 6);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
}
