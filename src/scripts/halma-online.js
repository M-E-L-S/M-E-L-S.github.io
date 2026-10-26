const version = new URL(import.meta.url).search;
const { OnlineGame } = await import('./gomoku-online.js' + version);
const { GameRoomClient } = await import('./game-room-client.js' + version);
const messages = {
    illegal_move: '该位置不能落子或尚未轮到你', opponent_offline: '有玩家未在线，等待重连',
    offer_pending: '请先处理当前申请', nothing_to_undo: '还没有可撤回的落子',
    invalid_offer: '申请已失效，请重试', host_only: '只有房主可以修改开局设置',
    restart_required: '已有玩家加入，更改设置需全员同意重开', invalid_options: '开局设置无效，请重新选择',
    seat_occupied: '已有玩家的席位不能改为 AI', invalid_swap: '请选择另一位在线玩家交换颜色'
};
export class CloudflareHalma extends OnlineGame {
    constructor(onChange) { super(onChange, { game: 'halma', messages }); }
}
export class NetlifyHalma extends GameRoomClient {
    constructor(onChange) { super({ game: 'halma', onChange, messages }); }
}
export const roomMessage = code => messages[code];
