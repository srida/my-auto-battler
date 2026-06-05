export function createUnitEl(unit, { selected = false, materialSelected = false } = {}) {
  const el = document.createElement('div');
  el.className = 'unit-card'
    + ` unit-${unit.side}`
    + (selected ? ' selected' : '')
    + (materialSelected ? ' material-selected' : '')
    + (unit.is_neutralized ? ' neutralized' : '');
  el.dataset.uid = unit.uid;
  el.innerHTML = _inner(unit);
  return el;
}

export function updateUnitEl(el, unit) {
  el.innerHTML = _inner(unit);
  el.classList.toggle('neutralized', unit.is_neutralized);
}

function _inner(unit) {
  const hpPct = Math.round((unit.current_hp / unit.max_hp) * 100);
  const hpColor = hpPct > 60 ? 'var(--green)' : hpPct > 25 ? '#f59e0b' : 'var(--red)';
  const pwrPct = unit.power_id
    ? Math.min(100, Math.round((unit.power_gauge / unit.power_speed) * 100))
    : 0;
  return `
    <img src="/illustrations/${unit.card_id}" alt="${esc(unit.name)}" loading="lazy">
    <span class="unit-team-diamond">◆</span>
    <div class="unit-tier-badge badge-tier${unit.tier}">${unit.tier}</div>
    <div class="unit-hp-bar"><div class="unit-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
    ${unit.power_id ? `<div class="unit-pwr-bar"><div class="unit-pwr-fill" style="width:${pwrPct}%"></div></div>` : ''}
  `;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
