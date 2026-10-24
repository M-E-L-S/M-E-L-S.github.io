# Netlify 五子棋联机评估

核对日期：2026-10-24。此目录保留最初的评估、网络探针和复测脚本。实际的通用游戏房间实现现位于 [netlify-games](../netlify-games/README.md)，尚待账户部署；以下示例测试不等于正式后端验收。现有 Cloudflare 后端保持独立。

## 结论

**技术上可行，适合少量、间歇使用；不适合承诺长期不限量免费。** 推荐普通 Netlify Functions + Netlify Database（PostgreSQL）+ 短轮询，不照搬 Cloudflare Durable Object / WebSocket 房间。

Netlify 既能部署静态网页也能执行动态函数，但两者访问链路不同。开源静态站可以打开，不能证明动态函数、数据库唤醒和连续对局同样稳定。本次仅用自己的物理网卡链路测试官方函数示例，不能代替自己部署后的验收或多运营商、晚高峰测试。

## 免费套餐与主要限制

以下针对新账户的 Credit-based Free，不套用旧教程的 Legacy 125,000 次函数 / 100 GB 流量配额。

| 项目 | 官方当前说明 | 对本项目的影响 |
| --- | --- | --- |
| 免费总额度 | 每月 300 credits，硬上限、不可自动充值 | 函数、数据库、带宽、请求、发布共用额度 |
| 正式发布 | 每次 15 credits；预览/分支发布为 0 credits | 减少无意义的正式重发 |
| Web 请求 | 每 10,000 次 2 credits | 轮询、操作、预检等均应计入估算 |
| 计算 | 每 GB-hour 10 credits | 函数默认 1 GB；等待中的长请求也会消耗计算时间 |
| 流量 | 每 GB 20 credits | 小 JSON 响应有利于控制用量 |

来源：[套餐](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)、[credits 计量](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)。额度为团队共享，不能按每个站点各 300 credits 计算。

数据库是主要成本：Free 固定 1 compute unit，活动时间每小时消耗 10 credits，空闲 5 分钟才休眠。因此仅数据库理论上就会在 30 活动小时消耗完 300 credits，实际还要扣除其他用量。多个房间共享数据库活动时间，不是每个房间各计一份；但闲置页面持续轮询会让数据库保持活动。Free 另有数据库每周期 48 compute-unit-hours、5 GB 存储等硬限制，不能把这些上限视为额外赠送 credits。

来源：[数据库计费和限制](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/)、[Free 计算规格](https://docs.netlify.com/build/data-and-storage/netlify-database/configure-auto-scale/)。官方数据库页面仍包含已经过去的存储免费截止日期，当前存储计费需以账户控制台为准，不在此承诺免费。

普通函数默认部署在美国 Ohio，默认 1 GB、同步请求上限 60 秒；自选地域标注为 Pro / Enterprise 功能。因此不能把免费函数直接按“新加坡或东京节点”估算延迟。本次官方示例的套餐和函数执行地域未知，DNS 接入 IP 也不代表函数执行位置。

来源：[函数配置](https://docs.netlify.com/build/functions/configuration/)。

## 适配架构

- 前端继续放 GitHub Pages，使用标准 `fetch` 调用独立 Netlify 五子棋 API。函数内处理 `OPTIONS` 与精确的来源响应头，不依赖前端 SDK 或购买域名来添加调用来源。
- PostgreSQL 保存房间、双方席位的凭据摘要、局面 revision、协商状态、最近操作 ID 与到期时间。事务/行锁协调加入和落子；操作 ID 防止响应丢失后重复执行。
- 前台约 3 秒同步一次，操作立即返回局面；每次请求结束后再安排下次请求，错误退避。后台降频或停止，长时间无操作停止轮询，避免闲置标签页让数据库整天活动。
- 重连凭据按后端、房间独立持久化；服务端校验轮次、座位、租约和权限，不能信任请求中的玩家颜色或 uid。关闭标签页后通过原浏览器恢复。
- 不使用常驻函数内存保存棋局；不同函数实例和冷启动不共享内存。也不通过长轮询 / SSE 常驻函数来假装免费推送。
- 不直接使用 Blobs 的读改写保存完整房间。官方明确其为 last-write-wins，强一致读取并不提供原子并发控制，双人同时加入或落子会存在覆盖风险。

来源：[Netlify Blobs 一致性与限制](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)、[托管 PostgreSQL](https://docs.netlify.com/build/data-and-storage/netlify-database/)。

以上是初步设计建议，实际已编写的接口、原子提交和暂停策略以 [netlify-games/README.md](../netlify-games/README.md) 为准；尚未部署正式联机后端。

### 能否持续监听

可以在一次函数调用中监听变化，并用 SSE 向该浏览器推送；并非技术上完全不能推送。但流式函数最长执行 60 秒，必须重新连接并补齐期间遗漏的 revision；仅在函数内监听数据库也不会自动建立浏览器推送通道。15 分钟后台函数不能返回流式响应，不能用它延长浏览器监听。

在默认 1 GB 规格下，两位玩家各自持续保持一个流式函数一小时，函数计算约消耗 20 credits，数据库和其他请求另计。这是按持续执行时间的估算，不是已部署测得的账单。因此当前优先建议短轮询；如后续选择 SSE，还需验证断流重连、遗漏补偿、并发实例和真实 credits，而不能认为空闲监听不计费。

来源：[流式函数 60 秒时限](https://docs.netlify.com/build/functions/api/)、[后台函数不支持流式响应](https://docs.netlify.com/build/functions/background-functions/)、[函数计费](https://docs.netlify.com/build/functions/usage-and-billing/)。

以上时限和 20 credits 估算针对普通 Serverless Functions，不能套用到 Edge Functions。官方将 Edge 计入 Web requests，不计普通函数 compute；其约束包括每请求 50 ms CPU 和 40 秒响应头时限，等待外部资源不计 CPU。Edge 流式监听是值得另外验证的候选方案，但不能从这些文档就推断允许无限时长连接，或已经提供数据库实时订阅。当前探针和实测只覆盖普通 HTTP 函数，不覆盖 Edge SSE / 数据库监听。参见[Edge 限制](https://docs.netlify.com/build/edge-functions/limits/)、[credits 计量](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)。

## 网络实测

测试目标为 Netlify 官方维护的 [Hello Functions 示例](https://github.com/netlify/example-hello-world-functions)，不是随意挑选的第三方服务。

执行方式：现有 `curl.exe --noproxy '*' --ipv4`，并绑定物理以太网的本地 IPv4；未更改用户代理、DNS 或路由。系统代理当时开启，但 curl 明确绕过；活动网卡有 Tailscale，检查到的 IPv4 默认路由走物理以太网，没有 0/1、128/1 的出口路由。此证据限定在本机当时链路，不能据此证明全国所有运营商或完全排除上游网络设备影响。

每次带随机查询参数，动态接口需回显相同 nonce，避免把 CDN 的旧响应当作云函数成功。POST 使用 JSON，预检携带本站 Origin / POST / content-type。

官方示例回显的是查询参数；其 POST 测试证明携带 JSON 的 POST 能到达动态函数，不证明示例解析了 JSON 请求体。自有探针的 POST 才会解析并回显请求体中的 nonce。

两轮共 140 次请求全部 HTTP 成功，动态 GET、POST 回显均正确。两轮采样窗口覆盖北京时间 2026-10-24 17:15:56 至 17:20:38，并非持续整天监控。追加批次每 5 秒一轮，共 30 轮。

| 请求类型 | HTTP 成功数 | 中位延迟 | P95 | 最大延迟 |
| --- | --- | --- | --- | --- |
| 静态页面 | 42 / 42 | 447 ms | 842 ms | 1232 ms |
| 动态 GET | 42 / 42 | 820 ms | 1279 ms | 1309 ms |
| 动态 POST | 42 / 42 | 633 ms | 1004 ms | 1095 ms |
| OPTIONS | 14 / 14 | 803 ms | 1051 ms | 1051 ms |

**官方示例未配置跨域响应头，故这些请求的 CORS 检查全部不通过。**这证明 HTTP 链路可达，不能证明从 GitHub Pages 的浏览器调用已通过。不能用 HTTP 200 代替 CORS 成功。下面的自有探针已在本地检查预检、JSON POST、来源拒绝和请求体上限，部署后仍需实测。

原始数据在 `results/`；追加低频复测结果见同目录 JSON。尚未测试自己的站点、数据库冷启动、事务并发、真实建房落子、跨设备重连或多运营商网络。结论是“当前链路短时可达”，不是“境内长期稳定已验证”。

## 部署最小探针后复测

`probe/` 是独立的无依赖 Netlify 项目：只回显 nonce 和服务端时间，不保存棋局、不调用数据库。没有安装 Netlify CLI，也没有创建/发布任何 Netlify 站点。

在 Netlify 新建项目并导入包含本目录的 Git 仓库：

1. Base directory 设为 `netlify-evaluation/probe`。
2. Build command 留空，Publish directory 为 `public`，Functions directory 为 `netlify/functions`（均已写在该目录 `netlify.toml`）。
3. 部署后打开站点，关闭代理，点击“运行 20 轮测试”。
4. 将本地物理网卡直连、浏览器原网站跨域、手机移动网络分别测试。浏览器同源页面测试不会自动覆盖跨域预检，需要下述脚本及浏览器跨域测试。

不要直接把源码目录拖进静态站上传入口：这种方式不能保证构建部署云函数。无需配置账户密钥到前端，也不必现在创建数据库。

从仓库根目录复测自己的站点：

```powershell
node netlify-evaluation/check-network.mjs site=https://你的站点.netlify.app rounds=30 interval=5000 output=build/netlify-own-network.json
```

脚本明确禁用显式代理，但不能关闭系统 VPN/TUN。要限定物理网卡，可额外传 `interface=本机物理网卡IPv4`；该地址不写入报告。脚本默认验证 GitHub Pages 的 Origin，也可用 `origin=http://localhost:12001` 检查本地来源。它会记录 HTTP、JSON 回显、预检必要响应头、延迟、错误与 Netlify 请求 ID。

探针可达之后，再小规模接入数据库，验收同 revision 的并发提交只有一次成功、双人抢席位、重试幂等、身份恢复和到期，并观察真实函数延迟与 credits。此步骤需要实际账户/站点，不能从官方演示推断已通过。
