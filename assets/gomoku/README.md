# 五子棋经典引擎

`gomoku_wasm.js`、`gomoku_wasm.wasm` 复制自本机 `D:/codes/Py/AI导论 2025/gomoku/build/wasm/`（2026-10-23 构建）。调用该项目 `src/platform/c_api.cpp` 导出的 reset/play/undo/search/search_beginner/result，使用 `classical-v2` 手写评估、迭代加深及 Alpha-Beta 搜索。不使用 CNN/NNUE 模型或外部服务。

WASM SHA-256：`6f7932df94aaa1e6e62bd0d388e2bb2ff7909638555a9cf8c34cc0654662848f`。

更新时先在原项目使用已有 Emscripten 工具链运行 `tools/build-wasm.ps1`，再将上述两个产物复制到本目录。同步用原生引擎运行 `tools/wasm-fixtures.py`，将结果复制到本站 `scripts/fixtures/gomoku-native.json`，执行 `node scripts/check-gomoku.mjs` 和 `node scripts/build.cjs`。本次原生对照数据取自原项目 `docs/experiments/nnue-pilot-20261022/native-fixtures.json`，仅包含经典评估预期结果。

“简单”使用新增 C ABI `gm_search_beginner(depth, nodes, soft_ms, hard_ms, uint32_seed)`。保持引擎的新手选点策略，Worker 每手生成独立种子；“普通”“高级”继续调用原 `gm_search`。使用 `node scripts/capture-gomoku-beginner.mjs <原生 gomoku.exe 的路径>` 更新新手对照数据 `scripts/fixtures/gomoku-beginner.json`。MinGW 和 Emscripten 标准库的 `uniform_int_distribution` 对同一种子可能抽中不同名次，因此跨平台逐项比较完整候选评分及搜索计数、分别验证抽选落点/PV 与必胜/防守；WASM 内相同种子应完全复现。原正常模式 51 个冻结用例仍要求除时间外全字段一致。

`worker.js` 为本站适配层。引擎在独立的单线程 Web Worker 中运行，不需要 SharedArrayBuffer、跨源隔离、服务器进程或额外部署配置，适用于 GitHub Pages。页面传入的内容版本向 Worker、胶水和 WASM 传播，更新任一依赖后须重新运行站点构建。
