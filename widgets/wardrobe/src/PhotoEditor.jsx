import {findPayload} from './model.mjs';
import React,{useState,useEffect,useRef} from 'react';
import {fileDataUrl,verifyPhoto} from './photos.mjs';

export function PhotoEditor({item,host,close,refresh,busyChanged,replacePhotoId}){
 const [role,Role]=useState('alternate'),[file,File]=useState(null),[url,Url]=useState(''),[preview,Preview]=useState(null),[busy,Busy]=useState(false),[error,Error]=useState('');
 const fileInput=useRef();
 const [confirmed,Confirmed]=useState(false);
 useEffect(()=>{if(busy){busyChanged(true);return()=>busyChanged(false);}},[busy]);
 useEffect(()=>{if(!file){Preview(null);return;}const source=URL.createObjectURL(file);Preview(source);return()=>URL.revokeObjectURL(source);},[file]);
 async function save(event){
  event.preventDefault();if(!file&&!url.trim())return;Busy(true);Error('');let proven=false;
  try{
   const input={approval:'explicit_user_approved',photo_action:'add',item_id:item.id,image_type:role,image_origin:'user_source',provenance:{sourceType:'user_confirmation'},response_mode:'read_after_write'};

   if(file)input.image_data_url=await fileDataUrl(file);else{const source=new URL(url.trim());if(source.protocol!=='https:')throw new Error('Use an HTTPS image link.');input.image_url=source.href;}
   const ack=verifyPhoto(await host.call('fluent_set_style_item_image',input),item.id,role,input);proven=true;
   let undoToken;
   if(replacePhotoId){
    const fresh=await refresh();
    const revision=fresh?.photoRevision;
    if(!revision)throw Error('Refresh the item before replacing its old photo.');
    const operationId=crypto.randomUUID();
    const result=await host.call('fluent_update_style_item_patch',{approval:'explicit_user_approved',item_id:item.id,patch:{},photo_library:{expected_revision:revision,operation_id:operationId,action:{type:'replace',photoId:replacePhotoId,replacementId:ack.payload.photoId}},provenance:{sourceType:'user_confirmation'},response_mode:'read_after_write'});
    const proof=findPayload(result,v=>v.kind==='style_item_patch'&&v.target?.id===item.id);
    if(!proof?.payload?.durable||proof.readAfterWrite?.operationId!==operationId)throw Error('Replacement was not confirmed.');
    undoToken=proof.readAfterWrite.undoToken;
   }
   Confirmed(true);await refresh();close(true,undoToken);
  }catch(error){Error(proven?'The new photo was saved. Reopen this item to check whether replacement completed before retrying.':error.message==='Choose a JPG, PNG or WebP under 6 MB.'||error.message==='Use an HTTPS image link.'?error.message:'The photo update could not be confirmed. Check the saved item before retrying.');}
  finally{Busy(false);}
 }
 return <form className="photo-editor" onSubmit={save} aria-label="Add item photo">
  <fieldset disabled={busy||confirmed}><legend>{replacePhotoId?'Replacement photo':'Add photo'}</legend><div className="photo-role-options">{[['alternate','Product or detail'],['fit','On you']].map(([value,label])=><label key={value}><input type="radio" name="photo-role" checked={role===value} onChange={()=>Role(value)}/>{label}</label>)}</div>
  <p className="metadata-note">{replacePhotoId?'The new photo replaces this one. Its original stays retained.':'Your cover stays the same.'}</p>
  {preview&&<img className="upload-preview" src={preview} alt="Selected photo preview"/>}
  <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event=>{File(event.target.files?.[0]||null);Url('');Error('');}}/>
  <button className="photo-file-button" type="button" onClick={()=>fileInput.current?.click()}>{file?file.name:'Choose photo'}</button>
  <details><summary>Use an image link</summary><input type="url" aria-label="Direct photo link" placeholder="https://…" value={url} onChange={event=>{Url(event.target.value);File(null);}}/></details>
  </fieldset>{error&&<p className="error" role="alert">{error}</p>}
  <div className="form-actions"><button type="submit" className="primary" disabled={busy||confirmed||(!file&&!url.trim())}>{confirmed?'Saved':busy?'Saving…':replacePhotoId?'Replace photo':'Add photo'}</button><button type="button" disabled={busy} onClick={()=>close(confirmed)}>{confirmed?'Done':'Cancel'}</button></div>
 </form>;
}
