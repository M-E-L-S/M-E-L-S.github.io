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

缩写转义使用 `/tools/acronym/`。小游戏子路由为：连连看 `/minigame/link/`、扫雷 `/minigame/minesweeper/`、蜘蛛纸牌 `/minigame/spider/`、Wordle `/minigame/wordle/`、五子棋 `/minigame/gomoku/`。菜单切换会无刷新更新地址栏，所有子路由都可直接访问、刷新，并支持浏览器前进与后退。

## 五子棋

`src/scripts/gomoku.js` 为页面控制，`gomoku-model.js` 维护 15×15 自由五子棋规则与悔棋，`gomoku-client.js` 管理可终止的 Worker。浏览器模块使用 `.js` 扩展名，以兼容 Windows 上可能将 `.mjs` 返回为 `text/plain` 的 Python 静态服务。`assets/gomoku/` 保存来自本机 gomoku 项目的经典评估 WASM 引擎，不加载 CNN/NNUE 权重；来源和更新方式见该目录的 README。思考深度为：简单（引擎新手策略，目标 300ms/上限 1000ms）、普通（原快速，300/1000ms，默认）、高级（原普通，1000/3000ms）；移除原深度档。软时限只约束下一轮迭代，实际用时可能超过目标。

简单档调用 `_gm_search_beginner`，关闭短杀/叶端 VCF、对完整根候选评分后在较优落点中按引擎权重抽选；深度上限仍为 64。Worker 每手用浏览器加密随机源生成一个 uint32 种子，校验后传入 C ABI，并保留引擎的新手诊断字段。其他档调用原 `_gm_search`，不会继承新手选项。

“本地对战 / 双人联机”用与其他游戏一致的按钮展示。本地默认两方玩家；“AI 执白”“AI 执黑”是相互独立的开关，可随时改变控制方，不重置棋盘。单方 AI 时悔棋撤回玩家上一手及应手，其余模式撤回一手；双方 AI 悔棋后暂停，通过“继续 AI”恢复。首次 AI 回合才加载 WASM；切走游戏、隐藏页面、重开、切换 AI 和悔棋会终止搜索并丢弃旧结果。思考速度下一手生效。

确定杀棋组件只使用引擎的 `mate_proven=true`、`mate_plies` 与一致的胜负距离评分，显示胜方和落子次数上界。次数是从本手 AI 落子之前计算、双方合计，不是最短杀。手动落子、悔棋、重开或新的搜索会清除旧提示。构建时将模型、客户端、联机模块、Worker、WASM 胶水和二进制一起计入内容哈希，并向整条加载链传递版本。

运行 `node scripts/check-gomoku.mjs` 验证胜负、悔棋、Worker 取消及真实 WASM 的原生对照结果，包含 51 个原正常模式基线、19 个新手候选评分/搜索工作对照、随机性与模式切换隔离，再运行 `node scripts/check.cjs` 检查静态站点。启动 `python -m http.server 12001` 后，可用 `node scripts/check-gomoku.mjs http://127.0.0.1:12001/` 额外检查实际响应的模块 MIME 类型。

双人联机通过 `gomoku-online.js` 连接现有 `mels-api` Worker。每个房间一个 SQLite Durable Object，使用可休眠 WebSocket；支持房间码/邀请链接、房主下局选色、服务端判定、协商悔棋/重开、刷新重连与 24 小时到期清理。没有轮询或服务端 AI。客户端仅在当前标签页的 sessionStorage 保存模式及最多 8 个房间的重连凭据；邀请链接只有房间码。监听 `hashchange`、`popstate` 与 `pageshow`，同页只改房间号也会清除旧棋盘并切换连接，前进/后退能恢复对应房间身份。

本地除 Python 静态服务外，还需在 `mels-api/` 运行 `npm run dev`（8780 端口）；线上须单独部署 Worker 的 DO 绑定与迁移。协议、限流、额度取舍、部署顺序及测试方法见 `mels-api/README.md`。

扫雷支持各地图选择阶数 1、2、3、4。核心中 `mine` 保存雷的位置，`mineType` / `flagType` 保存单位根的指数，`adjCount` 区分无雷空白与抵消零，`adjSquared` 保存精确的整数模长平方。连片展开只经过无雷空白；标记按单位根指数递增循环，转完后取消；和弦比较旗子之和的模长平方，相符则展开其余邻格，漏标或错位翻到雷时判负，模长不符不展开；胜利只要求翻开所有安全格。运行 `node scripts/check-minesweeper.cjs` 检查全部 12 种组合与旋转、抵消等规则。

快捷文本工作台使用 `/tools/text/`。页面源文件是 `src/pages/text.html`、`src/styles/text.css`；`text-core.js` 负责嗅探、替换、清理、Markdown 解析和差异计算，`text-workbench.js` 负责可叠加操作的开关与实时结果，`text-worker.js` 为正则替换提供 2 秒超时隔离，`text-docx.js` 使用仓库已有的 JSZip 在浏览器内生成 DOCX。导出使用当前操作组合的结果。文本不上传，也不写入本地存储。运行 `node scripts/check-text.cjs` 检查文本处理和 DOCX 包结构。

自动提取按类型分组，每组默认仅显示第一项，其余通过展开查看。网址可复制或在新标签页打开。疑似 PIXIV ID 将未命中其他类型的数字片段按出现顺序拼接，仅接受首位非 0 的 2～9 位结果（不截取、不移除前导 0），并提供复制、作品链接和用户链接。

无文字提示的疑似代码采用较高阈值：括号包裹的候选至少 8 位、至少两类大小写字母／数字、熵至少 2.5、不同字符占比至少 60%；无括号的随机串至少 12 位，同时含大小写字母和数字、熵至少 3.4、不同字符占比至少 65%。有“码／口令”等提示的规则保持不变。

工具子路由：`/freshcup/sarkaz/`、`/freshcup/sami/`、`/freshcup/calculator/`。原来的根目录 `.html` 地址保留为轻量跳转页，不再生成第二套完整工具页面。

所有页面共享顶栏、主题、设置与音乐组件；鲜蔬杯使用原生内容，没有 iframe。主栏目和鲜蔬杯工具切换都使用浏览器 History API，同一文档内切换可保持音乐播放。每个工具子路由仍会生成完整 HTML，因此可以直接输入网址访问、刷新，也支持浏览器前进与后退。

## 界面翻译

`src/scripts/i18n.js` 统一维护中文源文案、英文词条、动态句式及语言偏好。业务代码向 DOM 写入中文源文案，由翻译层处理文本节点、提示、占位符、无障碍标签和 `data-damage` 浮字；不要将已翻译的 DOM 内容当作业务数据读取。数字、分数和游戏状态应保存在模型或独立 `data-*` 字段。

新动态文案优先使用 `MELSI18n.bind(element, '正在播放：{name}', { name: track.name })`。词条中的参数在翻译后以纯文本插入，语言切换时自动刷新。浏览器 alert 和 Canvas/SVG 文案使用 `MELSI18n.t(source, params)`，长期显示的非 DOM 内容监听 `mels-languagechange` 重新绘制。混合 `<b>`、`<br>` 的旧弹窗需要覆盖每个文本节点，不能只增加整句翻译。

歌曲名、歌手、实际歌词、第三方释义和用户输入属于原始内容，使用 `translate="no"` 保护。鲜蔬杯的标题、关卡、分队、计分项目、干员、藏品、属性与计算说明均保留原文；仅导航、打印与重置等网页控件，以及成绩单表头等与游戏内容无关的文案参与翻译。不要用单字全局替换翻译内容数据。

运行 `node scripts/check-i18n.cjs` 检查动态文案和双向恢复；启动本地服务器后访问 `/scripts/fixtures/i18n.html`，检查浏览器实际的 MutationObserver、富文本结算、重复更新、原文保护和参数安全。修改后运行 `node scripts/build.cjs` 与 `node scripts/check.cjs` 更新并校验所有路由。

五子棋覆盖本地与联机控件、思考档位和计时、落子与胜负、确定杀棋、房间申请及连接错误；棋盘坐标与棋子状态的无障碍标签也随语言切换。回归检查枚举 225 个位置的三种状态、双方 AI 组合、换色/悔棋/重开申请，并检查首页和解密页当前静态文案的翻译覆盖。

## 游戏音效与触屏输入

Wordle 和五子棋使用 `src/scripts/game-audio.js` 的 Web Audio 合成音效，无额外音频资源或请求。首次操作才创建并解锁音频上下文；两个游戏各有默认开启的独立音效按钮。Wordle 覆盖输入、删除、调整对齐、逐字翻牌、错误和胜负；五子棋覆盖落子、悔棋、重开和胜负。联机按连续的新局面播放一次音效，连接恢复、历史快照和重复状态不重播。关闭音效、切走游戏或隐藏页面会取消当前及已排程的声音。

五子棋触屏首次点按预选，显示当前棋色的旋转虚线棋子；再次点按同一位置才落子，点其他位置移动预选。鼠标、键盘和辅助技术仍直接落子。局面变化、悔棋、重开、切换模式及离开游戏会清除预选；减少动态效果设置会停用旋转。触屏判断及预选控制位于 `gomoku-input.js`，联机音效去重位于 `gomoku-feedback.js`。

运行 `node scripts/check-game-feedback.mjs` 检查预选确认、联机音效去重、懒加载、静音和排程取消；通过本地服务器访问 `/scripts/fixtures/gomoku-input.html` 可检查真实页面的触屏事件、虚线旋转及鼠标/键盘兼容。

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
