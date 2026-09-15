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

## 路由

首页 `/`；关于 `/about/`；小功能 `/tools/`；小游戏 `/minigame/`；鲜蔬杯 `/freshcup/`。

缩写转义使用 `/tools/acronym/`。小游戏子路由为：连连看 `/minigame/link/`、扫雷 `/minigame/minesweeper/`、蜘蛛纸牌 `/minigame/spider/`、Wordle `/minigame/wordle/`。菜单切换会无刷新更新地址栏，所有子路由都可直接访问、刷新，并支持浏览器前进与后退。

工具子路由：`/freshcup/sarkaz/`、`/freshcup/sami/`、`/freshcup/calculator/`。原来的根目录 `.html` 地址保留为轻量跳转页，不再生成第二套完整工具页面。

所有页面共享顶栏、主题、设置与音乐组件；鲜蔬杯使用原生内容，没有 iframe。主栏目和鲜蔬杯工具切换都使用浏览器 History API，同一文档内切换可保持音乐播放。每个工具子路由仍会生成完整 HTML，因此可以直接输入网址访问、刷新，也支持浏览器前进与后退。

## 高级效果

保留关于页火焰、首页粒子文字和歌词。外观设置支持任意主题色与四个推荐色，选择会存储在浏览器中，并自动适配浅色和深色模式。HTML-in-Canvas 依赖浏览器能力，未支持时使用原组件提供的简化显示。首页的漂浮表情、装饰星星和烟花不再初始化。

## 许可边界

一般原创网站代码使用 MIT License；BOSS 对决、Wordle 长单词模式和鲜蔬杯工具中心使用 PolyForm Noncommercial 1.0.0。鲜蔬杯范围包含网页实现、专用样式、路由逻辑、生成页面以及保留的 C 参考实现。第三方代码、数据、游戏名称和媒体不因本仓库声明而改变其原有权利状态，具体以根目录许可与第三方声明为准。

## 本地预览

运行 `python -m http.server 4173 --bind 127.0.0.1`，访问 `http://127.0.0.1:4173/`。页面包含根路径资源，不能直接双击 HTML 验证路由。
