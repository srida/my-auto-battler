import { navigate } from '../../main.js';

export async function mount(container, params = {}) {
  const isEdit = !!params.deckName;

  container.innerHTML = `
    <div class="topbar">
      <button class="topbar-back" id="btn-back">←</button>
      <span class="topbar-title">${isEdit ? 'Modifier le deck' : 'Nouveau deck'}</span>
      <button class="btn btn-primary" id="btn-save" disabled>Sauvegarder</button>
    </div>
    <div class="deck-builder-layout">
      <div class="deck-slots-panel">
        <p class="panel-label">Deck (5 tiers × 8 cartes)</p>
        <div class="deck-tiers" id="deck-tiers">
          ${[1, 2, 3, 4, 5].map(t => `
            <div class="tier-row">
              <span class="tier-label badge badge-tier${t}">Tier ${t}</span>
              <div class="tier-slots">
                ${Array(8).fill('<div class="deck-slot empty"></div>').join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card-browser-panel">
        <p class="panel-label">Cartes disponibles</p>
        <input class="search-input" id="search" type="search" placeholder="Rechercher…">
        <div class="card-grid" id="card-grid">
          <p class="loading-text">Chargement des cartes…</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => navigate('deck_selector'));
}
