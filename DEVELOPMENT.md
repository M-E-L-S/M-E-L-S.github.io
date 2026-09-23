# MELS 网站维护

网站为原生 HTML / CSS / JavaScript，GitHub Pages 直接发布仓库根目录。

## 修改源文件

- `src/site.html`：共用导航、设置、关于、小功能、小游戏、音乐栏。
- `src/pages/home-sections.html`：首页栏目摘要和跳转入口。
- `src/pages/freshcup/`：四个工具的原生页面内容。
- `src/scripts/freshcup/`：计分和伤害计算逻辑，查询范围限定在工具区域。
- `src/styles/site-design.css`：主题变量、页面布局和站点组件设计。
- `src/styles/components.css`：游戏、音乐与高级视觉效果的基础组件样式。
- `src/styles/freshcup/`：工具布局源样式；`.theme.css` 为自动生成文件。
- `src/styles/freshcup-native.css`：工具与全站共用的视觉规则。
- `main.c` / `CMakeLists.txt`：伤害计算器早期 C 语言参考实现，不参与网站构建。
- `freshcup/README.md`：保留改造前文本的鲜蔬杯伤害计算器专项说明。
- `vendor/`：仍在使用的 Canvas UI Flame Wrap、Particle Object 适配源码及许可。

修改后在仓库根目录运行 `node scripts/build.cjs`，生成各路由的 HTML 和工具主题样式。不要分别修改生成的 `index.html`，否则下次构建会覆盖它们。脚本为静态资源加入内容哈希，更新后浏览器会加载新版脚本与样式。

## ARG 的 ACG Name 词库

`python scripts/build-arg-acg.py` 会读取 Bangumi Archive 的 `aux/latest.json`，下载其中指向的最新 ZIP，校验 SHA-256，仅提取 `character.jsonlines`。已有 ZIP 时可运行 `python scripts/build-arg-acg.py --archive <dump.zip>`。Archive 通常每周三北京时间 05:00 更新；词库是构建时快照，更新后提交 `assets/data/arg-acg-names.json` 和 `assets/data/arg-acg-words.txt`，再运行 `node scripts/build.cjs` 部署到 GitHub Pages。

只收录 `role=1` 且 infobox 中有“简体中文名”、原名或别名中有拉丁字母姓名的角色。罗马字取角色原名或“罗马字 / 罗马音 / 英文名”别名；每个来源姓名保留 Bangumi 角色页 URL。同一罗马字对应多个角色时，前端不展示中文名和链接。分词文本每行是 `full<TAB>连写完整姓名` 或 `part<TAB>单独姓或名`；完整姓名在搜索里按正常词权重，片段降权。完整姓名至少三个字母，独立姓名片段也至少三个字母，以免两字母片段误命中编码。完整姓名连写是为了识别无空格的解码结果，页面也能匹配带空格的写法。开关默认关闭，只有开启时浏览器才加载两份角色数据。

## 路由

首页 `/`；关于 `/about/`；小功能 `/tools/`；小游戏 `/minigame/`；鲜蔬杯 `/freshcup/`。

缩写转义使用 `/tools/acronym/`。小游戏子路由为：连连看 `/minigame/link/`、扫雷 `/minigame/minesweeper/`、蜘蛛纸牌 `/minigame/spider/`、Wordle `/minigame/wordle/`。菜单切换会无刷新更新地址栏，所有子路由都可直接访问、刷新，并支持浏览器前进与后退。

工具子路由：`/freshcup/sarkaz/`、`/freshcup/sami/`、`/freshcup/calculator/`。原来的根目录 `.html` 地址保留为轻量跳转页，不再生成第二套完整工具页面。

所有页面共享顶栏、主题、设置与音乐组件；鲜蔬杯使用原生内容，没有 iframe。主栏目和鲜蔬杯工具切换都使用浏览器 History API，同一文档内切换可保持音乐播放。每个工具子路由仍会生成完整 HTML，因此可以直接输入网址访问、刷新，也支持浏览器前进与后退。

## 界面翻译

`src/scripts/i18n.js` 统一维护中文源文案、英文词条、动态句式及语言偏好。业务代码向 DOM 写入中文源文案，由翻译层处理文本节点、提示、占位符、无障碍标签和 `data-damage` 浮字；不要将已翻译的 DOM 内容当作业务数据读取。数字、分数和游戏状态应保存在模型或独立 `data-*` 字段。

新动态文案优先使用 `MELSI18n.bind(element, '正在播放：{name}', { name: track.name })`。词条中的参数在翻译后以纯文本插入，语言切换时自动刷新。浏览器 alert 和 Canvas/SVG 文案使用 `MELSI18n.t(source, params)`，长期显示的非 DOM 内容监听 `mels-languagechange` 重新绘制。混合 `<b>`、`<br>` 的旧弹窗需要覆盖每个文本节点，不能只增加整句翻译。

歌曲名、歌手、实际歌词、第三方释义和用户输入属于原始内容，使用 `translate="no"` 保护。鲜蔬杯的标题、关卡、分队、计分项目、干员、藏品、属性与计算说明均保留原文；仅导航、打印与重置等网页控件，以及成绩单表头等与游戏内容无关的文案参与翻译。不要用单字全局替换翻译内容数据。

运行 `node scripts/check-i18n.cjs` 检查动态文案和双向恢复；启动本地服务器后访问 `/scripts/fixtures/i18n.html`，检查浏览器实际的 MutationObserver、富文本结算、重复更新、原文保护和参数安全。修改后运行 `node scripts/build.cjs` 与 `node scripts/check.cjs` 更新并校验所有路由。

## 高级效果

保留关于页火焰、首页粒子文字和歌词。外观设置支持任意主题色与四个推荐色，选择会存储在浏览器中，并自动适配浅色和深色模式。HTML-in-Canvas 依赖浏览器能力，未支持时使用原组件提供的简化显示。首页的漂浮表情、装饰星星和烟花不再初始化。

## 许可边界

一般原创网站代码使用 MIT License；BOSS 对决、Wordle 长单词模式和鲜蔬杯工具中心使用 PolyForm Noncommercial 1.0.0。鲜蔬杯范围包含网页实现、专用样式、路由逻辑、生成页面以及保留的 C 参考实现。第三方代码、数据、游戏名称和媒体不因本仓库声明而改变其原有权利状态，具体以根目录许可与第三方声明为准。

## 本地预览

运行 `python -m http.server 4173 --bind 127.0.0.1`，访问 `http://127.0.0.1:4173/`。页面包含根路径资源，不能直接双击 HTML 验证路由。
# B站记录查询

入口 `/tools/aicu/`，源文件为 `src/pages/aicu.html`、`src/scripts/aicu.js`、`src/styles/aicu.css`。Worker 地址集中在脚本的 `API` 常量中。未授权时遮罩仅覆盖 Aicu 内容区，页面导航与功能切换不受影响。提交查询才请求对应接口，评论与视频弹幕每页 20 条；离开功能或点击取消会中止浏览器请求。

`mels-api/` 是独立部署的 Worker 项目，源码和绑定配置入库，依赖、运行缓存与本地密钥不入库。生产 CORS 只允许 `https://m-e-l-s.github.io`，因此 localhost 页面不能直接完成线上接口查询；不要为本地预览放宽生产 CORS。

本地 HTTP 服务中打开 `/scripts/fixtures/aicu.html` 可执行模拟接口的浏览器回归测试，覆盖四类数据、安全渲染、分页、失败、限流与取消；该测试页面不会调用线上 Worker。
