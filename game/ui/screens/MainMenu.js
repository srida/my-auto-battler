import { navigate } from '../../main.js';

export async function mount(container) {
  container.innerHTML = `
    <div class="main-menu">
      <div class="main-menu-hero">
        <img src="/game/logo.png" class="main-menu-logo" alt="Soulforge">
        <h1 class="main-menu-title">Soulforge</h1>
        <p class="main-menu-subtitle">Auto-Chess × Tactiques × Cartes à invoquer</p>
      </div>
      <div class="main-menu-actions">
        <button class="btn btn-primary btn-full" id="btn-play">Jouer</button>
        <button class="btn btn-secondary btn-full" id="btn-testbench">TestBench (dev)</button>
        <a href="/admin" class="main-menu-admin-link">Administration</a>
      </div>
    </div>
  `;

  container.querySelector('#btn-play').addEventListener('click', () => navigate('deck_selector'));
  container.querySelector('#btn-testbench').addEventListener('click', () => navigate('testbench'));
}
