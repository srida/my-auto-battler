import { Unit } from './Unit.js';

const HAND_SIZE = 5;

/**
 * EnemyAI
 * Draws from the enemy deck each round and places units on rows 4–7
 * using the same summon rules as the player (normal, sacrifice, fusion,
 * ritual, transformation).
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
   * Uses multi-pass: normal cards are placed first so they are available
   * as materials for fusion / ritual / transformation in later passes.
   * Unplaceable cards remain in the hand (used for multiplier).
   * @param {Board} board
   * @param {number} maxUnits
   * @returns {Unit[]} placed units
   */
  placeFromHand(board, maxUnits = 5) {
    let unplaced = [...this._hand];
    const placed = [];

    for (;;) {
      const before = placed.length;
      const remaining = [];

      // Sort each pass: normal first, then transformation, fusion, ritual, sacrifice.
      // This ensures materials/targets are on board before they are needed.
      const sorted = [...unplaced].sort(
        (a, b) => _summonPriority(a) - _summonPriority(b)
      );

      for (const card of sorted) {
        const unit = _tryPlace(card, board, maxUnits);
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
 * Returns the Unit on success, null if the summon conditions are not met.
 */
function _tryPlace(card, board, maxUnits) {
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
        // No cost — treat as normal
        if (onBoard >= maxUnits) return null;
        const cells = _freeCells(board);
        if (cells.length === 0) return null;
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[0]);
        return unit;
      }
      if (onBoard < needed) return null;
      // Sacrifice the first N living enemy units, then place
      const toSacrifice = board.getLivingUnitsOnSide('enemy').slice(0, needed);
      for (const u of toSacrifice) board.removeUnit(u);
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
      // Find all required material units on the enemy board
      const pool = [...board.getLivingUnitsOnSide('enemy')];
      const matUnits = [];
      for (const matId of materials) {
        const idx = pool.findIndex(u => u.card_id === matId);
        if (idx === -1) return null; // missing material
        matUnits.push(pool[idx]);
        pool.splice(idx, 1); // don't reuse the same unit
      }
      for (const u of matUnits) board.removeUnit(u);
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
      const enemyUnits = board.getLivingUnitsOnSide('enemy');
      if (enemyUnits.length < sacrifice) return null;
      // Satisfy material constraints first, then fill remaining sacrifice slots
      const pool = [...enemyUnits];
      const toConsume = [];
      for (const matId of required) {
        const idx = pool.findIndex(u => _matchesMaterial(u, matId));
        if (idx === -1) return null; // constraint unsatisfiable
        toConsume.push(pool[idx]);
        pool.splice(idx, 1);
      }
      for (const u of pool.slice(0, sacrifice - toConsume.length)) toConsume.push(u);
      for (const u of toConsume) board.removeUnit(u);
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, _freeCells(board)[0]);
      return unit;
    }

    case 'transformation': {
      const targetId = card.cost?.materials?.[0];
      if (!targetId) return null;
      const target = board.getLivingUnitsOnSide('enemy').find(u => u.card_id === targetId);
      if (!target) return null;
      const pos = { ...target.position };
      board.removeUnit(target);
      const unit = new Unit(card, 'enemy');
      board.placeUnit(unit, pos);
      return unit;
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
