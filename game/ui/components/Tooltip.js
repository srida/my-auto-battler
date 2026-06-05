let _el = null;

function _ensure() {
  if (_el) return;
  _el = document.createElement('div');
  _el.className = 'tooltip-popup';
  _el.hidden = true;
  document.body.appendChild(_el);
  document.addEventListener('pointerdown', e => {
    if (_el && !_el.hidden && !_el.contains(e.target)) _el.hidden = true;
  }, { capture: true });
}

export function show(html, anchorEl) {
  _ensure();
  _el.innerHTML = html;
  _el.hidden = false;
  _reposition(anchorEl);
}

export function showAtRect(html, rect) {
  _ensure();
  _el.innerHTML = html;
  _el.hidden = false;
  _repositionFromRect(rect);
}

export function hide() {
  if (_el) _el.hidden = true;
}

export function toggle(html, anchorEl) {
  _ensure();
  if (!_el.hidden) { hide(); return; }
  show(html, anchorEl);
}

function _reposition(anchor) {
  if (!anchor) return;
  _repositionFromRect(anchor.getBoundingClientRect());
}

function _repositionFromRect(r) {
  const vw = window.innerWidth;
  const W = 220;
  let left = r.left + r.width / 2 - W / 2;
  left = Math.max(8, Math.min(left, vw - W - 8));
  _el.style.left = left + 'px';
  _el.style.width = W + 'px';
  // offsetHeight triggers a synchronous reflow, giving the real height without needing rAF
  const h = _el.offsetHeight || 160;
  const top = r.top - h - 8 > 0 ? r.top - h - 8 : r.bottom + 8;
  _el.style.top = top + 'px';
}

// Builds tooltip HTML from a card data object
export function cardHtml(card, powerDb = null, archetypeDb = null) {
  const summonLabels = { normal: 'Normal', sacrifice: 'Sacrifice', fusion: 'Fusion', rituel: 'Rituel', transformation: 'Transformation' };
  const archetypeNames = (card.archetypes || []).map(id => {
    const a = archetypeDb?.getArchetype(id);
    return a ? a.name : id;
  });
  const power = card.power?.id && powerDb ? powerDb.getPower(card.power.id) : null;
  const costLines = [];
  if (card.cost?.sacrifice) costLines.push(`Sacrifice : ${card.cost.sacrifice}`);
  if (card.cost?.materials?.length) costLines.push(`Matériaux : ${card.cost.materials.join(', ')}`);

  return `
    <div class="tip-header">
      <span class="tip-name">${esc(card.name)}</span>
      <span class="badge badge-tier${card.tier}">T${card.tier}</span>
    </div>
    <div class="tip-type">${esc(summonLabels[card.summon_type] || card.summon_type)}</div>
    <div class="tip-stats">
      <span title="ATK">⚔ ${card.stats.atk}</span>
      <span title="HP">♥ ${card.stats.hp}</span>
      <span title="ATK speed">⚡ ${card.stats.attack_speed}</span>
      <span title="Range">↔ ${card.stats.range}</span>
      <span title="SPD">🏃 ${card.stats.movement_speed}</span>
    </div>
    ${archetypeNames.length ? `<div class="tip-archetypes">${archetypeNames.map(n => `<span class="badge">${esc(n)}</span>`).join('')}</div>` : ''}
    ${power ? `<div class="tip-power">✨ ${esc(power.name || card.power.id)}</div>` : ''}
    ${costLines.length ? `<div class="tip-cost">${costLines.map(l => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
  `;
}

// Builds tooltip HTML from a live Unit object
export function unitHtml(unit) {
  return `
    <div class="tip-header">
      <span class="tip-name">${esc(unit.name)}</span>
      <span class="badge badge-tier${unit.tier}">T${unit.tier}</span>
    </div>
    <div class="tip-stats">
      <span>⚔ ${unit.atk}</span>
      <span>♥ ${unit.current_hp}/${unit.max_hp}</span>
      <span>⚡ ${unit.attack_speed}</span>
      <span>↔ ${unit.range}</span>
    </div>
    ${unit.shield > 0 ? `<div class="tip-power">🛡 Shield : ${unit.shield}</div>` : ''}
    ${unit.power_id ? `<div class="tip-power">✨ ${esc(unit.power_id)} ${unit.power_gauge}/${unit.power_speed}</div>` : ''}
  `;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
