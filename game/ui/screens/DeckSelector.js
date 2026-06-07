import { navigate } from '../../main.js';
import * as DeckRepository from '../../data/DeckRepository.js';

export async function mount(container) {
  let selectedPlayer = null;
  let selectedEnemy  = null;

  // ── Step 1 : player deck selection ──────────────────────────────────────

  function renderStep1() {
    const names  = DeckRepository.listDecks();
    const active = DeckRepository.getActiveDeck();

    container.innerHTML = `
      <div class="topbar">
        <button class="topbar-back" id="btn-back">←</button>
        <span class="topbar-title">Mes Decks</span>
        <button class="btn btn-primary" id="btn-create">+ Nouveau</button>
      </div>
      <div class="screen-content">
        <div class="deck-list" id="deck-list"></div>
      </div>
      <div class="deck-selector-footer">
        <button class="btn btn-primary btn-full" id="btn-play" ${selectedPlayer ? '' : 'disabled'}>
          ${selectedPlayer ? `Jouer avec "${selectedPlayer}"` : 'Jouer avec ce deck'}
        </button>
      </div>
    `;

    const deckList = container.querySelector('#deck-list');
    const btnPlay  = container.querySelector('#btn-play');

    if (names.length === 0) {
      deckList.innerHTML = `
        <div class="empty-state">
          <p class="empty-icon">🃏</p>
          <p class="empty-text">Aucun deck sauvegardé.</p>
          <p class="empty-sub">Crée un deck pour commencer à jouer.</p>
        </div>`;
    } else {
      deckList.innerHTML = names.map(name => `
        <div class="deck-item${selectedPlayer === name ? ' selected' : ''}" data-name="${esc(name)}">
          <div class="deck-item-info">
            <span class="deck-item-name">${esc(name)}</span>
            ${name === active ? '<span class="badge badge-active">Actif</span>' : ''}
          </div>
          <div class="deck-item-actions">
            <button class="btn btn-icon btn-edit" data-name="${esc(name)}" title="Éditer">✏️</button>
            <button class="btn btn-icon btn-del"  data-name="${esc(name)}" title="Supprimer">🗑</button>
          </div>
        </div>`).join('');

      deckList.querySelectorAll('.deck-item').forEach(el => {
        el.addEventListener('click', e => {
          if (e.target.closest('.deck-item-actions')) return;
          selectedPlayer = el.dataset.name;
          renderStep1();
        });
      });

      deckList.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          DeckRepository.setPendingEdit(btn.dataset.name);
          navigate('deck_builder');
        });
      });

      deckList.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm(`Supprimer le deck "${btn.dataset.name}" ?`)) return;
          if (selectedPlayer === btn.dataset.name) selectedPlayer = null;
          DeckRepository.deleteDeck(btn.dataset.name);
          renderStep1();
        });
      });
    }

    container.querySelector('#btn-back').addEventListener('click', () => navigate('main_menu'));
    container.querySelector('#btn-create').addEventListener('click', () => navigate('deck_builder'));

    btnPlay.addEventListener('click', () => {
      if (!selectedPlayer) return;
      DeckRepository.setActiveDeck(selectedPlayer);
      renderStep2();
    });
  }

  // ── Step 2 : enemy deck selection ────────────────────────────────────────

  function renderStep2() {
    const names = DeckRepository.listDecks();

    container.innerHTML = `
      <div class="topbar">
        <button class="topbar-back" id="btn-back">←</button>
        <span class="topbar-title">Deck ennemi</span>
      </div>
      <div class="screen-content">
        <div class="deck-list" id="deck-list">
          <div class="deck-item${selectedEnemy === '__random__' ? ' selected' : ''}" data-name="__random__">
            <div class="deck-item-info">
              <span class="deck-item-name">Aléatoire</span>
              <span class="badge">Surprise</span>
            </div>
          </div>
          ${names.map(name => `
            <div class="deck-item${selectedEnemy === name ? ' selected' : ''}" data-name="${esc(name)}">
              <div class="deck-item-info">
                <span class="deck-item-name">${esc(name)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="deck-selector-footer">
        <button class="btn btn-primary btn-full" id="btn-confirm" ${selectedEnemy ? '' : 'disabled'}>
          Confirmer
        </button>
      </div>
    `;

    container.querySelector('#btn-back').addEventListener('click', renderStep1);

    container.querySelector('#deck-list').querySelectorAll('.deck-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedEnemy = el.dataset.name;
        renderStep2();
      });
    });

    container.querySelector('#btn-confirm').addEventListener('click', () => {
      if (!selectedEnemy) return;
      const enemyDeckName = selectedEnemy === '__random__'
        ? names[Math.floor(Math.random() * names.length)]
        : selectedEnemy;
      navigate('game', { deckName: selectedPlayer, enemyDeckName });
    });
  }

  renderStep1();
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
