import gomoku from './games/gomoku.mjs';
import halma from './games/halma.mjs';
// Room lifecycle and transports are shared; game rules live in these adapters.
export const games = Object.freeze({ gomoku, halma });
