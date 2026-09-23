const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let controller;
const engineUrl = new URL('./arg-engine.js', document.currentScript.src);
engineUrl.search = new URL(document.currentScript.src).search;
const enginePromise = import(engineUrl.href);
let dictionaryPromise;
const bindText=(element,source,params={})=>window.MELSI18n?window.MELSI18n.bind(element,source,params):element.textContent=source.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(params,key)?params[key]:match);
function loadEnglishDictionary(){
    if(!dictionaryPromise)dictionaryPromise=fetch('/assets/data/arg-english-words.txt').then(response=>{if(!response.ok)throw new Error(`Dictionary HTTP ${response.status}`);return response.text();}).then(text=>new Set(text.toLowerCase().split(/\s+/).filter(Boolean)));
    return dictionaryPromise;
}

function render(results, container) {
    if (!results.length) { container.innerHTML='<p class="arg-empty"></p>';bindText(container.firstElementChild,'没有找到可信候选。可提高深度或节点预算后重试。');return; }
    container.innerHTML=results.map((item,index)=>`<article class="arg-result">
        <div class="arg-result-head"><span class="arg-result-rank"></span><span class="arg-score"></span></div>
        <pre class="arg-output" translate="no">${escapeHtml(item.text)}</pre>
        <div class="arg-recipe" aria-label="解码路径">${item.path.map((step,i)=>`${i?'<span class="arg-arrow">→</span>':''}<a class="arg-step" href="/tools/arg/reference/#decoder-${encodeURIComponent(step.decoder)}" title="查看 ${escapeHtml(step.label)} 介绍">${escapeHtml(step.label)} · ${Math.round(step.confidence*100)}%</a>`).join('')}</div>
        <p class="arg-evidence">${item.evidence.map(evidence=>`<span class="arg-evidence-item">${escapeHtml(evidence)}</span>`).join('<span aria-hidden="true"> · </span>')}</p>
        <button class="game-btn arg-copy" type="button" data-copy="${index}"></button>
    </article>`).join('');
    container.querySelectorAll('.arg-result').forEach((article,index)=>{const item=results[index];bindText(article.querySelector('.arg-result-rank'),'候选 {index}',{index:index+1});bindText(article.querySelector('.arg-score'),'文本评分 {score} · 深度 {depth}',{score:item.score.toFixed(1),depth:item.depth});article.querySelectorAll('.arg-evidence-item').forEach((element,i)=>bindText(element,item.evidence[i]));});
    container.querySelectorAll('.arg-copy').forEach(button=>{bindText(button,'复制结果');button.addEventListener('click',async()=>{await navigator.clipboard.writeText(results[+button.dataset.copy].text);bindText(button,'已复制');});});
}

function init() {
    const form=document.getElementById('arg-form'),input=document.getElementById('arg-input'),results=document.getElementById('arg-results'),summary=document.getElementById('arg-summary'),run=document.getElementById('arg-run'),stop=document.getElementById('arg-stop');
    if(!form)return;
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
        controller?.abort();controller=new AbortController();run.disabled=true;stop.hidden=false;results.setAttribute('aria-busy','true');bindText(summary,'正在生成并排序搜索节点…');
        try {
            bindText(summary,'正在加载英文词库…');
            const [{search},englishWords]=await Promise.all([enginePromise,loadEnglishDictionary().catch(error=>{console.warn('English dictionary unavailable; using fallback scoring',error);return null;})]);
            bindText(summary,'正在生成并排序搜索节点…');
            const outcome=await search(text,{maxDepth:+document.getElementById('arg-depth').value,maxNodes:+document.getElementById('arg-budget').value,signal:controller.signal,englishWords,onProgress:s=>bindText(summary,'已展开 {expanded} 个节点，生成 {generated} 个不同状态，队列中还有 {queued} 个。',s)});
            render(outcome.candidates,results);const s=outcome.stats;bindText(summary,s.aborted?'搜索已停止。展开 {expanded} 个节点，生成 {generated} 个不同状态，显示前 {count} 个候选。':'搜索完成。展开 {expanded} 个节点，生成 {generated} 个不同状态，显示前 {count} 个候选。',{...s,count:outcome.candidates.length});
        } catch (error) {
            console.error('ARG engine failed to load or run', error);
            bindText(summary,'搜索组件加载失败，请刷新页面后重试。');
        } finally {
            run.disabled=false;stop.hidden=true;results.setAttribute('aria-busy','false');
        }
    });
    stop.addEventListener('click',()=>controller?.abort());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
