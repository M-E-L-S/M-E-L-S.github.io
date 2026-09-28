const engineUrl=new URL('./arg-engine.js',self.location.href);
engineUrl.search=self.location.search;
const enginePromise=import(engineUrl.href);
let englishWords=null,acgWords=null;

self.onmessage=async event=>{
    const {type,id}=event.data;
    if(type==='init'){
        try{
            await enginePromise;
            englishWords=event.data.englishWords;
            acgWords=event.data.acgWords;
            self.postMessage({type:'ready'});
        }catch(error){self.postMessage({type:'initError',message:String(error?.message??error)});}
        return;
    }
    if(type!=='expand')return;
    try{
        const {actions,maxDepth}=event.data;
        const {expandSearchAction}=await enginePromise;
        const results=actions.map(action=>expandSearchAction(action,{maxDepth,englishWords,acgWords}));
        self.postMessage({type:'expanded',id,results});
    }catch(error){
        self.postMessage({type:'error',id,message:String(error?.message??error)});
    }
};
