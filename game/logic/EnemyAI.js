import { Unit } from './Unit.js';

const HAND_SIZE = 5;

/**
 * EnemyAI
 * Draws from the enemy deck each round and places units on rows 4–7
 * using the same summon rules as the player (normal, sacrifice, fusion,
 * ritual, transformation). Graveyard units (neutralized last combat) are
 * available as materials during the preparation phase.
 */
export class EnemyAI {
  /**
   * @param {Object} deck   - { "1": [cardId, ...], ..., "5": [...] }
   * @param {CardDatabase} cardDb - must already be initialised
   */
  constructor(deck, cardDb) {
    this._deck = deck;
    this._cardDb = cardDb;
    this._hand = [];
  }

  /**
   * Draw HAND_SIZE cards from the deck for the given round's eligible tiers.
   * Stored internally; call placeFromHand() to place them.
   * @param {number} round
   * @returns {Object[]} drawn cards
   */
  drawHand(round) {
    const tiers = _tiersForRound(round);
    const pool = [];
    for (const t of tiers) {
      for (const id of (this._deck[String(t)] ?? [])) {
        const card = this._cardDb.getCard(id);
        if (card) pool.push(card);
      }
    }
    if (pool.length === 0) { this._hand = []; return []; }
    const hand = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      hand.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    this._hand = hand;
    return [...hand];
  }

  /**
   * Place cards from the hand on enemy cells, respecting all summon rules.
   * Uses multi-pass: normal cards first so they are available as materials
   * for fusion / ritual / transformation in later passes.
   * Graveyard units (neutralized last round, already off-board) are consumed
   * in-place when used as material.
   * @param {Board} board
   * @param {number} maxUnits
   * @param {Unit[]} graveyard - mutated: consumed units are spliced out
   * @returns {Unit[]} placed units
   */
  placeFromHand(board, maxUnits = 5, graveyard = []) {
    let unplaced = [...this._hand];
    const placed = [];

    for (;;) {
      const before = placed.length;
      const remaining = [];

      // Sort each pass: normal cards first so they are on board as materials.
      const sorted = [...unplaced].sort(
        (a, b) => _summonPriority(a) - _summonPriority(b)
      );

      for (const card of sorted) {
        const unit = _tryPlace(card, board, maxUnits, graveyard);
        if (unit) placed.push(unit);
        else remaining.push(card);
      }

      unplaced = remaining;
      if (placed.length === before || unplaced.length === 0) break;
    }

    this._hand = unplaced;
    return placed;
  }

  /** Cards not placed — used for damage multiplier calculation. */
  getHand() {
    return this._hand;
  }

  /** Damage multiplier formula (symmetric with player). */
  computeMultiplier(handSize) {
    return 1.0 + handSize / 10.0;
  }
}

// ── Placement helpers ─────────────────────────────────────────────────────────

/**
 * Try to place a single card on the enemy board.
 * graveyard is mutated in-place when units are consumed as materials.
 * Returns the placed Unit on success, null otherwise.
 */
function _tryPlace(card, board, maxUnits, graveyard) {
  const onBoard = board.getLivingUnitsOnSide('enemy').length;

  switch (card.summon_type) {
    case 'normal': {
      if (onBoard >= maxUnits) return null;
      const cells = _freeCells(board);
      if (cells.length === 0) return null;
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, cells[0]);
      return unit;
    }

    case 'sacrifice': {
      const needed = card.cost?.sacrifice ?? 0;
      if (needed === 0) {
        if (onBoard >= maxUnits) return null;
        const cells = _freeCells(board);
        if (cells.length === 0) return null;
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[0]);
        return unit;
      }
      const boardUnits = board.getLivingUnitsOnSide('enemy');
      if (boardUnits.length + graveyard.length < needed) return null;
      // Consume graveyard first (already off-board), then sacrifice live units
      const fromGraveCount = Math.min(needed, graveyard.length);
      const fromBoardCount = needed - fromGraveCount;
      // Net board change: -fromBoardCount + 1
      if (onBoard - fromBoardCount + 1 > maxUnits) return null;
      graveyard.splice(0, fromGraveCount);
      for (const u of boardUnits.slice(0, fromBoardCount)) board.removeUnit(u);
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, _freeCells(board)[0]);
      return unit;
    }

    case 'fusion': {
      const materials = card.cost?.materials ?? [];
      if (materials.length === 0) {
        if (onBoard >= maxUnits) return null;
        const cells = _freeCells(board);
        if (cells.length === 0) return null;
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[0]);
        return unit;
      }
      // Find each required material on board first, then in graveyard
      const boardPool = [...board.getLivingUnitsOnSide('enemy')];
      const gravePool = [...graveyard];
      const usedBoard = [];
      const usedGrave = [];
      for (const matId of materials) {
        let idx = boardPool.findIndex(u => u.card_id === matId);
        if (idx !== -1) {
          usedBoard.push(boardPool[idx]);
          boardPool.splice(idx, 1);
        } else {
          idx = gravePool.findIndex(u => u.card_id === matId);
          if (idx !== -1) {
            usedGrave.push(gravePool[idx]);
            gravePool.splice(idx, 1);
          } else {
            return null; // missing material
          }
        }
      }
      // Net board change: -usedBoard.length + 1
      if (onBoard - usedBoard.length + 1 > maxUnits) return null;
      for (const u of usedBoard) board.removeUnit(u);
      for (const u of usedGrave) {
        const gi = graveyard.indexOf(u);
        if (gi !== -1) graveyard.splice(gi, 1);
      }
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, _freeCells(board)[0]);
      return unit;
    }

    case 'rituel': {
      const required = card.cost?.materials ?? [];
      const sacrifice = card.cost?.sacrifice ?? 0;
      if (sacrifice === 0 && required.length === 0) {
        if (onBoard >= maxUnits) return null;
        const cells = _freeCells(board);
        if (cells.length === 0) return null;
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[0]);
        return unit;
      }
      const boardPool = [...board.getLivingUnitsOnSide('enemy')];
      const gravePool = [...graveyard];
      if (boardPool.length + gravePool.length < sacrifice) return null;

      const toConsumeBoard = [];
      const toConsumeGrave = [];

      // Satisfy explicit material constraints first (board priority, then graveyard)
      for (const matId of required) {
        let idx = boardPool.findIndex(u => _matchesMaterial(u, matId));
        if (idx !== -1) {
          toConsumeBoard.push(boardPool[idx]);
          boardPool.splice(idx, 1);
        } else {
          idx = gravePool.findIndex(u => _matchesMaterial(u, matId));
          if (idx !== -1) {
            toConsumeGrave.push(gravePool[idx]);
            gravePool.splice(idx, 1);
          } else {
            return null; // constraint unsatisfiable
          }
        }
      }

      // Fill remaining sacrifice slots — prefer graveyard over board
      let stillNeeded = sacrifice - toConsumeBoard.length - toConsumeGrave.length;
      for (const u of gravePool.slice(0, stillNeeded)) {
        toConsumeGrave.push(u);
        stillNeeded--;
      }
      for (const u of boardPool.slice(0, stillNeeded)) {
        toConsumeBoard.push(u);
      }

      // Net board change: -toConsumeBoard.length + 1
      if (onBoard - toConsumeBoard.length + 1 > maxUnits) return null;

      for (const u of toConsumeBoard) board.removeUnit(u);
      for (const u of toConsumeGrave) {
        const gi = graveyard.indexOf(u);
        if (gi !== -1) graveyard.splice(gi, 1);
      }
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, _freeCells(board)[0]);
      return unit;
    }

    case 'transformation': {
      const targetId = card.cost?.materials?.[0];
      if (!targetId) return null;

      // Board target: 1-for-1, no slot limit check
      const target = board.getLivingUnitsOnSide('enemy').find(u => u.card_id === targetId);
      if (target) {
        const pos = { ...target.position };
        board.removeUnit(target);
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, pos);
        return unit;
      }

      // Graveyard target: net +1 on board, need a free slot
      const graveIdx = graveyard.findIndex(u => u.card_id === targetId);
      if (graveIdx !== -1) {
        if (onBoard >= maxUnits) return null;
        const cells = _freeCells(board);
        if (cells.length === 0) return null;
        graveyard.splice(graveIdx, 1);
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[0]);
        return unit;
      }

      return null;
    }

    default:
      return null;
  }
}

// Normal cards placed first so they are on board as materials for later passes
function _summonPriority(card) {
  const order = { normal: 0, transformation: 1, fusion: 2, rituel: 3, sacrifice: 4 };
  return order[card.summon_type] ?? 5;
}

function _freeCells(board) {
  const cells = [];
  for (let row = 4; row <= 7; row++)
    for (let col = 0; col < 5; col++)
      if (!board.isOccupied({ col, row })) cells.push({ col, row });
  return cells;
}

// A material ID matches either a specific card or an archetype tag.
function _matchesMaterial(unit, matId) {
  if (matId.startsWith('ARCH_')) return unit.archetypes?.includes(matId) ?? false;
  return unit.card_id === matId;
}

function _tiersForRound(round) {
  if (round <= 1) return [1];
  if (round === 2) return [1, 2];
  if (round === 3) return [1, 2, 3];
  if (round === 4) return [2, 3, 4];
  return [3, 4, 5];
}
