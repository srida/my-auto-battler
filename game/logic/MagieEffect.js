const STAT_NAMES = {
  atk: 'ATK', hp: 'HP', attack_speed: 'Vit. attaque',
  movement_speed: 'Vit. déplacement', range: 'Portée', initiative: 'Initiative',
};

export function needsUnitTarget(magie) {
  return ['stat_bonus', 'stat_modifier', 'shield', 'heal'].includes(magie?.effect?.type);
}

export function needsGraveyardTarget(magie) {
  return magie?.effect?.type === 'revive';
}

export function effectLabel(magie) {
  const e = magie?.effect;
  if (!e) return 'Aucun effet';
  switch (e.type) {
    case 'stat_bonus':       return `+${e.value} ${STAT_NAMES[e.stat] || e.stat} sur une unité (permanent)`;
    case 'stat_modifier':    return `×${e.value} ${STAT_NAMES[e.stat] || e.stat} sur une unité (permanent)`;
    case 'draw_bonus':       return `+${e.value} carte${e.value > 1 ? 's' : ''} piochée${e.value > 1 ? 's' : ''} au prochain tour`;
    case 'guaranteed_draw':  return `Pioche garantie Tier ${e.tier} au prochain tour`;
    case 'heal':             return `Soigne une unité de ${e.value} PV`;
    case 'revive':           return `Réanime une unité du cimetière à ${e.value}% de ses PV`;
    case 'shield':           return `+${e.value} bouclier sur une unité`;
    case 'player_hp_bonus':  return `+${e.value} PV joueur`;
    case 'board_slot_bonus': return `+${e.value} slot${e.value > 1 ? 's' : ''} de board permanent${e.value > 1 ? 's' : ''}`;
    default: return e.type;
  }
}

export function applyEffect(magie, { gameState = null, targetUnit = null } = {}) {
  const e = magie?.effect;
  if (!e) return;
  switch (e.type) {
    case 'stat_bonus':
      if (targetUnit) {
        // Modify _base for permanence (survives resetCombatStats between rounds)
        targetUnit._base[e.stat] = Math.max(1, (targetUnit._base[e.stat] ?? 0) + e.value);
        targetUnit._recomputeStats();
        if (e.stat === 'hp') targetUnit.current_hp = Math.min(targetUnit.max_hp, targetUnit.current_hp + e.value);
      }
      break;
    case 'stat_modifier':
      if (targetUnit) {
        const base = targetUnit._base[e.stat] ?? 0;
        targetUnit._base[e.stat] = Math.max(1, base + Math.round(base * (e.value - 1)));
        targetUnit._recomputeStats();
      }
      break;
    case 'heal':
      if (targetUnit) targetUnit.heal(e.value);
      break;
    case 'shield':
      if (targetUnit) targetUnit.applyShield(e.value);
      break;
    case 'revive':
      if (targetUnit) {
        targetUnit.is_neutralized = false;
        targetUnit.current_hp = Math.max(1, Math.round(targetUnit.max_hp * (e.value / 100)));
      }
      break;
    case 'player_hp_bonus':
      if (gameState) gameState.player_hp = Math.min(gameState.player_hp + e.value, 1000);
      break;
    case 'board_slot_bonus':
      if (gameState) gameState.player_board_slots += (e.value || 1);
      break;
    case 'draw_bonus':
      if (gameState) gameState.player_extra_draws += (e.value || 1);
      break;
    case 'guaranteed_draw':
      if (gameState) gameState.player_guaranteed_draws.push({ tier: e.tier });
      break;
  }
}
