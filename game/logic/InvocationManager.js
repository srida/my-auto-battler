import { Unit } from './Unit.js';

/**
 * Validates and executes summons for all 5 types.
 *
 * hand: Card[] (mutable — cards are spliced out on summon)
 * board: Board
 */

export function canSummon(card, pos, board, hand, graveyard = []) {
  if (!board.isInBounds(pos)) return fail('Position hors limites');
  if (!board.isPlayerCell(pos)) return fail('Placement uniquement sur le côté joueur (rangées 0–3)');
  // La transformation place la carte sur la case de la cible (déjà occupée)
  if (card.summon_type !== 'transformation' && board.isOccupied(pos)) return fail('Case occupée');

  switch (card.summon_type) {
    case 'normal':
      return ok();

    case 'sacrifice': {
      const needed = card.cost?.sacrifice ?? 0;
      if (needed === 0) return ok();
      const total = board.getLivingUnitsOnSide('player').length + graveyard.length;
      if (total < needed) return fail(`Requiert ${needed} unité(s) sur le terrain ou au cimetière`);
      return ok();
    }

    case 'fusion': {
      const materials = card.cost?.materials ?? [];
      if (materials.length === 0) return ok();
      const playerUnits = board.getUnitsOnSide('player');
      for (const matId of materials) {
        const onBoard = playerUnits.find(u => u.card_id === matId && u.isAlive());
        const inGrave = graveyard.find(u => u.card_id === matId);
        if (!onBoard && !inGrave)
          return fail(`Matériau manquant sur le terrain ou au cimetière : ${matId}`);
      }
      return ok();
    }

    case 'rituel': {
      const materials = card.cost?.materials ?? [];
      const sacrifice = card.cost?.sacrifice ?? 0;
      const playerUnits = board.getUnitsOnSide('player');
      for (const matId of materials) {
        const onBoard = playerUnits.find(u => u.card_id === matId && u.isAlive());
        const inGrave = graveyard.find(u => u.card_id === matId);
        if (!onBoard && !inGrave)
          return fail(`Matériau rituel manquant sur le terrain ou au cimetière : ${matId}`);
      }
      if (sacrifice > 0) {
        const total = board.getLivingUnitsOnSide('player').length + graveyard.length;
        if (total < sacrifice) return fail(`Requiert ${sacrifice} tribut(s) sur le terrain ou au cimetière`);
      }
      return ok();
    }

    case 'transformation': {
      const targetId = card.cost?.materials?.[0];
      if (!targetId) return fail('Pas de cible de transformation définie');
      const onBoard = board.getUnitsOnSide('player').find(u => u.card_id === targetId && u.isAlive());
      const inGrave = graveyard.find(u => u.card_id === targetId);
      if (!onBoard && !inGrave) return fail(`Requiert ${targetId} sur le terrain ou au cimetière`);
      return ok();
    }

    default:
      return fail(`Type d'invocation inconnu : ${card.summon_type}`);
  }
}

/**
 * Execute the summon. Assumes canSummon() returned ok.
 * @param {Object} card  - card data object
 * @param {{col,row}} pos - target cell on player board
 * @param {Board} board
 * @param {Card[]} hand  - mutable hand array
 * @param {Card[][]} sacrificeTargets - for sacrifice/rituel: which board units to remove
 *        (if null, removes the first N living player units)
 * @returns {Unit}
 */
export function summon(card, pos, board, hand, sacrificeTargets = null) {
  const unit = new Unit(card, 'player');

  switch (card.summon_type) {
    case 'normal':
      _removeFromHand(hand, card.id);
      break;

    case 'sacrifice': {
      _removeFromHand(hand, card.id);
      const needed = card.cost?.sacrifice ?? 0;
      const toRemove = sacrificeTargets
        ? sacrificeTargets.slice(0, needed)
        : board.getLivingUnitsOnSide('player').slice(0, needed);
      for (const u of toRemove) board.removeUnit(u);
      break;
    }

    case 'fusion': {
      _removeFromHand(hand, card.id);
      if (sacrificeTargets && sacrificeTargets.length > 0) {
        for (const u of sacrificeTargets) board.removeUnit(u);
      } else {
        // AI fallback: auto-select matching units
        const fusionUnits = board.getUnitsOnSide('player');
        for (const matId of (card.cost?.materials ?? [])) {
          const mat = fusionUnits.find(u => u.card_id === matId && u.isAlive());
          if (mat) board.removeUnit(mat);
        }
      }
      break;
    }

    case 'rituel': {
      _removeFromHand(hand, card.id);
      if (sacrificeTargets && sacrificeTargets.length > 0) {
        for (const u of sacrificeTargets) board.removeUnit(u);
      } else {
        // AI fallback: auto-select matching units + tributes
        const rituelUnits = board.getUnitsOnSide('player');
        for (const matId of (card.cost?.materials ?? [])) {
          const mat = rituelUnits.find(u => u.card_id === matId && u.isAlive());
          if (mat) board.removeUnit(mat);
        }
        const sacrifice = card.cost?.sacrifice ?? 0;
        const toRemove = board.getLivingUnitsOnSide('player').slice(0, sacrifice);
        for (const u of toRemove) board.removeUnit(u);
      }
      break;
    }

    case 'transformation': {
      _removeFromHand(hand, card.id);
      const targetId = card.cost?.materials?.[0];
      const targetUnit = board.getUnitsOnSide('player').find(u => u.card_id === targetId && u.isAlive());
      if (targetUnit) {
        // Place transformation at the same position as the replaced unit
        pos = { ...targetUnit.position };
        board.removeUnit(targetUnit);
      }
      break;
    }
  }

  board.placeUnit(unit, pos);
  return unit;
}

function _removeFromHand(hand, cardId) {
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx !== -1) hand.splice(idx, 1);
}

function ok()         { return { ok: true,  reason: '' }; }
function fail(reason) { return { ok: false, reason }; }
