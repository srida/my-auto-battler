import { Unit } from './Unit.js';

const DEFAULT_HAND_SIZE = 3;

/**
 * EnemyAI
 * Places enemy units on rows 4–7 and computes the damage multiplier.
 * The AI always uses the same deck across 5 rounds.
 */
export class EnemyAI {
  /**
   * @param {Object} deck  - { "1": [cardId, ...], ..., "5": [...] }
   * @param {CardDatabase} cardDb - must already be initialised
   */
  constructor(deck, cardDb) {
    this._deck = deck;
    this._cardDb = cardDb;
  }

  /**
   * Select the hand the AI "keeps" (for multiplier calculation).
   * The AI keeps a fixed number of normal/sacrifice cards.
   * Returns an array of card objects.
   */
  selectHand() {
    const hand = [];
    for (let tier = 1; tier <= 5 && hand.length < DEFAULT_HAND_SIZE; tier++) {
      const ids = this._deck[String(tier)] ?? [];
      for (const id of ids) {
        if (hand.length >= DEFAULT_HAND_SIZE) break;
        const card = this._cardDb.getCard(id);
        // Prefer to keep cards that don't need board conditions to summon
        if (card && ['normal', 'sacrifice'].includes(card.summon_type)) hand.push(card);
      }
    }
    return hand;
  }

  /**
   * Place units on the enemy side (rows 4–7) of the board.
   * Uses cards from the deck, placing them left-to-right, row 4 first.
   * Normal cards are placed directly; special summon types are ignored for AI.
   * @param {Board} board
   * @param {number} maxUnits - board slot count for the enemy
   * @returns {Unit[]} placed units
   */
  placeUnits(board, maxUnits = 8) {
    const units = [];
    const cells = this._enemyCells();

    for (let tier = 1; tier <= 5; tier++) {
      const ids = this._deck[String(tier)] ?? [];
      for (const id of ids) {
        if (units.length >= maxUnits || units.length >= cells.length) break;
        const card = this._cardDb.getCard(id);
        if (!card) continue;
        // AI places all cards directly (no summon cost validation)
        const pos = cells[units.length];
        const unit = new Unit(card, 'enemy');
        board.placeUnit(unit, pos);
        units.push(unit);
      }
      if (units.length >= maxUnits) break;
    }

    return units;
  }

  /**
   * Damage multiplier formula (symmetric with player).
   * multiplier = 1.0 + hand_size / 10.0
   */
  computeMultiplier(handSize) {
    return 1.0 + handSize / 10.0;
  }

  // Generate enemy cell positions row by row (rows 4–7, left to right)
  _enemyCells() {
    const cells = [];
    for (let row = 4; row <= 7; row++)
      for (let col = 0; col < 5; col++)
        cells.push({ col, row });
    return cells;
  }
}
