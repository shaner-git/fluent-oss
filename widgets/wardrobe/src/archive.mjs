import {findPayload,readView} from './model.mjs';

export async function archiveItem(host,id,disposition){
 try{
  const result=await host.call('fluent_archive_item',{approval:'explicit_user_approved',domain:'style',item_id:id,item_type:'style_item',disposition,reason:'No longer owned',provenance:{sourceType:'user_confirmation'}});
  const ack=findPayload(result,value=>value.kind==='item_archive'&&value.readAfterWrite);
  const read=ack?.readAfterWrite,root=read?.updatedItem||read,record=root?.payload||root;
  if(result?.isError||ack?.payload?.durable!==true||ack.target?.id!==id||ack.target?.type!=='style_item'||record?.id!==id||record.status!=='archived'||ack.payload.disposition!==disposition)throw new Error('Archive acknowledgement incomplete');
  return;
 }catch{
  // Never repeat an ambiguous archive. Its disposition is available in the exact Closet projection.
  const result=await host.call('fluent_render_style_closet_surface',{filter:{status:'any',item_ids:[id]},limit:1,presentation:{focused_item_id:id,mode:'detail'}});
  const item=readView(result)?.items.find(item=>item.id===id);
  if(result?.isError||item?.status!=='archived'||item.archiveDisposition!==disposition)throw new Error('The removal could not be confirmed. Check this item before retrying.');
 }
}
