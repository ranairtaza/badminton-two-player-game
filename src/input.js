// ========================================================
// SUPER BADMINTON 2D - INPUT SYSTEM
// Full-Screen Per-Device Controls (Laptop + Mobile Multi-Touch)
// ========================================================

export class InputManager {
  constructor() {
    this.state = {
      left: false,
      right: false,
      jump: false,
      swing: false,
      swingType: 'hit', // 'hit', 'lob', or 'drop'
      jumpPressedThisFrame: false,
      swingPressedThisFrame: false,
      pointerDownThisFrame: false,
      aimX: 940, // Default aim coordinate on opponent court
      aimY: 480,
      aimActive: false,
      isTouchAim: false,
    };

    this.keysDown = new Set();
    this.activeTouches = new Map(); // touchId -> buttonKey
    this.wasSwingActive = false;
    this.wasJumpActive = false;

    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.touchControlsVisible = this.isTouchDevice;

    this.initKeyboard();
    this.initTouchControls();
    this.initPointerAim();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Prevent default page scroll on arrow keys / space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      this.keysDown.add(e.code);
      this.updateState();
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.updateState();
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.updateState();
      this.clearAllTouches();
    });
  }

  updateState() {
    // Laptop Controls:
    // Move: A / D OR Left / Right arrows
    const leftKey = this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft');
    const rightKey = this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight');

    // Jump: W OR Up arrow
    const jumpKey = this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp');

    // Swing / Smash: S OR Down arrow OR Space
    const hitKey = this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown') || this.keysDown.has('Space');

    // Lob: E OR Left/Right Shift OR Slash
    const lobKey = this.keysDown.has('KeyE') || this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight') || this.keysDown.has('Slash');

    // Drop Shot: F OR X
    const dropKey = this.keysDown.has('KeyF') || this.keysDown.has('KeyX');

    // Touch button bindings
    const touchLeft = this.hasTouch('move-left');
    const touchRight = this.hasTouch('move-right');
    const touchJump = this.hasTouch('jump');
    const touchHit = this.hasTouch('hit');
    const touchLob = this.hasTouch('lob');

    const moveLeft = leftKey || touchLeft;
    const moveRight = rightKey || touchRight;
    const jump = jumpKey || touchJump;
    const isSwingActive = hitKey || touchHit || lobKey || touchLob || dropKey;

    if (jump && !this.wasJumpActive) {
      this.state.jumpPressedThisFrame = true;
    }
    this.wasJumpActive = jump;

    if (isSwingActive && !this.wasSwingActive) {
      this.state.swingPressedThisFrame = true;
    }
    this.wasSwingActive = isSwingActive;

    this.state.left = moveLeft;
    this.state.right = moveRight;
    this.state.jump = jump;

    if (dropKey) {
      this.state.swing = true;
      this.state.swingType = 'drop';
    } else if (lobKey || touchLob) {
      this.state.swing = true;
      this.state.swingType = 'lob';
    } else if (hitKey || touchHit) {
      this.state.swing = true;
      this.state.swingType = 'hit';
    } else {
      this.state.swing = false;
    }
  }

  // Mobile / Tablet Multi-Touch (Left-thumb move, Right-thumb actions)
  initTouchControls() {
    const touchLayer = document.getElementById('touch-controls');
    if (!touchLayer) return;

    if (this.touchControlsVisible) {
      touchLayer.classList.remove('hidden');
    }

    const handleTouchStart = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const targetBtn = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.t-btn');
        if (targetBtn && targetBtn.dataset.key) {
          const key = targetBtn.dataset.key;
          this.activeTouches.set(touch.identifier, key);
          targetBtn.classList.add('active');
        }
      }
      this.updateState();
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const prevKey = this.activeTouches.get(touch.identifier);
        const currentTarget = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.t-btn');
        const newKey = currentTarget?.dataset.key || null;

        if (prevKey !== newKey) {
          if (prevKey) {
            const prevBtn = document.querySelector(`.t-btn[data-key="${prevKey}"]`);
            if (prevBtn) prevBtn.classList.remove('active');
          }
          if (newKey) {
            this.activeTouches.set(touch.identifier, newKey);
            currentTarget.classList.add('active');
          } else {
            this.activeTouches.delete(touch.identifier);
          }
        }
      }
      this.updateState();
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const key = this.activeTouches.get(touch.identifier);
        if (key) {
          const btn = document.querySelector(`.t-btn[data-key="${key}"]`);
          if (btn) btn.classList.remove('active');
          this.activeTouches.delete(touch.identifier);
        }
      }
      this.updateState();
    };

    touchLayer.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchLayer.addEventListener('touchmove', handleTouchMove, { passive: false });
    touchLayer.addEventListener('touchend', handleTouchEnd, { passive: false });
    touchLayer.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Desktop mouse fallback
    const buttons = touchLayer.querySelectorAll('.t-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        this.activeTouches.set('mouse', key);
        btn.classList.add('active');
        this.updateState();
      });

      const handleMouseUp = () => {
        if (this.activeTouches.get('mouse') === btn.dataset.key) {
          this.activeTouches.delete('mouse');
          btn.classList.remove('active');
          this.updateState();
        }
      };

      btn.addEventListener('mouseup', handleMouseUp);
      btn.addEventListener('mouseleave', handleMouseUp);
    });
  }

  hasTouch(key) {
    for (const val of this.activeTouches.values()) {
      if (val === key) return true;
    }
    return false;
  }

  clearAllTouches() {
    this.activeTouches.clear();
    document.querySelectorAll('.t-btn').forEach((b) => b.classList.remove('active'));
  }

  toggleTouchControls() {
    this.touchControlsVisible = !this.touchControlsVisible;
    const touchLayer = document.getElementById('touch-controls');
    if (touchLayer) {
      if (this.touchControlsVisible) {
        touchLayer.classList.remove('hidden');
      } else {
        touchLayer.classList.add('hidden');
        this.clearAllTouches();
        this.updateState();
      }
    }
    return this.touchControlsVisible;
  }

  getCanvasCoordinates(clientX, clientY) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const x = Math.max(50, Math.min(1230, (clientX - rect.left) * scaleX));
    const y = Math.max(80, Math.min(620, (clientY - rect.top) * scaleY));
    return { x, y };
  }

  initPointerAim() {
    // 1. Laptop / Desktop: Mouse Aiming
    window.addEventListener('mousemove', (e) => {
      // If user is interacting with HTML overlay screens, don't hijack
      const target = e.target;
      if (target && target.closest('.glass-card, .hud-layer button, .hud-layer input')) {
        return;
      }
      const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
      if (coords) {
        this.state.aimX = Math.round(coords.x);
        this.state.aimY = Math.round(coords.y);
        this.state.aimActive = true;
        this.state.isTouchAim = false;
      }
    });

    window.addEventListener('mousedown', (e) => {
      const target = e.target;
      if (target && target.closest('.glass-card, .hud-layer, .t-btn')) {
        return;
      }
      const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
      if (coords) {
        this.state.aimX = Math.round(coords.x);
        this.state.aimY = Math.round(coords.y);
        this.state.aimActive = true;
        this.state.pointerDownThisFrame = true;
      }
    });

    // 2. Mobile / Tablet: Tap Aiming
    const handleTouchAim = (e) => {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const elem = document.elementFromPoint(touch.clientX, touch.clientY);
        // Ignore if touching on-screen D-pad or action buttons
        if (elem && elem.closest('.t-btn, .glass-card, .hud-layer')) {
          continue;
        }
        const coords = this.getCanvasCoordinates(touch.clientX, touch.clientY);
        if (coords) {
          this.state.aimX = Math.round(coords.x);
          this.state.aimY = Math.round(coords.y);
          this.state.aimActive = true;
          this.state.isTouchAim = true;
          this.state.pointerDownThisFrame = true;
          break;
        }
      }
    };

    window.addEventListener('touchstart', handleTouchAim, { passive: true });
    window.addEventListener('touchmove', handleTouchAim, { passive: true });
  }

  clearFrameFlags() {
    this.state.jumpPressedThisFrame = false;
    this.state.swingPressedThisFrame = false;
    this.state.pointerDownThisFrame = false;
  }

  clearFrameTriggers() {
    this.clearFrameFlags();
  }
}

export const input = new InputManager();
