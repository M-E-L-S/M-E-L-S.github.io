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
        const {nodes,maxDepth,plaintextGrace}=event.data;
        const {expandNodeTransitions}=await enginePromise;
        const results=nodes.map(node=>{
            if(node.plainTextLikely&&node.depth>=plaintextGrace)return null;
            const expansion=expandNodeTransitions(node,{maxDepth,englishWords,acgWords});
            // The coordinator owns each parent. Avoid cloning the full ancestry
            // back once for every candidate in a wide expansion.
            for(const transition of expansion.transitions){
                transition.child.parent=null;
                if(transition.segmentedChild)transition.segmentedChild.parent=null;
            }
            return expansion;
        });
        self.postMessage({type:'expanded',id,results});
    }catch(error){
        self.postMessage({type:'error',id,message:String(error?.message??error)});
    }
};
