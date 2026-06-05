import { navigate } from '../../main.js';

export async function mount(container) {
  container.innerHTML = `
    <div class="topbar">
      <button class="topbar-back" id="btn-back">←</button>
      <span class="topbar-title">Mes Decks</span>
      <button class="btn btn-primary" id="btn-create">+ Nouveau</button>
    </div>
    <div class="screen-content">
      <div class="deck-list" id="deck-list">
        <div class="empty-state">
          <p class="empty-icon">🃏</p>
          <p class="empty-text">Aucun deck sauvegardé.</p>
          <p class="empty-sub">Crée un deck pour commencer à jouer.</p>
        </div>
      </div>
    </div>
    <div class="deck-selector-footer">
      <button class="btn btn-primary btn-full" id="btn-play" disabled>Jouer avec ce deck</button>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => navigate('main_menu'));
  container.querySelector('#btn-create').addEventListener('click', () => navigate('deck_builder'));
  container.querySelector('#btn-play').addEventListener('click', () => navigate('game'));
}
