const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const crypto = require('node:crypto');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const write = (p,s) => { const dest=path.join(root,p); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,s.replace(/[\t ]+$/gm,'')); };
let shell = read('src/site.html');
const home = read('src/pages/home-sections.html');
shell = shell.replace(/\n    <\/div>\s*\n    <!-- HOME_SECTIONS -->/, '\n'+home+'\n    </div>');
const tools = [['scoreboard_5','界园计分器',''],['scoreboard_4','萨卡兹计分器','sarkaz/'],['scoreboard_3','萨米计分器','sami/'],['calculator','伤害计算器','calculator/']];
function freshcup(tool) {
  const tabs=tools.map(([id,title,url])=>`<a href="/freshcup/${url}" data-freshcup-tool="${id}" ${id===tool?'aria-current="page"':''}>${title}</a>`).join('');
  return `<section class="page" id="freshcup"><header class="section-heading"><p class="eyebrow">THE TOOLKIT</p><h1>鲜蔬杯工具中心</h1><p>记录每一场挑战，算清每一次伤害。</p></header><nav class="tool-tabs" aria-label="鲜蔬杯工具">${tabs}</nav><div id="freshcup-tool">${read('src/pages/freshcup/'+tool+'.html')}</div></section>`;
}
function render(tool='scoreboard_5') {
  return shell.replace('<!-- FRESHCUP_PAGE -->',freshcup(tool)).replace('</head>',`<link id="freshcup-tool-theme" rel="stylesheet" href="/src/styles/freshcup/${tool}.theme.css"><link rel="stylesheet" href="/src/styles/freshcup-native.css"></head>`).replace('<!-- TOOL_SCRIPT -->',`<script id="freshcup-tool-script" data-tool="${tool}" src="/src/scripts/freshcup/${tool}.js"></script>`).replace(/(src|href)="(\/?(?:src|vendor)\/[^"?]+)(?:\?[^" ]*)?"/g,(_,attr,file)=>`${attr}="${file}?v=${crypto.createHash('sha256').update(read(file.replace(/^\//,''))).digest('hex').slice(0,10)}"`);
}
const palette = {
 '#1a1a2e':'var(--page-bg)', '#2a2a3e':'var(--surface)', '#3a3a4e':'var(--button-bg)', '#4a4a5e':'var(--track)',
 '#3a2a4e':'var(--button-bg)', '#4a3a5e':'var(--track)', '#4a4a6a':'var(--track)', '#4a4a7a':'var(--border)', '#5a5a7a':'var(--border)',
 '#8a2be2':'var(--accent)', '#9a3bf2':'var(--accent-soft)', '#a0a0c0':'var(--secondary)', '#b0b0d0':'var(--secondary)', '#e0e0e0':'var(--body-text)',
 '#505050':'var(--page-bg)', '#f5f5f5':'var(--button-bg)', '#d0d0d0':'var(--border)', '#ddd':'var(--divider)', '#ccc':'var(--border)',
 '#333':'var(--text)', '#444':'var(--body-text)', '#888':'var(--muted)', '#e9e9e9':'var(--track)', '#d8d8d8':'var(--track)',
 '#d4e1f9':'var(--button-bg)', '#4a90e2':'var(--accent)', '#fff':'var(--surface)', '#ffffff':'var(--surface)'
};
for (const [tool] of tools) write(`src/styles/freshcup/${tool}.theme.css`, read(`src/styles/freshcup/${tool}.css`).replace(/#[a-f\d]{3,8}\b/gi,hex=>palette[hex.toLowerCase()]||hex));
for (const route of ['','about','tools','tools/acronym','minigame','minigame/link','minigame/minesweeper','minigame/spider','minigame/wordle','freshcup']) write((route?route+'/':'')+'index.html',render());
for (const [id,,url] of tools) {
  if(url) write('freshcup/'+url+'index.html',render(id));
  // Original root-level public URLs remain usable as lightweight redirects.
  write(id+'.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/freshcup/${url}"><title>鲜蔬杯 · MELS</title><link rel="canonical" href="/freshcup/${url}"></head><body><a href="/freshcup/${url}">进入${tools.find(t=>t[0]===id)[1]}</a></body></html>`);
}
console.log('Built shared shell, main routes, direct tool/game routes and four native Fresh Cup tools.');
