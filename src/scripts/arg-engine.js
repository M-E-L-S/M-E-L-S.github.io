const encoder = new TextEncoder();

function entropy(text) {
    if (!text.length) return 0;
    const counts = new Map();
    for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
    let value = 0;
    for (const count of counts.values()) { const p = count / text.length; value -= p * Math.log2(p); }
    return value;
}

function textQuality(text, englishWords=null) {
    if (!text) return { score: 0, evidence: ['空输出'] };
    const chars = [...text], printable = chars.filter(c => !/\p{C}/u.test(c) || /[\n\r\t]/.test(c)).length / chars.length;
    const latinWords = (text.match(/[A-Za-z]{2,}/g) || []).map(word=>word.toLowerCase());
    const eligibleWords = latinWords.filter(word=>word.length>=3);
    const dictionaryHits = englishWords ? eligibleWords.filter(word=>englishWords.has(word)).length : 0;
    const hanChars = text.match(/\p{Script=Han}/gu) || [];
    const chineseMojibake = /锟斤拷|烫{2,}|屯{2,}|�|銆|鈥|鐨|鍚|鏄|浣犲|鎴戝|涓€/.test(text);
    const plainTextLikely = hanChars.length>=2 && !chineseMojibake && printable>.9;
    const spaces = (text.match(/\s/g) || []).length;
    const replacement = (text.match(/�/g) || []).length;
    const dictionaryRatio = eligibleWords.length ? dictionaryHits/eligibleWords.length : 0;
    const englishScore = englishWords ? Math.min(38,dictionaryHits*6+dictionaryRatio*14) : Math.min(latinWords.length,8)*2;
    let score = printable * 34 + englishScore + Math.min(spaces, 8) * 1.2 - replacement * 12;
    const evidence = [`可打印字符 ${Math.round(printable * 100)}%`, `熵 ${entropy(text).toFixed(2)}`];
    if(englishWords&&eligibleWords.length)evidence.push(`英文词库命中 ${dictionaryHits}/${eligibleWords.length}`);
    if(plainTextLikely){score=Math.max(score,96);evidence.push('正常中文，视为明文');}
    else if(hanChars.length>=2&&chineseMojibake)evidence.push('检测到典型中文乱码');
    if (/^\s*[\[{].*[\]}]\s*$/s.test(text)) { try { JSON.parse(text); score += 30; evidence.push('有效 JSON'); } catch {} }
    if (/https?:\/\/[^\s]+/i.test(text)) { score += 18; evidence.push('包含 URL'); }
    if (/\b(?:the|and|that|this|with|from|hello|flag|secret|password)\b/i.test(text)) { score += 18; evidence.push('英文词命中'); }
    return { score: Math.max(0, Math.min(100, score)), evidence, plainTextLikely };
}

const same = (a, b) => a === b;
const clean = text => text.trim();
const one = (text, label) => text == null ? [] : [{ text, label }];
const utf8 = bytes => new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));

function decodeBase32(text){
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',source=text.toUpperCase().replace(/[\s=]/g,'');let bits='';
    for(const char of source){const value=alphabet.indexOf(char);if(value<0)return null;bits+=value.toString(2).padStart(5,'0');}
    const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
    try{return utf8(bytes);}catch{return null;}
}
function decodeBase58(text){
    const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let value=0n;
    for(const char of text){const digit=alphabet.indexOf(char);if(digit<0)return null;value=value*58n+BigInt(digit);}
    const bytes=[];while(value>0n){bytes.unshift(Number(value&255n));value>>=8n;}
    for(const char of text){if(char==='1')bytes.unshift(0);else break;}
    try{return utf8(bytes);}catch{return null;}
}
function decodeAscii85(text){
    let source=text.trim().replace(/^<~/,'').replace(/~>$/,'').replace(/\s/g,''),bytes=[];
    for(let i=0;i<source.length;){
        if(source[i]==='z'){bytes.push(0,0,0,0);i++;continue;}
        const group=source.slice(i,i+5);if(group.length===1)return null;
        const padded=group.padEnd(5,'u');let value=0;
        for(const char of padded){const digit=char.charCodeAt(0)-33;if(digit<0||digit>84)return null;value=value*85+digit;}
        const decoded=[value>>>24,(value>>>16)&255,(value>>>8)&255,value&255];bytes.push(...decoded.slice(0,group.length-1));i+=5;
    }
    try{return utf8(bytes);}catch{return null;}
}

export const decoders = [
    { id:'url', name:'URL Decode', probe:t=>/%[0-9a-f]{2}/i.test(t)?0.98:0, decode:t=>{try{return one(decodeURIComponent(t),'URL Decode');}catch{return[];}} },
    { id:'html', name:'HTML Entity', probe:t=>/&(?:#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/i.test(t)?0.97:0, decode:t=>one(t.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(amp|lt|gt|quot|apos);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[n.toLowerCase()]),'HTML Entity') },
    { id:'hex', name:'From Hex', probe:t=>/^(?:\s*[0-9a-f]{2}[\s,:-]*){3,}$/i.test(t)?0.96:0, decode:t=>{try{const h=t.replace(/[^0-9a-f]/gi,'');if(h.length%2)return[];const b=Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));return one(new TextDecoder('utf-8',{fatal:true}).decode(b),'From Hex');}catch{return[];}} },
    { id:'base64', name:'From Base64', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=4&&s.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(s)?(/={1,2}$/.test(s)?.96:.78):0;}, decode:t=>{try{const raw=atob(t.replace(/\s/g,'')),b=Uint8Array.from(raw,c=>c.charCodeAt(0));return one(new TextDecoder('utf-8',{fatal:true}).decode(b),'From Base64');}catch{return[];}} },
    { id:'base32', name:'From Base32', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=8&&/^[A-Z2-7]+=*$/i.test(s)&&s.replace(/=/g,'').length%8!==1?.88:0;}, decode:t=>one(decodeBase32(t),'From Base32') },
    { id:'base58', name:'From Base58', probe:t=>{const s=t.trim();return s.length>=6&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)?.52:0;}, decode:t=>one(decodeBase58(t.trim()),'From Base58') },
    { id:'ascii85', name:'From ASCII85', probe:t=>{const s=t.trim();return /^<~[!-u\s]+~>$/.test(s)?.96:(s.length>=10&&/^[!-u\s]+$/.test(s)?.36:0);}, decode:t=>one(decodeAscii85(t),'From ASCII85') },
    { id:'binary', name:'Binary → Text', probe:t=>/^(?:\s*[01]{8}[\s,:-]*){2,}$/.test(t)?0.98:0, decode:t=>{const bits=t.match(/[01]{8}/g);return bits?one(String.fromCharCode(...bits.map(x=>parseInt(x,2))),'Binary → Text'):[];} },
    { id:'decimal', name:'Decimal → Text', probe:t=>/^(?:\s*\d{1,3}[\s,:-]+){2,}\s*\d{1,3}\s*$/.test(t)&&t.split(/[\s,:-]+/).every(x=>+x<=255)?.9:0, decode:t=>one(String.fromCharCode(...clean(t).split(/[\s,:-]+/).map(Number)),'Decimal → Text') },
    { id:'unicode', name:'Unicode Escape', probe:t=>/(?:\\u[0-9a-f]{4}|\\x[0-9a-f]{2})/i.test(t)?.97:0, decode:t=>one(t.replace(/\\u([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\\x([0-9a-f]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))),'Unicode Escape') },
    { id:'a1z26', name:'A1Z26', probe:t=>{const parts=t.trim().split(/[\s,:;|/-]+/);return parts.length>=3&&parts.every(n=>/^\d{1,2}$/.test(n)&&+n>=1&&+n<=26)?.86:0;}, decode:t=>one(t.trim().split(/[\s,:;|/-]+/).map(n=>String.fromCharCode(64+Number(n))).join(''),'A1Z26') },
    { id:'bacon', name:'Bacon Cipher', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=10&&s.length%5===0&&/^[ab]+$/i.test(s)?.88:0;}, decode:t=>{const s=t.replace(/\s/g,'').toLowerCase(),out=[];for(let i=0;i<s.length;i+=5){const value=parseInt(s.slice(i,i+5).replace(/a/g,'0').replace(/b/g,'1'),2);if(value>25)return[];out.push(String.fromCharCode(65+value));}return one(out.join(''),'Bacon Cipher');} },
    { id:'morse', name:'Morse', probe:t=>/^[.\-/\s]+$/.test(t)&&/[.-]{2}/.test(t)?.9:0, decode:t=>{const map={'.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9'};const out=t.split(/\s*\/\s*/).map(w=>w.trim().split(/\s+/).map(c=>map[c]||'?').join('')).join(' ');return out.includes('?')?[]:one(out,'Morse');} },
    { id:'atbash', name:'Atbash', probe:t=>/[A-Za-z]{4}/.test(t)?.24:0, decode:t=>one(t.replace(/[A-Za-z]/g,c=>String.fromCharCode((c<='Z'?155:219)-c.charCodeAt(0))),'Atbash') },
    { id:'reverse', name:'Reverse', probe:t=>t.length>=4?.14:0, decode:t=>one([...t].reverse().join(''),'Reverse') },
    { id:'caesar', name:'Caesar', probe:t=>(t.match(/[A-Za-z]/g)||[]).length>=6?.3:0, decode:t=>Array.from({length:25},(_,i)=>{const shift=i+1;return{text:t.replace(/[A-Za-z]/g,c=>{const a=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-a-shift+26)%26+a)}),label:shift===13?'ROT13':`Caesar -${shift}`,parameter:shift};}) }
];

export async function search(input, options={}) {
    const maxDepth=options.maxDepth??3, maxNodes=options.maxNodes??300, signal=options.signal, englishWords=options.englishWords??null;
    const rootQuality=textQuality(input,englishWords), open=[{text:input,path:[],depth:0,score:rootQuality.score,priority:rootQuality.score,evidence:rootQuality.evidence,plainTextLikely:rootQuality.plainTextLikely}], seen=new Set([input]), candidates=[];
    let expanded=0, generated=1;
    while(open.length&&expanded<maxNodes&&!signal?.aborted){
        open.sort((a,b)=>b.priority-a.priority); const node=open.shift(); expanded++;
        if(node.depth>0||node.plainTextLikely)candidates.push(node);
        if(node.depth>=maxDepth||node.plainTextLikely)continue;
        const probes=decoders.map(decoder=>({decoder,confidence:decoder.probe(node.text)})).filter(x=>x.confidence>0).sort((a,b)=>b.confidence-a.confidence);
        for(const {decoder,confidence} of probes){
            for(const result of decoder.decode(node.text)){
                if(!result.text||same(result.text,node.text)||seen.has(result.text))continue;
                seen.add(result.text);generated++;
                const quality=textQuality(result.text,englishWords), depth=node.depth+1;
                const progress=quality.score-node.score;
                const child={text:result.text,path:[...node.path,{decoder:decoder.id,label:result.label,confidence}],depth,score:quality.score,evidence:quality.evidence,plainTextLikely:quality.plainTextLikely};
                child.priority=quality.score+confidence*18+Math.max(-12,progress*.25)-depth*4;
                open.push(child);
            }
        }
        if(expanded%20===0){options.onProgress?.({expanded,generated,queued:open.length});await new Promise(resolve=>setTimeout(resolve,0));}
        if(open.length>maxNodes*3)open.sort((a,b)=>b.priority-a.priority).splice(maxNodes*3);
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    return {candidates:candidates.slice(0,12),stats:{expanded,generated,queued:open.length,aborted:!!signal?.aborted}};
}

export { textQuality };
