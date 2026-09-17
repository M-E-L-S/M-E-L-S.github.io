(function () {
    'use strict';
    const STORAGE_KEY = 'mels-language';
    const english = {
        '跳至主要内容':'Skip to main content','主导航':'Main navigation','首页':'Home','关于':'About','小功能':'Tools','小游戏':'Games','鲜蔬杯':'F.V. Cup','设置':'Settings','关闭设置':'Close settings','设置分类':'Settings categories','外观':'Appearance','音乐':'Music','老板键':'Boss key','切换到深色模式':'Switch to dark mode','切换到浅色模式':'Switch to light mode',
        '关于 · MELS':'About · MELS','小功能 · MELS':'Tools · MELS','小游戏 · MELS':'Games · MELS','鲜蔬杯 · MELS':'F.V. Cup · MELS','缩写转义 · 小功能 · MELS':'Acronym Decoder · Tools · MELS','Favicon 图包 · 小功能 · MELS':'Favicon Package · Tools · MELS',
        '调整页面的色彩与动态效果':'Customize colors and visual effects','语言':'Language','选择网站显示语言':'Choose the website language','跟随浏览器':'Use browser language','深色模式':'Dark mode','使用柔和的深色背景':'Use a comfortable dark background','主题色':'Accent color','选择用于按钮、链接、标签和粒子文字的强调色':'Choose the accent used for buttons, links, labels, and particle text','推荐主题色':'Suggested accent colors','天蓝色':'Sky blue','鸢尾蓝':'Iris blue','珊瑚红':'Coral red','青绿色':'Teal','「关于」页面':'About page','为「关于」页面下方文本框添加火焰效果':'Add a flame effect to the article on the About page','首页粒子文字':'Particle title on Home','鼠标掠过标题或首页歌词时，粒子会散开并回弹':'Particles scatter and spring back when the pointer crosses the title or Home lyrics','恢复默认设置':'Restore defaults','设置会自动保存':'Settings are saved automatically','已恢复默认':'Defaults restored',
        '管理本地音乐记录与歌词显示':'Manage local listening history and lyrics','停止记录播放历史':'Pause listening history','开启后，之后播放的歌曲不会加入历史记录。':'Newly played songs will not be added to history.','关闭实时歌词':'Disable live lyrics','开启后，音乐栏不再加载或显示实时歌词。':'The player will no longer load or display live lyrics.','首页特殊歌词效果':'Special Home lyrics effect','在首页副标题位置显示独立粒子歌词；关闭后歌词保留在音乐栏。':'Show separate particle lyrics in the Home subtitle; when disabled, lyrics remain in the player.','清除全部本地音乐数据':'Clear all local music data','仅清除当前浏览器的数据':'Only data in this browser is cleared','确认清除全部本地音乐数据？':'Clear all local music data?','这会删除播放历史、收藏夹、排序与播放偏好，以及已缓存的在线音乐信息；此操作无法撤销。':'This deletes listening history, favorites, sorting and playback preferences, plus cached online music data. This cannot be undone.','取消':'Cancel','确认清除':'Clear data',
        '在小游戏中一键暂停并隐藏游戏。可点击音乐栏中间的按钮，也可使用快捷键。':'Pause and hide a game instantly using the center player button or a keyboard shortcut.','执行动作':'Action','尝试切换到其他网页（若有）':'Try to switch to another page, if available','最小化浏览器':'Minimize browser','直接关闭当前网页':'Close the current tab','直接关闭浏览器':'Close browser','安装浏览器助手（Chrome / Edge）':'Install browser helper (Chrome / Edge)','下载浏览器助手':'Download the browser helper','支持本站正式域名与本地开发地址；助手不会自动安装。':'Supports the production site and local development addresses. The helper is never installed automatically.','关闭浏览器会关闭当前用户配置下的所有普通窗口；未保存内容可能丢失。':'Closing the browser closes all normal windows in the current profile; unsaved work may be lost.','快捷键':'Keyboard shortcut','点击输入框后按下组合键；Esc 取消。快捷键仅在小游戏页面获得键盘焦点时生效。':'Click the field, then press a key combination; Esc cancels. The shortcut works while a game page has keyboard focus.','点击后按下新的老板键快捷键':'Click, then press a new boss-key shortcut','恢复老板键默认设置':'Restore boss-key defaults',
        '向下探索':'Explore below','特色功能':'Featured experiences','实用的，放松的。总有你感兴趣的。':'Useful or relaxing—there is always something for you.','永远的神 ↗':'The GOAT ↗','一个缩写，一句“黑话”，这里有你想知道的答案。':'Decode an abbreviation or a piece of internet slang.','打开小功能':'Open tools','连连看、扫雷、蜘蛛纸牌与 Wordle。传统之外或许还有你未曾见过的新挑战？':'Tile Match, Minesweeper, Spider Solitaire, and Wordle—with a few challenges you may not have seen before.','开始一局':'Play a game','记录':'Track','计算':'Calculate','挑战':'Challenge','鲜蔬杯工具中心':'F.V. Cup Toolkit','界园、萨卡兹、萨米计分器，以及伤害计算器。':'Scoreboards for Jieyuan, Sarkaz, and Sami, plus a damage calculator.','进入工具中心':'Open toolkit','你的下一个电子播放器，何必是Spotify？':'Why should your next music player have to be Spotify?','发现音乐 ↗':'Discover music ↗','更新公告':'What’s new','关于本站、最近的更新，以及那些你未曾注意到的小变化。':'About this site, recent releases, and the little changes you may have missed.','了解更多 ↗':'Learn more ↗','页面重构更新。':'Site structure redesigned.','外观重构更新。':'Visual design refreshed.','原页面保留并收纳为单独「鲜蔬杯」页面。':'The original page now lives in its own F.V. Cup section.','也可以，换一种看法。':'See it your way.','浅色与深色、粒子文字、动态火焰。甚至主题色。':'Light and dark themes, particle text, animated flames—even your own accent color.','调整外观 ↗':'Customize appearance ↗',
        '想法、工具、玩具，this website is all you need.':'Ideas, tools, and toys—this website is all you need.','搜索喜欢的音乐，收进自己的列表。播放历史、收藏和独家粒子动态歌词。该有的，你没见过的这里都有。':'Find music you love and keep it in your library, with history, favorites, and exclusive animated particle lyrics.','^Spotify 是其各自权利人的商标，本站与 Spotify 无关联，亦未获其赞助或背书。':'Spotify is a trademark of its respective owner. This site is not affiliated with, sponsored, or endorsed by Spotify.','总有一些想法。':'There is always another idea.','关于本站 ↗':'About this site ↗',
        '关于本站':'About this site','欢迎访问M.E.L.S.个人站。':'Welcome to the M.E.L.S. personal site.','感谢访问网站。':'Thanks for visiting.','第三方内容说明':'Third-party content notice','不会互通':'are not synchronized','不会':'does not','特别致歉：':'Special apology:','版权声明：在线音乐的搜索结果、封面、歌词与播放地址由':'Copyright notice: online music search results, cover art, lyrics, and playback URLs are provided by','及其上游内容来源提供，本地歌曲“没有如果”来自于':'and its upstream sources. The bundled track “If Only” comes from','，本站不主张拥有这些内容的版权。':'. This site does not claim copyright in that content.','小功能页面':'Tools page','切换功能，当前：缩写转义':'Switch tools. Current: Acronym decoder','切换功能（当前：缩写转义）':'Switch tools (current: Acronym decoder)','选择功能':'Choose a tool','缩写转义':'Acronym decoder','Favicon 图包':'Favicon package','能不能好好说话？':'Can we speak plainly?','看懂拼音首字母缩写':'Decode Chinese initialisms','输入一段缩写，可能的原文会自动出现在下方。':'Enter an initialism and possible meanings will appear below.','缩写内容':'Initialism','例如：yyds、awsl、dbq':'For example: yyds, awsl, dbq','转义':'Decode','支持字母和数字组成的缩写；输入后会自动查询，也可以按回车。':'Supports initialisms made of letters and numbers. Results load automatically, or press Enter.','先输入一个缩写试试':'Enter an initialism to begin','把图片转换成 Favicon 图包':'Convert an image into a favicon package','上传一张简洁的方形图片，生成浏览器、Apple 与 Android 所需的完整图标文件。':'Upload a simple square image and generate the complete icon set for browsers, Apple, and Android.','拖放图片到这里，或点击上传':'Drop an image here, or click to upload','支持 PNG、JPG、BMP 与 WebP；图片仅在当前浏览器中处理。':'Supports PNG, JPG, BMP, and WebP. Images are processed only in this browser.','下载前预览':'Preview before downloading','更换图片':'Choose another image','完整 Favicon 图包':'Complete favicon package','7 个文件 · ICO、PNG 与 Web Manifest':'7 files · ICO, PNG, and Web Manifest','下载 Favicon 图包':'Download favicon package','建议使用轮廓醒目、细节较少的方形图片；小尺寸预览最能反映浏览器标签页中的实际效果。':'Square images with bold shapes and few details work best. Small previews most closely match a browser tab.','正在生成各尺寸图标…':'Generating icon sizes…','预览已生成。确认效果后即可下载。':'Preview ready. Check the result, then download.','正在打包 ZIP…':'Creating ZIP…','图包已生成，下载应已开始。':'Package created. Your download should have started.','无法读取这张图片，请换一张后重试。':'This image could not be read. Try another file.','ZIP 生成失败，请重试。':'Could not create the ZIP. Please try again.','ZIP 组件未能加载，请刷新页面后重试。':'The ZIP component did not load. Refresh and try again.','请选择 PNG、JPG、BMP 或 WebP 图片。':'Choose a PNG, JPG, BMP, or WebP image.',
        '小游戏中心':'Game Center','连连看':'Tile Match','扫雷':'Minesweeper','蜘蛛纸牌':'Spider Solitaire','开始游戏':'Start game','重新开始':'Restart','暂停':'Pause','继续':'Resume','难度':'Difficulty','简单':'Easy','中等':'Medium','困难':'Hard','分数':'Score','时间':'Time','步数':'Moves','剩余':'Remaining','胜利！':'You win!','游戏结束':'Game over','再来一局':'Play again','新游戏':'New game','提示':'Hint','撤销':'Undo','自动完成':'Auto-complete',
        '切换游戏':'Switch game','切换游戏，当前：连连看':'Switch game. Current: Tile Match','选择游戏':'Choose a game','竞速':'Time Attack','常规':'Classic','BOSS对决！':'BOSS Battle!','洗牌':'Shuffle','暂停 / 继续':'Pause / Resume','音效开关':'Toggle sound','BOSS 对决状态':'BOSS battle status','邪恶机器人':'Evil Robot','第 1 / 2 条生命':'Life 1 of 2','♥ 我方':'♥ You','仅一条生命 · 300 HP':'One life · 300 HP','等待开始':'Ready','得分':'Score','选择难度，点击「开始游戏」':'Choose a difficulty, then select “Start game”','初级 9×9':'Beginner 9×9','中级 16×16':'Intermediate 16×16','高级 30×16':'Expert 30×16','剩余雷':'Mines left','最佳':'Best','扫雷棋盘':'Minesweeper board','单色':'One suit','双色':'Two suits','四色':'Four suits','撤销上一步':'Undo last move','剩余发牌':'Deals left','已完成的牌组':'Completed runs','蜘蛛纸牌牌桌':'Spider Solitaire table','经典五字母':'Classic five-letter','考试五字母':'Exam five-letter','长单词':'Long words','Wordle 模式':'Wordle mode','选择考试词库':'Choose an exam word list','答案词库':'Answer list','考研英语':'Postgraduate Entrance Exam','答案':'Answer','猜测':'Guesses','连胜':'Streak','5 字母':'5 letters','提示×':'Hints ×','撤销×':'Undo ×','洗牌×':'Shuffle ×','标记模式：关':'Flag mode: Off','标记模式：开':'Flag mode: On','发牌 ×5':'Deal ×5','已收':'Completed','组':'runs',
        '玩法：点击两个相同的图案，若连接路径转弯不超过 2 次（路线可以绕到棋盘外侧）即可消除；在倒计时结束前清空全部方块即获胜。连续快速消除还能触发连击加分哦！':'How to play: Select two matching tiles. They can be cleared when a path connects them with no more than two turns, including around the outside of the board. Clear every tile before time runs out. Quick consecutive matches earn combo points.','对决规则：消除造成基础 10 点伤害，4 秒内连击每次 +5。BOSS 初始攻击间隔 5 秒，最低 1 秒，两次选块各需 2 秒，期间消除可打断并眩晕 2 秒；红框同类方块已被锁定。竞技期间 BOSS 无敌且无法打断，双方消除只计次数，不造成即时伤害，以 4 次消除为目标在结束后结算。清空棋盘会自动补满，胜负仅由血量决定。':'Battle rules: Matches deal 10 base damage, with +5 for each combo within four seconds. The BOSS attacks every five seconds at first, down to one second, and needs two seconds for each tile selection. Matching during selection interrupts and stuns it for two seconds. Red-outlined matching tiles are locked. During contests the BOSS is invincible; both sides race to four matches before damage is resolved. Empty boards refill automatically, and victory depends only on HP.',
        '玩法：翻开所有不含地雷的格子即可获胜。数字表示它周围 8 格中的地雷数量；右键、长按或开启「标记模式」可为疑似地雷的格子插旗；双击已翻开的数字，若周围旗数与数字相符，就会一次性翻开其余格子。第一次点击必定安全，每局还有几次「提示」可以直接翻开一个安全格。高级难度棋盘较宽，手机上可左右滑动查看。':'How to play: Reveal every safe cell. A number shows how many mines touch its eight neighboring cells. Right-click, long-press, or enable Flag mode to mark suspected mines. Double-click a revealed number to open its remaining neighbors when the adjacent flag count matches. The first move is always safe, and hints can reveal a safe cell. Scroll horizontally on mobile for the expert board.',
        '玩法：把牌按从大到小（K→Q→J→…→A）叠放；同一花色从 K 到 A 凑满一整列即可自动收走，收齐 8 组即获胜。可移动的牌必须是同花色且连续递减的一叠。无棋可走时点右上角牌堆发牌（每列各发一张，且每列都不能为空）。单色最轻松，双色、四色更具挑战。支持拖拽或「先点选、再点目标列」两种方式，双击一叠牌可自动归位。':'How to play: Stack cards from K down to A. A complete same-suit run is removed automatically; complete all eight runs to win. Only a descending same-suit sequence can move together. When no moves remain, deal one card to every non-empty column. One suit is easiest; two and four suits are more challenging. Drag cards or select a stack and then its destination; double-click a stack to move it automatically.',
        '界园计分器':'Jieyuan Scoreboard','萨卡兹计分器':'Sarkaz Scoreboard','萨米计分器':'Sami Scoreboard','伤害计算器':'Damage Calculator','清空':'Clear','重置':'Reset','重置选择':'Reset selection','计算结果':'Result','计算伤害':'Calculate damage','总分':'Total','确认':'Confirm','删除':'Delete','添加':'Add','保存':'Save','加载':'Load','打印本局成绩单':'Print score sheet','总分: 0':'Total: 0','总计个人得分: 0':'Total individual score: 0',
        '搜索音乐':'Search music','音乐列表':'Music library','收藏当前歌曲':'Favorite current song','收起音乐栏':'Collapse music player','展开音乐栏':'Expand music player','播放':'Play','暂停播放':'Pause','上一首':'Previous track','下一首':'Next track','调节音量':'Adjust volume','打开播放列表、历史和收藏':'Open playlists, history, and favorites','音乐播放进度':'Music playback progress','音量 100%':'Volume 100%','没有结果':'No results','播放历史':'Listening history','收藏夹':'Favorites','当前浏览器尚未启用 HTML-in-Canvas，文字扭曲效果已省略。':'HTML-in-Canvas is not enabled in this browser, so text distortion is omitted.','粒子文字已开启，移动鼠标即可拨散粒子。':'Particle text is enabled. Move the pointer to scatter the particles.',
        '网站语言':'Website language','更改后立即应用，并保存在当前浏览器中。':'Changes apply immediately and are saved in this browser.','简体中文':'简体中文',
        '网站全面重构，转向全面个人站。':'The site has been rebuilt as a complete personal site.','新增鲜蔬杯计分器':'F.V. Cup scoreboards added','网站上线':'Site launched','1. 正式转为鲜蔬杯专用网站，主办方M.E.提供官方计分器页面。':'1. The site became the official F.V. Cup site, with scoreboards provided by organizer M.E.','2. 计分器支持交互式点选加减分项目，实时计算总分和打印成绩单。此结果为唯一官方结果。':'2. Scoreboards support interactive scoring, live totals, and printable score sheets. These are the official results.','1. Github Pages正式上线，初期作为明日方舟肉鸽伤害计算器单独页面试运行，源逻辑来自':'1. The GitHub Pages site launched with an Arknights roguelike damage calculator based on','2. 计算器支持干员技能选择，藏品选择，敌方属性设置和精确伤害计算。':'2. The calculator supports operator skills, collectibles, enemy stats, and precise damage calculation.','3. 计算器项目还在持续开发中，详见':'3. The calculator remains in active development; see',
        '📢 更新公告':'📢 What’s new','1. 新增首页，关于，小道具，小游戏页面，原鲜蔬杯页面仍为单独页面。':'1. Added Home, About, Tools, and Games; F.V. Cup remains its own section.','2. 新增设置和音乐栏。重构并大幅升级了外观，并保持了设计统一。':'2. Added Settings and the music player, with a redesigned and unified visual system.','3. 「关于」页面用于存放更新公告，网站开源协议、第三方声明、用户隐私声明。会随网站更新实时更新。':'3. About now contains release notes, licensing, third-party notices, and privacy information.','4. 「小道具」页面用于提供M.E. 自制/收集到的开源 实用妙妙工具，你早晚会用到。':'4. Tools collects useful open-source utilities created or curated by M.E.','5. 「小游戏」页面用于提供':'5. Games provides','完全自制':'original','的各类游戏/经典游戏改，充满了作者的巧思。包括但不限于“连连看boss模式”“wordle长单词模式”。':'games and creative variations, including Tile Match BOSS Battle and Long Word Wordle.','6. 「鲜蔬杯」页面保持原有功能不变，仅做外观调整。':'6. F.V. Cup keeps its original functionality with refreshed visuals.','7. 「音乐」栏支持在线搜索、播放音乐，并支持同各家播放器一致的收藏和列表播放。':'7. The music player supports online search, playback, favorites, and playlists.','独家功能':'Exclusive feature','：粒子动态歌词，现可在首页标题下方体验。':': animated particle lyrics on the Home page.','8. 「设置」弹窗支持设置自定义外观，音乐相关和老板键的配置。':'8. Settings includes appearance, language, music, and boss-key controls.','C代码':'C source','。':'.'
    };
    Object.assign(english, {
        '经典 · 5 字母':'Classic · 5 letters','填满当前行，然后按回车提交':'Fill the current row, then press Enter','本次':'Current','拖动当前字母组调整对齐 · 第 1 位':'Drag the current letter group to align · Position 1','经典模式：答案来自原版 Wordle 的 2,315 词答案池，共六次机会。绿色表示字母与位置都正确，黄色表示答案中有该字母但位置不对，灰色表示答案中没有可用的该字母。':'Classic mode uses the original 2,315-word Wordle answer pool with six attempts. Green means the letter and position are correct, yellow means the letter appears elsewhere, and gray means no unused copy of that letter remains.','答案库来源':'Answer-list source','猜词库来源':'Guess-list source'
    });
    english['鲜蔬杯官方(M.E.)唯一指定工具集。思路参考'] = 'The official F.V. Cup toolkit by M.E. Inspired by';
    Object.assign(english, {
        '搜索歌曲、歌手或专辑':'Search songs, artists, or albums','音乐服务由 GD音乐台 提供':'Music service provided by GD Music','我的音乐':'My Music','播放列表':'Playlist','历史':'History','收藏':'Favorites','播放顺序':'Playback order','收藏排序':'Favorite sorting','顺序':'In order','单曲':'Repeat one','随机':'Shuffle','顺序播放 · 1 首歌曲':'In order · 1 track','加入时间：新到旧':'Date added: newest first','加入时间：旧到新':'Date added: oldest first','歌名：顺序':'Title: A–Z','歌名：倒序':'Title: Z–A','清除全部历史记录':'Clear all history','本地音乐暂无歌词':'No lyrics are available for this local track','打印成绩单':'Print score sheet','作词 :':'Lyrics:',
        '向左移动对齐位置':'Move alignment left','向右移动对齐位置':'Move alignment right',
        '释义由':'Meanings provided by','提供；查询内容会发送至该服务。查询结果来自第三方词库，可能包含不准确、过时或具有冒犯性的词语，仅供参考，不代表本站立场。':'. Your query is sent to that service. Results come from a third-party dictionary and may be inaccurate, outdated, or offensive. They are provided for reference and do not represent this site.','输入关键词搜索在线音乐':'Enter keywords to search online music',
        '点击两个相同图案、转弯不超过 2 次即可消除':'Match two identical tiles connected by a path with no more than two turns.','普通攻击 · 基础 10 / 连击 +5':'Normal attack · Base 10 / Combo +5','消除即攻击 · 红色锁定的同类方块不可选 · 选块时攻击可打断':'Matches attack · Red locked matches cannot be selected · Attack while the BOSS is selecting tiles to interrupt','题库说明：答案库为原版 Wordle 的':'Word list: answers use the original Wordle list of','个经典答案；猜词库为宽泛英文词表中的五字母单词。':'classic answers; guesses use five-letter words from a broad English dictionary.',
        '未连接浏览器助手：会先暂停游戏并切回首页；关闭当前网页会尝试执行，其余浏览器动作需要配套扩展。可在下方查看安装方法。':'Browser helper not connected: games will pause and the site will return Home. Closing the current tab will be attempted; other browser actions require the extension. Installation instructions follow.','并解压。在浏览器「扩展程序」中开启「开发者模式」，选择「加载已解压的扩展程序」，选中解压后的文件夹，然后刷新本页。':'and extract it. Open browser Extensions, enable Developer mode, choose Load unpacked, select the extracted folder, and refresh this page.','请使用 Ctrl、Alt 或 Meta 搭配字母、数字或功能键，建议同时加入 Shift 以减少冲突。':'Use Ctrl, Alt, or Meta with a letter, number, or function key. Adding Shift is recommended to reduce conflicts.'
        ,'首页当前显示普通文字。':'Home is currently showing regular text.','当前环境无法运行粒子效果，已自动保留普通文字。':'Particle effects are unavailable in this environment; regular text remains visible.','粒子文字已开启。':'Particle text is enabled.','粒子文字将在首页加载…':'Particle text will load on Home…','当前浏览器不支持此效果，正文仍可正常阅读。':'This browser does not support the effect; the article remains readable.','正文捕获失败，已保留正文与火焰。请打开浏览器控制台查看具体原因。':'Article capture failed; the article and flames remain visible. Check the browser console for details.','完整效果已运行。':'The full effect is running.','已检测到 HTML-in-Canvas，当前浏览器可显示完整效果':'HTML-in-Canvas detected; this browser can display the full effect.','当前浏览器尚未启用 HTML-in-Canvas，文字扭曲效果已省略。':'HTML-in-Canvas is not enabled, so text distortion is omitted.'
    });
    Object.assign(english, {
        '点击下方按钮或遮罩任意处继续':'Select the button below or anywhere on the overlay to resume','初级':'Beginner','中级':'Intermediate','高级':'Expert','四色 · 把同花色的 K→A 收齐 8 组即可获胜':'Four suits · Complete eight same-suit K-to-A runs to win','双色 · 把同花色的 K→A 收齐 8 组即可获胜':'Two suits · Complete eight same-suit K-to-A runs to win','单色 · 把同花色的 K→A 收齐 8 组即可获胜':'One suit · Complete eight same-suit K-to-A runs to win',
        '考试词库来源':'Exam word-list source','长单词模式：答案为 6–9 字母，共八次机会。可填入最短 5 个、最长与答案等长的单词；短词可直接拖动整组方格选择起始对齐位置。绿字按对齐后的绝对位置判断，黄字会在答案全词中查找，灰字则表示答案全词中没有可用的该字母。':'Long-word mode: the answer has 6–9 letters and you have eight attempts. Guesses may be from five letters up to the answer length; drag shorter rows to choose their starting alignment. Green uses absolute aligned positions, yellow searches the full answer, and gray means no unused copy exists anywhere in the answer.','考试五字模式：答案从 考研英语 词库的五字母单词中抽取，共六次机会。绿色表示字母与位置都正确，黄色表示答案中有该字母但位置不对，灰色表示答案中没有可用的该字母。':'Exam five-letter mode: answers are drawn from the Postgraduate Entrance Exam list, with six attempts. Green means correct letter and position, yellow means the letter appears elsewhere, and gray means no unused copy remains.','单词词库仍在加载，请稍候':'The word list is still loading. Please wait.',
        '棋盘已清空，自动补满，继续对决！':'Board cleared and refilled—keep fighting!','击败邪恶机器人！':'Evil Robot defeated!','对决失败':'Battle lost','再战一局':'Battle again','恭喜通关！':'You win!','时间到！':'Time’s up!','差一点点，再来一次吧！你可以尝试使用道具！':'So close—try again, and remember to use your tools!','游戏已自动继续':'Game resumed automatically','提示次数用完啦':'No hints left','洗牌次数用完啦':'No shuffles left','没有可消除的组合，请洗牌':'No matches are available. Shuffle the board.','没有可消除的组合，自动洗牌！':'No matches were available, so the board was shuffled.','已重新洗牌':'Board shuffled',
        '这一格插着旗子，先取消标记吧':'This cell is flagged. Remove the flag first.','本局提示次数已用完':'No hints remain in this game.','没有可提示的格子了':'There are no cells left to reveal with a hint.','排雷成功！':'All mines cleared!','踩到地雷！':'You hit a mine!','继续游戏':'Resume game','标记模式开启：点击格子插旗':'Flag mode enabled: select a cell to flag it.','标记模式关闭：点击格子翻开':'Flag mode disabled: select a cell to reveal it.',
        '只有同花色且依次递减的连续牌才能整组搬动':'Only a descending same-suit sequence can move together.','只能放到点数正好大 1 的牌上（或空列）':'Move onto a card exactly one rank higher, or an empty column.','不能移回原来那一列':'Cannot move back to the same column.','对局已经结束':'The game is over.','这组牌暂时没有可放的位置':'There is nowhere to move this stack.','牌堆已经发完了':'The stock is empty.','本局悔棋次数已用完':'No undos remain in this game.','没有可以悔的棋':'There is nothing to undo.','暂时没有可提示的走法':'There are no hintable moves right now.','全部收齐！':'All runs completed!','无路可走':'No moves left','没有可以移动的牌，牌堆也帮不上忙了。':'No cards can move, and the stock cannot help.','点工具栏的「悔棋」回退一步，或重新开始。':'Use Undo in the toolbar to step back, or restart.','背面朝上、或不是同花色依次递减的牌不能整组搬动':'Face-down cards and non-descending or mixed-suit stacks cannot move together.','已发完':'Dealt out','牌堆已发完':'Stock is empty','空':'empty','背面朝上':'face down',
        '只能输入英文字母':'Use English letters only.','词库中没有这个单词':'That word is not in the dictionary.','请选择有效的对齐位置':'Choose a valid alignment.','单词词库加载失败，请刷新页面重试':'The word list failed to load. Refresh and try again.'
        ,'题库说明：答案库从':'Word list: answers filtered from','中筛选出':'contain','个五字母单词；猜词库为宽泛英文词表中的五字母单词。':'five-letter answers; guesses use five-letter words from a broad English dictionary.','个 6–9 字母单词，6–7 字母优先抽取；猜词库为宽泛英文词表中长度介于 5 与本局答案长度之间的单词。':'6–9 letter answers, weighted toward 6–7 letters; guesses use broad-dictionary words from five letters up to the current answer length.'
    });
    Object.assign(english, {
        'B站记录查询': 'Bilibili archive',
        '第 {page} 页 · 共 {count} 条收录': 'Page {page} · {count} archived records', '第 {page} 页': 'Page {page}',
        '输入 UID，查看已收录的评论、视频弹幕与用户资料。': 'Enter a UID to explore archived comments, video comments and profile information.',
        '用户 UID': 'User UID', '例如：2': 'For example: 2', '查询类型': 'Record type',
        '评论': 'Comments', '视频弹幕': 'Video comments', '历史用户名': 'Previous usernames',
        '粉丝牌 / 装扮': 'Fan medals / Collectibles', '粉丝牌': 'Fan medals', '装扮': 'Collectibles',
        '关键词（选填）': 'Keyword (optional)', '查询记录': 'Search records', '取消查询': 'Cancel search',
        '数据由': 'Data provided by',
        '收录可能不完整或有延迟，未查到不代表没有记录。': 'Archives may be incomplete or delayed; no results do not imply no activity.',
        '需要访问授权': 'Authorization required', '访问密码': 'Access password',
        '输入访问密码后可使用此功能。授权在此浏览器保存，24 小时后到期。': 'Enter the access password to use this tool. Authorization is saved in this browser and expires in 24 hours.',
        '请输入访问密码。': 'Enter the access password.', '验证并解锁': 'Verify and unlock', '退出授权': 'Sign out',
        '正在验证授权…': 'Verifying authorization…', '授权已失效，请重新输入密码。': 'Authorization has expired or been revoked. Enter the password again.',
        '访问密码不正确。': 'Incorrect access password.', '验证过于频繁，请一分钟后重试。': 'Too many attempts. Try again in a minute.',
        '无法保存授权，请允许本站使用浏览器存储。': 'Cannot save authorization. Allow browser storage for this site.',
        '验证失败，请检查网络或服务配置后重试。': 'Verification failed. Check the connection or service configuration and try again.',
        '输入 UID 后开始查询。': 'Enter a UID to start searching.', '查询结果分页': 'Search result pages',
        '上一页': 'Previous', '下一页': 'Next', '打开原视频': 'Open original video',
        '查询完成。页码与收录总数见下方。': 'Search complete. Page number and archive count appear below.',
        '没有查到记录；这不代表用户没有相关活动。': 'No records found. This does not imply no activity.',
        '此项暂未获取成功，请稍后重新查询。': 'This section could not be loaded. Please try again later.',
        '暂无收录。': 'No archived records.', '查询完成。': 'Search complete.',
        '正在查询，繁忙时可能需要排队，请稍候…': 'Searching. Requests may queue when busy; please wait…',
        '部分资料获取失败；已显示成功的部分，可稍后重新查询。': 'Some sections failed to load. Available data is shown; please try again later.',
        '查询超时，请稍后重试。': 'Search timed out. Please try again later.', '查询已取消。': 'Search cancelled.',
        '查询过于频繁，请一分钟后重试。': 'Too many requests. Please try again in a minute.',
        '查询失败，请检查网络或稍后重试。': 'Search failed. Check your connection or try again later.',
        '请输入有效的数字 UID。': 'Please enter a valid numeric UID.'
    });
    const englishFragments = {
        '当前模式：':'Current mode: ','竞速':'Time Attack','常规':'Classic','当前难度：':'Current difficulty: ','限时 ':'Time limit: ','点击「开始游戏」出发！':'Select “Start game” to begin!',' 种花色':' suits',' 张牌':' cards','同花色的 K→A 连满 13 张会自动收起，收齐 8 组获胜':'A complete same-suit K-to-A run is removed automatically; complete all eight to win.','点击「开始游戏」发牌':'Select “Start game” to deal.','颗地雷':' mines','第一次点击必定安全':'The first click is always safe','正在加载单词词库…':'Loading word list…','单词词库加载失败，请刷新页面重试':'The word list failed to load. Refresh and try again.','填入 ':'Enter ',' 个字母':' letters','答案有 ':'The answer has ','还剩 ':'',' 次机会':' attempts left','已暂停':'Paused','继续游戏':'Resume game','切换到其他页面或其他小游戏会自动暂停，':'Switching pages or games pauses automatically. ','回到本页将自动继续':'Returning here resumes automatically.','难度：':'Difficulty: ','用时 ':'Time ','步数 ':'Moves ','新纪录！':'New record!','通关奖励 ':'Clear bonus ','最终得分 ':'Final score ','本局得分 ':'Score ','剩余时间加分 ':'Time bonus ','剩余道具加分 ':'Tool bonus ','剩余 ':'remaining ',' 次）':' times)','第 ':'',' 列':' column','发牌前每列都得有牌':'Every column must contain a card before dealing.','已悔棋':'Move undone','把第 ':'Move cards from column ','列的牌移到第 ':' to column ','收齐一组 ':'Completed one run of ','一次收起 ':'Completed ',' 组！':' runs!'
    };
    english['老板键 · Alt + B'] = 'Boss key · Alt + B';
    Object.assign(englishFragments, {'初级':'Beginner','中级':'Intermediate','高级':'Expert','坚持了 ':'Survived ','，翻开 ':' · Revealed ',' 个安全格':' safe cells','正面朝上':'face up','黑桃':'spades','红桃':'hearts','梅花':'clubs','方块':'diamonds'});
    Object.assign(english, {
        '核心已摧毁':'Core destroyed','对决结束':'Battle over','攻击间隔':'Attack interval','瞄准第一个方块':'Targeting first tile','选中第一个 · 瞄准第二个':'First selected · Targeting second tile','🌑 夜幕降临':'🌑 Nightfall','⚔ 同台竞技':'⚔ Match race','🔥 狂暴模式':'🔥 Rage mode','施放中':'Active','就绪':'Ready','机器人已锁定此类方块':'The robot locked this tile type.','BOSS 正在复活：可点选，暂时无法消除':'The BOSS is reviving: tiles may be selected but not cleared.','🔒 消除已冻结 · 可以观看、点选 · 复活结束后恢复消除':'🔒 Matching frozen · You may inspect and select · Matching resumes after revival','🔥 狂暴模式发动 · BOSS 正在重排剩余方块':'🔥 Rage mode · The BOSS is rearranging remaining tiles','普通攻击 · 基础 10 / 连击 +5':'Normal attack · Base 10 / Combo +5'
    });
    Object.assign(english, {
        '邪恶机器人 · 两条生命各 400 HP':'Evil Robot · Two lives with 400 HP each',
        '你拥有 300 HP · 初始地图 9×8 · 提示 3 次 / 重置 0 次':'You have 300 HP · Initial board 9×8 · 3 hints / 0 shuffles',
        '消除即攻击；在机器人选块时消除可打断并眩晕！':'Every match attacks. Match while the robot is selecting tiles to interrupt and stun it!',
        '消除即攻击 · 红色锁定的同类方块不可选 · 选块时攻击可打断':'Every match attacks · Red locked tile types cannot be selected · Attack during targeting to interrupt',
        '击败邪恶机器人！':'Evil Robot defeated!','对决失败':'Battle lost','再战一局':'Battle again',
        '恭喜通关！':'You cleared it!','时间到！':'Time’s up!','点击下方按钮或遮罩任意处继续':'Select the button below or anywhere on the overlay to resume',
        '棋盘已清空，自动补满，继续对决！':'Board cleared and refilled. Keep battling!','没有可消除的组合，自动洗牌！':'No available matches. Shuffling automatically!',
        '提示次数用完啦':'No hints remaining.','没有可消除的组合，请洗牌':'No available matches. Shuffle the board.','洗牌次数用完啦':'No shuffles remaining.','已重新洗牌':'Board shuffled.',
        '差一点点，再来一次吧！你可以尝试使用道具！':'Almost there—try again, and make use of the tools!',
        '点击两个相同图案、转弯不超过 2 次即可消除':'Select two matching tiles connected by a path with no more than two turns.',
        '这一格插着旗子，先取消标记吧':'This cell is flagged. Remove the flag first.','本局提示次数已用完':'No hints remain in this game.','没有可提示的格子了':'There are no cells left to reveal with a hint.',
        '排雷成功！':'Minefield cleared!','踩到地雷！':'Mine triggered!','标记模式开启：点击格子插旗':'Flag mode on: select a cell to place a flag.','标记模式关闭：点击格子翻开':'Flag mode off: select a cell to reveal it.','坚持了':'Survived','翻开':'Revealed','个安全格':'safe cells','黑桃':'spades','红桃':'hearts','梅花':'clubs','方块':'diamonds','正面朝上':'face up','本局得分':'Score','最终得分':'Final score','通关奖励':'Clear bonus','剩余时间加分':'Time bonus','剩余道具加分':'Tool bonus',
        '点击「开始游戏」出发，第一次点击必定安全':'Select “Start game” to begin. The first click is always safe.',
        '现在没有好走法，点牌堆发一轮牌吧':'No useful move is available. Deal another row from the stock.','填满当前行，然后按回车提交':'Fill the current row, then press Enter.','单词词库仍在加载，请稍候':'The word list is still loading. Please wait.',
        '经典模式：答案来自原版 Wordle 的 2,315 词答案池，共六次机会。':'Classic mode: the answer comes from the original 2,315-word Wordle answer list, with six attempts.',
        '绿色表示字母与位置都正确，黄色表示答案中有该字母但位置不对，灰色表示答案中没有可用的该字母。':'Green means the letter and position are correct; yellow means the letter occurs elsewhere; gray means no unused copy of that letter remains.',
        '长单词模式：答案为 6–9 字母，共八次机会。可填入最短 5 个、最长与答案等长的单词；短词可直接拖动整组方格选择起始对齐位置。绿字按对齐后的绝对位置判断，黄字会在答案全词中查找，灰字则表示答案全词中没有可用的该字母。':'Long Word mode: the answer has 6–9 letters and you have eight attempts. Guesses may range from five letters to the answer length; drag a shorter guess to choose its alignment. Green uses absolute aligned positions, yellow searches the whole answer, and gray means no unused copy of the letter remains anywhere in the answer.'
    });
    Object.assign(english, {
        '装甲破裂 · 地图补满 · 获得夜幕降临':'Armor broken · Board refilled · Nightfall unlocked',
        'BOSS 核心重启 · 10 秒无敌复活 · 消除冻结，可观看和点选':'BOSS core restarting · 10-second invincible revival · Matching is frozen; you may inspect and select tiles',
        '危险 · 狂暴觉醒 · 攻击加速 / 技能冷却减半':'Danger · Rage awakened · Faster attacks / Skill cooldowns halved',
        '夜幕降临 · 6 秒内图案不可见，仍可操作':'Nightfall · Tiles are hidden for 6 seconds, but controls remain active',
        '同台竞技 · 20 秒内挑战 4 次消除 · BOSS 无敌':'Match race · Make 4 matches within 20 seconds · BOSS is invincible',
        '狂暴模式 · 剩余方块重排':'Rage mode · Remaining tiles rearranged',
        '复活完成 · 消除已恢复 · 第二阶段，获得同台竞技':'Revival complete · Matching restored · Phase two; Match race unlocked'
    });
    Object.assign(englishFragments, {
        '💫 BOSS 已眩晕 ':'💫 BOSS stunned for ',' · 无法行动':' · cannot act','⚔ 同台竞技 · ':'⚔ Match race · ',' · 消除 ':' · matches ',' · 结束后结算':' · resolves at the end','🌑 夜幕降临 · ':'🌑 Nightfall · ',' · 仍可操作，小心 BOSS 普攻':' · controls remain active; watch for normal attacks','🔧 BOSS 正在复活 · 核心重启 ':'🔧 BOSS reviving · Core restart ',' · 无敌':' · invincible','第 ':'Life ',' / 2 条生命':' of 2',' · 狂暴':' · enraged','🌑 夜幕 ':'🌑 Nightfall ','⚔ 竞技 ':'⚔ Contest ',' · 你 ':' · You ',' / 目标 4':' / Target 4','命中 BOSS！':'Hit BOSS!','我方受伤！':'You took damage!','命中 ':'Hit ','受伤 ':'Damage '
    });
    englishFragments['第 '] = '';
    Object.assign(englishFragments, {'攻击间隔':'Attack interval','瞄准第一个方块':'Targeting first tile','选中第一个 · 瞄准第二个':'First selected · Targeting second tile','眩晕':'stunned','无敌复活':'invincible revival','🔥 狂暴模式':'🔥 Rage mode','施放中':'Active','就绪':'Ready'});
    // UI strings only. Track metadata, lyrics and user input are not translations.
    Object.assign(english, {
        '单曲循环':'Repeat one','随机播放':'Shuffle','顺序播放':'In order',
        '取消收藏':'Remove favorite','取消收藏当前歌曲':'Remove current song from favorites',
        '还没有播放历史':'No listening history yet','播放列表为空':'Your playlist is empty',
        '播放过的歌曲会保存在这里':'Songs you play will appear here','还没有收藏歌曲':'No favorites yet',
        '点击爱心收藏喜欢的歌曲':'Select the heart to save your favorite songs',
        '正在搜索…':'Searching…','没有找到相关歌曲':'No matching songs found',
        '在线音乐服务暂时无法连接，本地歌曲仍可播放':'Online music is unavailable. Local tracks can still be played.',
        '搜索失败，请稍后重试':'Search failed. Please try again later.',
        '请输入歌曲、歌手或专辑名':'Enter a song, artist, or album name',
        '浏览器阻止了播放，请再次点击播放':'Playback was blocked by the browser. Select Play again.',
        '浏览器存储空间不足，历史或收藏可能无法保存':'Browser storage is full. History or favorites may not be saved.',
        '这首歌暂时无法播放':'This track is currently unavailable','播放失败，请稍后重试':'Playback failed. Please try again later.',
        '本地音乐加载失败':'Failed to load local music','歌曲链接已失效，重新解析后仍无法播放':'The track URL expired and could not be refreshed.',
        '已清除全部播放历史':'Listening history cleared','已清除全部本地音乐数据':'All local music data cleared',
        '实时歌词已关闭':'Live lyrics are disabled','暂无歌词':'No lyrics available','歌词加载中…':'Loading lyrics…',
        '已开启，之后播放的歌曲不会加入历史记录。':'Enabled. Newly played songs will not be added to history.',
        '已开启，实时歌词不会加载或显示。':'Enabled. Live lyrics will not load or display.',
        '已关闭，歌词保留在音乐栏。':'Disabled. Lyrics remain in the player.',
        '未知歌曲':'Unknown track','未知歌手':'Unknown artist','经典':'Classic',
        '没有找到匹配的缩写':'No matching initialism found','未知缩写':'Unknown initialism',
        '暂无已收录释义':'No meanings available','有可能是：':'Possible meanings:',
        '请输入至少两个连续的字母或数字':'Enter at least two consecutive letters or numbers',
        '正在寻找可能的原文…':'Looking up possible meanings…','查询暂时不可用，请稍后再试':'Lookup is unavailable. Please try again later.',
        '图片导出失败':'Image export failed','已恢复默认快捷键。':'Default shortcut restored.',
        '浏览器助手已连接。切换优先选择最近使用的其他标签页；没有其他网页时保留首页。':'Browser helper connected. Switch to the most recently used other tab, or stay on Home if none exists.'
    });
    Object.assign(englishFragments, {
        '单色':'One suit','双色':'Two suits','四色':'Four suits',
        '用时':'Time','步数':'Moves','最佳':'Best','最终得分':'Final score',
        '本局得分':'Score','通关奖励':'Clear bonus','坚持了':'Survived',
        '，翻开':' · Revealed','，最终得分':' · Final score','发牌 ×':'Deal ×'
    });
    Object.assign(english, {
        '本站大部分代码，除非特殊说明，采用MIT协议开源。仅“连连看游戏的boss对决模式”“wordle游戏的长单词模式”以及“全部鲜蔬杯页面”由于涉及到大量个人独特原创设计，采用':'Most code on this site is released under the MIT License unless stated otherwise. Tile Match BOSS Battle, Wordle Long Word mode, and all F.V. Cup pages use the',
        '协议，限制免费商用，但个人/非盈利项目依旧不受限制。详见':'license, which restricts commercial use while permitting personal and nonprofit use. See',
        '第三方来源声明：“外观设置”中的两项高级视觉效果，本地预设歌曲“没有如果”，在线歌曲服务，“缩写转义”功能，“Favicon 图包生成功能”，“wordle游戏中内置的各类词库以及词性、翻译文本”，“鲜蔬杯页面涉及到的明日方舟游戏文本及计算逻辑”等内容，为第三方提供，非本站原创，本站也不对其效果和稳定性作保证。详见':'Third-party notice: the two advanced appearance effects, the bundled track “If Only,” online music services, the acronym decoder, favicon package generator, Wordle dictionaries and linguistic data, and Arknights text and calculation logic used by the F.V. Cup pages come from third parties. They are not original site content, and their accuracy and availability are not guaranteed. See the',
        '隐私和个人信息声明：本站是Github Pages纯前端静态页面，不设后端服务器，不会在云端保存任何用户信息，也不会对任何用户的访问信息做收集和统计。关于一些设置和历史的记录，全部保存在您的浏览器本地，云端不可见，您自行清除本站浏览器数据即可完全删除。当然，换句话说，您使用不同的设备或浏览器访问本网站，设置与历史记录将':'Privacy and personal information: this is a static GitHub Pages site with no project-operated backend. It does not store personal information in the cloud or collect visitor analytics. Settings and history remain only in your browser and can be removed by clearing the site data. Settings and history on different devices or browsers',
        '特殊提醒：在线音乐以及缩写转义功能，由于使用第三方接口，您的请求将从您的设备直接访问第三方服务，对于第三方服务对请求和数据 可能的 记录或收集，本站不作保证。但注意，本站':'Special notice: online music and acronym lookup use third-party services contacted directly from your device. Those providers may log or collect ordinary request data under their own policies. This site',
        '主动默默访问第三方服务，仅在您使用”音乐栏的搜索和非本地歌曲（“没有如果”）播放”以及“缩写转义的输入”时会访问第三方，若您不想接触第三方服务，不使用上述功能即可。':'contact third-party services silently. Requests are made only when you search the music player, play a non-local track, or submit an acronym lookup. Avoid those features if you do not want to contact third-party services.',
        '版权声明：在线音乐的搜索结果、封面、歌词与播放地址由':'Copyright notice: online music search results, cover art, lyrics, and playback URLs are provided by',
        '及其上游内容来源提供，本地歌曲“没有如果”来自于':'and its upstream content sources. The bundled track “If Only” comes from this',
        '，本站不主张拥有这些内容的版权。':'. This site does not claim ownership of that content.',
        '特别致歉：':'Special apology:',
        '，dbq周哥，实在是没忍住。':'. Sorry, Zhou—I really could not resist.',
        '—— M-E-L-S.github.io':'— M-E-L-S.github.io','—— M.E.':'— M.E.',
        '提示：直接翻开一个安全格':'Hint: reveal a safe cell',
        '标记模式：开启后点击格子即为插旗':'Flag mode: select a cell to place a flag',
        '已翻开安全格比例':'Proportion of safe cells revealed',
        '提示：高亮一步可行的移动':'Hint: highlight a legal move',
        '已完成牌组比例':'Proportion of completed runs','点击发牌：每列各发一张':'Deal one card to each column',
        '输入一个五字母英文单词':'Enter a five-letter English word','Wordle 猜测记录':'Wordle guesses','屏幕键盘':'On-screen keyboard',
        '在线音乐搜索':'Online music search','关闭音乐面板':'Close music search','搜索歌曲':'Search songs','搜索':'Search',
        '「能不能好好说话？」':'“Can We Speak Plainly?”',
        '关闭音乐列表':'Close music library','音量':'Volume','音乐音量':'Music volume',
        '工具暂时加载失败，请检查网络后再次点击。当前页面不会刷新。':'The tool could not load. Check your connection and try again. The current page will stay open.',
        '已重置所有选择！':'All selections reset.',
        '项目':'Item','次数':'Count','单次分数':'Points each','小计':'Subtotal','最终结算':'Final total','成绩单':'Score sheet','个人结算分':'Individual total',
        '✨ 我来成为神明 ✨':'✨ I will become a god ✨','✦ 我来成为神明 ✦':'✦ I will become a god ✦'
    });
    Object.assign(englishFragments, {
        '成绩单 (模式:':'Score sheet (mode:','成绩单（模式：':'Score sheet (mode:',
        '我方生命 ':'Your HP ',' · BOSS 生命 ':' · BOSS HP ',' · 无敌':' · invincible'
    });
    // Longest first prevents a short label from consuming a more specific phrase.
    const fragments = Object.entries(englishFragments).sort((a, b) => b[0].length - a[0].length);
    const originals = new WeakMap();
    const attributes = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'data-damage'];
    let preference = 'auto';
    let language = 'zh-CN';
    let observer;

    function resolveLanguage(value) {
        if (value === 'en' || value === 'zh-CN') return value;
        return /^zh\b/i.test(navigator.language || '') ? 'zh-CN' : 'en';
    }
    function translateValue(value) {
        const leading = value.match(/^\s*/)[0];
        const trailing = value.match(/\s*$/)[0];
        const core = value.trim();
        let translated = Object.hasOwn(english, core) ? english[core] : undefined;
        let dynamic;
        if (!translated) {
            if ((dynamic = core.match(/^(正在加载|正在播放|已取消收藏|已收藏)：(.*)$/))) {
                translated = ({'正在加载':'Loading','正在播放':'Now playing','已取消收藏':'Removed favorite','已收藏':'Favorited'})[dynamic[1]] + ': ' + dynamic[2];
            } else if ((dynamic = core.match(/^(顺序播放|随机播放|单曲循环) · (\d+) 首歌曲$/))) {
                translated = `${english[dynamic[1]]} · ${dynamic[2]} track${dynamic[2] === '1' ? '' : 's'}`;
            } else if ((dynamic = core.match(/^(最近播放|已收藏|找到) (\d+) 首(?:歌曲)?$/))) {
                translated = `${({'最近播放':'Recently played','已收藏':'Favorited','找到':'Found'})[dynamic[1]]}: ${dynamic[2]} track${dynamic[2] === '1' ? '' : 's'}`;
            } else if ((dynamic = core.match(/^已切换为(顺序播放|随机播放|单曲循环)$/))) translated = `Playback order: ${english[dynamic[1]]}`;
            else if ((dynamic = core.match(/^音量 (\d+)%$/))) translated = `Volume ${dynamic[1]}%`;
            else if ((dynamic = core.match(/^切换(游戏|功能)[，（]当前：(.+?)）?$/))) translated = `Switch ${dynamic[1] === '游戏' ? 'game' : 'tool'} (current: ${english[dynamic[2]] || dynamic[2]})`;
            else if ((dynamic = core.match(/^老板键 · (.+)$/))) translated = `Boss key · ${dynamic[1]}`;
            else if ((dynamic = core.match(/^已保存：(.+)。若被浏览器或系统占用，请换一个组合。$/))) translated = `Saved: ${dynamic[1]}. Choose another combination if the browser or system uses it.`;
            else if ((dynamic = core.match(/^(\d+) × (\d+) 像素图标预览$/))) translated = `${dynamic[1]} × ${dynamic[2]} pixel icon preview`;
            else if ((dynamic = core.match(/^(音乐服务响应异常|本地音乐加载失败)（(\d+)）$/))) translated = `${dynamic[1] === '音乐服务响应异常' ? 'Music service error' : 'Local music failed to load'} (${dynamic[2]})`;
            else if (core === '个人成绩单') translated = 'Individual score sheet';
        }
        if (!translated) {
            let match;
            if ((match = core.match(/^(.+) · 小游戏 · MELS$/))) translated = `${english[match[1]] || match[1]} · Games · MELS`;
            else if ((match = core.match(/^当前模式：(.+)（(\d+)×(\d+)，限时 (.+)）$/))) translated = `Current mode: ${english[match[1]] || match[1]} (${match[2]}×${match[3]}, time limit ${match[4]})`;
            else if ((match = core.match(/^总分:\s*(-?\d+)$/))) translated = `Total: ${match[1]}`;
            else if ((match = core.match(/^总计个人得分:\s*(-?\d+)$/))) translated = `Total individual score: ${match[1]}`;
            else if ((match = core.match(/^作词\s*:\s*(.+)$/))) translated = `Lyrics: ${match[1]}`;
            else if ((match = core.match(/^\/8 组$/))) translated = '/8 runs';
            else if ((match = core.match(/^(\d+) 字母$/))) translated = `${match[1]} letters`;
            else if ((match = core.match(/^还剩 (\d+) 次机会$/))) translated = `${match[1]} attempts left`;
            else if ((match = core.match(/^\+(\d+)\s+连击×(\d+)$/))) translated = `+${match[1]}  Combo ×${match[2]}`;
            else if ((match = core.match(/^猜对了！答案是 (.+)$/))) translated = `Correct! The answer is ${match[1]}`;
            else if ((match = core.match(/^本局结束，答案是 (.+)$/))) translated = `Game over. The answer was ${match[1]}`;
            else if ((match = core.match(/^第 (\d+) 行第 (\d+) 列，(.+)$/))) {
                const cellStates = {'未翻开':'covered','地雷':'mine','空白':'empty','已插旗':'flagged'};
                let state = cellStates[match[3]] || match[3].replace(/^周围 (\d+) 颗地雷$/, '$1 adjacent mines');
                translated = `Row ${match[1]}, column ${match[2]}, ${state}`;
            }
            else if ((match = core.match(/^拖动当前字母组调整对齐 · 第 (\d+) 位$/))) translated = `Drag the current letter group to align · Position ${match[1]}`;
            else if ((match = core.match(/^(.+) · (\d+) 字母$/))) translated = `${english[match[1]] || match[1]} · ${match[2]} letters`;
            else if ((match = core.match(/^第 (\d+) 列，空$/))) translated = `Column ${match[1]}, empty`;
            else if ((match = core.match(/^第 (\d+) 列，(\d+) 张牌$/))) translated = `Column ${match[1]}, ${match[2]} cards`;
            else if ((match = core.match(/^第 (\d+) 列第 (\d+) 张，(.+)$/))) translated = `Column ${match[1]}, card ${match[2]}, ${english[match[3]] || match[3]}`;
            else if ((match = core.match(/^牌堆，还剩 (\d+) 张，可发 (\d+) 轮$/))) translated = `Stock: ${match[1]} cards, ${match[2]} deals left`;
            else if ((match = core.match(/^发牌，剩余 (\d+) 组$/))) translated = `Deal cards, ${match[1]} deals left`;
            else if ((match = core.match(/^请输入 (\d+)(?:–(\d+))? 个字母$/))) translated = match[2] ? `Enter ${match[1]}–${match[2]} letters` : `Enter ${match[1]} letters`;
            else if ((match = core.match(/^考试五字模式：答案从 (.+) 词库的五字母单词中抽取，共六次机会。绿色表示字母与位置都正确，黄色表示答案中有该字母但位置不对，灰色表示答案中没有可用的该字母。$/))) translated = `Exam five-letter mode: answers are drawn from the ${english[match[1]] || match[1]} list, with six attempts. Green means correct letter and position, yellow means the letter appears elsewhere, and gray means no unused copy remains.`;
            else if ((match = core.match(/^第 (\d+) \/ 2 条生命(.*)$/))) translated = `Life ${match[1]} of 2${match[2].replace('狂暴','enraged').replace('无敌','invincible')}`;
            else if ((match = core.match(/^打断成功 · 眩晕 (\d+(?:\.\d+)?) 秒$/))) translated = `Interrupt successful · Stunned for ${match[1]} seconds`;
            else if ((match = core.match(/^竞技失败 · 消除 (\d+)\/4 · 受到 (\d+) 伤害$/))) translated = `Match race lost · ${match[1]}/4 matches · Took ${match[2]} damage`;
            else if ((match = core.match(/^竞技成功 · 消除 (\d+)\/4 · 提示 \+(\d+)(?: · BOSS 眩晕 (\d+) 秒)?$/))) translated = `Match race won · ${match[1]}/4 matches · Hints +${match[2]}${match[3] ? ` · BOSS stunned for ${match[3]} seconds` : ''}`;
            else if ((match = core.match(/^我方生命 (\d+)\/(\d+) · BOSS 生命 (\d+)\/400$/))) translated = `Your HP ${match[1]}/${match[2]} · BOSS HP ${match[3]}/400`;
            else if ((match = core.match(/^用时 (.+)，剩余时间加分 \+(\d+)，剩余道具加分 \+(\d+)$/))) translated = `Time ${match[1]} · Time bonus +${match[2]} · Tool bonus +${match[3]}`;
            else if ((match = core.match(/^已为你翻开一个安全格（剩余 (\d+) 次）$/))) translated = `Revealed one safe cell for you (${match[1]} hints remaining).`;
            else if ((match = core.match(/^(.+) · (\d+)×(\d+) · 第一次点击必定安全$/))) translated = `${english[match[1]] || match[1]} · ${match[2]}×${match[3]} · The first click is always safe`;
            else if ((match = core.match(/^当前难度：(.+)（(\d+)×(\d+) · (\d+) 颗地雷）$/))) translated = `Current difficulty: ${english[match[1]] || match[1]} (${match[2]}×${match[3]} · ${match[4]} mines)`;
            else if ((match = core.match(/^难度：(.+) · 用时 (.+?)(?: · 步数 (\d+))?(?: · (新纪录！|最佳 .+))?$/))) translated = `Difficulty: ${english[match[1]] || match[1]} · Time ${match[2]}${match[3] ? ` · Moves ${match[3]}` : ''}${match[4] ? ` · ${match[4] === '新纪录！' ? 'New record!' : match[4].replace('最佳 ', 'Best ')}` : ''}`;
            else if ((match = core.match(/^通关奖励 \+(\d+)，最终得分 (\d+)$/))) translated = `Clear bonus +${match[1]} · Final score ${match[2]}`;
            else if ((match = core.match(/^坚持了 (.+)，翻开 (\d+) \/ (\d+) 个安全格$/))) translated = `Survived ${match[1]} · Revealed ${match[2]} / ${match[3]} safe cells`;
            else if ((match = core.match(/^另有 (\d+) 面旗子插错了位置（❌）$/))) translated = `${match[1]} other flag${match[1] === '1' ? '' : 's'} placed incorrectly (❌)`;
            else if ((match = core.match(/^第 (\d+) 列是空的，发牌前每列都得有牌$/))) translated = `Column ${match[1]} is empty. Every column must contain a card before dealing.`;
            else if ((match = core.match(/^已悔棋(?:，继续加油)?（剩余 (\d+) 次）$/))) translated = `Move undone (${match[1]} undos remaining).`;
            else if ((match = core.match(/^现在没有好走法，点牌堆发一轮牌吧（剩余 (\d+) 次）$/))) translated = `No useful move is available. Deal another row from the stock (${match[1]} hints remaining).`;
            else if ((match = core.match(/^把第 (\d+) 列的牌移到第 (\d+) 列（剩余 (\d+) 次）$/))) translated = `Move the cards from column ${match[1]} to column ${match[2]} (${match[3]} hints remaining).`;
            else if ((match = core.match(/^(.+) · 把同花色的 K→A 收齐 8 组即可获胜$/))) translated = `${english[match[1]] || match[1]} · Complete eight same-suit K-to-A runs to win.`;
            else if ((match = core.match(/^已收 (\d+)\/8 组$/))) translated = `Completed ${match[1]}/8 runs`;
            else if ((match = core.match(/^一次收起 (\d+) 组！\+(\d+) 分$/))) translated = `Completed ${match[1]} runs! +${match[2]} points`;
            else if ((match = core.match(/^收齐一组 (.+)！\+(\d+) 分$/))) translated = `Completed one ${match[1]} run! +${match[2]} points`;
            else if ((match = core.match(/^当前难度：(.+)（(\d+) 种花色 · (\d+) 张牌）$/))) translated = `Current difficulty: ${english[match[1]] || match[1]} (${match[2]} suit${match[2] === '1' ? '' : 's'} · ${match[3]} cards)`;
            else if ((match = core.match(/^答案有 (\d+) 个字母；填入 5–(\d+) 个字母$/))) translated = `The answer has ${match[1]} letters; enter 5–${match[2]} letters.`;
        }
        if (!translated) {
            let replaced = core;
            fragments.forEach(([source, target]) => { replaced = replaced.split(source).join(target); });
            if (replaced !== core) translated = replaced;
        }
        return translated ? leading + translated + trailing : value;
    }
    // Explicit source binding for new dynamic UI. Parameters remain data, so a
    // song called “随机播放” cannot be changed by fragment replacement.
    const bindings = new Map();
    function format(source, params = {}) {
        const template = language === 'en' ? translateValue(String(source)) : String(source);
        return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
    }
    function bind(element, source, params = {}) {
        bindings.set(element, { source, params: { ...params } });
        element.textContent = format(source, params);
    }
    function translateNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (bindings.has(node.parentElement)) return;
            if (node.parentElement?.closest('[translate="no"], script, style, textarea, code, pre, [contenteditable="true"]')) return;
            if (!originals.has(node)) originals.set(node, node.nodeValue);
            const original = originals.get(node);
            const next = language === 'en' ? translateValue(original) : original;
            if (node.nodeValue !== next) node.nodeValue = next;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.closest('[translate="no"], script, style, textarea, code, pre, [contenteditable="true"]')) return;
        attributes.forEach((name) => {
            if (!node.hasAttribute(name)) return;
            let saved = originals.get(node);
            if (!saved || typeof saved !== 'object') { saved = {}; originals.set(node, saved); }
            if (!(name in saved)) saved[name] = node.getAttribute(name);
            const original = saved[name];
            const next = language === 'en' ? translateValue(original) : original;
            if (node.getAttribute(name) !== next) node.setAttribute(name, next);
        });
        Array.from(node.childNodes).forEach(translateNode);
    }
    function captureMutation(record) {
        const node = record.target;
        if (record.type === 'characterData') {
            originals.set(node, node.nodeValue);
        } else if (record.type === 'attributes') {
            let saved = originals.get(node);
            if (!saved || typeof saved !== 'object') saved = {};
            saved[record.attributeName] = node.getAttribute(record.attributeName);
            originals.set(node, saved);
        }
    }
    function apply(root) {
        // Preserve pending application writes before disconnecting on a language switch.
        observer?.takeRecords().forEach(captureMutation);
        observer?.disconnect();
        translateNode(root || document.documentElement);
        bindings.forEach(({ source, params }, element) => {
            if (!element.isConnected) bindings.delete(element);
            else element.textContent = format(source, params);
        });
        document.documentElement.lang = language;
        observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
        window.dispatchEvent(new CustomEvent('mels-languagechange', { detail: { language, preference } }));
    }
    function setLanguage(value) {
        preference = ['auto', 'zh-CN', 'en'].includes(value) ? value : 'auto';
        language = resolveLanguage(preference);
        try { localStorage.setItem(STORAGE_KEY, preference); } catch (_) {}
        apply();
        const select = document.getElementById('language-select');
        if (select) select.value = preference;
    }
    try { preference = localStorage.getItem(STORAGE_KEY) || 'auto'; } catch (_) {}
    language = resolveLanguage(preference);
    window.MELSI18n = { get language() { return language; }, get preference() { return preference; }, setLanguage, bind, t: (value, params) => format(value, params).trim() };
    function init() {
        const select = document.getElementById('language-select');
        if (select) { select.value = preference; select.addEventListener('change', () => setLanguage(select.value)); }
        observer = new MutationObserver((records) => {
            observer.disconnect();
            // Capture the complete batch before translating: one node may have been
            // written several times in the same tick. Never save our English output
            // as the Chinese source on the second record.
            records.forEach(captureMutation);
            records.forEach((record) => {
                if (record.type === 'characterData' || record.type === 'attributes') {
                    translateNode(record.target);
                }
                else record.addedNodes.forEach(translateNode);
            });
            observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
        });
        apply();
        window.addEventListener('languagechange', () => { if (preference === 'auto') { language = resolveLanguage('auto'); apply(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
