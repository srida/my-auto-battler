let list = null;
let byId = null;

export async function init() {
  if (list) return list;
  const res = await fetch('/api/archetypes');
  if (!res.ok) throw new Error(`ArchetypeDatabase: fetch failed (${res.status})`);
  list = await res.json();
  byId = Object.fromEntries(list.map(a => [a.id, a]));
  return list;
}

export function getArchetype(id) {
  if (!byId) throw new Error('ArchetypeDatabase not initialised — call init() first');
  return byId[id] ?? null;
}

export function getAllArchetypes() {
  if (!list) throw new Error('ArchetypeDatabase not initialised — call init() first');
  return list;
}

// Dictionnaire direct : { [id]: archetype }
export function getArchetypes() {
  if (!byId) throw new Error('ArchetypeDatabase not initialised — call init() first');
  return byId;
}
