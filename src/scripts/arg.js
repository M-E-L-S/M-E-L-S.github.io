const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let controller;
const enginePromise = import('./arg-engine.js');
let dictionaryPromise;
function loadEnglishDictionary(){
    if(!dictionaryPromise)dictionaryPromise=fetch('/assets/data/wordle-words.txt').then(response=>{if(!response.ok)throw new Error(`Dictionary HTTP ${response.status}`);return response.text();}).then(text=>new Set(text.toLowerCase().split(/\s+/).filter(Boolean)));
    return dictionaryPromise;
}

function render(results, container) {
    if (!results.length) { container.innerHTML='<p class="arg-empty">没有找到可信候选。可提高深度或节点预算后重试。</p>'; return; }
    container.innerHTML=results.map((item,index)=>`<article class="arg-result">
        <div class="arg-result-head"><span class="arg-result-rank">候选 ${index+1}</span><span class="arg-score">文本评分 ${item.score.toFixed(1)} · 深度 ${item.depth}</span></div>
        <pre class="arg-output" translate="no">${escapeHtml(item.text)}</pre>
        <div class="arg-recipe" aria-label="解码路径">${item.path.map((step,i)=>`${i?'<span class="arg-arrow">→</span>':''}<a class="arg-step" href="/tools/arg/reference/#decoder-${encodeURIComponent(step.decoder)}" title="查看 ${escapeHtml(step.label)} 介绍">${escapeHtml(step.label)} · ${Math.round(step.confidence*100)}%</a>`).join('')}</div>
        <p class="arg-evidence">${item.evidence.map(escapeHtml).join(' · ')}</p>
        <button class="game-btn arg-copy" type="button" data-copy="${index}">复制结果</button>
    </article>`).join('');
    container.querySelectorAll('.arg-copy').forEach(button=>button.addEventListener('click',async()=>{await navigator.clipboard.writeText(results[+button.dataset.copy].text);button.textContent='已复制';}));
}

function init() {
    const form=document.getElementById('arg-form'),input=document.getElementById('arg-input'),results=document.getElementById('arg-results'),summary=document.getElementById('arg-summary'),run=document.getElementById('arg-run'),stop=document.getElementById('arg-stop');
    if(!form)return;
    const searchPanel=document.getElementById('arg-search-panel'),referencePanel=document.getElementById('arg-reference-panel');
    const showArgPage=()=>{
        const reference=location.pathname.startsWith('/tools/arg/reference');
        searchPanel.hidden=reference;referencePanel.hidden=!reference;
        document.querySelectorAll('[data-arg-page]').forEach(link=>link.toggleAttribute('aria-current',(link.dataset.argPage==='reference')===reference));
        if(reference)document.title='支持的编码与密码 · ARG 辅助器 · MELS';
    };
    showArgPage();addEventListener('popstate',showArgPage);
    form.addEventListener('submit',async event=>{
        event.preventDefault();const text=input.value.trim();if(!text){input.focus();return;}
        controller?.abort();controller=new AbortController();run.disabled=true;stop.hidden=false;results.setAttribute('aria-busy','true');summary.textContent='正在生成并排序搜索节点…';
        try {
            summary.textContent='正在加载英文词库…';
            const [{search},englishWords]=await Promise.all([enginePromise,loadEnglishDictionary().catch(error=>{console.warn('English dictionary unavailable; using fallback scoring',error);return null;})]);
            summary.textContent='正在生成并排序搜索节点…';
            const outcome=await search(text,{maxDepth:+document.getElementById('arg-depth').value,maxNodes:+document.getElementById('arg-budget').value,signal:controller.signal,englishWords,onProgress:s=>summary.textContent=`已展开 ${s.expanded} 个节点，生成 ${s.generated} 个不同状态，队列中还有 ${s.queued} 个。`});
            render(outcome.candidates,results);const s=outcome.stats;summary.textContent=`${s.aborted?'搜索已停止。':'搜索完成。'}展开 ${s.expanded} 个节点，生成 ${s.generated} 个不同状态，显示前 ${outcome.candidates.length} 个候选。`;
        } catch (error) {
            console.error('ARG engine failed to load or run', error);
            summary.textContent='搜索组件加载失败，请刷新页面后重试。';
        } finally {
            run.disabled=false;stop.hidden=true;results.setAttribute('aria-busy','false');
        }
    });
    stop.addEventListener('click',()=>controller?.abort());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
