/* The C++ core uses classical-v2 by default. No network weights are loaded. */
const version = new URL(self.location.href).search;
importScripts('gomoku_wasm.js' + version);
const ready = createGomoku({ locateFile: (name, prefix) => `${prefix}${name}${version}` });
self.onmessage = async ({ data }) => {
    const { id, moves, limits = {} } = data;
    try {
        const engine = await ready;
        engine._gm_reset();
        if (!Array.isArray(moves)) throw new Error('moves must be an array');
        for (const move of moves) {
            // Check before i32 conversion, which would wrap large JS coordinates.
            if (!Array.isArray(move) || move.length !== 2 ||
                !move.every(n => Number.isInteger(n) && n >= 0 && n < 15) ||
                engine._gm_play(...move) < 0) throw new Error('illegal move record');
        }
        const { depth = 64, nodes = 0, soft_ms = 3000, hard_ms = 12000, beginner = false, beginner_seed } = limits;
        if (![depth, nodes, soft_ms, hard_ms].every(Number.isInteger) ||
            depth < 1 || depth > 225 || nodes < 0 || nodes > 0xFFFFFFFF ||
            soft_ms < 0 || hard_ms <= 0 || hard_ms > 60000 || soft_ms > hard_ms || typeof beginner !== 'boolean' ||
            beginner_seed !== undefined && (!beginner || !Number.isInteger(beginner_seed) || beginner_seed < 0 || beginner_seed > 0xFFFFFFFF)) throw new Error('invalid limits');
        // Seeded in JS so every browser move gets fresh entropy without passing
        // a 64-bit integer through the i32 ABI or losing JSON integer precision.
        const status = beginner
            ? engine._gm_search_beginner(depth, nodes, soft_ms, hard_ms, beginner_seed ?? crypto.getRandomValues(new Uint32Array(1))[0])
            : engine._gm_search(depth, nodes, soft_ms, hard_ms);
        if (status < 0) throw new Error('invalid search limits');
        self.postMessage({ id, result: JSON.parse(engine.UTF8ToString(engine._gm_result())) });
    } catch (error) {
        self.postMessage({ id, error: String(error.message ?? error) });
    }
};
