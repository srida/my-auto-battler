const STORAGE_KEY = 'soulforge_decks';
const ACTIVE_KEY = 'soulforge_active_deck';
const PENDING_EDIT_KEY = 'soulforge_pending_edit';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function save(decks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

// Sauvegarde un deck. Structure : { "1": ["ID", ...], "2": [...], ... }
export function saveDeck(name, deckData) {
  const decks = load();
  decks[name] = deckData;
  save(decks);
}

export function loadDeck(name) {
  return load()[name] ?? null;
}

export function deleteDeck(name) {
  const decks = load();
  delete decks[name];
  save(decks);
  if (getActiveDeck() === name) localStorage.removeItem(ACTIVE_KEY);
}

export function renameDeck(oldName, newName) {
  const decks = load();
  if (!decks[oldName]) throw new Error(`Deck "${oldName}" introuvable`);
  if (decks[newName]) throw new Error(`Un deck "${newName}" existe déjà`);
  decks[newName] = decks[oldName];
  delete decks[oldName];
  save(decks);
  if (getActiveDeck() === oldName) setActiveDeck(newName);
}

export function listDecks() {
  return Object.keys(load());
}

export function deckExists(name) {
  return name in load();
}

export function setActiveDeck(name) {
  localStorage.setItem(ACTIVE_KEY, name);
}

export function getActiveDeck() {
  return localStorage.getItem(ACTIVE_KEY) ?? null;
}

export function hasActiveDeck() {
  const name = getActiveDeck();
  return name !== null && deckExists(name);
}

// Utilisé par DeckSelector pour ouvrir DeckBuilder en mode édition
export function setPendingEdit(deckName) {
  sessionStorage.setItem(PENDING_EDIT_KEY, deckName);
}

export function consumePendingEdit() {
  const name = sessionStorage.getItem(PENDING_EDIT_KEY) ?? null;
  sessionStorage.removeItem(PENDING_EDIT_KEY);
  return name;
}
