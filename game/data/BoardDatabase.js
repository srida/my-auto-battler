let _boards = [];
let _byId = {};
let _initialized = false;

export async function init() {
  if (_initialized) return;
  const res = await fetch('/api/boards');
  _boards = await res.json();
  _byId = Object.fromEntries(_boards.map(b => [b.id, b]));
  _initialized = true;
}

export function getBoard(id) {
  if (!_initialized) throw new Error('BoardDatabase not initialized');
  return _byId[id] ?? null;
}

export function getAllBoards() {
  if (!_initialized) throw new Error('BoardDatabase not initialized');
  return _boards;
}
