import { CELLS } from '../src/scripts/halma-geometry.js';
import { createHalmaRules, SEATS } from '../src/scripts/halma-rules.js';
const { HalmaGame } = createHalmaRules(CELLS);
const fail = error => { throw Object.assign(Error(error), { expected: true }); };
const levels = ['simple', 'fast', 'light'];
const botMask = state => state.ai ?? Array(state.playerCount).fill(false);
export function options(value = {}, players = value?.players ?? 2) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(players) || !Object.hasOwn(SEATS, players)
        || value.players !== undefined && value.players !== players
        || !Number.isInteger(value.first ?? 1) || (value.first ?? 1) < 1 || (value.first ?? 1) > players
        || !Number.isInteger(value.hostColor ?? 1) || (value.hostColor ?? 1) < 1 || (value.hostColor ?? 1) > players
        || typeof (value.mirror ?? false) !== 'boolean' || !levels.includes(value.difficulty ?? 'fast')
        || value.ai !== undefined && (!Array.isArray(value.ai) || value.ai.length !== players || value.ai.some(v => typeof v !== 'boolean') || value.ai[(value.hostColor ?? 1) - 1])) fail('invalid_options');
    return { players, first: value.first ?? 1, mirror: value.mirror ?? false, hostColor: value.hostColor ?? 1,
        difficulty: value.difficulty ?? 'fast', ...(value.ai !== undefined ? { ai: value.ai.slice() } : {}) };
}
export function board(state) {
    const game = new HalmaGame(state.playerCount, state.mirror, state.first, state.layoutVersion ?? 1);
    for (const move of state.moves) if (!game.play(move)) throw Error('invalid_stored_game');
    return game;
}
function effective(state, view) {
    const ai = botMask(state);
    return { joined: view.joined.map((value, seat) => value || ai[state.colors[seat] - 1]),
        online: view.online.map((value, seat) => value || !!view.online[0] && ai[state.colors[seat] - 1]) };
}
function configure(state, config) {
    const previous = state.colors.indexOf(config.hostColor), oldHost = state.colors[0];
    state.ai = botMask(state).slice();
    [state.colors[0], state.colors[previous]] = [state.colors[previous], state.colors[0]];
    [state.ai[oldHost - 1], state.ai[config.hostColor - 1]] = [state.ai[config.hostColor - 1], state.ai[oldHost - 1]];
    if (config.ai) state.ai = config.ai.slice();
    state.first = config.first; state.mirror = config.mirror; state.moves = []; state.layoutVersion = 2;
    if (config.difficulty) state.difficulty = config.difficulty;
}
const undoIndex = (game, you) => game.moves.findLastIndex(move => move.player === you);
function finishOffer(state, game) {
    const offer = state.offer;
    if (!offer.required.every(color => offer.accepted.includes(color))) return;
    if (offer.kind === 'restart') configure(state, offer.options);
    else if (offer.kind === 'undo') state.moves.splice(undoIndex(game, offer.by));
    else {
        const a = state.colors.indexOf(offer.by), b = state.colors.indexOf(offer.target);
        [state.colors[a], state.colors[b]] = [state.colors[b], state.colors[a]];
    }
    state.offer = null;
}
export default {
    seats: state => state.playerCount,
    emptySeat(state, seats) { return seats.findIndex((seat, i) => !seat && !botMask(state)[state.colors[i] - 1]); },
    initial(value) {
        const config = options(value);
        return { playerCount: config.players, mirror: config.mirror, first: config.first, layoutVersion: 2,
            colors: [config.hostColor, ...Array.from({ length: config.players }, (_, i) => i + 1).filter(color => color !== config.hostColor)],
            moves: [], offer: null, offerSerial: 0, ai: config.ai ?? Array(config.players).fill(false), difficulty: config.difficulty };
    },
    acceptsStale(state, command) {
        return command.type === 'respond' && !!state.offer && command.offerId === state.offer.id;
    },
    snapshot(state, view) {
        const game = board(state), you = state.colors[view.seat], ready = effective(state, view);
        const byColor = values => state.colors.reduce((out, color, i) => { out[color - 1] = values[i]; return out; }, []);
        const offer = state.offer && { ...state.offer, required: state.offer.required ?? state.colors.filter((_, seat) => view.joined[seat]) };
        return { moves: state.moves, offer, playerCount: state.playerCount, mirror: state.mirror, first: state.first, layoutVersion: state.layoutVersion ?? 1,
            hostColor: state.colors[0], you, isHost: view.seat === 0, players: byColor(ready.online), joined: byColor(ready.joined),
            humanJoined: byColor(view.joined), ai: botMask(state).slice(), difficulty: state.difficulty ?? 'fast',
            outcome: game.outcome, canUndo: undoIndex(game, you) >= 0,
            pollAfterMs: offer ? 3000 : !ready.joined.every(Boolean) || game.outcome !== null ? 10000 : game.turn === you ? 6000 : 3000 };
    },
    apply(state, command, view) {
        const you = state.colors[view.seat], game = board(state), ai = botMask(state), ready = effective(state, view);
        if (command.type === 'settings') {
            if (view.seat !== 0) fail('host_only');
            if (state.offer) fail('offer_pending');
            if (state.moves.length || view.joined.slice(1).some(Boolean)) fail('restart_required');
            configure(state, options(command.options, state.playerCount)); return;
        }
        if (command.type === 'ai') {
            if (view.seat !== 0) fail('host_only');
            if (state.offer) fail('offer_pending');
            if (state.playerCount > 2 && state.layoutVersion !== 2) fail('restart_required');
            if (command.difficulty !== undefined && !levels.includes(command.difficulty)) fail('invalid_options');
            if (command.color !== undefined) {
                if (!Number.isInteger(command.color) || command.color < 1 || command.color > state.playerCount || typeof command.enabled !== 'boolean') fail('invalid_options');
                const seat = state.colors.indexOf(command.color);
                if (view.joined[seat]) fail('seat_occupied');
            }
            state.ai = ai.slice();
            if (command.color !== undefined) state.ai[command.color - 1] = command.enabled;
            if (command.difficulty !== undefined) state.difficulty = command.difficulty;
            return;
        }
        if (command.type === 'respond') {
            const offer = state.offer;
            if (!offer || command.offerId !== offer.id || typeof command.accept !== 'boolean') fail('invalid_offer');
            offer.required ??= state.colors.filter((_, seat) => view.joined[seat] && !ai[state.colors[seat] - 1]);
            if (!offer.required.includes(you) || command.accept && offer.accepted.includes(you)) fail('invalid_offer');
            const requiredOnline = offer.required.every(color => view.online[state.colors.indexOf(color)]);
            if (!requiredOnline) fail('opponent_offline');
            if (!command.accept) { state.offer = null; return; }
            offer.accepted.push(you); finishOffer(state, game); return;
        }
        if (command.type === 'offer' && command.kind === 'swap') {
            if (state.offer) fail('offer_pending');
            if (state.playerCount <= 2 || !Number.isInteger(command.target) || command.target === you || !state.colors.includes(command.target)
                || ai[command.target - 1] || !view.joined[state.colors.indexOf(command.target)]) fail('invalid_swap');
            if (!view.online[view.seat] || !view.online[state.colors.indexOf(command.target)]) fail('opponent_offline');
            state.offerSerial = (state.offerSerial || 0) + 1;
            state.offer = { id: state.offerSerial, kind: 'swap', by: you, target: command.target, accepted: [you], required: [you, command.target] };
            return;
        }
        if (!ready.online.every(Boolean)) fail('opponent_offline');
        if (command.type === 'move') {
            if (state.offer) fail('offer_pending');
            const botTurn = ai[game.turn - 1];
            if (botTurn ? view.seat !== 0 || command.ai !== true : game.turn !== you || command.ai === true) fail('illegal_move');
            if (!game.play(command.move)) fail('illegal_move');
            state.moves.push({ from: command.move.from, to: command.move.to });
        } else if (command.type === 'offer') {
            if (state.offer) fail('offer_pending');
            if (!['undo', 'restart'].includes(command.kind)) fail('invalid_message');
            if (command.kind === 'undo' && undoIndex(game, you) < 0) fail('nothing_to_undo');
            if (command.options !== undefined && (command.kind !== 'restart' || view.seat !== 0)) fail('host_only');
            if (command.options?.ai !== undefined) fail('invalid_options');
            const config = command.kind === 'restart' ? options(command.options ?? {
                first: state.first, mirror: state.mirror, hostColor: state.colors[0], difficulty: state.difficulty ?? 'fast' }, state.playerCount) : undefined;
            state.offerSerial = (state.offerSerial || 0) + 1;
            state.offer = { id: state.offerSerial, kind: command.kind, by: you, accepted: [you],
                required: state.colors.filter((color, seat) => view.joined[seat] && !ai[color - 1]), ...(config ? { options: config } : {}) };
            finishOffer(state, game);
        } else fail('invalid_message');
    }
};
