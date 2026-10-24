const version = new URL(import.meta.url).search;
const { GameRoomClient } = await import('./game-room-client.js' + version);
export class NetlifyGomoku extends GameRoomClient {
    constructor(onChange) {
        super({ game: 'gomoku', onChange, messages: {
            illegal_move: '该位置不能落子或尚未轮到你', opponent_offline: '对方已断线，等待重连',
            offer_pending: '还没有处理完当前申请', nothing_to_undo: '还没有可撤回的落子',
            invalid_offer: '申请已失效，请重试', host_only: '只有房主可以选择下局执棋', restart_required: '更换执棋颜色需要申请重开'
        } });
    }
}
