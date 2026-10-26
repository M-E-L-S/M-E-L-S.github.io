# MELS 游戏联机后端（Netlify）

这是独立的通用房间服务，注册五子棋和中国跳棋；Cloudflare 后端及 Aicu 转发独立部署。Netlify 不部署整站、不接入 Aicu、不安装全局 CLI。

跳棋复用现有数据表、身份、租约和同步机制，按开局配置分配 2/3/4/6 席位，无新增数据库迁移。`shared/halma-room.js` 与 Cloudflare 共用权威规则，支持镜像、先手、房主选色，以及全员协商悔棋/重开。相同申请的并发投票通过申请编号合并，旧申请的投票不能批准后续申请；落子等命令仍严格校验版本。动态多人游戏最多进行 8 次 CAS 尝试，固定双人五子棋仍为 4 次。

## 需要你配置的内容

多人 AI 与换色更新仍复用现有数据表和绑定，无新增迁移。真人加入会跳过房主指定的 AI 席位；AI 着只接受房主身份，计算发生在房主浏览器。悔棋/重开只统计真人投票，交换颜色只需双方确认。旧房间保留旧棋谱布局，重开后使用新版顺时针布局。前后端均需更新后才能使用这些协议。

先把本次代码提交/推送到 GitHub，再在 Netlify **Add new project → Import an existing project** 中选择此仓库。选择 Free，部署配置填写：

| 项目 | 值 |
| --- | --- |
| Base directory | `netlify-games` |
| Build command | 留空 |
| Publish directory | `public`（相对于 Base directory） |
| Node.js | 22，最低 22.12；已在配置中指定 |
| 配置文件 | 此目录 `netlify.toml` |

只需一个 Netlify 项目，名称可以用 `mels-games`，被占用时加后缀。不要把仓库根目录或旧的 `netlify-evaluation/probe` 当作这个后端的部署目录；不要使用静态文件拖放上传来代替 Git 构建云函数。

项目含 `@netlify/database` 和 `netlify/database/migrations/0001_rooms.sql`。按当前官方流程，首次部署会自动开通托管 PostgreSQL 并执行迁移，无需手工建表、填写数据库密码或开启匿名登录。如果账户未自动创建数据库，进入 **Data & Storage → Database → Create a database manually** 后重新部署一次。数据库连接信息由平台提供，不要放进前端配置或发送到聊天中。

官方参考：[自动建库与手动入口](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/)、[自动迁移](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)。控制台如出现付费升级提示，先停止对应配置，不需要为了本实现升级套餐。

部署成功后：

1. 打开 `https://你的站点.netlify.app/api/rooms?health=1`，应看到 `ok: true`、`games: ["gomoku", "halma"]`。此检查不访问数据库；它不能证明数据库迁移已成功。
2. 将公开站点地址发来，或自己修改仓库根目录 `assets/data/netlify-games.json`：

```json
{
  "endpoint": "https://你的站点.netlify.app/api/rooms"
}
```

3. 在仓库根目录运行 `node scripts/build.cjs` 并发布 GitHub Pages。只改前端 endpoint 不需要重新发布 Netlify 后端。
4. 本地仍使用 `http://127.0.0.1:12001/minigame/gomoku/`，选择「Netlify 联机」。两位玩家使用不同浏览器身份/隐私窗口。新建房间成功才是数据库链路的第一次端到端验证。

默认已允许 `https://m-e-l-s.github.io`、`http://localhost:12001`、`http://127.0.0.1:12001` 和后端同源来源，不需要在控制台购买/配置跨域域名。以后更换网站域名时，才设置 Functions 环境变量 `GAME_ALLOWED_ORIGINS`，多个完整来源以逗号分隔，并重新部署。

不要给这个游戏 API 启用访客密码或团队登录保护，否则公开网页无法调用。无需购买域名、开通其他外部数据库或实时消息服务。Git 部署预览与生产数据库分支相互隔离；生产前端应填写正式站点地址。

## 额度控制

- 前端只在实际连接 Netlify 时读取一次公开配置；不下载前端 SDK，不额外登录或建立 WebSocket/SSE 连接。
- 所有操作使用 `text/plain` 携带 JSON 的简单 POST；凭据只在 HTTPS 请求体内，避免 URL 泄漏，也避免为每个请求增加跨域预检。仍支持必要的 OPTIONS。
- 建房/加入/操作直接返回最新局面，不再立即补发一次同步。客户端按队列串行请求，不重叠轮询。
- 五子棋等待对方或处理协商时约 3 秒同步；自己思考约 6 秒，等待加入或结束后约 10 秒。60 秒没有棋局变化/本地操作后降到约 15 秒；有随机抖动。
- 约 5 分钟无变化/操作，最后同步确认后暂停；手动「重新连接」继续。页面隐藏时停止轮询并尽力标离线，返回前台再恢复。切换游戏、后端或离开页面时停止定时请求。
- 网络失败指数退避，约 30 秒封顶；首次连接失败重试 open，不对尚未加入的房间反复 sync。未配置时直接停止，不重试下载配置。
- 无变化同步只返回时间、到期与同步标识，不重发棋谱。数据库读取也省略操作去重历史；续租的 SQL 保留这段历史，避免破坏幂等。
- 不单独发送心跳：同步时每 30 秒最多续租一次；其他同步只读。在线判定租约 90 秒，异常关闭可能要等租约到期才能显示离线。
- 房间固定 24 小时到期。过期后立即拒绝访问；物理清理在后续真实建房请求中限量执行，每表最多 32 行，带过期索引。没有 cron、后台常驻函数或定期扫库；没有后续建房时，过期数据可能继续占用少量存储。
- 入口配置每 IP/域名约 180 请求/分钟；共享房间服务每 IP 每小时最多建 10 个房间，成功游戏操作每席最多 20 次/10 秒。这些防滥用限制不是无限并发保证。
- `/api/rooms?health=1`、非法来源、预检和明显非法请求不创建数据库客户端，避免健康监控反复唤醒数据库。平台网关限流可能短暂延迟生效。
- Git 自动部署比较后端目录和共用棋规模块；仅改前端、此 README 或测试时跳过后端发布，避免不必要的正式发布额度。首次/无缓存部署照常执行；配置修改后需要重发同一份代码时，使用 Netlify「Retry without cache」，或临时设置构建环境变量 `FORCE_BACKEND_DEPLOY=1`，完成后移除。今后新增规则如果引用后端目录之外的共用模块，须把该依赖加入 `ignore-build.mjs` 的比较范围。

免费额度仍由团队内各项目共享，数据库在活跃期间仍计费。建议在 Netlify Usage & billing 观察实际 Compute、Web requests、Bandwidth，保留默认数据库空闲休眠设置，不开启常驻计算或自动充值。普通前端页面修改无需跟随重发后端。

## 房间与身份

`/api/rooms` 是统一入口。请求包含 `game`、`action`、房间码、256-bit 席位凭据和单次连接标识；修改游戏状态还需当前 revision、128-bit 操作 ID 和游戏命令。

凭据摘要、租约、去重记录只保存在私有数据库 JSON 中。客户端不能直接访问数据库；公开局面由规则模块按玩家席位生成。每个成功游戏命令通过带 version 条件的原子 SQL 更新提交；其他实例抢先更新时重新读取校验，不使用进程内锁。

同席位新的 open 接管旧连接；旧连接随后同步会停止，不自动抢回，用户可手动重新连接。收到迟到的旧房间响应不会覆盖当前房间。操作响应丢失只重试一次，并复用操作 ID 防止重复执行。

前端身份按 `Netlify + game + room` 持久化。邀请格式为 `#backend=netlify&room=...`，不包含凭据；关闭标签页后同浏览器、同来源打开邀请可恢复。Cloudflare 的 `#room=...` 邀请与原存储独立，不迁移正在进行的对局。清除浏览器存储后无法恢复原席位。

## 增加其他游戏

共用部分为 `core.mjs`（身份、租约、版本、幂等）、`repository.mjs`（原子提交/限额）、`http.mjs`（协议/CORS）、`src/scripts/game-room-client.js`（同步、存储、重连）。数据库使用通用 `game_rooms`、`game_limits`，函数和项目也不绑定五子棋名称。

新游戏增加 `games/<id>.mjs` 并在 `registry.mjs` 注册，规则模块实现：

```js
{
  seats: 2,                         // 也支持其他固定席位数，或 state => state.playerCount
  initial(options) { /* 初始私有状态 */ },
  snapshot(state, view) { /* 当前席位可见的 JSON 局面 */ },
  apply(state, command, view) { /* 校验并同步修改状态 */ }
}
```

`view` 提供 seat、joined、online。规则模块不得做外部 I/O 或依赖进程内全局状态；CAS 冲突时 apply 可能重新执行。对非法命令抛出带 `expected: true` 的错误。snapshot 返回 `players`、`joined` 数组及游戏自己的界面字段，可选 `pollAfterMs`；不要覆盖公共 room/game/revision/expiresAt/sync 字段，也不要暴露私有牌面、凭据或其他玩家隐藏状态。

前端复用 `GameRoomClient({ game: '<id>', ... })`；游戏文案和界面适配独立实现。`gomoku-netlify.js` 仅提供五子棋错误文案；棋规在 `games/gomoku.mjs`。现有测试还注册了一个三席位游戏检查公共层没有写死双人棋类。

## 本地验证与当前边界

```powershell
npm --prefix netlify-games ci --ignore-scripts
npm --prefix netlify-games test
node scripts/check-i18n.cjs
node scripts/check-gomoku-reconnect.cjs
node scripts/build.cjs
node scripts/check.cjs
```

依赖只位于 `netlify-games/node_modules/`；沿用现有 npm 正常缓存，不安装 Netlify CLI 或系统数据库服务。测试使用内存中的 PGlite PostgreSQL，验证实际 SQL、CAS 冲突、并发席位/限额、去重、协商、到期清理以及 Netlify SDK 结果类型；客户端用可控时钟验证暂停、退避、单次轮询和重连。它们不能代替真实托管 PostgreSQL 的网络、连接数和平台并发验收。

正式接口已配置为 `https://m-e-l-s.netlify.app/api/rooms`。2026-10-24 在本机物理网络接口上绕过显式代理，完成 33 次真实部署请求：健康检查、生产站及本地来源预检、建房加入、同步、双方落子、重复操作去重、非法操作拒绝、悔棋协商、重开换色、获胜判定、连接接管与离开后恢复均通过。该次短测中位耗时 706 ms，P95 为 1234 ms；不能代表不同境内运营商、晚高峰或长期可用性。

网页端另用 `127.0.0.1:12001` 和 `localhost:12001` 两个独立来源连接真实后端，验证建房、邀请加入、双方落子同步及刷新恢复原席位与棋谱。仍需两台设备、不同运营商以及关闭标签页后重新打开邀请、后台再返回等实际场景验收。之前官方示例的直连测试见 `../netlify-evaluation/README.md`。

需要再次验收部署时，可在仓库根目录手动运行：

```powershell
node netlify-games/test/live.mjs
```

这是可选的真实云端测试，不包含在 `npm test` 中。每次创建一个 24 小时测试房间，最后关闭双方连接；会消耗真实请求和数据库计算额度，不要定时运行。它使用现有 curl 绕过显式代理，可用 `interface=<本机网卡地址>` 绑定指定网络接口。只保存脱敏状态与耗时到被忽略的 `build/netlify-live-results.json`，不输出或保存席位凭据。
