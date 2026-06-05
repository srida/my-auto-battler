import { Unit } from './Unit.js';

/**
 * Validates and executes summons for all 5 types.
 *
 * hand: Card[] (mutable — cards are spliced out on summon)
 * board: Board
 */

export function canSummon(card, pos, board, hand) {
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
      const allies = board.getLivingUnitsOnSide('player');
      if (allies.length < needed) return fail(`Requiert ${needed} unité(s) alliée(s) sur le terrain`);
      return ok();
    }

    case 'fusion': {
      const materials = card.cost?.materials ?? [];
      if (materials.length === 0) return ok();
      for (const matId of materials) {
        if (!hand.find(c => c.id === matId))
          return fail(`Matériau manquant en main : ${matId}`);
      }
      return ok();
    }

    case 'rituel': {
      const materials = card.cost?.materials ?? [];
      const sacrifice = card.cost?.sacrifice ?? 0;
      for (const matId of materials) {
        if (!hand.find(c => c.id === matId))
          return fail(`Matériau rituel manquant en main : ${matId}`);
      }
      if (sacrifice > 0) {
        const allies = board.getLivingUnitsOnSide('player');
        if (allies.length < sacrifice) return fail(`Requiert ${sacrifice} tribut(s) sur le terrain`);
      }
      return ok();
    }

    case 'transformation': {
      const targetId = card.cost?.materials?.[0];
      if (!targetId) return fail('Pas de cible de transformation définie');
      const targetUnit = board.getUnitsOnSide('player').find(u => u.card_id === targetId && u.isAlive());
      if (!targetUnit) return fail(`Requiert ${targetId} vivant sur le terrain`);
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
      for (const matId of (card.cost?.materials ?? [])) _removeFromHand(hand, matId);
      break;
    }

    case 'rituel': {
      _removeFromHand(hand, card.id);
      for (const matId of (card.cost?.materials ?? [])) _removeFromHand(hand, matId);
      const sacrifice = card.cost?.sacrifice ?? 0;
      const toRemove = sacrificeTargets
        ? sacrificeTargets.slice(0, sacrifice)
        : board.getLivingUnitsOnSide('player').slice(0, sacrifice);
      for (const u of toRemove) board.removeUnit(u);
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
