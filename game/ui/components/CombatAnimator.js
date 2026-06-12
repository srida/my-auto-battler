import { updateUnitEl } from './UnitCard.js';

const BASE_TICK_MS = 180;

const POWER_NAMES = {
  POWER_HEAL:         'Soin',
  POWER_SHIELD:       'Bouclier',
  POWER_SUPER_ATTACK: 'Super Attaque',
  POWER_AOE_ATTACK:   'Attaque Zone',
  POWER_POISON:       'Poison',
  POWER_PARALYSIS:    'Paralysie',
  POWER_PUSH:         'Poussée',
  POWER_DEBUFF:       'Débuff',
  POWER_BLOCK:        'Blocage',
};

export class CombatAnimator {
  constructor(combatManager, gridEl, { onFinished, onStep } = {}) {
    this._cm = combatManager;
    this._el = gridEl;
    this._onFinished = onFinished;
    this._onStep = onStep;
    this._speed = 1;
    this._rafId = null;
    this._running = false;
    this._paused = false;
  }

  setSpeed(s) { this._speed = s; }

  pause() {
    this._paused = true;
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._running) this._schedule();
  }

  start() {
    this._running = true;
    this._paused = false;
    this._schedule();
  }

  stop() {
    this._running = false;
    this._paused = false;
    if (this._rafId) clearTimeout(this._rafId);
    this._rafId = null;
  }

  _schedule() {
    const interval = BASE_TICK_MS / this._speed;
    this._rafId = setTimeout(() => {
      if (!this._running || this._paused) return;
      const events = this._cm.step();
      this._onStep?.(events);
      for (const evt of events) this._apply(evt);
      this._refreshPowerGauges();
      if (this._cm.isOver) {
        this._running = false;
        setTimeout(() => this._onFinished?.(), 500);
        return;
      }
      this._schedule();
    }, interval);
  }

  // Power gauges fill up every tick for all living units, even those that
  // don't move/attack/take damage — refresh their bars so the UI stays in sync.
  _refreshPowerGauges() {
    for (const unit of [...this._cm.playerUnits, ...this._cm.enemyUnits]) {
      if (!unit.isAlive()) continue;
      const el = this._unitEl(unit.uid);
      if (el) updateUnitEl(el, unit);
    }
  }

  _cellEl(pos) {
    return this._el.querySelector(`.board-cell[data-col="${pos.col}"][data-row="${pos.row}"]`);
  }

  _unitEl(uid) {
    return this._el.querySelector(`.unit-card[data-uid="${uid}"]`);
  }

  _apply(evt) {
    switch (evt.type) {
      case 'move':   this._applyMove(evt);   break;
      case 'attack': this._applyAttack(evt); break;
      case 'dot':    this._applyDot(evt);    break;
      case 'power':  this._applyPower(evt);  break;
      case 'death':  this._applyDeath(evt);  break;
    }
  }

  _applyMove({ unit, from, to }) {
    const fromCell = this._cellEl(from);
    const toCell   = this._cellEl(to);
    if (!fromCell || !toCell) return;
    const unitEl = fromCell.querySelector(`.unit-card[data-uid="${unit.uid}"]`);
    if (!unitEl) return;
    this._slideUnitEl(unitEl, fromCell, toCell);
  }

  // Animate a unit DOM element sliding from one cell to another.
  // Used by both normal movement and push powers.
  _slideUnitEl(unitEl, fromCell, toCell) {
    if (fromCell === toCell) return;

    const fr  = fromCell.getBoundingClientRect();
    const tr  = toCell.getBoundingClientRect();
    const dur = Math.max(60, Math.round((BASE_TICK_MS * 0.75) / this._speed));

    const clone = unitEl.cloneNode(true);
    Object.assign(clone.style, {
      position:     'fixed',
      pointerEvents:'none',
      zIndex:       '50',
      width:        fr.width  + 'px',
      height:       fr.height + 'px',
      left:         fr.left   + 'px',
      top:          fr.top    + 'px',
      margin:       '0',
      borderRadius: 'var(--radius-sm)',
      transition:   `left ${dur}ms ease, top ${dur}ms ease`,
    });
    document.body.appendChild(clone);

    unitEl.style.opacity = '0';
    toCell.appendChild(unitEl);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.left = tr.left + 'px';
      clone.style.top  = tr.top  + 'px';
    }));

    clone.addEventListener('transitionend', () => {
      clone.remove();
      // Don't restore opacity if death animation has already started
      if (!unitEl.classList.contains('anim-death')) {
        unitEl.style.opacity = '';
      }
    }, { once: true });
  }

  _applyAttack({ attacker, target }) {
    const atkEl = this._unitEl(attacker.uid);
    if (atkEl) this._flashClass(atkEl, 'anim-shake');

    if (attacker.range > 1) {
      // Ranged: projectile flies to target, then applies hit
      this._launchProjectile(attacker.uid, target);
    } else {
      // Melee: instant hit
      const tgtEl = this._unitEl(target.uid);
      if (tgtEl) {
        this._flashClass(tgtEl, 'anim-hit');
        updateUnitEl(tgtEl, target);
      }
      if (target.position) this._flashTargetCell(target.position);
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
      this._showPowerToast(casterEl, power_id);
    }
    const cls = _powerTargetClass(power_id);
    for (const t of targets) {
      const el = this._unitEl(t.uid);
      if (el) {
        this._flashClass(el, cls);
        updateUnitEl(el, t);
      }
      if (t.position) this._flashTargetCell(t.position);

      // POWER_PUSH: the logic layer already moved the unit via board.moveUnit,
      // but no 'move' event was emitted — relocate the DOM element to match.
      if (power_id === 'POWER_PUSH' && el && t.position) {
        const fromCell = el.closest('.board-cell');
        const toCell   = this._cellEl(t.position);
        if (fromCell && toCell) this._slideUnitEl(el, fromCell, toCell);
      }
    }
  }

  _applyDeath({ unit }) {
    const el = this._unitEl(unit.uid);
    if (!el) return;
    // Clear any inline opacity left by a move animation
    el.style.opacity = '';
    el.classList.add('anim-death');
    const cleanup = () => { if (el.parentNode) el.remove(); };
    el.addEventListener('animationend', cleanup, { once: true });
    // Fallback in case animationend doesn't fire (detached element, throttled tab)
    setTimeout(cleanup, 600);
  }

  _flashTargetCell(pos) {
    const cell = this._cellEl(pos);
    if (cell) this._flashClass(cell, 'attack-target-cell');
  }

  _launchProjectile(attackerUid, target) {
    const atkEl = this._unitEl(attackerUid);
    const tgtEl = this._unitEl(target.uid);
    if (!atkEl || !tgtEl) {
      // Fallback: apply damage immediately
      if (tgtEl) { updateUnitEl(tgtEl, target); this._flashClass(tgtEl, 'anim-hit'); }
      return;
    }

    const ar  = atkEl.getBoundingClientRect();
    const tr  = tgtEl.getBoundingClientRect();
    const dur = Math.max(40, Math.round((BASE_TICK_MS * 0.5) / this._speed));

    const sx = ar.left + ar.width  / 2;
    const sy = ar.top  + ar.height / 2;
    const tx = tr.left + tr.width  / 2;
    const ty = tr.top  + tr.height / 2;

    const proj = document.createElement('div');
    proj.className = 'combat-projectile';
    Object.assign(proj.style, {
      left:       sx + 'px',
      top:        sy + 'px',
      transition: `left ${dur}ms linear, top ${dur}ms linear`,
    });
    document.body.appendChild(proj);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      proj.style.left = tx + 'px';
      proj.style.top  = ty + 'px';
    }));

    setTimeout(() => {
      proj.remove();
      const el = this._unitEl(target.uid);
      if (el) {
        updateUnitEl(el, target);
        if (!el.classList.contains('anim-death')) {
          this._flashClass(el, 'anim-hit');
          if (target.position) this._flashTargetCell(target.position);
        }
      }
    }, dur);
  }

  _showPowerToast(casterEl, power_id) {
    const label = POWER_NAMES[power_id] ?? power_id.replace('POWER_', '').replace(/_/g, ' ');
    const rect = casterEl.getBoundingClientRect();
    const toast = document.createElement('div');
    toast.className = 'power-cast-label';
    toast.textContent = label;
    toast.style.left = (rect.left + rect.width / 2) + 'px';
    toast.style.top  = (rect.top - 4) + 'px';
    document.body.appendChild(toast);
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
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
