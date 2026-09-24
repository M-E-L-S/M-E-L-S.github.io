const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let controller;
const engineUrl = new URL('./arg-engine.js', document.currentScript.src);
engineUrl.search = new URL(document.currentScript.src).search;
const enginePromise = import(engineUrl.href);
const parallelUrl=new URL('./arg-parallel.js',document.currentScript.src);
parallelUrl.search=engineUrl.search;
const parallelModulePromise=()=>import(parallelUrl.href);
const acgUrl=new URL('./arg-acg.js',document.currentScript.src);
acgUrl.search=engineUrl.search;
const dataVersion=engineUrl.search;
const acgModulePromise=()=>import(acgUrl.href);
let dictionaryPromise;
let acgPromise;
const bindText=(element,source,params={})=>window.MELSI18n?window.MELSI18n.bind(element,source,params):element.textContent=source.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(params,key)?params[key]:match);
function loadEnglishDictionary(){
    if(!dictionaryPromise)dictionaryPromise=fetch('/assets/data/arg-english-words.txt').then(response=>{if(!response.ok)throw new Error(`Dictionary HTTP ${response.status}`);return response.text();}).then(text=>new Set(text.toLowerCase().split(/\s+/).filter(Boolean)));
    return dictionaryPromise;
}
function loadAcgData(){
    if(!acgPromise)acgPromise=Promise.all([
        acgModulePromise(),
        fetch('/assets/data/arg-acg-names.json'+dataVersion).then(response=>{if(!response.ok)throw new Error(`ACG JSON HTTP ${response.status}`);return response.json();}),
        fetch('/assets/data/arg-acg-words.txt'+dataVersion).then(response=>{if(!response.ok)throw new Error(`ACG words HTTP ${response.status}`);return response.text();})
    ]).then(([module,entries,words])=>module.createAcgData(entries,words)).catch(error=>{acgPromise=null;throw error;});
    return acgPromise;
}

function render(results, container, acgData=null, matchAcgNames=null) {
    if (!results.length) { container.innerHTML='<p class="arg-empty"></p>';bindText(container.firstElementChild,'没有找到可信候选。可提高深度或节点预算后重试。');return; }
    container.innerHTML=results.map((item,index)=>`<article class="arg-result">
        <div class="arg-result-head"><span class="arg-result-rank"></span><span class="arg-score"></span></div>
        <pre class="arg-output" translate="no">${escapeHtml(item.text)}</pre>
        <div class="arg-recipe" aria-label="解码路径">${item.path.map((step,i)=>`${i?'<span class="arg-arrow">→</span>':''}<a class="arg-step" href="/tools/arg/reference/#decoder-${encodeURIComponent(step.decoder)}" title="查看 ${escapeHtml(step.label)} 介绍">${escapeHtml(step.label)} · ${Math.round(step.confidence*100)}%</a>`).join('')}</div>
        <p class="arg-evidence">${item.evidence.map(evidence=>`<span class="arg-evidence-item">${escapeHtml(evidence)}</span>`).join('<span aria-hidden="true"> · </span>')}</p>
        ${acgData ? (()=>{const matches=matchAcgNames(item.text,acgData);return matches.length?`<p class="arg-acg"><span>？可能的ACG Name：</span>${matches.map(match=>match.entry&&/^https:\/\/bangumi\.tv\/character\/\d+$/.test(match.entry.url)?`<a translate="no" href="${escapeHtml(match.entry.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match.text)}（${escapeHtml(match.entry.chinese)}）</a>`:`<span translate="no" class="arg-acg-bare">${escapeHtml(match.text)}</span>`).join('、')}</p>`:'';})() : ''}
        <button class="game-btn arg-copy" type="button" data-copy="${index}"></button>
    </article>`).join('');
    container.querySelectorAll('.arg-result').forEach((article,index)=>{const item=results[index];bindText(article.querySelector('.arg-result-rank'),'候选 {index}',{index:index+1});bindText(article.querySelector('.arg-score'),'文本评分 {score} · 深度 {depth}',{score:item.score.toFixed(1),depth:item.depth});article.querySelectorAll('.arg-evidence-item').forEach((element,i)=>bindText(element,item.evidence[i]));});
    container.querySelectorAll('.arg-copy').forEach(button=>{bindText(button,'复制结果');button.addEventListener('click',async()=>{await navigator.clipboard.writeText(results[+button.dataset.copy].text);bindText(button,'已复制');});});
}

function init() {
    const form=document.getElementById('arg-form'),input=document.getElementById('arg-input'),results=document.getElementById('arg-results'),summary=document.getElementById('arg-summary'),run=document.getElementById('arg-run'),stop=document.getElementById('arg-stop'),acgToggle=document.getElementById('arg-acg-toggle');
    if(!form)return;
    const depthSelect=document.getElementById('arg-depth'),budgetSelect=document.getElementById('arg-budget'),modeSelect=document.getElementById('arg-mode'),workerSelect=document.getElementById('arg-workers'),effortSelect=document.getElementById('arg-effort');
    const reportedThreads=Math.max(1,Math.floor(navigator.hardwareConcurrency||4));
    const workerCounts=[];
    for(let count=1;count<=reportedThreads;count*=2)workerCounts.push(count);
    if(workerCounts.at(-1)!==reportedThreads)workerCounts.push(reportedThreads);
    for(const count of workerCounts)workerSelect.add(new Option(String(count),String(count),false,count===Math.min(4,reportedThreads)));
    bindText(document.getElementById('arg-thread-info'),navigator.hardwareConcurrency?'检测到本机有 {count} 个可用逻辑线程；搜索力度会按照实际情况自动调整总节点数。':'浏览器未报告逻辑线程数，暂按 {count} 个提供选项；搜索力度会自适应调整搜索宽度。',{count:reportedThreads});
    const updateMode=()=>{
        const parallel=modeSelect.value==='parallel';
        document.querySelectorAll('.arg-standard-control').forEach(element=>element.hidden=parallel);
        document.querySelectorAll('.arg-parallel-control').forEach(element=>element.hidden=!parallel);
    };
    modeSelect.addEventListener('change',updateMode);updateMode();
    const searchPanel=document.getElementById('arg-search-panel'),referencePanel=document.getElementById('arg-reference-panel');
    const showArgPage=()=>{
        if(!location.pathname.startsWith('/tools/arg'))return;
        const reference=location.pathname.startsWith('/tools/arg/reference');
        searchPanel.hidden=reference;referencePanel.hidden=!reference;
        document.querySelectorAll('[data-arg-page]').forEach(link=>link.toggleAttribute('aria-current',(link.dataset.argPage==='reference')===reference));
        document.title=reference?'支持的编码与密码 · ARG 辅助器 · MELS':'ARG 辅助器 · 小功能 · MELS';
        if(reference&&location.hash){
            const entry=document.getElementById(decodeURIComponent(location.hash.slice(1)));
            entry?.closest('.arg-category')?.setAttribute('open','');
        }
    };
    showArgPage();addEventListener('popstate',showArgPage);
    addEventListener('hashchange',showArgPage);
    document.querySelector('.nav-link[data-page="tools"]')?.addEventListener('click',()=>queueMicrotask(showArgPage));
    document.querySelector('.utility-picker-item[data-utility="arg"]')?.addEventListener('click',()=>queueMicrotask(showArgPage));
    document.querySelectorAll('[data-arg-page]').forEach(link=>link.addEventListener('click',event=>{
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        event.preventDefault();
        const url=new URL(link.href);
        if(location.pathname!==url.pathname)history.pushState({page:'tools',utility:'arg'},'',url.pathname);
        showArgPage();
        window.scrollTo({top:0,behavior:'instant'});
    }));
    results.addEventListener('click',event=>{
        const link=event.target.closest('.arg-step');
        if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        const url=new URL(link.href),entry=document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if(!entry)return;
        event.preventDefault();
        history.pushState({page:'tools',utility:'arg'},'',url.pathname+url.hash);
        showArgPage();
        entry.scrollIntoView({block:'start'});
    });
    form.addEventListener('submit',async event=>{
        event.preventDefault();const text=input.value.trim();if(!text){input.focus();return;}
        controller?.abort();controller=new AbortController();const current=controller;run.disabled=true;stop.hidden=false;results.setAttribute('aria-busy','true');bindText(summary,'正在生成并排序搜索节点…');
        try {
            bindText(summary,'正在加载英文词库…');
            const useAcg=acgToggle.checked,parallel=modeSelect.value==='parallel',maxDepth=+depthSelect.value,maxNodes=+budgetSelect.value,workerCount=+workerSelect.value,effort=effortSelect.value;
            const [module,englishWords,acgData,acgModule]=await Promise.all([parallel?parallelModulePromise():enginePromise,loadEnglishDictionary().catch(error=>{console.warn('English dictionary unavailable; using fallback scoring',error);return null;}),useAcg?loadAcgData():null,useAcg?acgModulePromise():null]);
            if(current.signal.aborted)return;
            bindText(summary,'正在生成并排序搜索节点…');
            const outcome=await (parallel?module.searchParallel(text,{maxDepth,effort,workerCount,signal:current.signal,englishWords,acgWords:acgData?.words,onProgress:s=>{if(controller===current)bindText(summary,'{workers} 个 Worker：已展开 {expanded} 个节点，生成 {generated} 个不同状态。',{...s,workers:workerCount});}}):module.search(text,{maxDepth,maxNodes,signal:current.signal,englishWords,acgWords:acgData?.words,onProgress:s=>{if(controller===current)bindText(summary,'已展开 {expanded} 个节点，生成 {generated} 个不同状态，队列中还有 {queued} 个。',s);}}));
            if(controller!==current)return;
            render(outcome.candidates,results,acgData,acgModule?.matchAcgNames);const s=outcome.stats;bindText(summary,s.aborted?'搜索已停止。展开 {expanded} 个节点，生成 {generated} 个不同状态，显示前 {count} 个候选。':'搜索完成。展开 {expanded} 个节点，生成 {generated} 个不同状态，显示前 {count} 个候选。',{...s,count:outcome.candidates.length});
        } catch (error) {
            if(controller!==current)return;
            if(error?.name==='AbortError'){bindText(summary,'搜索已停止。');return;}
            console.error('ARG engine failed to load or run', error);
            bindText(summary,acgToggle.checked?'ACG Name 数据加载失败，请稍后重试。':'搜索组件加载失败，请刷新页面后重试。');
        } finally {
            if(controller===current){run.disabled=false;stop.hidden=true;results.setAttribute('aria-busy','false');}
        }
    });
    stop.addEventListener('click',()=>controller?.abort());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
