import { navigate } from '../../main.js';

export async function mount(container, params = {}) {
  const isTestbench = params.mode === 'testbench';

  container.innerHTML = `
    <div class="topbar">
      <button class="topbar-back" id="btn-back">←</button>
      <span class="topbar-title">${isTestbench ? 'TestBench' : 'Combat'}</span>
      <div class="game-hud" id="game-hud">
        <span class="hud-round">Tour 1/5</span>
        <span class="hud-hp player">♥ 30</span>
        <span class="hud-hp enemy">♥ 30</span>
      </div>
    </div>
    <div class="game-layout">
      <div class="board-area" id="board-area">
        <div class="board-placeholder">
          <p>Board (5×8)</p>
          <p class="muted-text">Phase 5 — Board UI</p>
        </div>
      </div>
      <div class="hand-area" id="hand-area">
        <div class="hand-placeholder">
          <p>Main du joueur</p>
          <p class="muted-text">Phase 5 — HandUI</p>
        </div>
      </div>
      <div class="phase-controls" id="phase-controls">
        <button class="btn btn-primary btn-full" id="btn-phase">Lancer le combat</button>
      </div>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => navigate('main_menu'));
}
