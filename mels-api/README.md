# MELS Aicu Worker

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
