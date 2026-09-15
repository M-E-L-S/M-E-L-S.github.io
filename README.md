# MELS

MELS 是一个由原生 HTML、CSS 和 JavaScript 构建并通过 GitHub Pages 发布的
个人网站。站点包含首页、关于、小功能、小游戏、音乐栏，以及鲜蔬杯工具中心。

## 开发

可维护源码位于 `src/`，静态页面由 `scripts/build.cjs` 生成到仓库根目录及各
路由目录。修改源码后运行：

```text
node scripts/build.cjs
node scripts/check.cjs
```

具体目录、路由和本地预览说明见 `DEVELOPMENT.md`。

## 鲜蔬杯与 C 参考实现

鲜蔬杯包含界园、萨卡兹、萨米计分器和伤害计算器。`main.c` 保留了伤害计算器
早期的 C 语言参考实现，`CMakeLists.txt` 用于单独构建该参考程序；网站运行时
使用的是 `src/scripts/freshcup/calculator.js`，不依赖 C 可执行文件。

改造前的完整计算器 README 文本保留在 `freshcup/README.md`。

伤害计算逻辑曾参考视频：
[“万物汇集#13《青年大学集》——集成战略收藏品当中的加减乘除”](https://www.bilibili.com/video/BV1qnUWY4E59)。

## 许可

本仓库采用多重许可，不存在覆盖全部内容的单一许可证：

- 一般原创网站代码：MIT License；
- BOSS 对决、Wordle 长单词模式、鲜蔬杯工具中心：PolyForm
  Noncommercial License 1.0.0；
- 原创文章和个人内容：保留所有权利；
- 第三方代码、数据、音乐与媒体：遵循各自的许可和权利声明。

完整范围以 `LICENSE.md`、`FRESHCUP-NONCOMMERCIAL-LICENSE.md`、
`BOSS-NONCOMMERCIAL-LICENSE.md`、`LONG-WORDLE-NONCOMMERCIAL-LICENSE.md`
和 `THIRD_PARTY_AND_CONTENT_NOTICE.md` 为准。
