// Only live, contiguous room updates make sounds; reconnect snapshots stay quiet.
export function onlineFeedback(previous, next) {
    if (!previous?.connected || !next.connected || previous.room !== next.room) return null;
    const before = previous.moves, after = next.moves;
    const prefix = Math.min(before.length, after.length);
    for (let i = 0; i < prefix; i++) if (before[i][0] !== after[i][0] || before[i][1] !== after[i][1]) return null;
    if (after.length === before.length + 1) return 'stone';
    if (after.length < before.length) return previous.offer?.kind === 'restart' && !after.length ? 'start' : 'undo';
    return null;
}
