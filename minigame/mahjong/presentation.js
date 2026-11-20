// Presentation-only transformations. The Worker remains the authority for game state.
export function handLayout(state, sort = true) {
  const hand = state.players[0].hand;
  const drawn = state.lastDraw !== null && state.phase === 'turn' && state.turn === 0
    ? hand.lastIndexOf(state.lastDraw) : -1;
  const order = hand.map((_, i) => i).filter(i => i !== drawn);
  if (sort) order.sort((a, b) => hand[a] - hand[b]);
  if (drawn >= 0) order.push(drawn);
  return {order, drawn};
}

// Keep source indices for the most recent discard marker, while closing claimed gaps.
export function visibleRiver(river) {
  return river.flatMap((r, index) => r.claimed ? [] : [{...r, index}]);
}

// Compare what the player has already seen, including a projected own discard.
// The later Worker acknowledgement must not replay that same physical tile.
export function discardTransitions(before, after) {
  if (!before || before.round !== after.round) return [];
  return after.players.flatMap((player, p) => player.river.flatMap((r, index) =>
    index >= before.players[p].river.length && !r.claimed
      ? [{key:`${after.round}:${p}:${index}`, player:p, index, tile:r.tile, ...(r.tsumogiri === undefined ? {} : {tsumogiri:r.tsumogiri})}] : []));
}

export function automaticAction(state, tools) {
  const options = state.options;
  const win = options.find(o => o.kind === 'win' || o.kind === 'ron');
  if (tools.win && win) return win;
  if (state.phase === 'response' && tools.noCall && !win)
    return options.find(o => o.kind === 'pass') || null;
  if (state.phase === 'turn' && state.turn === 0 && tools.cut && state.lastDraw !== null && !options.length)
    return {kind:'discard', tile:state.lastDraw};
  return null;
}

export function projectDiscard(state, action, selected) {
  if (action?.kind !== 'discard') return state;
  const hand = state.players[0].hand;
  const i = selected !== null && hand[selected] === action.tile ? selected : hand.indexOf(action.tile);
  if (i < 0) return state;
  const s = structuredClone(state);
  s.players[0].hand.splice(i, 1);
  s.players[0].count--;
  s.players[0].river.push({tile:action.tile, claimed:false});
  s.pending = {source:0, tile:action.tile};
  s.options = []; s.phase = 'resolving'; s.lastDraw = null;
  s.hints = {waits:state.hints?.discards.find(d => d.tile === action.tile)?.waits || [], discards:[]};
  return s;
}

export function latestDiscard(before, after, previous) {
  if (!before || before.round !== after.round) return null;
  for (let p = 0; p < 4; p++) {
    if (after.players[p].river.length > before.players[p].river.length)
      return {player:p, index:after.players[p].river.length - 1};
  }
  return previous;
}

export function meldLayout(meld, player = 0) {
  const {kind, tile, source, called_tile = tile} = meld;
  if (kind === 'ankan') return {faces:[null, tile, tile, null], sideways:-1, addedTile:null};
  if (kind === 'chi') {
    const handTiles = [tile, tile + 1, tile + 2].filter(t => t !== called_tile);
    return {faces:[called_tile, ...handTiles], sideways:0, addedTile:null};
  }
  const faces = Array(kind === 'kan' ? 4 : 3).fill(tile);
  const from = (source - player + 4) % 4;
  const sideways = from === 3 ? 0 : from === 2 ? 1 : faces.length - 1;
  return {faces, sideways, addedTile:kind === 'kakan' ? tile : null};
}

export function winningHandLayout(hand, result) {
  const tiles = [...hand];
  if (result.source !== -1) return {tiles:tiles.sort((a, b) => a - b), winningTile:result.tile};
  const index = tiles.lastIndexOf(result.tile);
  const winningTile = index < 0 ? null : tiles.splice(index, 1)[0];
  return {tiles:tiles.sort((a, b) => a - b), winningTile};
}
