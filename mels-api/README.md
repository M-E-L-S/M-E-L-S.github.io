# MELS API Worker

## 五子棋双人联机

沿用此 Worker，无需新建 Worker 项目。`src/gomoku-router.js` 将 `GET /api/gomoku/rooms/<20位房间码>` 的 WebSocket 握手转发到 `GOMOKU_ROOMS`，每个房间对应一个 `GomokuRoom` SQLite Durable Object。`wrangler.jsonc` 包含绑定、`gomoku-v1` 迁移和连接限流配置，兼容 Workers Free 的 SQLite DO。前端代码为仓库根目录的 `src/scripts/gomoku-online.js`；线上沿用 `https://mels-api.3209692800.workers.dev`。

先在本目录运行 `npm test`，再用 `npm run deploy` 发布后端；随后在仓库根目录运行 `node scripts/build.cjs` 并发布 GitHub Pages。只发布前端不会启用线上联机。已有 Aicu Secrets 和授权逻辑不变，五子棋不使用 Aicu 的共享密码。

本地测试开两个终端：本目录 `npm run dev`，仓库根目录 `python -m http.server 12001`。浏览器访问 `http://127.0.0.1:12001/minigame/gomoku/`，选择“双人联机”；本地前端自动连接 `http://127.0.0.1:8780`。8787 在此 Windows 机器上属于系统保留端口，因此配置使用 8780。Worker 的本地地址才允许 localhost/127.0.0.1 页面来源；生产仅允许本站来源。

测试命令：`npm test` 包括休眠后重新构造实例、重放与非法落子、双方协商、离线暂停、限流、清理和既有 Aicu 授权回归；启动本地 Worker 后，`npm run test:gomoku:integration` 用 Wrangler 已安装的 ws 客户端检查真实 Workers 运行时的双人对局、重连、满房、重复凭据接管与自动 ping/pong。可选参数为另一个本地 WebSocket origin，例如 `npm run test:gomoku:integration -- ws://127.0.0.1:8780`。

### 协议与保存内容

房主生成随机 80-bit 房间码与 256-bit 重连凭据，通过 `?create=1&color=1|2` 创建。好友提供房间码，自动获得空座位。浏览器以 `gomoku.v1` 和 `token.<随机凭据>` 子协议握手；服务端只回显 `gomoku.v1`，持久化凭据的 SHA-256 摘要。原始凭据仅保存在当前标签页的 sessionStorage，不写入链接、查询串或应用日志。邀请链接只带房间码，知道房间码的人可占用尚未加入的座位；没有观战或账号系统。离开房间会清除本标签页的凭据；想保留座位应使用刷新或自动重连。已占用座位不向第三人重新分配，直到房间到期。

服务端存储局面、两席凭据摘要、房主凭据摘要、递增 revision、待确认申请与固定到期时间；每次落子和协议操作都校验身份、轮次、坐标和 revision。落子以服务端确认为准。双方在线才接受落子，悔棋/重开必须由对方接受；申请者可取消。悔棋返回申请者上次落子之前（包含之后的应手），终局也可协商悔棋或重开。房主等待好友时可直接更换执棋；已有两名玩家时，可在重开申请中附带 `hostColor`（1/2），对方同意后清空棋盘并交换两席及连接附件的颜色。重连凭据不变。普通玩家不能指定房主颜色。旧格式房间没有可靠的房主身份，因此保持原色；新建房间后可使用换色功能，不推断或允许自报房主。

邀请链接使用 `#room=`；片段变化不保证触发整页加载，因此页面监听房间片段、前进/后退及缓存恢复事件。切换房间时终止旧连接、清空旧局面，标签页内最多保留 8 个房间的凭据，以支持返回旧房间。显式“离开房间”只清除当前房间的凭据，其他房间的记录保留。

每席最多一个活动连接，相同凭据的新连接关闭旧连接（4001，旧端不自动重连）。暂时掉线指数退避重试最多 5 次，可手动重连；离开游戏关闭连接，单纯后台标签页继续保持连接。刷新会恢复联机模式和凭据。没有计时判负或断线判负。

### 额度控制

- `ctx.acceptWebSocket()` 与 `webSocketMessage/Close/Error` 使用 Hibernation API，不使用服务端轮询、`setInterval` 或常驻任务。`serializeAttachment()` 保存连接身份和短时消息计数，休眠后构造函数从一条持久化快照恢复局面。
- 浏览器每 45 秒发送 `ping`，由 `setWebSocketAutoResponse()` 自动回复 `pong`，不唤醒 DO、不写数据库。这避免保活带来持续运行时长；不承诺应用消息没有请求额度消耗。
- 只有成功变更房间/棋局才保存快照；连接在线状态只取自当前 sockets，不持久化。无效操作、断线、广播、ping/pong 不写棋局记录。重连凭据已存在时也不重写记录。
- 每房间只有一个 24 小时绝对到期 alarm，与首次快照事务式保存，不按手数或心跳重设，不循环续期。到期关闭连接并 `deleteAll()`，不保留历史棋谱。
- 握手每 IP 每分钟 20 次，创建房间每边缘位置每分钟 10 次；这些都是 Cloudflare Rate Limit 的近似计数，不是严格全局配额。每连接最多 30 条业务消息/10 秒，单消息最多 512 字符，额外连接与非法输入拒绝。

Cloudflare 的 Hibernation 免除符合休眠条件的空闲持续时长，不免除所有消息、握手、alarm 和存储额度；还需留意既有 Worker 的 100% invocation logs 设置。此变更没有调整 Aicu 的现有日志配置，也没有为五子棋增加应用日志。定价与额度以 [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) 和 [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) 为准。

## 授权配置与发布

首次发布此版本前，在 Cloudflare Dashboard 的 Worker 设置中添加以下 **Secret**（不要设为普通变量或写进 Git）：

- `AICU_ACCESS_PASSWORD`：共享访问密码，16–512 字符，建议使用密码管理器生成的随机值。
- `AICU_TOKEN_SECRET`：独立随机签名密钥，至少 32 字符，建议 32 随机字节的 Base64 编码。不要与访问密码相同。
- `AICU_AUTH_VERSION`：授权版本，例如 `1`。升级版本可撤销所有旧令牌。

也可以在本目录执行 `npx wrangler secret put AICU_ACCESS_PASSWORD`、`npx wrangler secret put AICU_TOKEN_SECRET`、`npx wrangler secret put AICU_AUTH_VERSION`，通过交互输入值，避免密码出现在命令历史中。

先配置 Secrets，再 `npm run deploy` 发布 Worker（会创建配置中的两个登录限流绑定），最后发布 GitHub Pages 前端。仅更新前端不会保护仍运行旧代码的公开 Worker。缺少授权配置时，新 Worker 返回 503 并拒绝查询。

`POST /api/aicu/auth/login` 接受 JSON `{ "password": "…" }`，成功返回 `token` 和毫秒时间戳 `expiresAt`；`GET /api/aicu/auth/session` 及四个数据接口均要求 `Authorization: Bearer <token>`。所有令牌固定 24 小时有效，无滑动续期，权限仅为 `aicu:read`。密码只出现在 HTTPS 请求体，令牌不进入 URL；应用不记录二者。

HMAC 签名密钥由独立 Secret、访问密码及授权版本派生，因此**修改任意一个都会使旧令牌失效**，无需额外清缓存。前端将令牌保存在 `localStorage`，进功能时验证，401 时清除并锁定；跨标签页退出会同步锁定。退出授权仅清除当前浏览器凭证，复制走的令牌仍需到期或通过轮换撤销。

登录限制为每 IP 每分钟 5 次、每边缘位置合计每分钟 30 次（包含成功尝试），绑定缺失或异常时拒绝登录。Cloudflare Rate Limit 是边缘位置的宽松计数，并非严格全局配额。查询仍先鉴权、再读共享缓存，缓存未命中才消耗查询额度。

运行 `npm test` 验证签名、过期、撤销、鉴权先于缓存、登录请求大小和限流、跨域预检。测试密钥仅为测试夹具，不能用于部署。本地调试 Secrets 放 `.dev.vars`，该文件已忽略。

独立部署的 Cloudflare Worker，前端地址配置在 `src/scripts/aicu.js`（仓库根目录）。

源码、`wrangler.jsonc`、包清单和 lockfile 应提交 Git；`node_modules/`、`.wrangler/`、`.dev.vars*`、`.env*` 已由本目录的 `.gitignore` 排除。配置中的 Rate Limit namespace ID 是绑定标识，不是访问密钥。不要在源码或 Wrangler 配置中添加 API token；敏感值使用 Wrangler secrets。

在本目录执行 `npm ci` 安装依赖，`npm run dev` 本地运行，`npm run deploy` 单独发布 Worker。GitHub Pages 发布不会部署 Worker。

四条 GET 路由：`/api/aicu/replies`、`/api/aicu/video-danmaku`、`/api/aicu/history`、`/api/aicu/assets`。均需要 `uid`。前两条支持 `pn`、`ps`、`keyword`。优先 v3，失败回退 v4；只缓存完整成功结果，缓存未命中才消耗 Rate Limit 额度。
