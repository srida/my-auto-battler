import { Unit } from './Unit.js';

const HAND_SIZE = 5;

/**
 * EnemyAI
 * Draws cards from the enemy deck each round and places them on rows 4–7.
 */
export class EnemyAI {
  /**
   * @param {Object} deck  - { "1": [cardId, ...], ..., "5": [...] }
   * @param {CardDatabase} cardDb - must already be initialised
   */
  constructor(deck, cardDb) {
    this._deck = deck;
    this._cardDb = cardDb;
    this._hand = [];
  }

  /**
   * Draw HAND_SIZE cards from the deck for the given round's eligible tiers.
   * Stores them internally; call placeFromHand() to place them on the board.
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
   * Place normal/sacrifice cards from the hand onto free enemy cells.
   * Unplaceable cards (fusion, ritual, transformation) remain in hand.
   * @param {Board} board
   * @param {number} maxUnits - max units allowed on enemy side
   * @returns {Unit[]} placed units
   */
  placeFromHand(board, maxUnits = 5) {
    const placed = [];
    const remaining = [];
    const cells = this._freeEnemyCells(board);
    let cellIdx = 0;

    for (const card of this._hand) {
      const onBoard = board.getLivingUnitsOnSide('enemy').length + placed.length;
      if (onBoard >= maxUnits || cellIdx >= cells.length) {
        remaining.push(card);
        continue;
      }
      if (['normal', 'sacrifice'].includes(card.summon_type)) {
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, cells[cellIdx++]);
        placed.push(unit);
      } else {
        remaining.push(card);
      }
    }
    this._hand = remaining;
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

  _freeEnemyCells(board) {
    const cells = [];
    for (let row = 4; row <= 7; row++)
      for (let col = 0; col < 5; col++) {
        if (!board.isOccupied({ col, row })) cells.push({ col, row });
      }
    return cells;
  }
}

function _tiersForRound(round) {
  if (round <= 1) return [1];
  if (round === 2) return [1, 2];
  if (round === 3) return [1, 2, 3];
  if (round === 4) return [2, 3, 4];
  return [3, 4, 5];
}
