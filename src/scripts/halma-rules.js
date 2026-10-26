export const SEATS = Object.freeze({ 2: [0, 3], 3: [3, 1, 5], 4: [0, 5, 3, 2], 6: [0, 5, 4, 3, 2, 1] });
export const LEGACY_SEATS = Object.freeze({ 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] });

// Pure rules shared by browser, Cloudflare and Netlify. Geometry is supplied by the caller.
export function createHalmaRules(CELLS) {
const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const index = new Map(CELLS.map(([q, r], i) => [`${q},${r}`, i]));
const NEXT = CELLS.map(([q, r]) => directions.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`) ?? -1));

class HalmaGame {
    constructor(players = 2, mirror = false, first = 1, layoutVersion = 2) {
        if (!SEATS[players]) throw new RangeError('Invalid player count');
        if (!Number.isInteger(first) || first < 1 || first > players) throw new RangeError('Invalid starting player');
        this.players = players; this.mirror = mirror; this.layoutVersion = layoutVersion;
        this.seats = (layoutVersion === 1 ? LEGACY_SEATS : SEATS)[players];
        this.board = CELLS.map(([, , region]) => this.seats.indexOf(region) + 1);
        this.first = first; this.turn = first; this.outcome = null; this.moves = [];
        this.history = [this.frame()];
    }
    frame() { return this.turn + this.board.join(''); }
    legalMoves(from) {
        if (this.outcome !== null || !Number.isInteger(from) || this.board[from] !== this.turn) return [];
        const occupied = at => at === from ? 0 : this.board[at];
        const paths = new Map(), queue = [from], parents = new Map([[from, null]]);
        for (let head = 0; head < queue.length; ++head) {
            const current = queue[head];
            for (let d = 0; d < 6; ++d) {
                let hurdle = NEXT[current][d], radius = 1, landing = -1;
                if (this.mirror) {
                    while (hurdle >= 0 && !occupied(hurdle)) { hurdle = NEXT[hurdle][d]; ++radius; }
                    if (hurdle >= 0) {
                        landing = hurdle;
                        for (let k = 0; k < radius && landing >= 0; ++k) {
                            landing = NEXT[landing][d];
                            if (landing >= 0 && occupied(landing)) { landing = -1; break; }
                        }
                    }
                } else if (hurdle >= 0 && occupied(hurdle)) landing = NEXT[hurdle][d];
                if (landing < 0 || occupied(landing) || parents.has(landing)) continue;
                parents.set(landing, current); queue.push(landing);
                const path = [landing];
                for (let at = current; at !== null; at = parents.get(at)) path.unshift(at);
                paths.set(landing, path);
            }
        }
        // A step ends the turn; it cannot be followed by jumps.
        for (const to of NEXT[from]) if (to >= 0 && !this.board[to]) paths.set(to, [from, to]);
        return [...paths].map(([to, path]) => ({ from, to, path }));
    }
    allMoves() { return this.board.flatMap((piece, i) => piece === this.turn ? this.legalMoves(i) : []); }
    won(player) {
        const start = this.seats[player - 1], target = (start + 3) % 6;
        return CELLS.every(([, , region], i) =>
            (region !== start || this.board[i] !== player) && (region !== target || this.board[i] !== 0));
    }
    play(candidate) {
        const move = this.legalMoves(candidate?.from).find(m => m.to === candidate?.to);
        if (!move) return false;
        this.moves.push({ ...move, player: this.turn });
        this.board[move.to] = this.turn; this.board[move.from] = 0;
        const previous = this.turn;
        this.turn = this.turn % this.players + 1;
        this.history.push(this.frame());
        // Last mover has priority, matching the two-player engine.
        for (const p of [previous, ...Array.from({ length: this.players }, (_, i) => i + 1).filter(p => p !== previous)]) {
            if (this.won(p)) { this.outcome = p; break; }
        }
        if (this.outcome === null && (this.history.filter(frame => frame === this.frame()).length >= 3 || !this.allMoves().length)) this.outcome = 0;
        return move;
    }
    undo(ai = []) {
        if (!this.moves.length) return false;
        const singleAI = this.players === 2 && !!ai[1] !== !!ai[2];
        do {
            const move = this.moves.pop();
            this.board[move.from] = move.player; this.board[move.to] = 0;
            this.turn = move.player; this.outcome = null; this.history.pop();
        } while (singleAI && this.moves.length && ai[this.turn]);
        return true;
    }
    position() {
        if (this.layoutVersion === 1 && this.players > 2) throw new Error('Restart the legacy room before enabling multiplayer AI');
        return { players: this.players, board: this.board.join(''), turn: [1, -1, 2, 3, 4, 5][this.turn - 1], mirror: this.mirror, history: this.history.slice() };
    }
}

return { HalmaGame, NEXT };
}
