// Keep useful reads across scroll/navigation, while bounding host requests.
export function createHydrator({fetchItems,accept,onError,batchSize=6,concurrency=2}){
 let epoch=0,queue=[],ready=new Set(),failed=new Set(),disposed=false;
 const active=new Set();
 const pending=id=>[...active].some(job=>job.epoch===epoch&&job.ids.includes(id));
 function pump(){
  if(disposed)return;
  queue=queue.filter(id=>!ready.has(id)&&!failed.has(id)&&!pending(id));
  while(active.size<concurrency&&queue.length){
   const job={epoch,ids:queue.splice(0,batchSize)};active.add(job);
   Promise.resolve().then(()=>fetchItems(job.ids)).then(result=>{
    if(disposed||job.epoch!==epoch)return;
    const received=accept(result);
    received.forEach(id=>ready.add(id));
    const missing=job.ids.filter(id=>!ready.has(id));
    if(missing.length){missing.forEach(id=>failed.add(id));onError(missing);}
   }).catch(()=>{
    if(disposed||job.epoch!==epoch)return;
    job.ids.forEach(id=>failed.add(id));onError(job.ids);
   }).finally(()=>{active.delete(job);pump();});
  }
 }
 return {
  // Replace queued prefetch work with the latest viewport; in-flight reads finish.
  want(ids){queue=[...new Set(ids)];pump();},
  seed(ids){ids.forEach(id=>ready.add(id));},
  reset(ids=[]){epoch++;queue=[];ready=new Set(ids);failed.clear();},
  dispose(){disposed=true;epoch++;queue=[];},
 };
}
