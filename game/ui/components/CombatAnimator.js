import { updateUnitEl } from './UnitCard.js';

const BASE_TICK_MS = 180;

export class CombatAnimator {
  constructor(combatManager, gridEl, { onFinished, onStep } = {}) {
    this._cm = combatManager;
    this._el = gridEl;
    this._onFinished = onFinished;
    this._onStep = onStep;
    this._speed = 1;
    this._rafId = null;
    this._lastTick = 0;
    this._running = false;
  }

  setSpeed(s) { this._speed = s; }

  start() {
    this._running = true;
    this._lastTick = performance.now();
    this._schedule();
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _schedule() {
    this._rafId = requestAnimationFrame(ts => {
      if (!this._running) return;
      const interval = BASE_TICK_MS / this._speed;
      if (ts - this._lastTick >= interval) {
        this._lastTick = ts;
        const events = this._cm.step();
        this._onStep?.(events);
        for (const evt of events) this._apply(evt);
        if (this._cm.isOver) {
          this._running = false;
          // Delay so death animations finish before showing the overlay
          setTimeout(() => this._onFinished?.(), 500);
          return;
        }
      }
      this._schedule();
    });
  }

  _cellEl(pos) {
    return this._el.querySelector(`.board-cell[data-col="${pos.col}"][data-row="${pos.row}"]`);
  }

  _unitEl(uid) {
    return this._el.querySelector(`.unit-card[data-uid="${uid}"]`);
  }

  _apply(evt) {
    switch (evt.type) {
      case 'move':   this._applyMove(evt); break;
      case 'attack': this._applyAttack(evt); break;
      case 'dot':    this._applyDot(evt); break;
      case 'power':  this._applyPower(evt); break;
      case 'death':  this._applyDeath(evt); break;
      // combat_end handled by _cm.isOver check in _schedule
    }
  }

  _applyMove({ unit, from, to }) {
    const fromCell = this._cellEl(from);
    const toCell   = this._cellEl(to);
    if (!fromCell || !toCell) return;
    const unitEl = fromCell.querySelector(`.unit-card[data-uid="${unit.uid}"]`);
    if (!unitEl) return;

    const fr  = fromCell.getBoundingClientRect();
    const tr  = toCell.getBoundingClientRect();
    const dur = Math.max(60, Math.round((BASE_TICK_MS * 0.75) / this._speed));

    // Clone floats from source to destination (avoids overflow:hidden clipping)
    const clone = unitEl.cloneNode(true);
    Object.assign(clone.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '50',
      width:  fr.width  + 'px',
      height: fr.height + 'px',
      left:   fr.left   + 'px',
      top:    fr.top    + 'px',
      margin: '0',
      borderRadius: 'var(--radius-sm)',
      transition: `left ${dur}ms ease, top ${dur}ms ease`,
    });
    document.body.appendChild(clone);

    // Move actual element immediately (invisible)
    unitEl.style.opacity = '0';
    toCell.appendChild(unitEl);

    // Double rAF so transition fires
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.left = tr.left + 'px';
      clone.style.top  = tr.top  + 'px';
    }));

    clone.addEventListener('transitionend', () => {
      clone.remove();
      unitEl.style.opacity = '';
    }, { once: true });
  }

  _applyAttack({ attacker, target }) {
    const atkEl = this._unitEl(attacker.uid);
    const tgtEl = this._unitEl(target.uid);
    if (atkEl) this._flashClass(atkEl, 'anim-shake');
    if (tgtEl) {
      this._flashClass(tgtEl, 'anim-hit');
      updateUnitEl(tgtEl, target);
    }
  }

  _applyDot({ unit }) {
    const el = this._unitEl(unit.uid);
    if (el) {
      this._flashClass(el, 'anim-poison');
      updateUnitEl(el, unit);
    }
  }

  _applyPower({ unit, targets, power_id }) {
    const casterEl = this._unitEl(unit.uid);
    if (casterEl) {
      this._flashClass(casterEl, 'anim-power-cast');
      updateUnitEl(casterEl, unit);
    }
    const cls = _powerTargetClass(power_id);
    for (const t of targets) {
      const el = this._unitEl(t.uid);
      if (el) {
        this._flashClass(el, cls);
        updateUnitEl(el, t);
      }
    }
  }

  _applyDeath({ unit }) {
    const el = this._unitEl(unit.uid);
    if (el) {
      el.classList.add('anim-death');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }
  }

  _flashClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
}

function _powerTargetClass(power_id) {
  switch (power_id) {
    case 'POWER_HEAL':      return 'anim-heal';
    case 'POWER_SHIELD':    return 'anim-shield';
    case 'POWER_POISON':    return 'anim-poison';
    case 'POWER_PARALYSIS': return 'anim-paralysis';
    default:                return 'anim-hit';
  }
}
