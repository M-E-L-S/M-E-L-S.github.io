# AlphaMah WASM

将本目录上传到静态网站即可游玩。游戏与 AI 均在浏览器内运行，不需要 Python 后端。

牌桌采用四向布局：中央计分盘显示各家座风、分数和余牌，手牌将摸牌单独分隔；单击选牌后点出牌，或双击直接打出。鼠标指向牌张会高亮桌面同牌，牌河箭头标记最新弃牌。支持方向键选牌、回车出牌。吃碰杠响应在右下角，结算可查看各家手牌。

本机体验：解压后双击 start.cmd（使用本机已有 Python），或在源码目录运行 start-wasm.ps1。不能用 file:// 直接打开 index.html。刷新会重新开局。

网页牌桌默认在专用 Worker 中运行单线程 WASM。部署到 GitHub Pages 时，直接上传静态文件即可启用引擎。

弃牌固定标准档 3 秒；原作者 FlatMC 吃碰杠响应最多 1 秒。单次操作可能串行处理多家响应，并有当前模拟批次的收尾时间。

规则：四组顺刻加一对；普通胡每个付款方 10，七对子、龙、岭上各翻倍，十三幺翻两倍；点炮一家付、自摸三家付。杠分立即支付。七对子须七种对子，龙可副露；一炮多响、抢加杠、无振听／过胡限制；无留牌，牌尽流局。

庄家胡牌续庄，只有闲家胡牌或流局时由庄家的下家接庄。庄家胡牌时每位付款方在番形结算后各付双倍。庄家付分时也翻倍，包括杠分。

引擎：MeowCaTS 作者源码 PD，提交 1e6ae5320d5e0d3d3b5d017ff83e05d02b9ba162，MST／IS／MDTT 默认关闭。LGPL-2.1 许可见 LICENSE-MeowCaTS.txt。完整对应源码与重新构建脚本见 AlphaMah-source.zip，允许按 LGPL 修改与重新链接。

标准牌面来自 FluffyStuff/riichi-mahjong-tiles（公开领域），固定版本 26e127ba2117f45cdce5ea0225748cc0cfad3169。牌背／牌底／牌面均使用原 SVG，未自行绘制。
来源：https://github.com/FluffyStuff/riichi-mahjong-tiles
许可：assets/tiles/LICENSE.md

页面不加载外部字体、CDN 或联网分析。
