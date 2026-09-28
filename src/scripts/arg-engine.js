const encoder = new TextEncoder();
const trigramModels = new WeakMap();
const prefixModels = new WeakMap();

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

const same = (a, b) => a === b;
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
const characterSupport=new Map();
for(const alphabet of alphabetSets.values())for(const char of alphabet)characterSupport.set(char,(characterSupport.get(char)||0)+1);
function broadAlphabetConfidence(id,text,baseline){
    const alphabet=alphabetSets.get(id);
    let compact=text.replace(/\s/g,'');
    if(id==='ascii85'&&compact.startsWith('<~')&&compact.endsWith('~>'))compact=compact.slice(2,-2);
    const source=[...compact];
    if(!source.length||source.some(char=>!alphabet.has(char)))return 0;
    const counts=new Map();
    for(const char of source)counts.set(char,(counts.get(char)||0)+1);
    let distinctive=0;
    for(const [char,count] of counts){
        const support=characterSupport.get(char);
        if(support<=3)distinctive+=Math.min(count,8)*(broadAlphabets.size-support)/(broadAlphabets.size-1);
    }
    return baseline+(Math.max(baseline,.92)-baseline)*(1-Math.exp(-distinctive/5));
}
const commonWords=new Set('a i am an as at be by do go he hi if in is it me my no of on or so to up us we all and any are but can day did end for get got had has her him his how its let may new not now off old one our out own say see she the too two use was way who why yes yet you your after again about been being come could every first found from give going good great have here into just know like little look make many more most much must name never only other over part people right said same some such take than that their them then there these they thing think this those time under want were what when where which while will with word work would years hello world secret message discover discovered flee once'.split(' '));
const englishLetterFrequency=[8.2,1.5,2.8,4.3,12.7,2.2,2,6.1,7,.15,.77,4,2.4,6.7,7.5,1.9,.095,6,6.3,9.1,2.8,.98,2.4,.15,2,.074];
function englishUnigramEvidence(text){
    const letters=text.match(/[A-Za-z]/g)||[];
    if(letters.length<20)return 0;
    const likelihood=letters.reduce((sum,char)=>sum+Math.log(englishLetterFrequency[char.toUpperCase().charCodeAt(0)-65]/100),0)/letters.length;
    return Math.max(0,Math.min(1,(likelihood+3.5)/.65));
}
function atbashProbe(text){
    const letters=text.match(/[A-Za-z]/g)||[];
    if(letters.length<4)return 0;
    const coverage=letters.length/Math.max(1,[...text].filter(char=>!/[\s]/.test(char)).length);
    if(letters.length<20||coverage<.9)return .24;
    // A reflected English unigram profile is evidence for Atbash itself;
    // this deliberately does not use the result board's word scoring.
    const reflected=letters.map(char=>String.fromCharCode(90-(char.toUpperCase().charCodeAt(0)-65))).join('');
    return .24+englishUnigramEvidence(reflected)*.59;
}
const orderWords=[...commonWords].filter(word=>word.length>=3);
function wordOrderEvidence(text){
    const compact=text.replace(/\s/g,'');
    if(!/^[A-Za-z]{12,80}$/.test(compact))return 0;
    const lower=compact.toLowerCase();
    let total=0;
    for(const word of orderWords){
        if(word.length<4&&word!=='can'&&word!=='the')continue;
        if(lower.includes(word))total+=Math.min(word.length,6);
    }
    return total;
}
function reverseProbe(text){
    if(text.length<4)return 0;
    const backward=wordOrderEvidence([...text].reverse().join(''));
    const forward=wordOrderEvidence(text);
    return backward>=10&&backward>=forward+7?.14+Math.min(.78,(backward-forward-6)*.2):.14;
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
    const hasDigits=/\p{N}/u.test(source),hasSymbols=/[^\p{L}\p{N}\s]/u.test(source);
    return hasSymbols?(hasDigits?.10:.16):(hasDigits?.22:.28);
}
const keyboardRows=['1234567890-=','qwertyuiop[]\\',"asdfghjkl;'",'zxcvbnm,./'];
function decodeKeyboardShift(text){
    const results=[];
    const shifts=[...[-2,-1,1,2].map(offset=>({axis:'horizontal',offset})),...[-2,-1,1,2].map(offset=>({axis:'vertical',offset}))];
    for(const {axis,offset} of shifts){
        let valid=true;
        const decoded=[...text].map(char=>{
            const lower=char.toLowerCase(),rowIndex=keyboardRows.findIndex(keys=>keys.includes(lower));
            if(rowIndex<0)return char;
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
    const chars=[...text],mapped=chars.filter(c=>keyboardRows.some(row=>row.includes(c.toLowerCase()))).length;
    if(chars.length<5||chars.length>500||mapped/chars.length<.75)return 0;
    const letters=(text.match(/[A-Za-z]/g)||[]).length;
    if(letters<2)return mapped>=5&&/^[0-9=\-\s]+$/.test(text)?.18:0;
    if(letters<20||chars.length>160)return .34;
    let evidence=0;
    for(const result of decodeKeyboardShift(text))evidence=Math.max(evidence,englishUnigramEvidence(result.text));
    return .34+evidence*.5;
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
    { id:'atbash', name:'Atbash', probe:atbashProbe, decode:t=>one(t.replace(/[A-Za-z]/g,c=>String.fromCharCode((c<='Z'?155:219)-c.charCodeAt(0))),'Atbash') },
    { id:'reverse', name:'Reverse', probe:reverseProbe, decode:t=>one([...t].reverse().join(''),'Reverse') },
    { id:'caesar', name:'Caesar', probe:t=>(t.match(/[A-Za-z]/g)||[]).length>=4?.3:0, decode:t=>Array.from({length:25},(_,i)=>{const shift=i+1;return{text:t.replace(/[A-Za-z]/g,c=>{const a=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-a-shift+26)%26+a)}),label:shift===13?'ROT13':`Caesar -${shift}`,parameter:shift};}) },
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

// These probes describe specific input structures. Broad alphabet matches such as
// unpadded Base64 are too common to predict whether another layer will be useful.
const strongFollowupIds=new Set(['adfgx','binary','bacon','morse','polybius','tap','hex','url','html','unicode','a1z26','octal','decimal']);
const byteFollowupIds=new Set(['base58','ascii85','base85','base91']);
const base58Decoder=decoders.find(decoder=>decoder.id==='base58');
const base85Decoder=decoders.find(decoder=>decoder.id==='base85');
const caesarDecoder=decoders.find(decoder=>decoder.id==='caesar');
const originalProbes=new Map(decoders.map(decoder=>[decoder.id,decoder.probe]));
const transpositionEvidenceCache=new Map();
function transpositionEvidence(text){
    if(transpositionEvidenceCache.has(text))return transpositionEvidenceCache.get(text);
    let best=0,confirmed=false;
    for(const decoder of decoders){
        if(decoder.id==='reverse'||decoder.id==='railfence'||decoder.id==='caesar'||decoder.id==='atbash'||decoder.id==='keyboardshift')continue;
        const confidence=decoder.probe(text);
        if(confidence>best)best=confidence;
        if(['url','html','unicode'].includes(decoder.id)&&confidence>=.85&&decoder.decode(text).length)confirmed=true;
    }
    const content=[...text].filter(char=>!/[\s/|]/.test(char));
    const symbols=new Set(content);
    let latent=content.length>=8&&symbols.size===2?.62:0;
    const slashCount=(text.match(/\\/g)||[]).length,percentCount=(text.match(/%/g)||[]).length;
    if(slashCount>=2&&/[ux]/i.test(text)&&/[0-9a-f]/i.test(text))latent=Math.max(latent,.72);
    if(percentCount>=2&&/[0-9a-f]/i.test(text))latent=Math.max(latent,.68);
    const result={best:Math.max(best,latent),confirmed};
    if(transpositionEvidenceCache.size>=128)transpositionEvidenceCache.clear();
    transpositionEvidenceCache.set(text,result);
    return result;
}
for(const decoder of decoders){
    const rawProbe=originalProbes.get(decoder.id);
    decoder.probe=text=>{
        const baseline=rawProbe(text);
        if(broadAlphabets.has(decoder.id))return baseline?broadAlphabetConfidence(decoder.id,text,baseline):0;
        if(['caesar','atbash','keyboardshift'].includes(decoder.id)){
            const content=[...text].filter(char=>!/\s/.test(char));
            if(!content.length)return 0;
            const active=content.filter(char=>decoder.id==='keyboardshift'?keyboardRows.some(row=>row.includes(char.toLowerCase())):/[A-Za-z]/.test(char)).length;
            return baseline*(active/content.length)**1.5;
        }
        if(decoder.id==='reverse'||decoder.id==='railfence'){
            if(!baseline)return 0;
            const {best,confirmed}=transpositionEvidence(text);
            const confidence=Math.max(baseline,Math.min(.72,.08+best*.58));
            return confirmed?Math.min(confidence,.25):confidence;
        }
        return baseline;
    };
}

const modulo26=value=>(value%26+26)%26;
// Character substitutions commute with Rail Fence and Reverse. Reduce their
// combined affine map before spending another search depth on an equivalent path.
const isPermutation=id=>id==='railfence'||id==='reverse';
const isAffine=id=>id==='caesar'||id==='atbash';

function redundantAffineStep(node,decoder,result){
    const operations=[{decoder:decoder.id,parameter:result.parameter}];
    for(let cursor=node;cursor?.step;cursor=cursor.parent){
        if(cursor.step.segmented)break;
        if(isAffine(cursor.step.decoder))operations.unshift(cursor.step);
        else if(!isPermutation(cursor.step.decoder))break;
    }
    if(operations.length<2)return false;
    let sign=1,offset=0;
    for(const operation of operations){
        const nextSign=operation.decoder==='atbash'?-1:1;
        const nextOffset=operation.decoder==='atbash'?25:-operation.parameter;
        offset=modulo26(nextSign*offset+nextOffset);
        sign*=nextSign;
    }
    const minimum=sign===1?(offset===0?0:1):(offset===25?1:2);
    return operations.length>minimum;
}

function keyboardVector(parameter){
    return typeof parameter==='number'?{axis:'horizontal',offset:parameter}:{axis:'vertical',offset:(parameter.direction==='up'?-1:1)*parameter.steps};
}

function redundantKeyboardStep(node,result){
    const current=keyboardVector(result.parameter),permutations=[];
    let cursor=node;
    while(cursor?.step&&!cursor.step.segmented&&isPermutation(cursor.step.decoder)){
        permutations.unshift(cursor.step);
        cursor=cursor.parent;
    }
    if(cursor?.step?.segmented||cursor?.step?.decoder!=='keyboardshift')return false;
    const previous=keyboardVector(cursor.step.parameter);
    if(previous.axis!==current.axis)return false;
    const offset=previous.offset+current.offset;
    if(Math.abs(offset)>2)return false;
    // Keyboard rows have different lengths and can change case at the digit
    // boundary, so confirm the shorter route actually produces the same text.
    let shorter=cursor.parent.text;
    if(offset){
        const variant=decodeKeyboardShift(shorter).find(candidate=>{
            const vector=keyboardVector(candidate.parameter);
            return vector.axis===current.axis&&vector.offset===offset;
        });
        if(!variant)return false;
        shorter=variant.text;
    }
    for(const step of permutations){
        if(step.decoder==='railfence'&&!probeRailFence(shorter))return false;
        shorter=step.decoder==='reverse'?[...shorter].reverse().join(''):decodeRailFence(shorter).find(candidate=>candidate.parameter===step.parameter)?.text;
        if(shorter==null)return false;
    }
    return shorter.toLowerCase()===result.text.toLowerCase();
}

function redundantReverseStep(node){
    for(let cursor=node;cursor?.step;cursor=cursor.parent){
        if(cursor.step.segmented)return false;
        if(cursor.step.decoder==='reverse')return true;
        if(!isAffine(cursor.step.decoder)&&cursor.step.decoder!=='keyboardshift')return false;
    }
    return false;
}

function redundantTransform(node,decoder,result){
    if(isAffine(decoder.id))return redundantAffineStep(node,decoder,result);
    if(decoder.id==='keyboardshift')return redundantKeyboardStep(node,result);
    if(decoder.id==='reverse')return redundantReverseStep(node);
    return false;
}

// Expansion is pure: workers can evaluate nodes independently, while the
// coordinator retains ownership of deduplication, ranking and beam pruning.
// Search jobs are (text state, next decoder) pairs. Text quality belongs to
// the result board; it never contributes to the priority of these jobs.
export function admissibleText(text){
    return !!text&&![...text].some(char=>char==='\ufffd'||(/\p{C}/u.test(char)&&!/[\r\n\t]/.test(char)));
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

const searchDecoders=new Map(decoders.map(decoder=>[decoder.id,decoder]));
const lookaheadDecoders=decoders.filter(decoder=>strongFollowupIds.has(decoder.id)||byteFollowupIds.has(decoder.id)||decoder.id==='base64'||decoder.id==='base32');
const polybiusDecoder=searchDecoders.get('polybius'),morseDecoder=searchDecoders.get('morse'),baconDecoder=searchDecoders.get('bacon');
function safeDecode(decoder,text){try{return decoder.decode(text);}catch{return[];}}
// A rail/shift lookahead reaches the same intermediate text from many actions.
// Bound the cache so a long search does not retain its entire speculative tree.
const formatConfidenceCache=new Map();
function validatedFormatConfidence(text){
    const cached=formatConfidenceCache.get(text);
    if(cached!==undefined)return cached;
    let best=0;
    for(const decoder of lookaheadDecoders){
        const confidence=decoder.probe(text);
        if(confidence<.6&&!(decoder.id==='base58'&&confidence>=.5))continue;
        if(confidence<=best&&decoder.id!=='base58')continue;
        if(text.length>200&&byteFollowupIds.has(decoder.id)&&decoder.id!=='base58'&&confidence<.85)continue;
        for(const result of safeDecode(decoder,text)){
            if(!admissibleText(result.text)||result.text===text||result.text.length<8)continue;
            if(decoder.id==='base58'&&(morseDecoder.probe(result.text)>=.8||baconDecoder.probe(result.text)>=.8||searchDecoders.get('a1z26').probe(result.text)>=.8||searchDecoders.get('decimal').probe(result.text)>=.8))best=Math.max(best,.95);
            else best=Math.max(best,confidence);
        }
    }
    if(formatConfidenceCache.size>=4096)formatConfidenceCache.clear();
    formatConfidenceCache.set(text,best);
    return best;
}
function actionLookahead(text,decoder,confidence,remaining,parentDecoder){
    const weakAtbash=decoder.id==='atbash'&&remaining>=3&&text.length<=160;
    const weakCaesar=decoder.id==='caesar'&&((parentDecoder==='railfence'&&text.length<=500)||(parentDecoder==='base91'&&remaining>=5&&text.length<=160));
    const verifiedBase64=decoder.id==='base64'&&confidence>.8&&remaining>=2&&text.length<=500&&safeDecode(decoder,text).some(result=>polybiusDecoder.probe(result.text)>=.7);
    if(remaining<2||text.length>500||(confidence<.2&&!weakAtbash&&!weakCaesar)||(confidence>.8&&!['base32','adfgx'].includes(decoder.id)&&!verifiedBase64))return 0;
    let best=0;
    for(const result of safeDecode(decoder,text)){
        if(!admissibleText(result.text)||result.text===text)continue;
        best=Math.max(best,validatedFormatConfidence(result.text));
        if(decoder.id==='adfgx'&&/^[A-Za-z]{10,80}$/.test(result.text))best=Math.max(best,atbashProbe(result.text));
        if(weakCaesar&&parentDecoder==='base91'&&best<.9){
            for(const rail of decodeRailFence(result.text)){
                const reversed=[...rail.text].reverse().join('');
                if(base85Decoder.probe(reversed)<.75)continue;
                if(safeDecode(base85Decoder,reversed).some(decoded=>polybiusDecoder.probe(decoded.text)>=.7)){best=.95;break;}
            }
        }
        if(decoder.id==='railfence'&&remaining>=4&&best<.9){
            const reversed=[...result.text].reverse().join('');
            if(parentDecoder==='caesar'&&result.text.length<=160&&base85Decoder.probe(reversed)>=.75&&safeDecode(base85Decoder,reversed).some(decoded=>polybiusDecoder.probe(decoded.text)>=.7))best=.95;
            if(parentDecoder==='base85'&&result.text.length<=350&&base58Decoder.probe(reversed)>=.5&&safeDecode(base58Decoder,reversed).some(decoded=>baconDecoder.probe(decoded.text)>=.8))best=.95;
        }
        if(remaining>=3&&best<.9){
            if(decoder.id==='railfence'&&parentDecoder==='reverse'&&/^[A-Za-z0-9+/=]{24,160}$/.test(result.text)){
                for(const shifted of caesarDecoder.decode(result.text))best=Math.max(best,validatedFormatConfidence(shifted.text));
            }
            if(decoder.id==='atbash'&&result.text.length>=20&&result.text.length<=160){
                for(const shifted of decodeRailFence(result.text))best=Math.max(best,validatedFormatConfidence(shifted.text));
            }
            if(decoder.id==='base64'&&parentDecoder==='caesar'&&result.text.length<=160){
                for(const shifted of decodeKeyboardShift(result.text))best=Math.max(best,validatedFormatConfidence(shifted.text));
            }
        }
    }
    return Math.min(.9,best*.9);
}

export function prepareSearchActions(text,parentConfidence,remaining,parentDecoder=null){
    if(remaining<1)return [];
    const actions=[];
    for(const decoder of decoders){
        const confidence=decoder.probe(text);
        if(!confidence)continue;
        const lookahead=actionLookahead(text,decoder,confidence,remaining,parentDecoder);
        actions.push({decoder:decoder.id,confidence,priority:confidence+parentConfidence*.8+lookahead});
    }
    return actions.sort((a,b)=>b.priority-a.priority);
}

export function expandSearchAction(action,{maxDepth,englishWords=null,acgWords=null}){
    const decoder=searchDecoders.get(action.decoder);
    if(!decoder)return {transitions:[],redundantPruned:0};
    const state=action.state,transitions=[];
    let redundantPruned=0;
    for(const result of safeDecode(decoder,state.text)){
        if(!admissibleText(result.text)||result.text===state.text)continue;
        if(redundantTransform(state,decoder,result)){redundantPruned++;continue;}
        const step={decoder:decoder.id,label:result.label,confidence:action.confidence,parameter:result.parameter};
        const depth=state.depth+1;
        transitions.push({text:result.text,step,depth,plaintext:plaintextResults(result.text,englishWords,acgWords),actions:prepareSearchActions(result.text,action.confidence,maxDepth-depth,decoder.id)});
    }
    return {transitions,redundantPruned};
}

class ActionHeap{
    constructor(){this.items=[];}
    get size(){return this.items.length;}
    push(item){
        const items=this.items;let index=items.length;items.push(item);
        while(index>0){const parent=(index-1)>>1;if(items[parent].priority>=item.priority)break;items[index]=items[parent];index=parent;}
        items[index]=item;
    }
    pop(){
        const items=this.items,top=items[0],tail=items.pop();
        if(items.length){let index=0;while(index*2+1<items.length){let child=index*2+1;if(child+1<items.length&&items[child+1].priority>items[child].priority)child++;if(tail.priority>=items[child].priority)break;items[index]=items[child];index=child;}items[index]=tail;}
        return top;
    }
    trim(limit){
        if(this.size<=limit)return;
        const best=this.items.sort((a,b)=>b.priority-a.priority).slice(0,limit);
        this.items=[];for(const item of best)this.push(item);
    }
}
class ActionFrontier{
    constructor(){this.groups=new Map();this.size=0;this.selected=new Map();}
    get items(){return [...this.groups.values()].flatMap(heap=>heap.items);}
    push(action){
        let heap=this.groups.get(action.decoder);
        if(!heap){heap=new ActionHeap();this.groups.set(action.decoder,heap);}
        heap.push(action);this.size++;
    }
    pop(diverse=false){
        let chosen=null,chosenHeap=null,best=-Infinity;
        for(const [decoder,heap] of this.groups){
            if(!heap.size)continue;
            const score=diverse?-(this.selected.get(decoder)||0):heap.items[0].priority;
            if(score>best||(score===best&&heap.items[0].priority>(chosenHeap?.items[0].priority??-Infinity))){best=score;chosen=decoder;chosenHeap=heap;}
        }
        if(!chosenHeap)return null;
        this.size--;
        this.selected.set(chosen,(this.selected.get(chosen)||0)+1);
        return chosenHeap.pop();
    }
    trim(limit){
        if(this.size<=limit)return;
        const best=this.items.sort((a,b)=>b.priority-a.priority).slice(0,limit);
        this.clear();for(const action of best)this.push(action);
    }
    clear(){this.groups.clear();this.size=0;}
}

export async function search(input, options={}) {
    const maxDepth=options.maxDepth??3,maxNodes=options.maxNodes??300,signal=options.signal;
    const englishWords=options.englishWords??null,acgWords=options.acgWords??null;
    if(!admissibleText(input))return {candidates:[],stats:{expanded:0,attempted:0,generated:0,queued:0,redundantPruned:0,aborted:!!signal?.aborted,stoppedOnPlaintext:false}};
    const root={text:input,path:[],depth:0,parent:null,step:null};
    const frontiers=Array.from({length:maxDepth},()=>new ActionFrontier()),seen=new Map([[input,[root]]]),results=new Map();
    for(const descriptor of prepareSearchActions(input,0,maxDepth))frontiers[0].push({...descriptor,state:root});
    let expanded=0,attempted=0,generated=1,redundantPruned=0,nodeBudget=maxNodes,stoppedOnPlaintext=false;
    const addResult=(variant,state,step)=>{
        const path=[...state.path,variant.segmented?{...step,label:step.label+' · 自动分词',segmented:true}:step];
        const candidate={text:variant.text,path,depth:state.depth+1,score:variant.score,evidence:variant.evidence};
        const previous=results.get(candidate.text);
        if(!previous||candidate.score>previous.score)results.set(candidate.text,candidate);
        if(results.size>100){
            const ranked=[...results.values()].sort((a,b)=>b.score-a.score).slice(0,40);
            results.clear();for(const item of ranked)results.set(item.text,item);
        }
        if(variant.score>=99&&variant.readableCoverage>=.98&&variant.wordCount>=6&&candidate.text.length>=35)stoppedOnPlaintext=true;
    };
    const consume=(action,expansion)=>{
        redundantPruned+=expansion.redundantPruned;
        let productive=false;
        for(const transition of expansion.transitions){
            const variants=seen.get(transition.text)||[];
            const previous=variants.find(state=>state.depth===transition.depth&&state.step?.decoder===transition.step.decoder);
            if(previous&&previous.step.confidence>=transition.step.confidence)continue;
            if(previous)previous.discarded=true;
            const state={text:transition.text,path:[...action.state.path,transition.step],depth:transition.depth,parent:action.state,step:transition.step};
            if(previous)variants.splice(variants.indexOf(previous),1,state);
            else variants.push(state);
            seen.set(state.text,variants);generated++;productive=true;
            for(const variant of transition.plaintext)addResult(variant,action.state,transition.step);
            if(state.depth<maxDepth)for(const descriptor of transition.actions)frontiers[state.depth].push({...descriptor,state});
        }
        if(productive)expanded++;
    };
    const attemptLimit=Math.max(2000,maxNodes*32);
    for(let level=0;level<maxDepth&&expanded<nodeBudget&&attempted<attemptLimit&&!signal?.aborted&&!stoppedOnPlaintext;level++){
        const frontier=frontiers[level];
        if(options.adjustBudget)nodeBudget=Math.max(expanded+1,Math.round(options.adjustBudget({level,frontier:frontier.items,expanded,generated,nodeBudget,attempted})));
        // Jobs start at depth zero, while successful text results start at
        // depth one. Unused successful-operation allowance rolls forward.
        const levelLimit=Math.max(expanded+1,Math.round(nodeBudget*(level+1)*(level+2)/(maxDepth*(maxDepth+1))));
        while(frontier.size&&expanded<levelLimit&&attempted<attemptLimit&&!signal?.aborted&&!stoppedOnPlaintext){
            const batch=[];
            const requested=options.expandBatch?Math.max(1,options.batchSize??8):1;
            const batchSize=Math.min(requested,levelLimit-expanded);
            while(batch.length<batchSize&&frontier.size){
                // Most slots follow global priority. Every fourth slot gives
                // an underexplored decoder a chance at this depth.
                const action=frontier.pop((attempted+batch.length)%4===3);
                if(action.state.discarded)continue;
                batch.push(action);
            }
            if(!batch.length)break;
            const expansions=options.expandBatch?await options.expandBatch(batch,{maxDepth}):batch.map(action=>expandSearchAction(action,{maxDepth,englishWords,acgWords}));
            for(let index=0;index<batch.length;index++){
                if(signal?.aborted||stoppedOnPlaintext)break;
                attempted++;
                options.onAction?.(batch[index],{expanded,attempted,queued:frontier.size});
                consume(batch[index],expansions[index]);
            }
            const next=frontiers[level+1],cap=Math.max(512,Math.min(20000,nodeBudget*8));
            if(next&&next.size>cap*1.5)next.trim(cap);
            if(attempted%20===0||options.expandBatch){options.onProgress?.({expanded,generated,queued:frontiers.reduce((sum,item)=>sum+item.size,0),attempted});await new Promise(resolve=>setTimeout(resolve,0));}
        }
        frontier.clear();
        // Deduplication is local to one generated text layer. Older paths are
        // reachable through queued states but need not remain indexed here.
        seen.clear();
    }
    const candidates=[...results.values()].sort((a,b)=>b.score-a.score).slice(0,20);
    return {candidates,stats:{expanded,attempted,generated,queued:frontiers.reduce((sum,item)=>sum+item.size,0),redundantPruned,aborted:!!signal?.aborted,stoppedOnPlaintext}};
}

export { textQuality, redundantTransform };
