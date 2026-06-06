import { navigate } from '../../main.js';

export async function mount(container) {
  container.innerHTML = `
    <div class="main-menu">
      <div class="main-menu-hero">
        <div class="main-menu-logo">⚔️</div>
        <h1 class="main-menu-title">YGO Auto-Battler</h1>
        <p class="main-menu-subtitle">Auto-Chess × Yu-Gi-Oh × Marvel Snap</p>
      </div>
      <div class="main-menu-actions">
        <button class="btn btn-primary btn-full" id="btn-play">Jouer</button>
        <button class="btn btn-secondary btn-full" id="btn-testbench">TestBench (dev)</button>
      </div>
    </div>
  `;

  container.querySelector('#btn-play').addEventListener('click', () => navigate('deck_selector'));
  container.querySelector('#btn-testbench').addEventListener('click', () => navigate('testbench'));
}
