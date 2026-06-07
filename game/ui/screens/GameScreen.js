import { navigate } from '../../main.js';
import * as CardDatabase from '../../data/CardDatabase.js';
import * as DeckRepository from '../../data/DeckRepository.js';
import * as PowerDatabase from '../../data/PowerDatabase.js';
import * as ArchetypeDatabase from '../../data/ArchetypeDatabase.js';
import { Board } from '../../logic/Board.js';
import { GameState, Phase } from '../../logic/GameState.js';
import { EnemyAI } from '../../logic/EnemyAI.js';
import { ArchetypeManager } from '../../logic/ArchetypeManager.js';
import { CombatManager } from '../../logic/CombatManager.js';
import * as InvocationManager from '../../logic/InvocationManager.js';
import { BoardGrid } from '../components/BoardGrid.js';
import { HandUI } from '../components/HandUI.js';
import { CombatAnimator } from '../components/CombatAnimator.js';
import { createUnitEl } from '../components/UnitCard.js';
import * as Tooltip from '../components/Tooltip.js';

const HAND_SIZE = 5;

export async function mount(container, params = {}) {
  await Promise.all([CardDatabase.init(), PowerDatabase.init(), ArchetypeDatabase.init()]);

  const deckName = params.deckName || DeckRepository.getActiveDeck();
  if (!deckName) { navigate('deck_selector'); return; }
  const rawDeck = DeckRepository.loadDeck(deckName);
  if (!rawDeck) { navigate('deck_selector'); return; }

  // Precompute per-tier card arrays from the deck
  const cardsByTier = {};
  for (let t = 1; t <= 5; t++) {
    cardsByTier[t] = (rawDeck[String(t)] ?? []).map(id => CardDatabase.getCard(id)).filter(Boolean);
  }

  // Game objects
  const gameState = new GameState();
  const board = new Board();
  const enemyAI = new EnemyAI(rawDeck, CardDatabase);
  let hand = [];
  let graveyard = [];           // Neutralized player units from last combat, usable as material
  let _graveyardElMap = new Map(); // uid → DOM element (smart diff to avoid img rebuilds)
  let selectedCard = null;
  let selectedBoardPos = null;
  let selectedMaterials = [];  // Unit[] — board or graveyard units selected as material/tribute

  // ── Shell ────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="topbar">
      <button class="topbar-back" id="btn-back">←</button>
      <span class="topbar-title" id="phase-label">Préparation</span>
      <div class="game-hud">
        <span class="hud-hp player" id="hud-player">♥ 30</span>
        <span class="hud-round" id="hud-round">1/5</span>
        <span class="hud-hp enemy" id="hud-enemy">♥ 30</span>
      </div>
    </div>
    <div class="game-layout">
      <div class="archetype-panel" id="archetype-panel"></div>
      <div class="board-area" id="board-area"></div>
      <div class="graveyard-area" id="graveyard-area" style="display:none">
        <span class="graveyard-label">Cimetière</span>
        <div class="graveyard-units" id="graveyard-units"></div>
      </div>
      <div class="hand-area" id="hand-area"></div>
      <div class="phase-controls">
        <button class="btn btn-primary btn-full" id="btn-combat">Lancer le combat</button>
        <div class="combat-speed-controls" id="speed-controls" style="display:none">
          <span class="speed-label">Vitesse</span>
          <button class="btn btn-secondary speed-btn active" data-speed="1">×1</button>
          <button class="btn btn-secondary speed-btn" data-speed="2">×2</button>
          <button class="btn btn-secondary speed-btn" data-speed="4">×4</button>
          <div style="flex:1"></div>
          <button class="btn btn-secondary speed-btn" id="btn-pause">⏸</button>
        </div>
      </div>
    </div>
  `;

  const boardArea  = container.querySelector('#board-area');
  const handArea   = container.querySelector('#hand-area');
  const btnCombat  = container.querySelector('#btn-combat');
  const phaseLabel = container.querySelector('#phase-label');

  // ── Components ───────────────────────────────────────────────────────────

  const grid = new BoardGrid(boardArea, {
    rows: 4,
    onCellTap: handleCellTap,
    onUnitTap: handleUnitTap,
    onUnitDrag: handleUnitDrag,
    powerDb: PowerDatabase,
    archetypeDb: ArchetypeDatabase,
  });
  grid.setBoard(board);

  handArea.className = 'hand-ui-wrap';
  const handInner = document.createElement('div');
  handInner.className = 'hand-ui';
  handArea.appendChild(handInner);

  const handUI = new HandUI(handInner, {
    onSelect: handleCardSelect,
    powerDb: PowerDatabase,
    archetypeDb: ArchetypeDatabase,
    cardDb: CardDatabase,
    isPlayable: (card) => _isPlayable(card, board, graveyard, gameState.player_board_slots),
  });

  // ── Interaction ──────────────────────────────────────────────────────────

  function handleCardSelect(card) {
    selectedCard = card;
    selectedMaterials = [];
    selectedBoardPos = null;
    grid.setSelectedPos(null);
    if (card) {
      grid.setHighlight(_validCells(card));
      grid.setMaterialCandidates(_materialCandidateCells(card, [], board));
    } else {
      grid.clearHighlight();
      grid.clearMaterialHighlight();
    }
    _refreshGraveyard();
  }

  function handleCellTap(pos) {
    Tooltip.hide();
    if (selectedCard) {
      if (_needsMaterials(selectedCard, board, graveyard) && !_materialsComplete(selectedCard, selectedMaterials)) {
        _flashError('Sélectionne les matériaux d\'abord');
        return;
      }
      _tryPlace(selectedCard, pos);
    } else if (selectedBoardPos) {
      _tryMove(pos);
    }
  }

  function handleUnitTap(unit, pos) {
    Tooltip.hide();
    if (unit.side !== 'player') return;

    // Material selection mode: a card requiring board materials is selected
    if (selectedCard && _needsMaterials(selectedCard, board, graveyard)) {
      const idx = selectedMaterials.indexOf(unit);
      if (idx !== -1) {
        // Deselect this material
        selectedMaterials.splice(idx, 1);
      } else {
        // Only add if this unit is a valid candidate
        const candidates = _materialCandidateCells(selectedCard, selectedMaterials, board);
        if (candidates.some(p => p.col === pos.col && p.row === pos.row)) {
          selectedMaterials.push(unit);
        }
      }
      _refreshMaterialHighlight();
      return;
    }

    // Transformation: tapping the target unit triggers the summon directly
    if (selectedCard && selectedCard.summon_type === 'transformation') {
      const targetId = selectedCard.cost?.materials?.[0];
      if (unit.card_id === targetId && unit.isAlive()) {
        // Pass the specific unit so InvocationManager uses the right one (fixes same-name ambiguity)
        selectedMaterials = [unit];
        _tryPlace(selectedCard, pos);
      }
      return;
    }

    // Deselect hand card if one is selected (non-material card)
    if (selectedCard) {
      selectedCard = null;
      handUI.deselect();
      grid.clearHighlight();
      grid.clearMaterialHighlight();
      return;
    }

    // Toggle unit repositioning selection
    if (selectedBoardPos?.col === pos.col && selectedBoardPos?.row === pos.row) {
      selectedBoardPos = null;
      grid.setSelectedPos(null);
      grid.clearHighlight();
      return;
    }

    selectedBoardPos = pos;
    grid.setSelectedPos(pos);
    const empty = [];
    for (let r = 0; r <= 3; r++)
      for (let c = 0; c < 5; c++)
        if (!board.isOccupied({ col: c, row: r })) empty.push({ col: c, row: r });
    grid.setHighlight(empty);
  }

  function _tryPlace(card, pos) {
    const result = InvocationManager.canSummon(card, pos, board, hand, graveyard);
    if (!result.ok) { _flashError(result.reason); return; }

    // Board slot limit (transformation is always 1-for-1, skip)
    if (card.summon_type !== 'transformation') {
      const materialsOnBoard = selectedMaterials.filter(u => !graveyard.includes(u)).length;
      const afterPlace = board.getLivingUnitsOnSide('player').length - materialsOnBoard + 1;
      if (afterPlace > gameState.player_board_slots) {
        _flashError(`Maximum ${gameState.player_board_slots} unités sur le terrain`);
        return;
      }
    }
    const selIdx = handUI.getSelectedIdx();
    InvocationManager.summon(card, pos, board, hand, selectedMaterials.length > 0 ? selectedMaterials : null, selIdx);
    // Remove consumed graveyard units
    for (const u of selectedMaterials) {
      const gi = graveyard.indexOf(u);
      if (gi !== -1) graveyard.splice(gi, 1);
    }
    selectedCard = null;
    selectedMaterials = [];
    // Remove just the placed card element — no full hand rebuild (avoids image flicker)
    handUI.removeSelected();
    grid.clearHighlight();
    grid.clearMaterialHighlight();
    grid.refresh();
    _updateHUD();
    _refreshGraveyard();
    _refreshArchetypePanel();
  }

  function handleUnitDrag(unit, fromPos, toPos) {
    if (gameState.phase !== Phase.PREPARATION) return;
    if (unit.side !== 'player') return;
    if (toPos.col === fromPos.col && toPos.row === fromPos.row) return;
    if (!board.isPlayerCell(toPos)) return;

    const targetUnit = board.getUnit(toPos);
    if (targetUnit && targetUnit.side !== 'player') return;

    board.removeUnit(unit);
    if (targetUnit) {
      board.removeUnit(targetUnit);
      board.placeUnit(targetUnit, fromPos);
      targetUnit.initial_position = { ...fromPos };
    }
    board.placeUnit(unit, toPos);
    unit.initial_position = { ...toPos };

    selectedCard = null;
    selectedBoardPos = null;
    selectedMaterials = [];
    handUI.deselect();
    grid.clearHighlight();
    grid.clearMaterialHighlight();
    grid.setSelectedPos(null);
    grid.refresh();
    _refreshArchetypePanel();
  }

  function _tryMove(to) {
    if (!selectedBoardPos) return;
    if (board.isOccupied(to)) { _flashError('Case occupée'); return; }
    if (!board.isPlayerCell(to)) return;
    const unit = board.getUnit(selectedBoardPos);
    if (!unit) { selectedBoardPos = null; grid.clearHighlight(); return; }
    board.moveUnit(unit, to);
    // Update initial_position so unit returns here after combat
    unit.initial_position = { ...to };
    selectedBoardPos = null;
    grid.setSelectedPos(null);
    grid.clearHighlight();
    grid.refresh();
    _refreshArchetypePanel();
  }

  function _validCells(card) {
    // Don't show placement cells until required materials are selected
    if (_needsMaterials(card, board, graveyard) && !_materialsComplete(card, selectedMaterials)) return [];

    // Board slot limit (transformation is always 1-for-1, skip)
    if (card.summon_type !== 'transformation') {
      const materialsOnBoard = selectedMaterials.filter(u => !graveyard.includes(u)).length;
      const afterPlace = board.getLivingUnitsOnSide('player').length - materialsOnBoard + 1;
      if (afterPlace > gameState.player_board_slots) return [];
    }

    // For transformation:
    if (card.summon_type === 'transformation') {
      const targetId = card.cost?.materials?.[0];
      const boardTarget = board.getLivingUnitsOnSide('player').find(u => u.card_id === targetId);
      if (boardTarget) return [{ ...boardTarget.position }];
      // Graveyard target selected → show all empty player cells
      const graveTarget = selectedMaterials.find(u => u.card_id === targetId && graveyard.includes(u));
      if (graveTarget) {
        const cells = [];
        for (let r = 0; r <= 3; r++)
          for (let c = 0; c < 5; c++)
            if (!board.isOccupied({ col: c, row: r })) cells.push({ col: c, row: r });
        return cells;
      }
      return [];
    }

    // Only board materials free cells (graveyard units have no board position)
    const willBeFreed = new Set(
      selectedMaterials
        .filter(u => !graveyard.includes(u))
        .map(u => `${u.position.col},${u.position.row}`)
    );

    const cells = [];
    for (let r = 0; r <= 3; r++)
      for (let c = 0; c < 5; c++) {
        const pos = { col: c, row: r };
        if (willBeFreed.has(`${c},${r}`)) {
          cells.push(pos);  // freed by material consumption
        } else if (InvocationManager.canSummon(card, pos, board, hand, graveyard).ok) {
          cells.push(pos);
        }
      }
    return cells;
  }

  function _refreshMaterialHighlight() {
    grid.setHighlight(_validCells(selectedCard));
    grid.setMaterialCandidates(_materialCandidateCells(selectedCard, selectedMaterials, board));
    // Only board units have grid positions — graveyard units are highlighted in their own panel
    grid.setMaterialSelected(selectedMaterials.filter(u => !graveyard.includes(u)).map(u => ({ ...u.position })));
    _refreshGraveyard();
  }

  // ── Graveyard ─────────────────────────────────────────────────────────────

  // Returns graveyard units that are valid material candidates for the card
  function _materialCandidateGraveyard(card, alreadySelected) {
    if (!graveyard.length) return [];
    const selected = new Set(alreadySelected);
    const avail = graveyard.filter(u => !selected.has(u));

    if (card.summon_type === 'sacrifice') {
      const needed = card.cost?.sacrifice ?? 0;
      if (alreadySelected.length >= needed) return [];
      return avail;
    }

    if (card.summon_type === 'fusion') {
      const required = card.cost?.materials ?? [];
      const coveredIds = alreadySelected.map(u => u.card_id);
      const stillNeeded = required.filter(id => !coveredIds.includes(id));
      if (stillNeeded.length === 0) return [];
      return avail.filter(u => stillNeeded.includes(u.card_id));
    }

    if (card.summon_type === 'rituel') {
      const required = card.cost?.materials ?? [];
      const sacrifice = card.cost?.sacrifice ?? 0;
      if (alreadySelected.length >= sacrifice) return [];
      const uncovered = _getUncoveredRequirements(required, alreadySelected);
      const remainingSlots = sacrifice - alreadySelected.length;
      if (uncovered.length > 0 && uncovered.length === remainingSlots)
        return avail.filter(u => uncovered.some(matId => _matchesMaterial(u, matId)));
      return avail;
    }

    if (card.summon_type === 'transformation') {
      const targetId = card.cost?.materials?.[0];
      if (!targetId) return [];
      // Only when there's no board target does the graveyard one become usable
      if (board.getLivingUnitsOnSide('player').find(u => u.card_id === targetId)) return [];
      return avail.filter(u => u.card_id === targetId);
    }

    return [];
  }

  function _refreshArchetypePanel() {
    const panel = container.querySelector('#archetype-panel');
    if (!panel) return;
    const units = board.getLivingUnitsOnSide('player');
    if (units.length === 0) { panel.innerHTML = ''; return; }
    const archetypeList = ArchetypeDatabase.getAllArchetypes();
    const mgr = new ArchetypeManager(archetypeList, units, []);
    const synergies = mgr.getActiveSynergies(units);
    panel.innerHTML = synergies.map(({ arch, count, activeThreshold, nextThreshold }) => {
      const isActive = !!activeThreshold;
      const label = nextThreshold ? `${count}/${nextThreshold.count}` : `${count}`;
      return `<button class="archetype-chip${isActive ? ' arch-active' : ''}" data-arch-id="${arch.id}" title="${arch.name}">`
        + `<span class="archetype-chip-icon">${arch.icon ?? '?'}</span>`
        + `<span class="archetype-chip-count">${label}</span>`
        + `</button>`;
    }).join('');
    panel.querySelectorAll('.archetype-chip').forEach(chip => {
      chip.addEventListener('pointerdown', e => {
        e.stopPropagation();
        const archId = chip.dataset.archId;
        const s = synergies.find(x => x.arch.id === archId);
        if (!s) return;
        Tooltip.toggle(Tooltip.archetypeHtml(s.arch, s.count, s.activeThreshold, CardDatabase), chip);
      });
    });
  }

  function _refreshGraveyard() {
    const graveyardArea    = container.querySelector('#graveyard-area');
    const graveyardUnitsEl = container.querySelector('#graveyard-units');

    if (graveyard.length === 0) {
      graveyardArea.style.display = 'none';
      _graveyardElMap.clear();
      graveyardUnitsEl.innerHTML = '';
      return;
    }
    graveyardArea.style.display = '';

    const candidates  = new Set(selectedCard ? _materialCandidateGraveyard(selectedCard, selectedMaterials) : []);
    const selectedSet = new Set(selectedMaterials.filter(u => graveyard.includes(u)));
    const graveyardUidSet = new Set(graveyard.map(u => u.uid));

    // Remove elements whose unit is no longer in graveyard
    for (const [uid, el] of _graveyardElMap) {
      if (!graveyardUidSet.has(uid)) {
        el.remove();
        _graveyardElMap.delete(uid);
      }
    }

    // Add / update elements, preserving DOM order
    for (const unit of graveyard) {
      let el = _graveyardElMap.get(unit.uid);
      if (!el) {
        el = createUnitEl(unit, { materialSelected: selectedSet.has(unit) });
        el.classList.toggle('material-candidate', candidates.has(unit));

        let startX, startY, moved = false, longPressTimer;
        el.addEventListener('pointerdown', e => {
          e.stopPropagation();
          startX = e.clientX; startY = e.clientY; moved = false;
          longPressTimer = setTimeout(() => Tooltip.show(Tooltip.unitHtml(unit, PowerDatabase, ArchetypeDatabase), el), 500);
          const onMove = ev => {
            if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 10) moved = true;
          };
          const onUp = () => {
            clearTimeout(longPressTimer);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            if (!moved) handleGraveyardUnitTap(unit);
          };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          document.addEventListener('pointercancel', onUp);
        });
        _graveyardElMap.set(unit.uid, el);
      } else {
        // Smart update: only toggle CSS classes, never rebuild the <img>
        el.classList.toggle('material-selected',  selectedSet.has(unit));
        el.classList.toggle('material-candidate', candidates.has(unit));
        el.classList.toggle('neutralized', unit.is_neutralized);
      }
      // Append to maintain correct order (no-op if already at right position)
      graveyardUnitsEl.appendChild(el);
    }
  }

  function handleGraveyardUnitTap(unit) {
    Tooltip.hide();

    if (selectedCard && _needsMaterials(selectedCard, board, graveyard)) {
      const candidates = _materialCandidateGraveyard(selectedCard, selectedMaterials);
      const idx = selectedMaterials.indexOf(unit);
      if (idx !== -1) {
        selectedMaterials.splice(idx, 1);
      } else if (candidates.includes(unit)) {
        selectedMaterials.push(unit);
      }
      _refreshMaterialHighlight();
      return;
    }
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  function _updateHUD() {
    container.querySelector('#hud-player').textContent = `♥ ${gameState.player_hp}`;
    container.querySelector('#hud-enemy').textContent  = `♥ ${gameState.enemy_hp}`;
    container.querySelector('#hud-round').textContent  = `${gameState.round}/5`;
  }

  function _flashError(msg) {
    const prev = phaseLabel.textContent;
    const prevColor = phaseLabel.style.color;
    phaseLabel.textContent = '⚠ ' + msg;
    phaseLabel.style.color = 'var(--red)';
    setTimeout(() => { phaseLabel.textContent = prev; phaseLabel.style.color = prevColor; }, 2000);
  }

  // ── Preparation ──────────────────────────────────────────────────────────

  function startPreparation() {
    phaseLabel.textContent = `Prépa — Tour ${gameState.round}`;
    phaseLabel.style.color = '';
    btnCombat.textContent = 'Lancer le combat';
    btnCombat.disabled = false;

    // Guaranteed draws occupy slots within the normal hand (not extra cards)
    const guaranteedDraws = gameState.player_guaranteed_draws.splice(0);
    const randomCount = Math.max(0, HAND_SIZE + gameState.player_extra_draws - guaranteedDraws.length);
    hand = _drawHand(cardsByTier, gameState.round, randomCount);

    const pool = _tiersForRound(gameState.round).flatMap(t => cardsByTier[t] ?? []);
    for (const draw of guaranteedDraws) {
      const matches = pool.filter(c =>
        (!draw.archetype || c.archetypes?.includes(draw.archetype)) &&
        (!draw.category  || c.summon_type === draw.category)
      );
      if (matches.length > 0) {
        hand.push(matches[Math.floor(Math.random() * matches.length)]);
      } else {
        // Fallback: any card matching just the archetype, then any random card
        const fallback = pool.filter(c => !draw.archetype || c.archetypes?.includes(draw.archetype));
        if (fallback.length > 0) hand.push(fallback[Math.floor(Math.random() * fallback.length)]);
        else if (pool.length > 0) hand.push(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    handUI.setHand(hand);

    selectedCard = null;
    selectedBoardPos = null;
    selectedMaterials = [];
    grid.clearHighlight();
    grid.clearMaterialHighlight();
    grid.refresh();
    _updateHUD();
    _refreshGraveyard();
    _refreshArchetypePanel();
  }

  // ── Combat ───────────────────────────────────────────────────────────────

  function runCombat() {
    graveyard = [];
    btnCombat.disabled = true;
    phaseLabel.textContent = `Combat — Tour ${gameState.round}`;
    phaseLabel.style.color = '';

    // Enemy setup
    const enemyHand = enemyAI.selectHand();
    gameState.startCombat(hand.length, enemyHand.length);
    const enemyUnits = enemyAI.placeUnits(board, gameState.enemy_board_slots);

    // Player units + archetypes
    const playerUnits = board.getLivingUnitsOnSide('player');
    const archetypeList = ArchetypeDatabase.getAllArchetypes();
    const archetypeManager = new ArchetypeManager(archetypeList, playerUnits, enemyUnits);
    archetypeManager.applyStartOfCombat();

    const combat = new CombatManager(board, playerUnits, enemyUnits, archetypeManager);

    // Switch to combat UI
    grid.enterCombatMode();
    handArea.style.display = 'none';
    container.querySelector('#graveyard-area').style.display = 'none';
    btnCombat.style.display = 'none';
    const speedControls = container.querySelector('#speed-controls');
    speedControls.style.display = '';

    // Wire speed buttons (once per combat)
    let currentSpeed = 1;
    const animator = new CombatAnimator(combat, grid.gridEl(), {
      onFinished: () => _finishCombat(combat, playerUnits, enemyUnits, archetypeManager),
    });

    const btnPause = speedControls.querySelector('#btn-pause');
    let isPaused = false;
    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      if (isPaused) {
        animator.pause();
        btnPause.textContent = '▶';
        btnPause.classList.add('active');
      } else {
        animator.resume();
        btnPause.textContent = '⏸';
        btnPause.classList.remove('active');
      }
    });

    speedControls.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSpeed = +btn.dataset.speed;
        animator.setSpeed(currentSpeed);
        speedControls.querySelectorAll('.speed-btn[data-speed]')
          .forEach(b => b.classList.toggle('active', b === btn));
      }, { once: false });
    });

    animator.start();
  }

  function _finishCombat(combat, playerUnits, enemyUnits, archetypeManager) {
    // Post-combat archetype effects
    const playerNeutralized = playerUnits.filter(u => u.is_neutralized);
    const enemyNeutralized  = enemyUnits.filter(u => u.is_neutralized);
    const archetypeResult = archetypeManager.applyEndOfCombat(playerNeutralized, enemyNeutralized);

    const winner = combat.winner ?? 'draw';
    const playerSurvivors = playerUnits.filter(u => !u.is_neutralized).length;
    const enemySurvivors  = enemyUnits.filter(u => !u.is_neutralized).length;
    gameState.applyEndOfCombat(winner, playerSurvivors, enemySurvivors, archetypeResult);

    // Reset board: remove all enemy units
    for (const u of enemyUnits) board.removeUnit(u);

    // Remove neutralized player units from the board
    for (const u of playerUnits) {
      if (u.is_neutralized) board.removeUnit(u);
    }

    // Re-place revived units
    for (const u of archetypeResult.revived) {
      u.is_neutralized = false;
      const target = u.initial_position && !board.isOccupied(u.initial_position)
        ? u.initial_position
        : board.firstEmptyPlayerCell();
      if (target) {
        try { board.placeUnit(u, target); } catch (_) { /* occupied by a survivor that moved there */ }
      }
    }

    // Units still neutralized → graveyard for next preparation
    graveyard = playerUnits.filter(u => u.is_neutralized);

    // Reset combat stat bonuses on all surviving player units so they don't stack between rounds
    for (const u of board.getLivingUnitsOnSide('player')) {
      u.resetCombatStats();
    }

    // Survivors return to initial_position
    for (const u of board.getLivingUnitsOnSide('player')) {
      if (u.initial_position) {
        const init = u.initial_position;
        if (!board.isOccupied(init) || board.getUnit(init) === u) {
          if (board.getUnit(u.position) === u &&
              (u.position.col !== init.col || u.position.row !== init.row)) {
            board.moveUnit(u, init);
          }
        }
      }
    }

    // Restore preparation UI
    grid.exitCombatMode();
    handArea.style.display = '';
    const sc = container.querySelector('#speed-controls');
    sc.style.display = 'none';
    const bp = sc.querySelector('#btn-pause');
    if (bp) { bp.textContent = '⏸'; bp.classList.remove('active'); }
    btnCombat.style.display = '';

    _showEndRound(winner);
  }

  // ── End of round overlay ─────────────────────────────────────────────────

  function _showEndRound(winner) {
    _updateHUD();
    const msgMap = { player: '🏆 Victoire du round !', enemy: '💀 Défaite du round', draw: '⚖ Égalité' };
    const isOver = gameState.isGameOver();

    const overlay = document.createElement('div');
    overlay.className = 'end-round-overlay';
    overlay.innerHTML = `
      <div class="end-round-panel">
        <p class="end-round-result">${msgMap[winner] || '⚖ Fin'}</p>
        <div class="end-round-hps">
          <span class="hud-hp player">♥ ${gameState.player_hp}</span>
          <span style="color:var(--muted)">vs</span>
          <span class="hud-hp enemy">♥ ${gameState.enemy_hp}</span>
        </div>
        <button class="btn btn-primary" id="btn-next">
          ${isOver ? 'Résultat final' : 'Tour suivant'}
        </button>
      </div>
    `;
    container.appendChild(overlay);
    overlay.querySelector('#btn-next').addEventListener('click', () => {
      overlay.remove();
      if (isOver) {
        _showGameOver();
      } else {
        gameState.nextRound();
        startPreparation();
      }
    });
  }

  function _showGameOver() {
    _updateHUD();
    const winner = gameState.getWinner();
    const msgMap = { player: '🏆 Victoire !', enemy: '💀 Défaite', draw: '⚖ Égalité' };
    const overlay = document.createElement('div');
    overlay.className = 'end-round-overlay';
    overlay.innerHTML = `
      <div class="end-round-panel">
        <p class="end-round-result" style="font-size:2rem">${msgMap[winner] || '—'}</p>
        <div class="end-round-hps">
          <span class="hud-hp player">♥ ${gameState.player_hp}</span>
          <span style="color:var(--muted)">vs</span>
          <span class="hud-hp enemy">♥ ${gameState.enemy_hp}</span>
        </div>
        <button class="btn btn-primary" id="btn-menu">Menu principal</button>
      </div>
    `;
    container.appendChild(overlay);
    overlay.querySelector('#btn-menu').addEventListener('click', () => navigate('main_menu'));
  }

  // ── Events ───────────────────────────────────────────────────────────────

  container.querySelector('#btn-back').addEventListener('click', () => navigate('main_menu'));

  // Use pointerdown (not click) so the event fires reliably on iOS Safari
  btnCombat.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (gameState.phase === Phase.PREPARATION) runCombat();
  });

  // Tap outside hand/board/graveyard → deselect everything
  // Exclude .phase-controls so tapping the combat button doesn't trigger deselect
  container.querySelector('.game-layout').addEventListener('pointerdown', e => {
    if (e.target.closest('#board-area') || e.target.closest('#hand-area') ||
        e.target.closest('#graveyard-area') || e.target.closest('.phase-controls')) return;
    selectedCard = null;
    selectedBoardPos = null;
    selectedMaterials = [];
    handUI.deselect();
    grid.clearHighlight();
    grid.clearMaterialHighlight();
    Tooltip.hide();
  });

  // ── Start ────────────────────────────────────────────────────────────────

  startPreparation();
}

// ── Material selection helpers ────────────────────────────────────────────────

function _needsMaterials(card, board = null, graveyard = []) {
  if (card.summon_type === 'sacrifice') return (card.cost?.sacrifice ?? 0) > 0;
  if (card.summon_type === 'fusion')   return (card.cost?.materials?.length ?? 0) > 0;
  if (card.summon_type === 'rituel')   return (card.cost?.materials?.length ?? 0) > 0 || (card.cost?.sacrifice ?? 0) > 0;
  if (card.summon_type === 'transformation') {
    // Only needs explicit material selection when the target isn't alive on the board
    const targetId = card.cost?.materials?.[0];
    if (!targetId || !board) return false;
    return !board.getLivingUnitsOnSide('player').find(u => u.card_id === targetId);
  }
  return false;
}

function _materialsComplete(card, mats) {
  if (card.summon_type === 'sacrifice') {
    return mats.length >= (card.cost?.sacrifice ?? 0);
  }
  if (card.summon_type === 'fusion') {
    const required = card.cost?.materials ?? [];
    const coveredIds = mats.map(u => u.card_id);
    return required.every(id => coveredIds.includes(id));
  }
  if (card.summon_type === 'rituel') {
    const required = card.cost?.materials ?? [];
    const sacrifice = card.cost?.sacrifice ?? 0;
    // Need exactly `sacrifice` units total, all material constraints satisfied among them
    return mats.length >= sacrifice && _getUncoveredRequirements(required, mats).length === 0;
  }
  if (card.summon_type === 'transformation') {
    const targetId = card.cost?.materials?.[0];
    if (!targetId) return true;
    return mats.some(u => u.card_id === targetId);
  }
  return true;
}

// Returns positions of units that can still be selected as material for the given card.
function _materialCandidateCells(card, alreadySelected, board) {
  if (!_needsMaterials(card)) return [];
  const units = board.getLivingUnitsOnSide('player');
  const selected = new Set(alreadySelected);

  if (card.summon_type === 'sacrifice') {
    const needed = card.cost?.sacrifice ?? 0;
    if (alreadySelected.length >= needed) return [];
    return units.filter(u => !selected.has(u)).map(u => ({ ...u.position }));
  }

  if (card.summon_type === 'fusion') {
    const required = card.cost?.materials ?? [];
    const coveredIds = alreadySelected.map(u => u.card_id);
    const stillNeeded = required.filter(id => !coveredIds.includes(id));
    if (stillNeeded.length === 0) return [];
    return units.filter(u => stillNeeded.includes(u.card_id) && !selected.has(u)).map(u => ({ ...u.position }));
  }

  if (card.summon_type === 'rituel') {
    const required = card.cost?.materials ?? [];
    const sacrifice = card.cost?.sacrifice ?? 0;
    if (alreadySelected.length >= sacrifice) return [];
    const uncovered = _getUncoveredRequirements(required, alreadySelected);
    const remainingSlots = sacrifice - alreadySelected.length;
    // If remaining slots == uncovered requirements, only allow units matching those requirements
    if (uncovered.length > 0 && uncovered.length === remainingSlots) {
      return units
        .filter(u => !selected.has(u) && uncovered.some(matId => _matchesMaterial(u, matId)))
        .map(u => ({ ...u.position }));
    }
    // Free slots available — any unit is acceptable
    return units.filter(u => !selected.has(u)).map(u => ({ ...u.position }));
  }

  return [];
}

// Returns true if the card can potentially be played given the current board state.
// Used to grey out unplayable cards in hand. Intentionally lenient: doesn't check
// for empty cells when materials will be freed by the summon itself.
function _isPlayable(card, board, graveyard = [], maxSlots = Infinity) {
  if (card.summon_type === 'normal') {
    if (board.getLivingUnitsOnSide('player').length >= maxSlots) return false;
    return _hasEmptyPlayerCell(board);
  }
  if (card.summon_type === 'sacrifice') {
    const needed = card.cost?.sacrifice ?? 0;
    if (needed === 0) return _hasEmptyPlayerCell(board);
    return board.getLivingUnitsOnSide('player').length + graveyard.length >= needed;
  }
  if (card.summon_type === 'fusion') {
    const materials = card.cost?.materials ?? [];
    if (materials.length === 0) return _hasEmptyPlayerCell(board);
    const units = board.getUnitsOnSide('player');
    return materials.every(id =>
      units.find(u => u.card_id === id && u.isAlive()) ||
      graveyard.find(u => u.card_id === id)
    );
  }
  if (card.summon_type === 'rituel') {
    const required = card.cost?.materials ?? [];
    const sacrifice = card.cost?.sacrifice ?? 0;
    const allUnits = [...board.getUnitsOnSide('player'), ...graveyard];
    if (allUnits.length < sacrifice) return false;
    return _getUncoveredRequirements(required, allUnits).length === 0;
  }
  if (card.summon_type === 'transformation') {
    const targetId = card.cost?.materials?.[0];
    if (!targetId) return false;
    return !!board.getUnitsOnSide('player').find(u => u.card_id === targetId && u.isAlive()) ||
           !!graveyard.find(u => u.card_id === targetId);
  }
  return _hasEmptyPlayerCell(board);
}

// Material helpers — a requirement can be a card ID (CORE_*) or an archetype ID (ARCH_*).
function _matchesMaterial(unit, matId) {
  if (matId.startsWith('ARCH_')) return unit.archetypes?.includes(matId) ?? false;
  return unit.card_id === matId;
}

// Returns the subset of `required` not yet covered by `selectedUnits` (greedy, order-stable).
function _getUncoveredRequirements(required, selectedUnits) {
  const pool = [...selectedUnits];
  return required.filter(matId => {
    const idx = pool.findIndex(u => _matchesMaterial(u, matId));
    if (idx !== -1) { pool.splice(idx, 1); return false; }
    return true;
  });
}


function _hasEmptyPlayerCell(board) {
  for (let r = 0; r <= 3; r++)
    for (let c = 0; c < 5; c++)
      if (!board.isOccupied({ col: c, row: r })) return true;
  return false;
}

// Tiers available per round:
// T1: R1  T2: R1+  T3: R3+  T4: R4+  T5: R5+
// R1:[1]  R2:[1,2]  R3:[1,2,3]  R4:[2,3,4]  R5+:[3,4,5]
function _tiersForRound(round) {
  if (round <= 1) return [1];
  if (round === 2) return [1, 2];
  if (round === 3) return [1, 2, 3];
  if (round === 4) return [2, 3, 4];
  return [3, 4, 5];
}

// Draw `count` cards randomly from the eligible tiers (duplicates allowed)
function _drawHand(cardsByTier, round, count) {
  const pool = _tiersForRound(round).flatMap(t => cardsByTier[t] ?? []);
  if (pool.length === 0) return [];
  const hand = [];
  for (let i = 0; i < count; i++) {
    hand.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return hand;
}
