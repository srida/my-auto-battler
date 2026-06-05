export const Phase = Object.freeze({
  PREPARATION: 'preparation',
  COMBAT:      'combat',
  END_ROUND:   'end_round',
  GAME_OVER:   'game_over',
});

const MAX_ROUNDS = 5;
const STARTING_HP = 30;
const DEFAULT_BOARD_SLOTS = 5;
// Base damage when all enemies are wiped: survivors × 2
const SURVIVOR_DAMAGE_PER_UNIT = 2;

export class GameState {
  constructor() {
    this.round = 1;
    this.phase = Phase.PREPARATION;

    this.player_hp = STARTING_HP;
    this.enemy_hp  = STARTING_HP;

    this.player_multiplier = 1.0;
    this.enemy_multiplier  = 1.0;

    // Expanded by board_slot_bonus archetype effect
    this.player_board_slots = DEFAULT_BOARD_SLOTS;
    this.enemy_board_slots  = DEFAULT_BOARD_SLOTS;

    // Carry-over from previous rounds
    this.player_extra_draws = 0;   // accumulated draw_bonus
    this.player_guaranteed_draws = []; // [{ category, archetype }]
  }

  // ── Phase transitions ──

  startCombat(playerHandSize, enemyHandSize) {
    this.phase = Phase.COMBAT;
    this.player_multiplier = this._multiplier(playerHandSize);
    this.enemy_multiplier  = this._multiplier(enemyHandSize);
  }

  _multiplier(handSize) {
    return 1.0 + handSize / 10.0;
  }

  /**
   * Apply the result of a finished combat round.
   * @param {'player'|'enemy'|'draw'} winner
   * @param {number} playerSurvivors  - living player units count
   * @param {number} enemySurvivors   - living enemy units count
   * @param {Object} archetypeResult  - from ArchetypeManager.applyEndOfCombat()
   */
  applyEndOfCombat(winner, playerSurvivors, enemySurvivors, archetypeResult = {}) {
    this.phase = Phase.END_ROUND;

    if (winner === 'player') {
      // Enemy takes damage: surviving player units × constant, scaled by multiplier
      const rawDmg = Math.max(1, playerSurvivors * SURVIVOR_DAMAGE_PER_UNIT);
      this.enemy_hp -= Math.round(rawDmg * this.player_multiplier);
    } else if (winner === 'enemy') {
      const rawDmg = Math.max(1, enemySurvivors * SURVIVOR_DAMAGE_PER_UNIT);
      this.player_hp -= Math.round(rawDmg * this.enemy_multiplier);
    }
    // draw: no damage

    // Clamp HP
    this.player_hp = Math.max(0, this.player_hp);
    this.enemy_hp  = Math.max(0, this.enemy_hp);

    // Accumulate end-of-combat archetype bonuses
    if (archetypeResult.board_slot_bonus) {
      this.player_board_slots += archetypeResult.board_slot_bonus;
    }
    if (archetypeResult.draw_bonus) {
      this.player_extra_draws += archetypeResult.draw_bonus;
    }
    if (archetypeResult.guaranteed_draws?.length) {
      this.player_guaranteed_draws.push(...archetypeResult.guaranteed_draws);
    }
  }

  /**
   * Advance to the next round or trigger game over.
   * Returns the new phase.
   */
  nextRound() {
    if (this.player_hp <= 0 || this.enemy_hp <= 0 || this.round >= MAX_ROUNDS) {
      this.phase = Phase.GAME_OVER;
    } else {
      this.round++;
      this.phase = Phase.PREPARATION;
      // Reset per-round multipliers
      this.player_multiplier = 1.0;
      this.enemy_multiplier  = 1.0;
    }
    return this.phase;
  }

  isGameOver() {
    return this.phase === Phase.GAME_OVER || this.player_hp <= 0 || this.enemy_hp <= 0 || this.round >= MAX_ROUNDS;
  }

  getWinner() {
    if (this.player_hp > this.enemy_hp) return 'player';
    if (this.enemy_hp > this.player_hp) return 'enemy';
    return 'draw';
  }

  toSnapshot() {
    return {
      round: this.round,
      phase: this.phase,
      player_hp: this.player_hp,
      enemy_hp: this.enemy_hp,
      player_multiplier: this.player_multiplier,
      enemy_multiplier: this.enemy_multiplier,
      player_board_slots: this.player_board_slots,
    };
  }
}
