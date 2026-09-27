import {findPayload,readView,verifyPatch} from './model.mjs';

function domainItem(result,id){
 if(result?.isError)throw new Error('The saved item could not be read.');
 const envelope=findPayload(result,value=>value.object==='DomainItem'&&value.domain==='style'&&value.type==='style_item'&&value.id===id&&value.payload?.id===id);
 if(!envelope||!Array.isArray(envelope.payload.photos))throw new Error('The saved photos could not be verified.');
 return envelope.payload;
}
const photoIds=item=>item.photos.map(photo=>photo.id).sort();
const sameIds=(actual,expected)=>actual.length===expected.length&&actual.every((id,index)=>id===expected[index]);
async function readPair(host,sourceId,targetId){
 const results=await Promise.all([sourceId,targetId].map(id=>host.call('fluent_get_item',{domain:'style',item_id:id,item_type:'style_item',view:'summary'})));
 return results.map((result,index)=>domainItem(result,index===0?sourceId:targetId));
}
export async function combineItems(host,sourceId,targetId,mergeId){
 if(sourceId===targetId)throw new Error('Choose a different item.');
 const before=await readPair(host,sourceId,targetId);
 if(before.some(item=>item.status!=='active'))throw new Error('Both items must still be active.');
 const sourcePhotos=photoIds(before[0]),targetPhotos=photoIds(before[1]),expected=[...new Set([...sourcePhotos,...targetPhotos])].sort();
 try{
  const result=await host.call('fluent_archive_item',{
   approval:'explicit_user_approved',domain:'style',item_type:'style_item',item_id:sourceId,
   disposition:'duplicate',merge_into_item_id:targetId,merge_operation_id:mergeId,
   reason:'User confirmed these records describe the same physical garment.',response_mode:'full',
   source_skill:'fluent-style-closet-widget',source_type:'user_confirmation',
   source_snapshot:{notes:'fluent-style-closet-widget:merge_into_item_id='+targetId,title:'Confirmed duplicate closet item merge'},
  });
  if(result?.isError)throw new Error('Combine was rejected.');
 }catch{/* An ambiguous acknowledgement never causes a second mutation. Verify the exact pair/cycle. */}
 const [after,projection]=await Promise.all([
  readPair(host,sourceId,targetId),
  host.call('fluent_render_style_closet_surface',{filter:{status:'any',item_ids:[sourceId]},limit:1,presentation:{mode:'detail',focused_item_id:sourceId}}),
 ]);
 const source=readView(projection)?.items.find(item=>item.id===sourceId);
 if(projection?.isError||after[0].status!=='archived'||after[1].status!=='active'||photoIds(after[0]).length!==0||!sameIds(photoIds(after[1]),expected)||source?.duplicateMergeId!==mergeId)throw new Error('The combine could not be confirmed. Reopen both items before retrying.');
 return {kind:'duplicate',sourceId,targetId,mergeId,sourcePhotos,targetPhotos,name:before[1].name||'item'};
}

export async function undoCombine(host,receipt){
 const result=await host.call('fluent_update_style_item_patch',{
  approval:'explicit_user_approved',item_id:receipt.sourceId,expected_duplicate_merge_id:receipt.mergeId,
  patch:{status:'active'},provenance:{sourceType:'user_confirmation'},response_mode:'read_after_write',
 });
 verifyPatch(result,receipt.sourceId,{status:'active'});
 const after=await readPair(host,receipt.sourceId,receipt.targetId);
 if(after.some(item=>item.status!=='active')||!sameIds(photoIds(after[0]),receipt.sourcePhotos)||!sameIds(photoIds(after[1]),receipt.targetPhotos))throw new Error('The original photo collections could not be confirmed.');
}
