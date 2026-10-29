const engineUrl=new URL('./arg-engine.js',self.location.href);
engineUrl.search=self.location.search;
const enginePromise=import(engineUrl.href);
let englishWords=null,acgWords=null,context=null;

self.onmessage=async event=>{
    const {type,id}=event.data;
    if(type==='init'){
        try{
            const {createSearchContext}=await enginePromise;
            context=createSearchContext();
            englishWords=event.data.englishWords;
            acgWords=event.data.acgWords;
            self.postMessage({type:'ready'});
        }catch(error){self.postMessage({type:'initError',message:String(error?.message??error)});}
        return;
    }
    if(type!=='expand')return;
    try{
        const {nodes,alpha,maxDepth,lookahead,baseModel}=event.data;
        if(baseModel&&context.baseModel!==baseModel){
            const {createSearchContext}=await enginePromise;
            context=createSearchContext(null,{baseModel});
        }
        context.lookahead=lookahead!==false;
        const {expandTextNode}=await enginePromise;
        const results=nodes.map(node=>expandTextNode(node,{alpha,maxDepth,englishWords,acgWords,context}));
        self.postMessage({type:'expanded',id,results});
    }catch(error){
        self.postMessage({type:'error',id,message:String(error?.message??error)});
    }
};
