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

// Update only the variable parts (HP/power bars) without touching the <img>
export function updateUnitEl(el, unit) {
  el.classList.toggle('neutralized', unit.is_neutralized);

  const hpPct = Math.round((unit.current_hp / unit.max_hp) * 100);
  const hpColor = hpPct > 60 ? 'var(--green)' : hpPct > 25 ? '#f59e0b' : 'var(--red)';

  const hpFill = el.querySelector('.unit-hp-fill');
  if (hpFill) {
    hpFill.style.width = hpPct + '%';
    hpFill.style.background = hpColor;
  }

  if (unit.power_id) {
    const pwrPct = Math.min(100, Math.round((unit.power_gauge / unit.power_speed) * 100));
    const pwrFill = el.querySelector('.unit-pwr-fill');
    if (pwrFill) pwrFill.style.width = pwrPct + '%';
  }
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
