export function longestLegal(rules, info, faces) {
  const byRank = new Map();
  for (const face of faces) {
    if (!byRank.has(face.rank)) byRank.set(face.rank, []);
    byRank.get(face.rank).push(face.id);
  }
  const pending = [''];
  const seen = new Set(pending);
  let best = [];
  while (pending.length) {
    for (const [move, committed] of rules.actions(info, pending.pop())) {
      if (!committed) {
        if (!seen.has(move)) {
          seen.add(move);
          pending.push(move);
        }
        continue;
      }
      if (move === 'PASS' || move.length <= best.length || move.length > faces.length) continue;
      const used = new Map();
      const ids = [];
      for (const rank of move) {
        const count = used.get(rank) ?? 0;
        const id = byRank.get(rank)?.[count];
        if (id === undefined) break;
        ids.push(id);
        used.set(rank, count + 1);
      }
      if (ids.length === move.length) best = ids;
      if (best.length === faces.length) return best;
    }
  }
  return best;
}
