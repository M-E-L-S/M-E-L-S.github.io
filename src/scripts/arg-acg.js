const lettersOnly = value => String(value).toLowerCase().replace(/[^a-z]/g, '');

export function createAcgData(entries, dictionaryText) {
    const full=new Set(), parts=new Set(), byName=new Map(), partialUsages=new Set();
    for(const line of dictionaryText.split(/\r?\n/)){
        if(!line)continue;
        const [kind,raw]=line.split('\t');
        const word=lettersOnly(raw);
        if(word.length<3)continue; // Also reject stale or externally supplied two-letter entries.
        if(kind==='full')full.add(word);
        else if(kind==='part')parts.add(word);
    }
    for(const entry of entries){
        const key=lettersOnly(entry.roman);
        if(!full.has(key))continue;
        const tokens=entry.roman.toLowerCase().match(/[a-z]+/g)||[];
        if(tokens.length>1)tokens.filter(token=>token.length>=3).forEach(token=>partialUsages.add(token));
        const list=byName.get(key)||[];
        if(!list.some(item=>item.url===entry.url))list.push(entry);
        byName.set(key,list);
    }
    for(const word of full)parts.delete(word);
    const index=new Map();
    for(const word of new Set([...full,...parts])){
        const prefix=word.slice(0,Math.min(3,word.length)),list=index.get(prefix)||[];
        list.push(word);index.set(prefix,list);
    }
    for(const list of index.values())list.sort((a,b)=>b.length-a.length);
    let maxLength=20;
    for(const word of full)maxLength=Math.max(maxLength,word.length);
    return {words:{full,parts,maxLength:Math.min(70,maxLength)},byName,partialUsages,index};
}

export function matchAcgNames(text,acgData) {
    if(!acgData)return[];
    const positions=[],source=String(text);
    for(let i=0;i<source.length;i++)if(/[A-Za-z]/.test(source[i]))positions.push(i);
    const compact=positions.map(i=>source[i].toLowerCase()).join(''),found=[];
    for(let start=0;start<=compact.length-2;start++){
        const candidates=[...(acgData.index.get(compact.slice(start,start+3))||[]),...(acgData.index.get(compact.slice(start,start+2))||[])];
        for(const word of candidates){
            if(!compact.startsWith(word,start))continue;
            const from=positions[start],to=positions[start+word.length-1]+1;
            const isFull=acgData.words.full.has(word);
            if(isFull&&!/^[A-Za-z\s.'’·-]+$/.test(source.slice(from,to)))continue;
            if(/[0-9]/.test(source[from-1]||'')||/[0-9]/.test(source[to]||''))continue;
            if(isFull&&word.length<6&&(/[A-Za-z]/.test(source[from-1]||'')||/[A-Za-z]/.test(source[to]||'')))continue;
            if(!isFull&&(!/^[A-Za-z]+$/.test(source.slice(from,to))||/[A-Za-z0-9]/.test(source[from-1]||'')||/[A-Za-z0-9]/.test(source[to]||'')))continue;
            const records=isFull?acgData.byName.get(word):null;
            if(isFull&&records?.every(item=>!item.roman.includes(' '))&&(/[A-Za-z]/.test(source[from-1]||'')||/[A-Za-z]/.test(source[to]||'')))continue;
            found.push({from,to,full:isFull,text:source.slice(from,to),entry:records?.length===1&&!acgData.partialUsages.has(word)?records[0]:null});
        }
    }
    found.sort((a,b)=>(b.full-a.full)||(b.to-b.from)-(a.to-a.from)||a.from-b.from);
    const selected=[];
    for(const match of found){
        if(selected.some(item=>match.from<item.to&&item.from<match.to))continue;
        selected.push(match);
        if(selected.length>=30)break;
    }
    return selected.sort((a,b)=>a.from-b.from);
}
