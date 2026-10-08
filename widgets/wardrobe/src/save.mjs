import {findPayload,verifyPatch} from './model.mjs';

function confirmItem(result,id,patch){
 if(result?.isError)throw new Error('The saved item could not be read.');
 const item=findPayload(result,value=>value.object==='DomainItem'&&value.domain==='style'&&value.type==='style_item'&&value.id===id&&value.payload?.id===id);
 if(!item)throw new Error('The saved item could not be identified.');
 const record=item.payload||item;
 for(const [key,expected] of Object.entries(patch)){
  const actual=Object.hasOwn(record,key)?record[key]:key==='color'?record.colorFamily??record.color_family:undefined;
  if((actual??null)!==expected)throw new Error('The saved item does not confirm this edit.');
 }
 return item;
}

export async function saveMetadata(host,id,patch,expectedDuplicateMergeId){
 try{
  // One tool per operation: undoing a merge is bound to the exact merge cycle, restoring an archived
  // item is its own tool, and the details tool only edits fields.
  const restoring=Object.keys(patch).length===1&&patch.status==='active';
  const common={approval:'explicit_user_approved',item_id:id,provenance:{sourceType:'user_confirmation'},response_mode:'read_after_write'};
  const result=expectedDuplicateMergeId
   ?await host.call('fluent_undo_closet_item_merge',{...common,merge_id:expectedDuplicateMergeId})
   :restoring
    ?await host.call('fluent_restore_closet_item',common)
    :await host.call('fluent_update_closet_item',{...common,patch});
  return verifyPatch(result,id,patch);
 }catch{
  // Active status alone cannot prove that the intended duplicate cycle was undone.
  if(expectedDuplicateMergeId)throw new Error('The duplicate restore could not be confirmed. Reopen the item to check its saved state.');
  // A transport failure can occur after persistence. Read once; never replay the write.
  const result=await host.call('fluent_get_closet_item',{
   domain:'style',item_id:id,item_type:'style_item',view:'summary',
  });
  return confirmItem(result,id,patch);
 }
}
