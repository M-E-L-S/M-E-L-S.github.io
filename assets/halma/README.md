# 中国跳棋 AI

来自本机 `D:/codes/Py/AI 2025/Halma/build/wasm` 的多人版完整运行链：
`halma.wasm`、`halma.js`、`api.js`、`worker.js`、`client.js`。
经典手写评估、单线程 Worker，无神经网络权重或服务器推理。

运行文件按原样复制，仅把 `client.mjs` 改名为 `client.js`，以兼容本网站的静态服务 MIME。
`manifest.json` / `SHA256SUMS.txt` 为本次网站运行文件的清单，记录实际分发文件的校验值。
旧 `dist/halma-wasm-v1` 发布包不包含多人搜索，更新时应确认产物支持 2/3/4/6 人。
`licenses/` 保留 Halma MIT 许可、Emscripten 及 libc++ 许可。

更新时整体复制同一版运行链及许可证，再运行 `node scripts/check-halma.mjs`、
`node scripts/build.cjs` 和 `node scripts/check.cjs`。
构建哈希涵盖前端模型、几何、SDK、Worker、协议适配和 WASM；版本查询串沿加载链传递。
`src/scripts/halma-geometry.js` 的格号与上游 `engine/geometry_data.h` 一致，由测试对照 WASM hello 验证。

页面在任意人数的首个 AI 回合才加载引擎；简单/普通为 300/1000ms，高级为 1000/3000ms。
切走、隐藏页面、悔棋、重开、切换规则或 AI 开关会终止旧 Worker。
局面显式传递 `players`；座位 1…6 对应引擎 side `[1,-1,2,3,4,5]`，历史帧仍使用棋盘字符 1…6。
多人使用 Paranoid AB，保留根部终盘规划。三人出发营 `[3,1,5]`，四人 `[0,5,3,2]`，六人 `[0,5,4,3,2,1]`，均顺时针。
联机 AI 只由房主浏览器计算并提交，服务端校验宿主权限、AI 席位、回合与着法；访客不加载引擎。
`scripts/fixtures/halma-native.json` 保存 175 项原生对照，规则测试另逐局面对照实际 WASM。
预计剩余步数以搜索开始时的棋盘为准，不加搜索深度、不减已执行的一手，也不作为必胜证明。
