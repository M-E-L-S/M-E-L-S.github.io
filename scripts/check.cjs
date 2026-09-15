// Static build integrity checks; these do not replace browser interaction testing.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const routes = ['index.html','about/index.html','tools/index.html','tools/acronym/index.html','minigame/index.html','minigame/link/index.html','minigame/minesweeper/index.html','minigame/spider/index.html','minigame/wordle/index.html','freshcup/index.html','freshcup/sarkaz/index.html','freshcup/sami/index.html','freshcup/calculator/index.html'];
const requiredNotices = ['LICENSE.md','FRESHCUP-NONCOMMERCIAL-LICENSE.md','BOSS-NONCOMMERCIAL-LICENSE.md','LONG-WORDLE-NONCOMMERCIAL-LICENSE.md','THIRD_PARTY_AND_CONTENT_NOTICE.md','vendor/CanvasUI-LICENSE.md'];
for (const notice of requiredNotices) {
 if(!fs.existsSync(path.join(root,notice))) throw Error(`Missing license or notice: ${notice}`);
}
if(!fs.readFileSync(path.join(root,'LICENSE.md'),'utf8').includes('FRESHCUP-NONCOMMERCIAL-LICENSE.md')) throw Error('F.V. cup noncommercial scope is missing from LICENSE.md');
for (const obsolete of ['src/scripts/letter-cloth.js','src/scripts/timeline-ripple.js','src/scripts/timeline-water-reveal.js','vendor/cloth.js','vendor/ripple.js','freshcup/scoreboard_3.html','freshcup/scoreboard_4.html','freshcup/scoreboard_5.html','freshcup/calculator.html']) {
 if(fs.existsSync(path.join(root,obsolete))) throw Error(`Obsolete file remains: ${obsolete}`);
}
for(const route of routes) {
 const html=fs.readFileSync(path.join(root,route),'utf8');
 if(/<iframe\b/i.test(html)) throw Error(`${route}: embedded page remains`);
 for(const m of html.matchAll(/(?:src|href)="(\/?(?:src|vendor|assets)\/[^"?]+)(?:\?[^" ]*)?"/g)) {
  if(!fs.existsSync(path.join(root,m[1].replace(/^\//,'')))) throw Error(`Missing resource: ${m[1]}`);
 }
 for(const marker of ['id="explore"','id="freshcup-tool"','id="freshcup-tool-theme"','id="freshcup-tool-script"','data-freshcup-tool','freshcup-navigation.js','id="settings-dialog"','id="theme-color"','id="music-player"','particle-title.js']) {
  if(!html.includes(marker)) throw Error(`${route}: missing ${marker}`);
 }
 if(html.indexOf('freshcup-navigation.js') > html.indexOf('</head>')) throw Error(`${route}: F.V. cup navigation listener loads too late`);
 const open=html.indexOf('<main '), fresh=html.indexOf('id="freshcup"'), close=html.indexOf('</main>');
 if(!(open<fresh && fresh<close)) throw Error(`${route}: F.V. cup is outside the shared main content`);
 for(const href of ['/tools/acronym/','/minigame/link/','/minigame/minesweeper/','/minigame/spider/','/minigame/wordle/']) {
  if(!html.includes(`href="${href}"`)) throw Error(`${route}: missing direct route ${href}`);
 }
 console.log(`OK ${route}`);
}
