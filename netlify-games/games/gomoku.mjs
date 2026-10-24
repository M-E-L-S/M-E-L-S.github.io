import { GomokuGame } from '../../src/scripts/gomoku-model.js';
const fail = error => { throw Object.assign(Error(error), { expected: true }); };
const color = (state, seat) => seat === 0 ? state.hostColor : 3 - state.hostColor;
function board(state, human = 1) {
  const game = new GomokuGame(human);
  for (const move of state.moves) if (!game.play(move)) throw Error('invalid_stored_game');
  return game;
}
export default {
  seats: 2,
  initial(options) { return { moves: [], offer: null, hostColor: options?.hostColor === 2 ? 2 : 1 }; },
  snapshot(state, view) {
    const game = board(state);
    const byColor = values => state.hostColor === 1 ? values : [...values].reverse();
    return { moves: state.moves, offer: state.offer, hostColor: state.hostColor,
      you: color(state, view.seat), isHost: view.seat === 0,
      players: byColor(view.online), joined: byColor(view.joined),
      pollAfterMs: state.offer ? 3000 : !view.joined.every(Boolean) ? 10000 : game.outcome !== null ? 10000 : game.turn === color(state, view.seat) ? 6000 : 3000,
      outcome: game.outcome, winningLine: game.winningLine };
  },
  apply(state, command, view) {
    const you = color(state, view.seat), game = board(state, you);
    if (command.type === 'color') {
      if (view.seat !== 0 || ![1, 2].includes(command.hostColor)) fail('host_only');
      if (state.moves.length || view.joined.every(Boolean)) fail('restart_required');
      state.hostColor = command.hostColor;
      return;
    }
    if (!view.online.every(Boolean)) fail('opponent_offline');
    if (command.type === 'move') {
      if (state.offer) fail('offer_pending');
      if (game.turn !== you || !game.play(command.move)) fail('illegal_move');
      state.moves = game.moves;
    } else if (command.type === 'offer') {
      if (state.offer) fail('offer_pending');
      if (!['undo', 'restart'].includes(command.kind)) fail('invalid_message');
      if (command.kind === 'undo' && !game.canUndo) fail('nothing_to_undo');
      if (command.hostColor !== undefined && (command.kind !== 'restart' || view.seat !== 0 || ![1, 2].includes(command.hostColor))) fail('host_only');
      state.offer = { kind: command.kind, by: you };
      if (command.kind === 'restart') state.offer.hostColor = command.hostColor ?? state.hostColor;
    } else if (command.type === 'respond') {
      const offer = state.offer;
      if (!offer || typeof command.accept !== 'boolean' || command.accept && offer.by === you) fail('invalid_offer');
      if (command.accept) {
        if (offer.kind === 'restart') { state.moves = []; state.hostColor = offer.hostColor; }
        else { const previous = board(state, offer.by); previous.undo(); state.moves = previous.moves; }
      }
      state.offer = null;
    } else fail('invalid_message');
  }
};
