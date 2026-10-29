const trigramModels = new WeakMap();
const prefixModels = new WeakMap();

// Format parsers are private; callers supply an untyped pool of up to five keys.
const keyFields=['affine','keyword','columnar','nihilist','playfair','twosquare','trisquare','foursquare','hill'].map(id=>({id}));
const keyAlphabet='ABCDEFGHIKLMNOPQRSTUVWXYZ';
const keyMod=(n,m=26)=>(n%m+m)%m;
const keyInverse=n=>Array.from({length:26},(_,i)=>i).find(i=>keyMod(i*n)===1);
const letterCipherInput=text=>admissibleText(text)&&/^[A-Za-z\s]+$/.test(text)&&/[A-Za-z]/.test(text);
const keyLetters=text=>text.toUpperCase().replace(/J/g,'I');
const keySquare=word=>[...new Set(keyLetters(word)+keyAlphabet)].join('');
const squareText=text=>letterCipherInput(text)?keyLetters(text.replace(/\s/g,'')):'';
const keyResult=(text,label,parameter)=>text?[{text,label,parameter}]:[];
function mapKeyLetters(text,transform){
    if(!letterCipherInput(text))return '';
    let index=0;
    return text.replace(/[A-Za-z]/g,c=>{
        const base=c<='Z'?65:97;
        return String.fromCharCode(base+keyMod(transform(c.charCodeAt(0)-base,index++)));
    });
}
function columnarDecode(text,order){
    const chars=[...text],columns=Array(order.length),rows=Math.floor(chars.length/order.length),extra=chars.length%order.length;
    let offset=0;
    for(const column of order){const length=rows+(column<extra?1:0);columns[column]=chars.slice(offset,offset+length);offset+=length;}
    return Array.from({length:rows+(extra?1:0)},(_,row)=>columns.map(column=>column[row]??'').join('')).join('');
}
function squareDecode(text,squares,kind){
    const source=squareText(text),size=kind==='trisquare'?3:2;
    if(!source||source.length%size)return '';
    let output='';
    for(let i=0;i<source.length;i+=size){
        const a=squares[0].indexOf(source[i]),b=squares[1]?.indexOf(source[i+1]);
        if(kind==='playfair'){
            const second=squares[0].indexOf(source[i+1]),r=Math.floor(a/5),s=Math.floor(second/5),c=a%5,d=second%5;
            output+=r===s?squares[0][r*5+keyMod(c-1,5)]+squares[0][s*5+keyMod(d-1,5)]:c===d?squares[0][keyMod(r-1,5)*5+c]+squares[0][keyMod(s-1,5)*5+d]:squares[0][r*5+d]+squares[0][s*5+c];
        }else if(kind==='twosquare'){
            const right=squares[1].indexOf(source[i]),left=squares[0].indexOf(source[i+1]);
            output+=squares[0][Math.floor(right/5)*5+left%5]+squares[1][Math.floor(left/5)*5+right%5];
        }else if(kind==='foursquare'){
            output+=keyAlphabet[Math.floor(a/5)*5+b%5]+keyAlphabet[Math.floor(b/5)*5+a%5];
        }else{
            const middle=squares[2].indexOf(source[i+1]),last=squares[1].indexOf(source[i+2]);
            output+=squares[0][Math.floor(middle/5)*5+a%5]+squares[1][Math.floor(last/5)*5+middle%5];
        }
    }
    // Padding letters are deliberately retained: X can be genuine plaintext.
    return output;
}
function nihilistNumbers(text){
    if(!/^[\d\s,]+$/.test(text))return null;
    const trimmed=text.trim();
    const tokens=/^\d+$/.test(trimmed)&&trimmed.length>3&&trimmed.length%2===0?trimmed.match(/../g):trimmed.split(/[\s,]+/);
    if(!tokens.length||tokens.some(token=>!/^\d{2,3}$/.test(token)))return null;
    const values=tokens.map(token=>+token<=10?+token+100:+token);
    return values.every(n=>n>=22&&n<=110)?values:null;
}
function determinant(matrix){
    if(matrix.length===1)return matrix[0][0];
    return matrix[0].reduce((sum,n,column)=>sum+(column%2?-1:1)*n*determinant(matrix.slice(1).map(row=>row.filter((_,i)=>i!==column))),0);
}
function inverseKeyMatrix(matrix){
    const inverse=keyInverse(determinant(matrix));
    if(inverse===undefined)return null;
    return matrix.map((row,r)=>row.map((_,c)=>keyMod(inverse*((r+c)%2?-1:1)*determinant(matrix.filter((_,i)=>i!==c).map(line=>line.filter((_,i)=>i!==r))))));
}

function parseTypedKey(config={}){
    const keyed=[],errors=[];
    const add=(id,name,decode,probe=t=>{
        if(!letterCipherInput(t))return 0;
        const letters=(t.match(/[A-Za-z]/g)||[]).length,content=[...t].filter(c=>! /\s/.test(c)).length;
        return letters>=2?.46*(letters/content)**1.5:0;
    })=>keyed.push({id,name,keyed:true,decode,probe});
    const word=value=>{if(!/^[A-Za-z]{1,64}$/.test(value))throw new Error();return value.toUpperCase();};
    for(const field of keyFields){
        const raw=String(config[field.id]??'').trim();
        if(!raw)continue;
        try{
            if(raw.length>256)throw new Error();
            if(field.id==='affine'){
                if(!/^\d{1,2}[\s,]+\d{1,2}$/.test(raw))throw new Error();
                const [a,b]=raw.split(/[\s,]+/).map(Number),inverse=keyInverse(a);
                if(a<1||a>25||inverse===undefined||b>25)throw new Error();
                add('affine','Affine',t=>keyResult(mapKeyLetters(t,n=>inverse*(n-b)),`Affine (${a}, ${b})`,{a,b}));
            }else if(field.id==='keyword'){
                const key=word(raw),values=[...key].map(c=>c.charCodeAt(0)-65);
                for(const [id,name] of [['vigenere','Vigenère'],['beaufort','Beaufort'],['porta','Porta']])add(id,name,t=>keyResult(mapKeyLetters(t,(n,i)=>{
                    const k=values[i%values.length];
                    return id==='vigenere'?n-k:id==='beaufort'?k-n:n<13?13+keyMod(n+Math.floor(k/2),13):keyMod(n-13-Math.floor(k/2),13);
                }),`${name} (${key})`,key));
            }else if(field.id==='columnar'){
                let order;
                if(/^[A-Za-z]{2,32}$/.test(raw))order=[...raw.toUpperCase()].map((c,i)=>({c,i})).sort((a,b)=>a.c.localeCompare(b.c)||a.i-b.i).map(item=>item.i);
                else{
                    if(!/^\d{1,2}(?:[\s,]+\d{1,2})+$/.test(raw))throw new Error();
                    const ranks=raw.split(/[\s,]+/).map(Number);
                    if(ranks.length>32||new Set(ranks).size!==ranks.length||ranks.some(n=>n<1||n>ranks.length))throw new Error();
                    order=ranks.map((n,i)=>({n,i})).sort((a,b)=>a.n-b.n).map(item=>item.i);
                }
                add('columnar','Columnar',t=>keyResult(columnarDecode(t,order),`Columnar (${raw.toUpperCase()})`,order),t=>[...t].length>=order.length?.44:0);
            }else if(field.id==='hill'){
                const rows=raw.split(';').map(row=>row.trim());
                if(![2,3].includes(rows.length)||rows.some(row=>!/^\d{1,2}(?:[\s,]+\d{1,2})+$/.test(row)))throw new Error();
                const matrix=rows.map(row=>row.split(/[\s,]+/).map(Number));
                if(matrix.some(row=>row.length!==rows.length||row.some(n=>n>25)))throw new Error();
                const inverse=inverseKeyMatrix(matrix),size=rows.length;
                if(!inverse)throw new Error();
                add('hill','Hill',t=>{
                    if(!letterCipherInput(t))return [];
                    const chars=t.toUpperCase().replace(/\s/g,'');
                    if(chars.length%size)return [];
                    let output='';
                    for(let i=0;i<chars.length;i+=size){const block=[...chars.slice(i,i+size)].map(c=>c.charCodeAt(0)-65);for(const row of inverse)output+=String.fromCharCode(65+keyMod(row.reduce((sum,n,j)=>sum+n*block[j],0)));}
                    return keyResult(output,`Hill ${size}×${size} (${raw})`,matrix);
                },t=>letterCipherInput(t)&&t.replace(/\s/g,'').length%size===0?.48:0);
            }else{
                const parts=raw.split('/').map(part=>word(part.trim())),count=field.id==='trisquare'?3:field.id==='playfair'?1:2;
                if(parts.length!==count)throw new Error();
                const squares=parts.map(keySquare);
                if(field.id==='nihilist'){
                    const square=squares[0],coordinate=c=>{const i=square.indexOf(c);return (Math.floor(i/5)+1)*10+i%5+1;},key=[...keyLetters(parts[1])].map(coordinate);
                    const decode=t=>{
                        const values=nihilistNumbers(t);
                        if(!values)return [];
                        let output='';
                        for(let i=0;i<values.length;i++){const n=values[i]-key[i%key.length],r=Math.floor(n/10)-1,c=n%10-1;if(r<0||r>4||c<0||c>4)return [];output+=square[r*5+c];}
                        return keyResult(output,`Nihilist (${parts.join(' / ')})`,parts);
                    };
                    add('nihilist','Nihilist',decode,t=>decode(t).length?.86:0);
                }else{
                    const size=field.id==='trisquare'?3:2;
                    const name={playfair:'Playfair',twosquare:'Two-square',trisquare:'Tri-square',foursquare:'Four-square'}[field.id];
                    add(field.id,name,t=>keyResult(squareDecode(t,squares,field.id),`${name} (${parts.join(' / ')})`,parts),t=>{const s=squareText(t);return s.length>=size&&s.length%size===0?.48:0;});
                }
            }
        }catch{errors.push({field:field.id,message:'密钥格式不受支持，请按此栏说明填写。'});}
    }
    if(!keyed.length&&!errors.length)errors.push({field:'',message:'密钥模式至少需要一组有效密钥。'});
    return {decoders:keyed,errors};
}

export function validateKeyConfig(keys=[]){
    const errors=[],groups=new Map();
    if(!Array.isArray(keys)||keys.length>5)return {decoders:[],errors:[{field:'',message:'最多输入 5 个密钥。'}]};
    keys.forEach((value,index)=>{
        const raw=typeof value==='string'?value.trim():'';
        if(!raw){if(typeof value!=='string')errors.push({field:String(index),message:'密钥格式不受支持，请按输入格式提示填写。'});return;}
        const keyId=raw.toUpperCase().replace(/\s*([/;])\s*/g,'$1').replace(/[\s,]+/g,',');
        let matched=false;
        for(const {id} of keyFields){
            const parsed=parseTypedKey({[id]:raw});
            if(parsed.errors.length)continue;
            matched=true;
            for(const decoder of parsed.decoders){
                let group=groups.get(decoder.id);
                if(!group){group={...decoder,variants:[],keys:new Set()};groups.set(decoder.id,group);}
                if(!group.keys.has(keyId)){group.keys.add(keyId);group.variants.push({...decoder,keyId});}
            }
        }
        if(!matched)errors.push({field:String(index),message:'密钥格式不受支持，请按输入格式提示填写。'});
    });
    const decoders=[...groups.values()].map(({variants,keys,...decoder})=>({...decoder,
        keyVariants:variants,
        probe:text=>Math.max(...variants.map(variant=>variant.probe(text))),
        decode:(text,keyIds=null)=>variants.filter(variant=>!keyIds||keyIds.includes(variant.keyId)).flatMap(variant=>variant.decode(text).map(result=>({...result,keyId:variant.keyId})))
    }));
    if(!decoders.length&&!errors.length)errors.push({field:'',message:'密钥模式至少需要一组有效密钥。'});
    return {decoders,errors};
}

function englishTrigramScore(text, englishWords) {
    if (!englishWords || !/^[A-Za-z]{10,}$/.test(text)) return 0;
    let model = trigramModels.get(englishWords);
    if (!model) {
        model = new Map();
        for (const word of englishWords) {
            if (!/^[a-z]{3,}$/.test(word)) continue;
            for (let i=0;i<word.length-2;i++) {
                const group=word.slice(i,i+3);
                model.set(group,(model.get(group)||0)+1);
            }
        }
        trigramModels.set(englishWords,model);
    }
    const lower=text.toLowerCase();
    let average=0;
    for(let i=0;i<lower.length-2;i++) average+=Math.log1p(model.get(lower.slice(i,i+3))||0);
    average/=lower.length-2;
    const diversity=Math.max(0,Math.min(1,(entropy(lower)-2.4)/.8));
    return Math.max(0,Math.min(40,(average-2.4)*10))*diversity;
}

function entropy(text) {
    if (!text.length) return 0;
    const counts = new Map();
    for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
    let value = 0;
    for (const count of counts.values()) { const p = count / text.length; value -= p * Math.log2(p); }
    return value;
}

function textQuality(text, englishWords=null, acgWords=null) {
    if (!text) return { score: 0, evidence: ['空输出'] };
    const chars = [...text], invalidControls = chars.filter(c => /\p{C}/u.test(c) && !/[\n\r\t]/.test(c)).length;
    const printable = 1-invalidControls/chars.length;
    const latinWords = (text.match(/[A-Za-z]{2,}/g) || []).map(word=>word.toLowerCase());
    const eligibleWords = latinWords.filter(word=>word.length>=3);
    const shortRareHits=eligibleWords.filter(word=>word.length===3&&!commonWords.has(word)&&!acgWords?.full.has(word)&&englishWords?.has(word)).length;
    const englishHits = englishWords ? eligibleWords.filter(word=>englishWords.has(word)).length : 0;
    const dictionaryHits = eligibleWords.filter(word=>englishWords?.has(word)||acgWords?.full.has(word)).length;
    const hanChars = text.match(/\p{Script=Han}/gu) || [];
    const basicHanShare=hanChars.length?(text.match(/[\u4e00-\u9fa5]/gu)||[]).length/hanChars.length:0;
    const chineseMojibake = /锟斤拷|烫{2,}|屯{2,}|�|銆|鈥|鐨|鍚|鏄|浣犲|鎴戝|涓€/.test(text);
    const spaces = (text.match(/\s/g) || []).length;
    const replacement = (text.match(/�/g) || []).length;
    const dictionaryRatio = eligibleWords.length ? dictionaryHits/eligibleWords.length : 0;
    const trigramSignal=englishTrigramScore(text,englishWords);
    const trigramScore=trigramSignal*.5;
    const englishScore = englishWords||acgWords ? Math.max(Math.min(38,dictionaryHits*6+dictionaryRatio*14),trigramScore) : Math.min(latinWords.length,8)*2;
    const compact=text.toLowerCase().replace(/[^a-z]/g,'');
    const latinMatches=[...text.matchAll(/[A-Za-z]+/g)];
    let fullNameHit=!!(acgWords?.full.has(compact)||latinWords.some(word=>acgWords?.full.has(word)));
    const wholeFullName=!!acgWords?.full.has(compact)&&/^[A-Za-z\s.'’·-]+$/.test(text);
    const partialHits=acgWords ? latinWords.filter(word=>acgWords.parts.has(word)).length : 0;
    // Score what the dictionaries explain in the whole output, including
    // digits, controls and unknown scripts in the denominator. Isolated names are clues,
    // but cannot make a mostly unreadable intermediate state look like plaintext.
    const contentLength=chars.filter(char=>/[\p{L}\p{N}\p{S}]/u.test(char)||(/\p{C}/u.test(char)&&!/[\n\r\t]/.test(char))).length;
    let readableLength=chineseMojibake?0:hanChars.length;
    const latinCredit=latinMatches.map(match=>{
        const word=match[0].toLowerCase();
        if(commonWords.has(word)||(word.length>=3&&englishWords?.has(word))||acgWords?.full.has(word))return 1;
        return acgWords?.parts.has(word)?.35:0;
    });
    if(acgWords){
        for(let start=0;start<latinMatches.length;start++){
            let joined=latinMatches[start][0].toLowerCase();
            for(let end=start+1;end<Math.min(latinMatches.length,start+5);end++){
                const separator=text.slice(latinMatches[end-1].index+latinMatches[end-1][0].length,latinMatches[end].index);
                if(!/^[\s.'’·-]+$/.test(separator))break;
                joined+=latinMatches[end][0].toLowerCase();
                if(joined.length>acgWords.maxLength)break;
                if(acgWords.full.has(joined)){
                    fullNameHit=true;
                    for(let index=start;index<=end;index++)latinCredit[index]=1;
                }
            }
        }
    }
    for(let index=0;index<latinMatches.length;index++)readableLength+=latinMatches[index][0].length*latinCredit[index];
    for(const match of text.matchAll(/\d+/g)){
        const before=text[match.index-1]||'',after=text[match.index+match[0].length]||'';
        if(!/[A-Za-z]/.test(before)&&!/[A-Za-z]/.test(after))readableLength+=match[0].length;
    }
    if(wholeFullName)readableLength=contentLength;
    const readableCoverage=contentLength?Math.min(1,readableLength/contentLength):0;
    const wholeTextWeight=readableCoverage**2;
    const hanShare=contentLength?hanChars.length/contentLength:0;
    const plainTextLikely=hanChars.length>=8&&hanShare>=.8&&basicHanShare>=.75&&!chineseMojibake&&invalidControls===0&&readableCoverage>=.98;
    let score = printable*34 + (englishScore+(wholeFullName?16:fullNameHit?0:Math.min(4,partialHits*2)))*wholeTextWeight + Math.min(spaces,4)*.5*readableCoverage - Math.max(0,shortRareHits-1)*2.5*wholeTextWeight - replacement*12 - (chineseMojibake?12:0);
    const evidence = [`可打印字符 ${Math.round(printable * 100)}%`, `全文可读覆盖 ${Math.round(readableCoverage*100)}%`, `熵 ${entropy(text).toFixed(2)}`];
    if(englishWords&&eligibleWords.length)evidence.push(`英文词库命中 ${englishHits}/${eligibleWords.length}`);
    if(trigramScore>0)evidence.push(`英文字符组合 ${trigramScore.toFixed(1)}`);
    if(fullNameHit||partialHits)evidence.push('ACG Name 词库命中');
    if(plainTextLikely){score=Math.max(score,86);evidence.push('正常中文，视为明文');}
    else if(hanChars.length>=4&&!chineseMojibake)score=Math.max(score,86*wholeTextWeight*printable*printable*hanShare*basicHanShare*basicHanShare*Math.min(1,hanChars.length/8)**2);
    else if(hanChars.length>=2&&chineseMojibake)evidence.push('检测到典型中文乱码');
    if (/^\s*[\[{].*[\]}]\s*$/s.test(text)) { try { JSON.parse(text); score += 30*wholeTextWeight; evidence.push('有效 JSON'); } catch {} }
    if (/https?:\/\/[^\s]+/i.test(text)) { score += 18*wholeTextWeight; evidence.push('包含 URL'); }
    if (/\b(?:the|and|that|this|with|from|hello|flag|secret|password)\b/i.test(text)) { score += 18*wholeTextWeight; evidence.push('英文词命中'); }
    return { score: Math.max(0, Math.min(100, score)), evidence, plainTextLikely, trigramSignal, readableCoverage };
}

const clean = text => text.trim();
const one = (text, label) => text == null ? [] : [{ text, label }];
const utf8 = bytes => new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));
const base64Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const base32Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz234567=';
const base58Alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base85Alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
const base91Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const broadAlphabets=new Map([
    ['base64',base64Alphabet],['base32',base32Alphabet],['base58',base58Alphabet],
    ['ascii85',Array.from({length:85},(_,index)=>String.fromCharCode(index+33)).join('')+'z'],
    ['base85',base85Alphabet],['base91',base91Alphabet]
]);
const alphabetSets=new Map([...broadAlphabets].map(([id,alphabet])=>[id,new Set(alphabet)]));
const baseModels=[...alphabetSets].map(([name,set])=>[name,new Set(name==='base32'?[...set,...'abcdefghijklmnopqrstuvwxyz']:set)]);
baseModels.push(['letters',new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')],['other',new Set(Array.from({length:95},(_,i)=>String.fromCharCode(32+i)))]);
export const DEFAULT_BASE_MODEL='presence';
export function baseAlphabetPosterior(id,text,mode=DEFAULT_BASE_MODEL){
    let compact=text.replace(/\s/g,'');
    if(id==='ascii85'&&compact.startsWith('<~')&&compact.endsWith('~>'))compact=compact.slice(2,-2);
    const source=[...compact];
    if(!source.length)return 0;
    // Equal model priors; letters and unstructured printable ASCII are explicit
    // alternatives, so legal input need not be classified as a Base encoding.
    const distinct=new Set(source),logs=baseModels.map(([name,set])=>{
        if(source.some(c=>!set.has(c)))return [name,-Infinity];
        const k=set.size,n=source.length,d=distinct.size;
        if(mode==='counts')return [name,-n*Math.log(k)];
        if(mode!=='presence')throw new RangeError('Unknown Base model');
        // Bernoulli naive Bayes: both present and absent symbols are evidence.
        const absent=n*Math.log1p(-1/k),present=Math.log(-Math.expm1(absent));
        return [name,d*present+(k-d)*absent];
    });
    const best=Math.max(...logs.map(([,value])=>value));
    if(!Number.isFinite(best))return 0;
    const target=logs.find(([name])=>name===id)?.[1]??-Infinity;
    return Math.exp(target-best)/logs.reduce((sum,[,value])=>sum+Math.exp(value-best),0);
}
function baseScore(id,text,mode=DEFAULT_BASE_MODEL){
    const posterior=baseAlphabetPosterior(id,text,mode);
    const compact=id==='ascii85'?text.replace(/\s/g,'').replace(/^<~/,'').replace(/~>$/,''):text.replace(/\s/g,'');
    const alphabet=baseModels.find(([name])=>name===id)[1];
    if(!compact||[...compact].some(c=>!alphabet.has(c)))return 0;
    if(id==='ascii85'&&/^<~[\s\S]*~>$/.test(text.trim()))return .96;
    if(['base64','base32'].includes(id)&&/=\s*$/.test(text))return .96;
    return posterior;
}
const commonWords=new Set('a i am an as at be by do go he hi if in is it me my no of on or so to up us we all and any are but can day did end for get got had has her him his how its let may new not now off old one our out own say see she the too two use was way who why yes yet you your after again about been being come could every first found from give going good great have here into just know like little look make many more most much must name never only other over part people right said same some such take than that their them then there these they thing think this those time under want were what when where which while will with word work would years hello world secret message discover discovered flee once'.split(' '));
function atbashProbe(text){
    const letters=text.match(/[A-Za-z]/g)||[];
    return letterCipherInput(text)&&letters.length>=4?.3:0;
}
function reverseProbe(text){
    return text.length>=4?.14:0;
}

function wordPrefixBonus(word,englishWords){
    if(word.length<3||!englishWords.has(word))return 0;
    // The dictionary has no usage frequencies. Prefix families provide a
    // small tie-breaker between productive words and isolated rare entries.
    let model=prefixModels.get(englishWords);
    if(!model){model={sorted:[...englishWords].sort(),cache:new Map()};prefixModels.set(englishWords,model);}
    if(model.cache.has(word))return model.cache.get(word);
    const lowerBound=value=>{
        let left=0,right=model.sorted.length;
        while(left<right){const middle=(left+right)>>>1;if(model.sorted[middle]<value)left=middle+1;else right=middle;}
        return left;
    };
    const familySize=lowerBound(word+'{')-lowerBound(word);
    const bonus=Math.min(2,Math.log1p(familySize)*.45);
    model.cache.set(word,bonus);
    return bonus;
}

function autoSegmentEnglish(text,englishWords,trigramScore=englishTrigramScore(text,englishWords),acgWords=null){
    if((!englishWords&&!acgWords)||!/^[A-Za-z]{10,80}$/.test(text)||englishWords?.has(text.toLowerCase())||acgWords?.full.has(text.toLowerCase()))return null;
    const lower=text.toLowerCase(),best=Array(lower.length+1).fill(null);
    if(new Set(lower).size<4)return null;
    best[0]={score:0,parts:[]};
    for(let end=1;end<=lower.length;end++){
        for(let start=Math.max(0,end-Math.max(20,acgWords?.maxLength||0));start<end;start++){
            const previous=best[start];if(!previous)continue;
            const word=lower.slice(start,end),common=commonWords.has(word),fullName=!!acgWords?.full.has(word),partName=!!acgWords?.parts.has(word),english=!!englishWords?.has(word);
            if(!common&&!english&&!fullName&&!partName)continue;
            const uniqueName=fullName&&!english,shortRare=word.length<=3&&!common;
            const score=previous.score+word.length+Math.min(word.length,8)*.35+(english?wordPrefixBonus(word,englishWords):0)+(common?3:0)+(uniqueName&&word.length>=6?4:0)-4.5-(word.length===1?3:0)-(shortRare?2:0)-(partName&&!fullName&&!english?5:0);
            if(!best[end]||score>best[end].score)best[end]={score,parts:[...previous.parts,text.slice(start,end)]};
        }
    }
    const result=best[lower.length];
    return result?.parts.length>=2&&result.score>=lower.length*.5&&(trigramScore>=7||result.parts.some(part=>part.length>=6&&acgWords?.full.has(part.toLowerCase())))?result.parts.join(' '):null;
}

function decodeBase32(text){
    const source=text.toUpperCase().replace(/[\s=]/g,'');
    const bytes=new Uint8Array(Math.floor(source.length*5/8));
    let buffer=0,bitCount=0,index=0;
    for(const char of source){
        const code=char.charCodeAt(0);
        const value=code>=65&&code<=90?code-65:code>=50&&code<=55?code-24:-1;
        if(value<0)return null;
        buffer=(buffer<<5)|value;bitCount+=5;
        if(bitCount>=8){bitCount-=8;bytes[index++]=(buffer>>bitCount)&255;buffer&=(1<<bitCount)-1;}
    }
    try{return utf8(bytes);}catch{return null;}
}
function decodeBase58(text){
    let value=0n;
    for(const char of text){const digit=base58Alphabet.indexOf(char);if(digit<0)return null;value=value*58n+BigInt(digit);}
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
function decodeBase85(text){
    const alphabet=base85Alphabet,source=text.replace(/\s/g,'');if(source.length<5||source.length%5===1)return null;
    const bytes=[];
    for(let i=0;i<source.length;i+=5){
        const group=source.slice(i,i+5),padded=group.padEnd(5,alphabet[84]);let value=0;
        for(const char of padded){const digit=alphabet.indexOf(char);if(digit<0)return null;value=value*85+digit;}
        if(value>0xffffffff)return null;
        bytes.push(...[value>>>24,(value>>>16)&255,(value>>>8)&255,value&255].slice(0,group.length-1));
    }
    try{return utf8(bytes);}catch{return null;}
}
function decodeBase91(text){
    const alphabet=base91Alphabet,source=text.replace(/\s/g,'');let value=-1,bits=0,queue=0;const bytes=[];
    for(const char of source){
        const digit=alphabet.indexOf(char);if(digit<0)return null;
        if(value<0){value=digit;continue;}
        value+=digit*91;queue|=value<<bits;bits+=(value&8191)>88?13:14;
        while(bits>=8){bytes.push(queue&255);queue>>>=8;bits-=8;}value=-1;
    }
    if(value>=0)bytes.push((queue|value<<bits)&255);
    try{return utf8(bytes);}catch{return null;}
}
const morseMap={'.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9'};
const validMorseCharacters=text=>[...text].every(c=>!/[\p{C}\uFFFD]/u.test(c)||/[\r\n\t]/.test(c));
const splitCodeWords=text=>text.trim().split(/[ \t]*[\/|][ \t]*|\r?\n+|[ \t]{2,}/);
function fixedCodeWords(text,size,minUnits){
    const words=splitCodeWords(text),result=[];let units=0;
    if(words.some(word=>!word.trim()))return null;
    for(const word of words){
        const groups=word.trim().split(/[ \t]+/);
        if(groups.length>1&&groups.some(group=>[...group].length!==size))return null;
        const chars=[...groups.join('')];
        if(!chars.length||chars.length%size)return null;
        result.push(chars);units+=chars.length/size;
    }
    return units>=minUnits?result:null;
}
function decodeMorse(text){
    if(!validMorseCharacters(text))return[];
    const source=text.trim();const direct=/^[.\-_\/|\s]+$/.test(source)&&/[.\-_]{2}/.test(source);
    const variants=[];
    if(direct)variants.push({dot:'.',dash:source.includes('_')?'_':'-',standard:true});
    const symbols=[...new Set([...source].filter(c=>!/[\s/|]/.test(c)))];
    if(symbols.length===2){
        for(const dot of symbols){
            const dash=symbols.find(c=>c!==dot);
            if(!(direct&&dot==='.'&&dash===(source.includes('_')?'_':'-')))
                variants.push({dot,dash,standard:false});
        }
    }
    const results=[];
    for(const {dot,dash,standard} of variants){
        const words=splitCodeWords(source);let valid=words.every(Boolean);
        const output=words.map(word=>{
            const groups=word.trim().split(/[ \t]+/);
            return groups.map(group=>{
                if([...group].some(c=>c!==dot&&c!==dash)){valid=false;return '';}
                const letter=morseMap[[...group].map(c=>c===dot?'.':'-').join('')];
                if(!letter)valid=false;
                return letter||'';
            }).join('');
        }).join(' ');
        if(valid&&output)results.push({text:output,label:standard?'Morse':'Morse ('+dot+'=点 '+dash+'=划)'});
    }
    return results;
}
function decodeBacon(text){
    const words=fixedCodeWords(text,5,2);
    if(!words)return[];
    const symbols=[...new Set(words.flat().map(c=>c.toLowerCase()))];
    if(symbols.length!==2)return[];
    const results=[];
    for(const zero of symbols){
        const decoded=[];
        for(const word of words){
            const bits=word.map(c=>c.toLowerCase()===zero?'0':'1').join('');
            const values=bits.match(/.{5}/g).map(x=>parseInt(x,2));
            if(values.some(n=>n>25)){decoded.length=0;break;}
            decoded.push(values.map(n=>String.fromCharCode(65+n)).join(''));
        }
        if(decoded.length===words.length)results.push({text:decoded.join(' '),label:zero==='a'?'Bacon Cipher':'Bacon Cipher ('+zero+'=A)'});
    }
    return results;
}
function decodePolybius(text){
    const source=text.trim();if(!/^[1-5\s,:;|/-]+$/.test(source))return[];
    const digits=source.replace(/[^1-5]/g,'');if(digits.length<4||digits.length%2)return[];
    const square='ABCDEFGHIKLMNOPQRSTUVWXYZ';
    return one((digits.match(/../g)||[]).map(pair=>square[(+pair[0]-1)*5+(+pair[1]-1)]).join(''),'Polybius 5×5');
}
function decodeTapCode(text){
    const words=splitCodeWords(text);
    if(!words.length||words.some(word=>!word.trim()))return[];
    const square='ABCDEFGHIJLMNOPQRSTUVWXYZ';
    const output=[];
    for(const word of words){
        const runs=word.trim().split(/[ \t]+/);
        if(runs.length%2||runs.some(run=>![...run].length||[...run].length>5||new Set(run).size!==1))return[];
        let letters='';
        for(let i=0;i<runs.length;i+=2){
            const row=[...runs[i]].length,column=[...runs[i+1]].length;
            letters+=square[(row-1)*5+column-1];
        }
        output.push(letters);
    }
    return one(output.join(' '),'Tap Code');
}
function binarySymbols(text){
    const words=fixedCodeWords(text,8,2);
    if(!words)return null;
    const symbols=[...new Set(words.flat())];
    return symbols.length===2?{words,symbols}:null;
}
function decodeBinary(text){
    const structure=binarySymbols(text);
    if(!structure)return[];
    const {words,symbols}=structure,standard=symbols.includes('0')&&symbols.includes('1');
    const variants=standard?[['0','1','Binary → Text']]:symbols.map(zero=>[zero,symbols.find(c=>c!==zero),'Binary → Text ('+zero+'=0)']);
    const results=[];
    for(const [zero,oneSymbol,label] of variants){
        const decoded=[];
        for(const word of words){
            const bits=word.map(c=>c===zero?'0':c===oneSymbol?'1':'').join('');
            const bytes=bits.match(/.{8}/g).map(x=>parseInt(x,2));
            try{decoded.push(utf8(bytes));}catch{decoded.length=0;break;}
        }
        if(decoded.length===words.length)results.push({text:decoded.join(' '),label});
    }
    return results;
}
function decodeAdfgx(text){
    const source=text.replace(/[\s/]/g,'').toUpperCase();if(source.length<4||source.length%2||/[^ADFGX]/.test(source))return[];
    const square='ABCDEFGHIKLMNOPQRSTUVWXYZ',axis='ADFGX';
    return one((source.match(/../g)||[]).map(pair=>square[axis.indexOf(pair[0])*5+axis.indexOf(pair[1])]).join(''),'ADFGX（无换位）');
}
function decodeRailFence(text){
    const chars=[...text],results=[];
    for(let rails=2;rails<=Math.min(10,Math.floor(chars.length/2));rails++){
        const pattern=[],counts=Array(rails).fill(0);let row=0,direction=1;
        for(let i=0;i<chars.length;i++){
            pattern.push(row);counts[row]++;
            if(row===0)direction=1;
            else if(row===rails-1)direction=-1;
            row+=direction;
        }
        const rows=[];let offset=0;
        for(const count of counts){rows.push(chars.slice(offset,offset+count));offset+=count;}
        const positions=Array(rails).fill(0);
        results.push({text:pattern.map(index=>rows[index][positions[index]++]).join(''),label:'Rail Fence '+rails+' rails',parameter:rails});
    }
    return results;
}
function probeRailFence(text){
    const source=text.trim();
    const chars=[...source];
    if(chars.length<8||chars.length>500||!chars.some(char=>!/\s/u.test(char))||/[\p{C}]/u.test(source.replace(/[\n\r\t]/g,'')))return 0;
    return .14;
}
const keyboardRows=['1234567890-=','qwertyuiop[]\\',"asdfghjkl;'",'zxcvbnm,./'];
const keyboardCharacter=char=>char>='A'&&char<='Z'?char.toLowerCase():char;
function decodeKeyboardShift(text){
    // Every input character must belong to the physical keyboard table.
    // A direction is legal only when every character has a target in it.
    if(!text.length||[...text].some(char=>!keyboardRows.some(row=>row.includes(keyboardCharacter(char)))))return [];
    const results=[];
    const shifts=[...[-2,-1,1,2].map(offset=>({axis:'horizontal',offset})),...[-2,-1,1,2].map(offset=>({axis:'vertical',offset}))];
    for(const {axis,offset} of shifts){
        let valid=true;
        const decoded=[...text].map(char=>{
            const lower=keyboardCharacter(char),rowIndex=keyboardRows.findIndex(keys=>keys.includes(lower));
            const column=keyboardRows[rowIndex].indexOf(lower);
            const target=axis==='horizontal'?keyboardRows[rowIndex][column+offset]:keyboardRows[rowIndex+offset]?.[column];
            if(!target){valid=false;return char;}
            return char!==lower&&/[a-z]/.test(lower)?target.toUpperCase():target;
        }).join('');
        if(valid){
            const direction=axis==='horizontal'?(offset<0?'left':'right'):(offset<0?'up':'down');
            results.push({text:decoded,label:`Keyboard Shift ${direction} ${Math.abs(offset)}`,parameter:axis==='horizontal'?offset:{direction,steps:Math.abs(offset)}});
        }
    }
    return results;
}
function probeKeyboardShift(text){
    if(text.length<5||text.length>500||!decodeKeyboardShift(text).length)return 0;
    return .34;
}

export const decoders = [
    { id:'url', name:'URL Decode', probe:t=>/%[0-9a-f]{2}/i.test(t)?0.98:0, decode:t=>{try{return one(decodeURIComponent(t),'URL Decode');}catch{return[];}} },
    { id:'html', name:'HTML Entity', probe:t=>/&(?:#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/i.test(t)?0.97:0, decode:t=>one(t.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(amp|lt|gt|quot|apos);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[n.toLowerCase()]),'HTML Entity') },
    { id:'hex', name:'From Hex', probe:t=>/^(?:\s*[0-9a-f]{2}[\s,:-]*){3,}$/i.test(t)?0.96:0, decode:t=>{try{const h=t.replace(/[^0-9a-f]/gi,'');if(h.length%2)return[];const b=Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));return one(new TextDecoder('utf-8',{fatal:true}).decode(b),'From Hex');}catch{return[];}} },
    { id:'base64', name:'From Base64', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=4&&s.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(s)?(/={1,2}$/.test(s)?.96:.78):0;}, decode:t=>{try{const raw=atob(t.replace(/\s/g,'')),b=Uint8Array.from(raw,c=>c.charCodeAt(0));return one(new TextDecoder('utf-8',{fatal:true}).decode(b),'From Base64');}catch{return[];}} },
    { id:'base32', name:'From Base32', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=8&&/^[A-Z2-7]+=*$/i.test(s)&&s.replace(/=/g,'').length%8!==1?.88:0;}, decode:t=>one(decodeBase32(t),'From Base32') },
    { id:'base58', name:'From Base58', probe:t=>{const s=t.trim();return s.length>=6&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)?.52:0;}, decode:t=>one(decodeBase58(t.trim()),'From Base58') },
    { id:'ascii85', name:'From ASCII85', probe:t=>{const s=t.trim();return /^<~[!-u\s]+~>$/.test(s)?.96:(s.length>=10&&/^[!-u\s]+$/.test(s)?.36:0);}, decode:t=>one(decodeAscii85(t),'From ASCII85') },
    { id:'base85', name:'From Base85', probe:t=>{const s=t.replace(/\s/g,'');return s.length>=5&&s.length%5!==1?.42:0;}, decode:t=>one(decodeBase85(t),'From Base85') },
    { id:'base91', name:'From Base91', probe:t=>t.replace(/\s/g,'').length>=4?.36:0, decode:t=>one(decodeBase91(t),'From Base91') },
    { id:'binary', name:'Binary → Text', probe:t=>{const structure=binarySymbols(t);return structure?(structure.symbols.includes('0')&&structure.symbols.includes('1')?.98:.72):0;}, decode:decodeBinary },
    { id:'octal', name:'Octal → Text', probe:t=>{const parts=t.trim().split(/[\s,:-]+/);return parts.length>=2&&parts.every(x=>/^[0-7]{2,3}$/.test(x)&&parseInt(x,8)<=255)?.92:0;}, decode:t=>{try{return one(utf8(t.trim().split(/[\s,:-]+/).map(x=>parseInt(x,8))),'Octal → Text');}catch{return[];}} },
    { id:'decimal', name:'Decimal → Text', probe:t=>/^(?:\s*\d{1,3}[\s,:-]+){2,}\s*\d{1,3}\s*$/.test(t)&&t.split(/[\s,:-]+/).every(x=>+x<=255)?.9:0, decode:t=>one(String.fromCharCode(...clean(t).split(/[\s,:-]+/).map(Number)),'Decimal → Text') },
    { id:'unicode', name:'Unicode Escape', probe:t=>/(?:\\u[0-9a-f]{4}|\\x[0-9a-f]{2})/i.test(t)?.97:0, decode:t=>one(t.replace(/\\u([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\\x([0-9a-f]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))),'Unicode Escape') },
    { id:'a1z26', name:'A1Z26', probe:t=>{const parts=t.trim().split(/[\s,:;|/-]+/);return parts.length>=3&&parts.every(n=>/^\d{1,2}$/.test(n)&&+n>=1&&+n<=26)?.86:0;}, decode:t=>{const parts=t.trim().split(/[\s,:;|/-]+/);return parts.length&&parts.every(n=>/^\d{1,2}$/.test(n)&&+n>=1&&+n<=26)?one(parts.map(n=>String.fromCharCode(64+Number(n))).join(''),'A1Z26'):[];} },
    { id:'bacon', name:'Bacon Cipher', probe:t=>{const words=fixedCodeWords(t,5,2);if(!words||!decodeBacon(t).length)return 0;const symbols=new Set(words.flat().map(c=>c.toLowerCase()));return symbols.has('a')&&symbols.has('b')?.88:.62;}, decode:decodeBacon },
    { id:'morse', name:'Morse', probe:t=>{if(!validMorseCharacters(t))return 0;const s=t.trim(),symbols=new Set([...s].filter(c=>! /[\s/|]/.test(c)));return /^[.\-_\/|\s]+$/.test(s)&&/[.\-_]{2}/.test(s)?.9:s.length>=8&&symbols.size===2&&decodeMorse(s).length?.62:0;}, decode:decodeMorse },
    { id:'polybius', name:'Polybius', probe:t=>{const digits=t.replace(/[^1-5]/g,'');return /^[1-5\s,:;|/-]+$/.test(t)&&digits.length>=4&&digits.length%2===0?(digits.length>=20?.96:.76):0;}, decode:decodePolybius },
    { id:'adfgx', name:'ADFGX', probe:t=>{const s=t.replace(/[\s/]/g,'');return s.length>=4&&s.length%2===0&&/^[ADFGX]+$/i.test(s)?(s.length>=20?.92:.7):0;}, decode:decodeAdfgx },
    { id:'tap', name:'Tap Code', probe:t=>{const runs=splitCodeWords(t).flatMap(word=>word.trim().split(/[ \t]+/));return runs.length>=4&&decodeTapCode(t).length?(runs.every(run=>/^\.+$/.test(run))?.9:.68):0;}, decode:decodeTapCode },
    { id:'atbash', name:'Atbash', probe:atbashProbe, decode:t=>letterCipherInput(t)?one(t.replace(/[A-Za-z]/g,c=>String.fromCharCode((c<='Z'?155:219)-c.charCodeAt(0))),'Atbash'):[] },
    { id:'reverse', name:'Reverse', probe:reverseProbe, decode:t=>one([...t].reverse().join(''),'Reverse') },
    { id:'caesar', name:'Caesar', probe:t=>letterCipherInput(t)&&(t.match(/[A-Za-z]/g)||[]).length>=4?.3:0, decode:t=>letterCipherInput(t)?Array.from({length:25},(_,i)=>{const shift=i+1;return{text:t.replace(/[A-Za-z]/g,c=>{const a=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-a-shift+26)%26+a)}),label:shift===13?'ROT13':`Caesar -${shift}`,parameter:shift};}):[] },
    { id:'railfence', name:'Rail Fence', probe:probeRailFence, decode:decodeRailFence },
    { id:'keyboardshift', name:'Keyboard Shift', probe:probeKeyboardShift, decode:decodeKeyboardShift }
];

// Byte encodings can carry spaces and punctuation themselves. Only codes whose
// alphabet has no space receive optional explicit word-boundary restoration.
const wordEncodedIds=new Set(['a1z26','polybius','adfgx']);
for(const decoder of decoders){
    if(!wordEncodedIds.has(decoder.id))continue;
    const probe=decoder.probe,decode=decoder.decode;
    decoder.probe=text=>{
        const direct=probe(text),words=splitCodeWords(text);
        return words.length>1&&words.every(word=>decode(word).length)?Math.max(direct,.65):direct;
    };
    decoder.decode=text=>{
        const direct=decode(text),words=splitCodeWords(text);
        if(words.length<2||words.some(word=>!word.trim()))return direct;
        const parts=words.map(word=>decode(word));
        if(parts.some(results=>results.length!==1))return direct;
        const combined=parts.map(results=>results[0].text).join(' ');
        return direct.some(result=>result.text===combined)?direct:[...direct,{text:combined,label:parts[0][0].label}];
    };
}

// Raw decoder-local scores. Bounded position lookahead is applied in evaluateText.
for(const decoder of decoders){
    const probe=decoder.probe;
    decoder.probe=text=>{
        const baseline=probe(text);
        if(broadAlphabets.has(decoder.id))return baseline?baseScore(decoder.id,text):0;
        if(['caesar','atbash','keyboardshift'].includes(decoder.id)){
            const chars=[...text].filter(c=>!/\s/.test(c));
            const active=chars.filter(c=>decoder.id==='keyboardshift'?keyboardRows.some(row=>row.includes(c.toLowerCase())):/[A-Za-z]/.test(c)).length;
            return chars.length?baseline*(active/chars.length)**1.5:0;
        }
        return baseline;
    };
}
export function admissibleText(text){
    return !!text&&![...text].some(c=>c==='\ufffd'||(/\p{C}/u.test(c)&&!/[\r\n\t]/.test(c)));
}

function plaintextResults(text,englishWords,acgWords){
    const variants=[{text,segmented:false}];
    const segmented=text.replace(/[A-Za-z]{10,80}/g,run=>autoSegmentEnglish(run,englishWords,undefined,acgWords)||run);
    if(segmented!==text)variants.push({text:segmented,segmented:true});
    const results=[];
    for(const variant of variants){
        const quality=textQuality(variant.text,englishWords,acgWords);
        const letters=(variant.text.match(/[A-Za-z]/g)||[]).length;
        const han=(variant.text.match(/\p{Script=Han}/gu)||[]).length;
        const compact=variant.text.trim().toLowerCase();
        const shortWord=letters>=2&&letters<=9&&/^[A-Za-z]+$/.test(variant.text.trim())&&(commonWords.has(compact)||englishWords?.has(compact)||acgWords?.full.has(compact));
        const phraseWords=variant.text.trim().split(/[\s.,!?;:]+/).filter(Boolean);
        const shortPhrase=letters>=5&&letters<8&&phraseWords.length>=2&&phraseWords.every(word=>/^[A-Za-z]+$/.test(word)&&(commonWords.has(word.toLowerCase())||englishWords?.has(word.toLowerCase())));
        const english=letters>=8&&quality.readableCoverage>=.72&&quality.score>=55;
        const chinese=han>=4&&quality.readableCoverage>=.7&&quality.score>=55;
        const numeric=/^\s*\d[\d\s.,:-]{2,}\d\s*$/.test(variant.text);
        const structured=quality.evidence.includes('有效 JSON')||quality.evidence.includes('包含 URL');
        if(!shortWord&&!shortPhrase&&!english&&!chinese&&!numeric&&!structured)continue;
        const wordCount=(variant.text.match(/[A-Za-z]{3,}/g)||[]).length;
        const score=Math.min(100,Math.max(shortPhrase?55:0,quality.score+(wordCount>=4&&quality.readableCoverage>=.98?Math.min(10,wordCount*1.5):0)));
        results.push({...variant,score,evidence:variant.segmented?[...quality.evidence,'自动分词']:quality.evidence,readableCoverage:quality.readableCoverage,wordCount});
    }
    return results;
}

// Shared recurrence and sampling defaults. Terminal evidence enters only
// through the explicitly bounded transform lookahead.
export const DEFAULT_ALPHA=.5;
export const DEFAULT_Q_INTERVAL=7;

// Eligibility is separate from a decoder's heuristic score. A legal decoder
// with score zero is still executed. Invalid outputs never become states.
function acceptsInput(decoder,text){
    const compact=text.replace(/\s/g,'');
    switch(decoder.id){
        case 'url':return /%[0-9a-f]{2}/i.test(text);
        case 'html':return /&(?:#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/i.test(text);
        case 'unicode':return /\\(?:u[0-9a-f]{4}|x[0-9a-f]{2})/i.test(text);
        case 'hex':return /^(?:\s*[0-9a-f]{2}[\s,:-]*)+$/i.test(text);
        case 'base64':return compact.length>=4&&compact.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(compact);
        case 'base32':return /^[A-Z2-7]+=*$/i.test(compact)&&compact.length>=2;
        case 'base58':return /^[1-9A-HJ-NP-Za-km-z]+$/.test(text.trim());
        case 'ascii85':return /^(?:<~)?[!-u\sz]+(?:~>)?$/.test(text.trim());
        case 'base85':case 'base91':return [...compact].every(c=>alphabetSets.get(decoder.id).has(c));
        case 'decimal':return /^\s*\d{1,3}(?:[\s,:-]+\d{1,3})+\s*$/.test(text)&&text.trim().split(/[\s,:-]+/).every(n=>+n<=255);
        case 'octal':return /^\s*[0-7]{2,3}(?:[\s,:-]+[0-7]{2,3})+\s*$/.test(text);
        case 'a1z26':return /^[\d\s,:;|/-]+$/.test(text);
        case 'polybius':return /^[1-5\s,:;|/-]+$/.test(text);
        case 'adfgx':return /^[ADFGX\s/|]+$/i.test(text);
        case 'binary':return !!binarySymbols(text);
        case 'bacon':return !!fixedCodeWords(text,5,2);
        case 'morse':return validMorseCharacters(text);
        case 'tap':return !!decodeTapCode(text).length;
        case 'caesar':case 'affine':case 'vigenere':case 'beaufort':case 'porta':
        case 'playfair':case 'twosquare':case 'trisquare':case 'foursquare':case 'hill':return letterCipherInput(text);
        case 'atbash':return letterCipherInput(text);
        case 'reverse':return [...text].length>=2;
        case 'railfence':return text.length>=4&&text.length<=500;
        default:return true; // Remaining decoders validate within decode().
    }
}

export function createSearchContext(keys=null,{lookahead=true,baseModel=DEFAULT_BASE_MODEL,englishWords=null,acgWords=null}={}){
    if(!['presence','counts'].includes(baseModel))throw new RangeError('Unknown Base model');
    const keyed=keys===null?[]:validateKeyConfig(keys);
    if(keys!==null&&keyed.errors.length){const error=new Error(keyed.errors[0].message);error.keyErrors=keyed.errors;throw error;}
    return {decoders:[...decoders,...(keys===null?[]:keyed.decoders)],lookahead,baseModel,englishWords,acgWords,cache:new Map(),scoreCache:new Map(),lookaheadCache:new Map(),formatCache:new Map(),plaintextCache:new Map()};
}

function analyzeText(text,context){
    if(!admissibleText(text))return {methods:[],attempted:0};
    const cached=context.cache.get(text);
    if(cached)return cached;
    const methods=[];
    let attempted=0;
    for(const decoder of context.decoders){
        if(!acceptsInput(decoder,text))continue;
        attempted++;
        let results=[];
        try{results=decoder.decode(text).filter(r=>admissibleText(r.text));}catch{}
        if(!results.length)continue;
        const raw=decoder.keyed?0:decoder.probe(text);
        const scores=decoder.keyed?decoder.keyVariants.filter(v=>results.some(r=>r.keyId===v.keyId)).map(v=>({keyId:v.keyId,base:v.probe(text)})):[{base:broadAlphabets.has(decoder.id)&&raw>0?baseScore(decoder.id,text,context.baseModel):raw}];
        methods.push({decoder:decoder.id,results,scores});
    }
    const analysis={methods,attempted};
    if(context.scoreCache){
        if(context.scoreCache.size>=16384)context.scoreCache.delete(context.scoreCache.keys().next().value);
        context.scoreCache.set(text,methods.flatMap(method=>method.scores));
    }
    // Memoization only bounds retained calculations, never the search frontier.
    if(context.cache.size>=256)context.cache.clear();
    context.cache.set(text,analysis);
    return analysis;
}

const positionDecoders=new Set(['reverse','railfence','columnar','caesar','atbash','keyboardshift']);
const formatDecoders=new Set(['url','html','unicode','hex','base64','base32','base58','ascii85','base85','base91','binary','octal','decimal','a1z26','bacon','morse','polybius','adfgx','tap']);
function validatedFormatConfidence(text,context){
    const cached=context.formatCache?.get(text);
    if(cached!==undefined)return cached;
    let best=0;
    for(const decoder of context.decoders){
        if(!formatDecoders.has(decoder.id)||!acceptsInput(decoder,text))continue;
        const score=broadAlphabets.has(decoder.id)?baseScore(decoder.id,text,context.baseModel):decoder.probe(text);
        if(score<=best||score<.5)continue;
        try{if(decoder.decode(text).some(r=>r.text!==text&&r.text.length>=8&&admissibleText(r.text)))best=score;}catch{}
    }
    if(context.formatCache){
        if(context.formatCache.size>=4096)context.formatCache.delete(context.formatCache.keys().next().value);
        context.formatCache.set(text,best);
    }
    return best;
}

function positionLookahead(text,context,remaining){
    if(text.length>500)return [];
    const cacheKey=JSON.stringify([text,remaining>=2]);
    const cached=context.lookaheadCache?.get(cacheKey);
    if(cached)return cached;
    const scores=[];
    for(const method of analyzeText(text,context).methods){
        if(!positionDecoders.has(method.decoder))continue;
        for(const score of method.scores){
            let future=0;
            for(const result of method.results){
                if(result.keyId!==score.keyId||result.text===text)continue;
                if(remaining>=2)future=Math.max(future,.9*validatedFormatConfidence(result.text,context));
                let plain=context.plaintextCache.get(result.text);
                if(!plain){
                    plain=plaintextResults(result.text,context.englishWords,context.acgWords);
                    if(context.plaintextCache.size>=4096)context.plaintextCache.delete(context.plaintextCache.keys().next().value);
                    context.plaintextCache.set(result.text,plain);
                }
                for(const candidate of plain)future=Math.max(future,.95*candidate.score/100);
            }
            // One transform only: verified next format or the actual plaintext
            // observer. No recursive lookahead and no speculative key reward.
            if(future)scores.push({...score,base:Math.max(score.base,future)});
        }
    }
    if(context.lookaheadCache){
        if(context.lookaheadCache.size>=4096)context.lookaheadCache.delete(context.lookaheadCache.keys().next().value);
        context.lookaheadCache.set(cacheKey,scores);
    }
    return scores;
}

export function evaluateText(text,context=createSearchContext(),remaining=Infinity){
    if(!admissibleText(text))return 0;
    let q=0;
    const scores=context.scoreCache?.get(text)??analyzeText(text,context).methods.flatMap(method=>method.scores);
    for(const score of scores)q=Math.max(q,score.base);
    if(context.lookahead!==false&&remaining>=1)for(const score of positionLookahead(text,context,remaining))q=Math.max(q,score.base);
    return q;
}

export function expandTextNode(node,{alpha=DEFAULT_ALPHA,maxDepth=Infinity,englishWords=null,acgWords=null,context=createSearchContext()}={}){
    if(context.englishWords!==englishWords||context.acgWords!==acgWords){
        context.englishWords=englishWords;context.acgWords=acgWords;
        context.lookaheadCache?.clear();context.plaintextCache.clear();
    }
    const transitions=[],analysis=analyzeText(node.text,context),previousKeys=node.usedKeys??[];
    for(const method of analysis.methods)for(const result of method.results){
        // Reward the key actually used by this transition, once per path.
        // Merely having a compatible unused key never increases a text's score.
        const keyTier=result.keyId?(!previousKeys.includes(result.keyId)?2:1):0;
        const keyBonus=keyTier,keySteps=(node.keySteps??0)+(result.keyId?1:0);
        const usedKeys=result.keyId&&!previousKeys.includes(result.keyId)?[...previousKeys,result.keyId]:previousKeys;
        const maxQ=evaluateText(result.text,context,maxDepth-node.depth-1),q=maxQ+keyBonus;
        const confidence=method.scores.find(s=>s.keyId===result.keyId)?.base??method.scores[0].base;
        const step={decoder:method.decoder,label:result.label,parameter:result.parameter,confidence,...(result.keyId?{keyId:result.keyId,keyBonus}:{})};
        let plaintext=context.plaintextCache.get(result.text);
        if(!plaintext){plaintext=plaintextResults(result.text,englishWords,acgWords);if(context.plaintextCache.size>=4096)context.plaintextCache.delete(context.plaintextCache.keys().next().value);context.plaintextCache.set(result.text,plaintext);}
        transitions.push({text:result.text,step,usedKeys,depth:node.depth+1,maxQ,keyBonus,keyTier,keySteps,q,priority:q+alpha*node.priority,plaintext});
    }
    return {transitions,attempted:analysis.attempted};
}

class TextHeap{
    constructor(score='priority'){this.items=[];this.score=score;}
    get size(){return this.items.length;}
    better(a,b){
        for(const field of ['keyTier','keySteps'])if((a[field]??0)!==(b[field]??0))return (a[field]??0)>(b[field]??0);
        return a[this.score]>b[this.score]||(a[this.score]===b[this.score]&&a.order<b.order);
    }
    push(item){let i=this.items.length;this.items.push(item);while(i>0){const p=(i-1)>>1;if(!this.better(item,this.items[p]))break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
    pop(){const top=this.items[0],tail=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.better(this.items[c+1],this.items[c]))c++;if(!this.better(this.items[c],tail))break;this.items[i]=this.items[c];i=c;}this.items[i]=tail;}return top;}
}

class TextFrontier{
    constructor(){this.byPriority=new TextHeap();this.byQ=new TextHeap('q');this.size=0;}
    push(node){node.enqueued=true;this.byPriority.push(node);this.byQ.push(node);this.size++;}
    discard(node){if(node.enqueued){this.size--;node.enqueued=false;}node.discarded=true;}
    pop(byQ=false){
        const heap=byQ?this.byQ:this.byPriority;
        while(heap.size){const node=heap.pop();if(!node.enqueued)continue;node.enqueued=false;this.size--;return node;}
    }
}

export async function search(input,options={}){
    const keyMode=options.keyMode===true,maxDepth=keyMode?Math.max(1,Math.min(5,options.maxDepth??5)):options.maxDepth??3;
    const maxNodes=options.maxNodes??300,alpha=options.alpha??DEFAULT_ALPHA,signal=options.signal;
    if(!Number.isFinite(alpha)||alpha<0||alpha>=1)throw new RangeError('alpha must be in [0, 1)');
    const context=createSearchContext(keyMode?options.keys??[]:null,{lookahead:options.lookahead!==false,baseModel:options.baseModel,englishWords:options.englishWords,acgWords:options.acgWords});
    const englishWords=options.englishWords??null,acgWords=options.acgWords??null;
    let expanded=0,attempted=0,generated=0,order=0,stoppedOnPlaintext=false,frontier=new TextFrontier();
    const qInterval=options.alternateQ===false?0:options.qInterval??DEFAULT_Q_INTERVAL,minDepth=new Map();
    if(!Number.isInteger(qInterval)||qInterval<0)throw new RangeError('qInterval must be a nonnegative integer');
    const stateKey=node=>JSON.stringify([node.text,[...node.usedKeys].sort()]);
    const results=new Map();
    const finish=()=>({candidates:[...results.values()].sort((a,b)=>b.score-a.score).slice(0,20),stats:{expanded,attempted,generated,queued:frontier.size,aborted:!!signal?.aborted,stoppedOnPlaintext,alpha,qInterval,lookahead:context.lookahead}});
    if(signal?.aborted||!admissibleText(input))return finish();
    const rootQ=evaluateText(input,context,maxDepth);
    const root={text:input,depth:0,path:[],usedKeys:[],maxQ:rootQ,keyBonus:0,q:rootQ,priority:rootQ,order:order++,parent:null};
    frontier.push(root);minDepth.set(stateKey(root),0);generated=1;
    const addResult=(variant,parent,step)=>{
        const path=[...parent.path,variant.segmented?{...step,label:step.label+' · 自动分词',segmented:true}:step];
        const candidate={text:variant.text,path,depth:parent.depth+1,score:variant.score,evidence:variant.evidence};
        const previous=results.get(candidate.text);
        if(!previous||candidate.score>previous.score)results.set(candidate.text,candidate);
        if(results.size>100){const best=[...results.values()].sort((a,b)=>b.score-a.score).slice(0,40);results.clear();for(const r of best)results.set(r.text,r);}
        if(variant.score>=99&&variant.readableCoverage>=.98&&variant.wordCount>=6&&candidate.text.length>=35)stoppedOnPlaintext=true;
    };
    const expandBatch=keyMode?null:options.expandBatch;
    for(let level=0;level<maxDepth&&frontier.size&&expanded<maxNodes&&!signal?.aborted&&!stoppedOnPlaintext;level++){
        const next=new TextFrontier(),seen=new Map(),limit=Math.max(expanded+1,Math.round(maxNodes*(level+1)/maxDepth));
        while(frontier.size&&expanded<limit&&!signal?.aborted&&!stoppedOnPlaintext){
            const batch=[],size=Math.min(expandBatch?Math.max(1,options.batchSize??8):1,limit-expanded);
            while(frontier.size&&batch.length<size)batch.push(frontier.pop(qInterval>0&&(expanded+batch.length)%(qInterval+1)===qInterval));
            if(!batch.length)break;
            const expansions=expandBatch?await expandBatch(batch,{alpha,maxDepth,lookahead:context.lookahead,baseModel:context.baseModel}):batch.map(node=>expandTextNode(node,{alpha,maxDepth,englishWords,acgWords,context}));
            for(let i=0;i<batch.length&&!signal?.aborted&&!stoppedOnPlaintext;i++){
                const parent=batch[i],expansion=expansions[i];expanded++;attempted+=expansion.attempted;
                options.onNode?.(parent,{expanded,attempted,generated});
                for(const transition of expansion.transitions){
                    const key=stateKey(transition),shorter=minDepth.get(key);
                    if(shorter!==undefined&&shorter<transition.depth)continue;
                    // A keyed cycle can return to an ancestor with a different
                    // used-key set; no extra steps are needed to recover its text.
                    let cycle=false;
                    if(keyMode)for(let ancestor=parent;ancestor;ancestor=ancestor.parent)if(ancestor.text===transition.text){cycle=true;break;}
                    if(cycle)continue;
                    // Plaintext is observed immediately, including the final depth.
                    for(const variant of transition.plaintext)addResult(variant,parent,transition.step);
                    const previous=seen.get(key);
                    if(previous&&!next.byPriority.better({...transition,order:previous.order},previous))continue;
                    if(previous)next.discard(previous);
                    minDepth.set(key,transition.depth);
                    const state={text:transition.text,usedKeys:transition.usedKeys,depth:transition.depth,maxQ:transition.maxQ,keyBonus:transition.keyBonus,keyTier:transition.keyTier,keySteps:transition.keySteps,q:transition.q,priority:transition.priority,path:[...parent.path,transition.step],order:order++,parent:keyMode?parent:null};
                    seen.set(key,state);generated++;if(state.depth<maxDepth)next.push(state);
                }
            }
            if(expanded%10===0||expandBatch){options.onProgress?.({expanded,attempted,generated,queued:frontier.size+next.size});await new Promise(resolve=>setTimeout(resolve,0));}
        }
        frontier=next;
    }
    return finish();
}

export {textQuality};
