// A move is a sequence of landings. Sound is emitted at each landing, never
// once for the whole move; cancellation also stops pending silent-mode timers.
export class MovePlayback {
    constructor(piece, points, sound, { reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches, timers = globalThis } = {}) {
        Object.assign(this, { piece, points, sound, reduced, timers });
        this.generation = 0; this.busy = false; this.animation = null; this.timer = null; this.release = null;
    }
    cancel() {
        ++this.generation; this.animation?.cancel(); this.animation = null;
        this.timers.clearTimeout(this.timer); this.timer = null; this.release?.(); this.release = null;
        this.busy = false; this.piece.hidden = true; this.sound.stop();
    }
    async play(move, color) {
        this.cancel(); const generation = this.generation;
        this.busy = true;
        const animated = !this.reduced() && typeof this.piece.animate === 'function';
        const duration = Math.min(180, 1600 / Math.max(1, move.path.length - 1));
        this.piece.style.setProperty('--piece', color); this.piece.hidden = !animated;
        try {
            for (let i = 1; i < move.path.length; ++i) {
                const start = this.points[move.path[i - 1]], end = this.points[move.path[i]];
                if (animated) {
                    this.animation = this.piece.animate([
                        { left: start[0] + '%', top: start[1] + '%' }, { left: end[0] + '%', top: end[1] + '%' }
                    ], { duration, easing: 'ease-in-out', fill: 'forwards' });
                    await this.animation.finished;
                    if (generation !== this.generation) return false;
                    this.piece.style.left = end[0] + '%'; this.piece.style.top = end[1] + '%';
                    this.animation.cancel(); this.animation = null;
                } else {
                    await new Promise(resolve => { this.release = resolve; this.timer = this.timers.setTimeout(resolve, duration); });
                    if (generation !== this.generation) return false;
                    this.timer = null; this.release = null;
                }
                this.sound.play('stone');
            }
            return true;
        } catch (error) {
            if (generation === this.generation) throw error;
            return false;
        } finally {
            if (generation === this.generation) { this.busy = false; this.piece.hidden = true; }
        }
    }
}
