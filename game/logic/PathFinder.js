// Chebyshev distance (8-directional king's distance)
export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function manhattanDistance(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/**
 * BFS from `from` to `to`.
 * Neutralized units do not block movement.
 * The destination cell may be occupied (by the target enemy).
 * Returns array of positions to walk (excluding start, including destination),
 * or null if unreachable.
 */
export function findPath(board, from, to) {
  const key = p => `${p.col},${p.row}`;
  const visited = new Set([key(from)]);
  const queue = [{ pos: from, path: [] }];

  while (queue.length > 0) {
    const { pos, path } = queue.shift();

    for (const next of board.getNeighbors(pos)) {
      const k = key(next);
      if (visited.has(k)) continue;
      visited.add(k);

      const isGoal = next.col === to.col && next.row === to.row;
      if (!isGoal) {
        const occupant = board.getUnit(next);
        // Block on living units (except destination)
        if (occupant && !occupant.is_neutralized) continue;
      }

      const newPath = [...path, next];
      if (isGoal) return newPath;
      queue.push({ pos: next, path: newPath });
    }
  }
  return null;
}

/**
 * Returns the best adjacent cell to step toward `to` from `from`.
 * Used when we only want to move one cell closer.
 */
export function stepToward(board, from, to) {
  const path = findPath(board, from, to);
  if (!path || path.length === 0) return null;
  return path[0]; // first step of the path
}

/**
 * Find the closest enemy to `unit` among `enemies`.
 * Returns { unit, distance } or null.
 */
export function findClosestEnemy(unit, enemies) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e.isAlive()) continue;
    const d = manhattanDistance(unit.position, e.position);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best ? { unit: best, distance: bestDist } : null;
}

/**
 * Returns true if `attacker` can attack `target` given its range.
 * All units use Manhattan distance (cardinal directions only).
 */
export function isInAttackRange(attacker, target) {
  return manhattanDistance(attacker.position, target.position) <= attacker.range;
}

/**
 * Find the best attack target for `unit` among `enemies`.
 * Uses Manhattan distance for all range values.
 * Returns { unit, distance } or null.
 */
export function findAttackTarget(unit, enemies) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e.isAlive()) continue;
    const d = manhattanDistance(unit.position, e.position);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best ? { unit: best, distance: bestDist } : null;
}
