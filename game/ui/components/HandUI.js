import * as Tooltip from './Tooltip.js';

export class HandUI {
  constructor(container, { onSelect, powerDb = null, archetypeDb = null, cardDb = null, isPlayable = null } = {}) {
    this._container = container;
    this._onSelect = onSelect;
    this._powerDb = powerDb;
    this._archetypeDb = archetypeDb;
    this._cardDb = cardDb;
    this._isPlayable = isPlayable;
    this._hand = [];
    this._selectedIdx = null;
  }

  setHand(cards) {
    this._hand = cards;
    this._selectedIdx = null;
    this._render();
  }

  getSelected() {
    return this._selectedIdx !== null ? this._hand[this._selectedIdx] : null;
  }

  // Remove the currently selected card from hand (after placement)
  removeSelected() {
    if (this._selectedIdx === null) return;
    this._hand.splice(this._selectedIdx, 1);
    this._selectedIdx = null;
    this._render();
    this._onSelect?.(null);
  }

  deselect() {
    this._selectedIdx = null;
    this._updateSelection();
    this._onSelect?.(null);
  }

  _updateSelection() {
    this._container.querySelectorAll('.hand-card').forEach((el, i) => {
      el.classList.toggle('selected', i === this._selectedIdx);
      if (this._isPlayable) el.classList.toggle('dim', !this._isPlayable(this._hand[i]));
    });
  }

  _render() {
    this._container.innerHTML = '';
    if (this._hand.length === 0) {
      this._container.innerHTML = '<p class="hand-empty">Main vide</p>';
      return;
    }

    this._hand.forEach((card, idx) => {
      const el = document.createElement('button');
      const playable = this._isPlayable ? this._isPlayable(card) : true;
      el.className = 'hand-card'
        + (this._selectedIdx === idx ? ' selected' : '')
        + (!playable ? ' dim' : '');

      const costHint = _costHint(card);
      el.innerHTML = `
        <img src="/illustrations/${card.id}" alt="${esc(card.name)}" loading="lazy">
        <span class="hand-card-name">${esc(card.name)}</span>
        <span class="badge badge-tier${card.tier} hand-card-tier">T${card.tier}</span>
        ${costHint ? `<span class="hand-card-cost">${costHint}</span>` : ''}
      `;

      let longPressTimer;
      el.addEventListener('pointerdown', e => {
        e.stopPropagation();
        Tooltip.hide();
        const rect = el.getBoundingClientRect();
        longPressTimer = setTimeout(() => {
          Tooltip.showAtRect(Tooltip.cardHtml(card, this._powerDb, this._archetypeDb, this._cardDb), rect);
        }, 500);
        if (this._selectedIdx === idx) {
          this._selectedIdx = null;
          this._onSelect?.(null);
        } else {
          this._selectedIdx = idx;
          this._onSelect?.(card);
        }
        // Update classes only — do NOT call _render() which would detach el
        // and prevent pointerup from clearing longPressTimer on the right element
        this._updateSelection();
      });
      el.addEventListener('pointerup',     () => clearTimeout(longPressTimer));
      el.addEventListener('pointercancel', () => clearTimeout(longPressTimer));

      this._container.appendChild(el);
    });
  }
}

function _costHint(card) {
  if (card.summon_type === 'sacrifice') {
    const n = card.cost?.sacrifice ?? 0;
    return n > 0 ? `×${n}💀` : null;
  }
  if (card.summon_type === 'fusion') return '⚗';
  if (card.summon_type === 'rituel') return '🔮';
  if (card.summon_type === 'transformation') return '🔄';
  return null;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
