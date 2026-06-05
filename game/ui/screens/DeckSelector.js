import { navigate } from '../../main.js';
import * as DeckRepository from '../../data/DeckRepository.js';

export async function mount(container) {
  let selected = null;

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
      <button class="btn btn-primary btn-full" id="btn-play" disabled>Jouer avec ce deck</button>
    </div>
  `;

  const deckList = container.querySelector('#deck-list');
  const btnPlay  = container.querySelector('#btn-play');

  function renderList() {
    const names  = DeckRepository.listDecks();
    const active = DeckRepository.getActiveDeck();

    if (names.length === 0) {
      deckList.innerHTML = `
        <div class="empty-state">
          <p class="empty-icon">🃏</p>
          <p class="empty-text">Aucun deck sauvegardé.</p>
          <p class="empty-sub">Crée un deck pour commencer à jouer.</p>
        </div>`;
      return;
    }

    deckList.innerHTML = names.map(name => `
      <div class="deck-item${selected === name ? ' selected' : ''}" data-name="${esc(name)}">
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
        selected = el.dataset.name;
        renderList();
        updatePlay();
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
        if (selected === btn.dataset.name) selected = null;
        DeckRepository.deleteDeck(btn.dataset.name);
        renderList();
        updatePlay();
      });
    });
  }

  function updatePlay() {
    btnPlay.disabled    = !selected;
    btnPlay.textContent = selected ? `Jouer avec "${selected}"` : 'Jouer avec ce deck';
  }

  container.querySelector('#btn-back').addEventListener('click', () => navigate('main_menu'));
  container.querySelector('#btn-create').addEventListener('click', () => navigate('deck_builder'));

  btnPlay.addEventListener('click', () => {
    if (!selected) return;
    DeckRepository.setActiveDeck(selected);
    navigate('game', { deckName: selected });
  });

  renderList();
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
