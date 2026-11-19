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
      swingType: 'hit', // 'hit' or 'lob'
      jumpPressedThisFrame: false,
      swingPressedThisFrame: false,
    };

    this.keysDown = new Set();
    this.activeTouches = new Map(); // touchId -> buttonKey

    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.touchControlsVisible = this.isTouchDevice;

    this.initKeyboard();
    this.initTouchControls();
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

    // Touch button bindings
    const touchLeft = this.hasTouch('move-left');
    const touchRight = this.hasTouch('move-right');
    const touchJump = this.hasTouch('jump');
    const touchHit = this.hasTouch('hit');
    const touchLob = this.hasTouch('lob');

    const moveLeft = leftKey || touchLeft;
    const moveRight = rightKey || touchRight;
    const jump = jumpKey || touchJump;

    if (jump && !this.state.jump) {
      this.state.jumpPressedThisFrame = true;
    }

    if ((hitKey || touchHit || lobKey || touchLob) && !this.state.swing) {
      this.state.swingPressedThisFrame = true;
    }

    this.state.left = moveLeft;
    this.state.right = moveRight;
    this.state.jump = jump;

    if (hitKey || touchHit) {
      this.state.swing = true;
      this.state.swingType = 'hit';
    } else if (lobKey || touchLob) {
      this.state.swing = true;
      this.state.swingType = 'lob';
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

  clearFrameFlags() {
    this.state.jumpPressedThisFrame = false;
    this.state.swingPressedThisFrame = false;
  }
}

export const input = new InputManager();
