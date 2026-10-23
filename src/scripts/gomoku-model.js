export const SIZE = 15;
export const BUDGETS = Object.freeze({
    beginner: { label: '简单', soft_ms: 300, hard_ms: 1000, beginner: true },
    fast: { label: '普通', soft_ms: 300, hard_ms: 1000 },
    light: { label: '高级', soft_ms: 1000, hard_ms: 3000 }
});

export const coordinate = ([x, y]) => `${String.fromCharCode(65 + x)}${SIZE - y}`;

// The engine reports a proven upper bound in BOTH players' plies, not a
// shortest win or an ordinary score. Keep that distinction in the UI.
export function mateProof(result, color) {
    if (result?.mate_proven !== true || !Number.isInteger(result.mate_plies) || result.mate_plies < 0 ||
        result.mate_plies > SIZE * SIZE || !Number.isFinite(result.score) ||
        Math.abs(result.score) !== 1000000 - result.mate_plies) return null;
    return { winner: result.score > 0 ? color : 3 - color, plies: result.mate_plies };
}

export class GomokuGame {
    constructor(human = 1) {
        this.human = human;
        this.moves = [];
        this.board = new Uint8Array(SIZE * SIZE);
        this.outcome = null;
        this.winningLine = [];
    }
    get turn() { return this.moves.length % 2 + 1; }
    get canUndo() { return this.moves.length >= this.human; }
    play(move) {
        if (!Array.isArray(move) || move.length !== 2 ||
            !move.every(n => Number.isInteger(n) && n >= 0 && n < SIZE)) return false;
        const [x, y] = move;
        if (this.outcome !== null || this.board[y * SIZE + x]) return false;
        const color = this.turn;
        this.board[y * SIZE + x] = color;
        this.moves.push([x, y]);
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
            const line = [[x, y]];
            for (const sign of [-1, 1]) {
                let xx = x + sign * dx, yy = y + sign * dy;
                while (xx >= 0 && xx < SIZE && yy >= 0 && yy < SIZE && this.board[yy * SIZE + xx] === color) {
                    line.push([xx, yy]); xx += sign * dx; yy += sign * dy;
                }
            }
            if (line.length >= 5) {
                this.outcome = color;
                this.winningLine = line;
                return true;
            }
        }
        if (this.moves.length === SIZE * SIZE) this.outcome = 0;
        return true;
    }
    undo() {
        if (!this.canUndo) return false;
        do {
            const [x, y] = this.moves.pop();
            this.board[y * SIZE + x] = 0;
        } while (this.moves.length && this.turn !== this.human);
        this.outcome = null;
        this.winningLine = [];
        return true;
    }
    canUndoLocal(ai) {
        const human = ai[1] !== ai[2] ? ai[1] ? 2 : 1 : null;
        return this.moves.length >= (human || 1);
    }
    undoLocal(ai) {
        if (!this.canUndoLocal(ai)) return false;
        if (ai[1] !== ai[2]) {
            this.human = ai[1] ? 2 : 1;
            return this.undo();
        }
        const [x, y] = this.moves.pop();
        this.board[y * SIZE + x] = 0;
        this.outcome = null;
        this.winningLine = [];
        return true;
    }
}
