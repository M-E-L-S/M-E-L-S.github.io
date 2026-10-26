const { CELLS } = await import('./halma-geometry.js' + new URL(import.meta.url).search);
const { createHalmaRules, SEATS } = await import('./halma-rules.js' + new URL(import.meta.url).search);
export { CELLS, SEATS };
export const { HalmaGame, NEXT } = createHalmaRules(CELLS);
export const NAMES = ['红方', '蓝方', '绿方', '黄方', '紫方', '橙方'];
export const BUDGETS = Object.freeze({
    simple: { label: '简单', soft_ms: 300, hard_ms: 1000 },
    fast: { label: '普通', soft_ms: 300, hard_ms: 1000 },
    light: { label: '高级', soft_ms: 1000, hard_ms: 3000 }
});

export function estimatedSteps(result, players = 2) {
    const steps = players > 2 ? result?.estimated_player_steps : result?.estimated_steps && [result.estimated_steps.red, result.estimated_steps.blue];
    if (!Array.isArray(steps)) return null;
    const values = Array.from({ length: players }, (_, i) => {
        const n = steps[i];
        return Number.isInteger(n) && n >= 0 ? ((result.estimated_lower_mask & (1 << i)) ? '≥' : '') + n : '—';
    });
    return values.every(value => value === '—') ? null : values;
}
