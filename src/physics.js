// ========================================================
// FEATHERLINE - PHYSICS & AERODYNAMICS ENGINE
// Authentic Drag, Feather Arrow Off-Screen Indicator & Trajectory Math
// ========================================================

export const COURT = {
  width: 1280,
  height: 720,
  floorY: 610,
  leftBound: 140,
  rightBound: 1140,
  netX: 640,
  netHeight: 155, // Net top is floorY - 155 = 455
  netTopY: 455,
  netThickness: 12,
  gravity: 1220, // px/s^2
};

export class Particle {
  constructor(x, y, vx, vy, color, size, life, decay, type = 'spark') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.decay = decay;
    this.type = type;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 8;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= this.decay * dt;
    this.rotation += this.rotSpeed * dt;

    if (this.type === 'confetti') {
      this.vy += 200 * dt;
      this.vx *= 0.98;
    } else if (this.type === 'smoke') {
      this.vy -= 15 * dt;
      this.size += 14 * dt;
    } else {
      this.vy += 420 * dt;
    }

    return this.life > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
    ctx.translate(this.x, this.y);

    if (this.type === 'confetti') {
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size, -this.size / 2, this.size * 2, this.size);
    } else if (this.type === 'smash') {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class PhysicsEngine {
  constructor() {
    this.particles = [];
    this.cameraShake = 0;
    this.hitStopTimer = 0; // 30ms freeze-frame for jump smashes
  }

  triggerHitStop(duration = 0.030) {
    this.hitStopTimer = duration;
  }

  addScreenShake(intensity = 8) {
    this.cameraShake = Math.max(this.cameraShake, intensity);
  }

  update(dt) {
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 45);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const alive = this.particles[i].update(dt);
      if (!alive) {
        this.particles.splice(i, 1);
      }
    }
  }

  createSmashTrail(x, y, vx, vy) {
    const colors = ['#ff3b00', '#ff8800', '#ffd000', '#ffffff'];
    const count = 3;
    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const pVx = -vx * 0.15 + (Math.random() - 0.5) * 60;
      const pVy = -vy * 0.15 + (Math.random() - 0.5) * 60;
      this.particles.push(new Particle(
        x + (Math.random() - 0.5) * 8,
        y + (Math.random() - 0.5) * 8,
        pVx, pVy,
        color,
        Math.random() * 3.5 + 2,
        1.0,
        Math.random() * 4 + 3,
        'smash'
      ));
    }
  }

  createHitSparks(x, y, count = 12, color = '#ffffff') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 260 + 80;
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        Math.random() * 2.5 + 1.5,
        1.0,
        Math.random() * 3 + 2.5,
        'spark'
      ));
    }
  }

  createDust(x, y) {
    for (let i = 0; i < 6; i++) {
      const vx = (Math.random() - 0.5) * 90;
      const vy = -Math.random() * 40;
      this.particles.push(new Particle(
        x, y,
        vx, vy,
        'rgba(240, 240, 240, 0.4)',
        Math.random() * 3 + 2,
        0.8,
        2.5,
        'smoke'
      ));
    }
  }

  createConfetti(count = 90) {
    const colors = ['#00f2fe', '#ff416c', '#ffbe0b', '#10b981', '#a855f7', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * COURT.width;
      const y = Math.random() * 150 - 50;
      const vx = (Math.random() - 0.5) * 200;
      const vy = Math.random() * 120 + 80;
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push(new Particle(
        x, y,
        vx, vy,
        color,
        Math.random() * 5 + 4,
        1.0,
        Math.random() * 0.25 + 0.35,
        'confetti'
      ));
    }
  }

  drawParticles(ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].draw(ctx);
    }
  }
}

// Predict Future Trajectory points taking drag and gravity into account
export function predictTrajectory(startX, startY, vx, vy, isSmash = false, maxPoints = 28, stepDt = 0.035) {
  const points = [];
  let curX = startX;
  let curY = startY;
  let curVx = vx;
  let curVy = vy;

  for (let i = 0; i < maxPoints; i++) {
    points.push({ x: curX, y: curY });

    const speed = Math.hypot(curVx, curVy);
    if (speed > 1) {
      const dragFactor = isSmash ? 0.0016 : 0.0012;
      const drag = dragFactor * speed * speed;
      curVx -= (curVx / speed) * drag * stepDt;
      curVy -= (curVy / speed) * drag * stepDt;
    }
    curVy += COURT.gravity * stepDt;
    curX += curVx * stepDt;
    curY += curVy * stepDt;

    // Stop at floor level
    if (curY >= COURT.floorY) {
      points.push({ x: curX, y: COURT.floorY });
      break;
    }
  }

  return points;
}

export class Shuttlecock {
  constructor() {
    this.reset(COURT.leftBound + 160, COURT.floorY - 140);
  }

  reset(x, y, side = 1) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = side === 1 ? -0.2 : Math.PI + 0.2;
    this.radius = 7;
    this.isSmash = false;
    this.inPlay = false;
    this.lastHitBy = side; // 1 = P1, 2 = P2
    this.hitCountInRally = 0;
    this.hasTouchedFloor = false;
    this.history = [];
  }

  launch(vx, vy, hitterSide, isSmash = false) {
    this.vx = vx;
    this.vy = vy;
    this.lastHitBy = hitterSide;
    this.isSmash = isSmash;
    this.inPlay = true;
    this.hasTouchedFloor = false;
    this.hitCountInRally++;
    this.history = [];
  }

  // Realistic aerodynamic simulation with quadratic drag & apex drop
  update(dt, physicsEngine, audioEngine, onFloorLanding, onNetClip) {
    if (!this.inPlay) return;

    this.history.push({ x: this.x, y: this.y, isSmash: this.isSmash });
    if (this.history.length > 10) {
      this.history.shift();
    }

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 1) {
      const dragFactor = this.isSmash ? 0.0016 : 0.0012;
      const drag = dragFactor * speed * speed;
      const dragVx = (this.vx / speed) * drag;
      const dragVy = (this.vy / speed) * drag;

      this.vx -= dragVx * dt;
      this.vy -= dragVy * dt;
    }

    this.vy += COURT.gravity * dt;

    if (this.isSmash && speed > 220) {
      physicsEngine.createSmashTrail(this.x, this.y, this.vx, this.vy);
    }

    const prevX = this.x;
    const prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Nose-first velocity-aligned rotation
    if (speed > 30) {
      const targetAngle = Math.atan2(this.vy, this.vx);
      let diff = targetAngle - this.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.rotation += diff * Math.min(1.0, 16 * dt);
    }

    // Net & Net-Tape Continuous Segment Collision
    const netHalfW = COURT.netThickness / 2;
    const crossedFromLeft = (prevX < COURT.netX && this.x >= COURT.netX - netHalfW);
    const crossedFromRight = (prevX > COURT.netX && this.x <= COURT.netX + netHalfW);

    if (crossedFromLeft || crossedFromRight) {
      const dx = this.x - prevX;
      const t = Math.abs(dx) > 0.0001 ? Math.max(0, Math.min(1, (COURT.netX - prevX) / dx)) : 0.5;
      const crossingY = prevY + t * (this.y - prevY);

      if (crossingY >= COURT.netTopY - 6 && crossingY <= COURT.floorY) {
        if (Math.abs(crossingY - COURT.netTopY) < 14) {
          // Top Net-Tape Clip
          this.x = COURT.netX + (crossedFromLeft ? 4 : -4);
          this.y = COURT.netTopY - 2;
          this.vx = (crossedFromLeft ? 1 : -1) * Math.max(80, Math.abs(this.vx) * 0.45);
          this.vy = -Math.abs(this.vy) * 0.35 + 40;
          this.isSmash = false;
          if (physicsEngine) physicsEngine.createHitSparks(this.x, this.y, 10, '#ffffff');
          if (audioEngine) audioEngine.playNetClip();
          if (onNetClip) onNetClip();
        } else if (crossingY > COURT.netTopY + 8) {
          // Rebound off net mesh
          this.x = crossedFromLeft ? (COURT.netX - netHalfW - 6) : (COURT.netX + netHalfW + 6);
          this.y = Math.min(COURT.floorY - this.radius, crossingY);
          this.vx = -this.vx * 0.22;
          this.vy *= 0.35;
          this.isSmash = false;
          if (audioEngine) audioEngine.playNetClip();
          if (physicsEngine) physicsEngine.createHitSparks(this.x, this.y, 8, '#cbd5e1');
        }
      }
    }

    // Floor Landing & IN/OUT Boundary Check
    if (this.y >= COURT.floorY - this.radius) {
      this.y = COURT.floorY - this.radius;
      this.vx *= 0.3;
      this.vy = 0;
      this.inPlay = false;
      this.hasTouchedFloor = true;
      if (physicsEngine) physicsEngine.createDust(this.x, this.y);

      const isOut = (this.x < COURT.leftBound || this.x > COURT.rightBound);
      if (onFloorLanding) {
        onFloorLanding(this.x, this.y, this.lastHitBy, isOut);
      }
    }

    if (this.x < 20) {
      this.x = 20;
      this.vx = -this.vx * 0.3;
    } else if (this.x > COURT.width - 20) {
      this.x = COURT.width - 20;
      this.vx = -this.vx * 0.3;
    }

    // Virtual sky allows high lobs above the 720 canvas
  }

  // Feather Arrow Indicator: Tracks off-screen shuttlecock along canvas top margin
  drawFeatherArrowIndicator(ctx) {
    if (!this.inPlay) return;

    // Trigger whenever shuttlecock rises above top viewport margin (y < 45)
    if (this.y >= 45) return;

    // Calculate altitude above top border
    const altitude = Math.max(0, 45 - this.y);
    const alpha = Math.min(1.0, altitude / 25);

    // Clamp indicator horizontal position within canvas margins
    const clampedX = Math.max(60, Math.min(COURT.width - 60, this.x));
    const indicatorY = 32; // Fixed top edge margin with clearance from scoreboard

    // Subtle scale based on altitude
    const scale = Math.min(1.35, 0.95 + (altitude / 260));

    // Dynamic color shifting:
    // Amber / Fiery Orange for fast downward smashes
    // Crisp Cyan / Pure White for defensive lobs and high clears
    const isSmashOrFast = this.isSmash || this.vy > 180;
    const primaryColor = isSmashOrFast ? '#ff8800' : '#00f2fe';
    const glowColor = isSmashOrFast ? 'rgba(255, 136, 0, 0.8)' : 'rgba(0, 242, 254, 0.8)';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(clampedX, indicatorY);
    ctx.scale(scale, scale);

    // 1. Glowing outer pill badge
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-24, -14, 48, 28, 14);
    ctx.fill();
    ctx.stroke();

    // 2. Mini feathered shuttlecock icon
    ctx.save();
    // Rotate mini icon to point along velocity or downwards
    const angle = Math.min(Math.PI * 0.45, Math.max(-Math.PI * 0.45, this.vx * 0.0015));
    ctx.rotate(angle);

    // Cork
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 3, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Skirt
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(6, -8);
    ctx.lineTo(1, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Downward pulsing chevron arrow pointing toward court
    const chevronPulse = Math.sin(Date.now() * 0.012) * 2;
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 16 + chevronPulse);
    ctx.lineTo(-6, 11 + chevronPulse);
    ctx.lineTo(-3, 11 + chevronPulse);
    ctx.lineTo(0, 13 + chevronPulse);
    ctx.lineTo(3, 11 + chevronPulse);
    ctx.lineTo(6, 11 + chevronPulse);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  draw(ctx) {
    // Dynamic floor shadow under shuttlecock
    if (this.inPlay && this.y < COURT.floorY) {
      const heightAboveFloor = Math.max(0, COURT.floorY - this.y);
      const shadowAlpha = Math.max(0.08, 0.40 - heightAboveFloor / 650);
      const shadowWidth = Math.max(6, 24 - heightAboveFloor / 38);
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(this.x, COURT.floorY - 2, shadowWidth, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.history.length > 2) {
      ctx.save();
      for (let i = 0; i < this.history.length - 1; i++) {
        const pt = this.history[i];
        const alpha = (i / this.history.length) * (pt.isSmash ? 0.45 : 0.2);
        ctx.strokeStyle = pt.isSmash ? `rgba(255, 90, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = pt.isSmash ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(this.history[i + 1].x, this.history[i + 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Only draw shuttlecock body if it is within or near visible canvas
    if (this.y < -20) {
      this.drawFeatherArrowIndicator(ctx);
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Feather Skirt
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-15, -4);
    ctx.lineTo(-15, 4);
    ctx.lineTo(-14, 8);
    ctx.closePath();
    ctx.fill();

    // Feather ribbing
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(-7, 4);
    ctx.moveTo(-11, -6);
    ctx.lineTo(-11, 6);
    ctx.stroke();

    // Cork Nose
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(1, 0, 4.5, -Math.PI / 2, Math.PI / 2, false);
    ctx.fill();

    // Red ribbon band
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-1.5, -4.5, 2.5, 9);

    if (this.isSmash) {
      ctx.shadowColor = '#ff5500';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    // Also draw indicator if near top border
    this.drawFeatherArrowIndicator(ctx);
  }
}
