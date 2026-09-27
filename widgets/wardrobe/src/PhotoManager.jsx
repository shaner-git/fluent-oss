import React,{useState,useEffect} from 'react';
import {PhotoEditor} from './PhotoEditor';
import {Plus,Check,ArrowLeft,ArrowRight,Trash,ArrowsClockwise,ImageBroken} from '@phosphor-icons/react';
import {findPayload} from './model.mjs';

export function PhotoManager({item,host,refresh,busyChanged,close,embedded=false}){
 const [busy,B]=useState(false),[error,E]=useState(''),[undo,U]=useState(item.raw.photoUndoToken||null),[adding,A]=useState(false),[replace,R]=useState(null),[removing,D]=useState(null),[original,O]=useState(false),[selected,S]=useState(null),[failed,F]=useState([]);
 const media=item.raw.media||[], photos=media.filter(p=>!p.hidden&&!media.some(c=>!c.hidden&&c.sourcePhotoId===p.id));
 const coverId=item.raw.coverPhotoId===undefined?(item.imageUrl?photos[0]?.id:null):item.raw.coverPhotoId;
 const firstMovable=coverId?1:0;
 useEffect(()=>{busyChanged(busy);return()=>busyChanged(false);},[busy]);
 async function change(action){B(true);E('');try{
  const operationId=crypto.randomUUID();
  const result=await host.call('fluent_update_style_item_patch',{approval:'explicit_user_approved',item_id:item.id,patch:{},photo_library:{expected_revision:item.raw.photoRevision,operation_id:operationId,action},provenance:{sourceType:'user_confirmation'},response_mode:'read_after_write'});
  const ack=findPayload(result,v=>v.kind==='style_item_patch'&&v.target?.id===item.id);
  const proof=ack?.readAfterWrite;
  if(ack?.payload?.durable!==true||proof?.operationId!==operationId||proof?.revision!==ack.payload.photoLibrary?.revision)throw new Error('The change could not be confirmed. Refresh before retrying.');
  U(proof.undoToken||null);D(null);await refresh();
 }catch(e){E(e.message||'Could not save. Your previous photos are unchanged.');}finally{B(false);}}
 function move(i,to){if(to<firstMovable||to>=photos.length)return;const ids=photos.map(p=>p.id);[ids[i],ids[to]]=[ids[to],ids[i]];void change({type:'reorder',ids});}
 if(adding)return <section className="photo-manager"><h2>{replace?'Replace photo':'Add photo'}</h2><PhotoEditor item={item} host={host} refresh={refresh} busyChanged={busyChanged} replacePhotoId={replace} close={(saved,token)=>{A(false);R(null);if(token)U(token);}}/></section>;
 const photo=photos.find(p=>p.id===selected)||photos[0], index=photos.indexOf(photo);
 const source=photo?.sourcePhotoId?media.find(p=>p.id===photo.sourcePhotoId):null;
 const displayed=original&&source?source:photo;
 const broken=displayed&&(!displayed.url||failed.includes(displayed.id));
 function choose(id){S(id);O(false);D(null);}
 return <section className="photo-workbench" aria-label="Manage photos">
  {!embedded&&<div className="photo-workbench-heading"><div><h2>Photos</h2><p>{item.name}</p></div><button className="photo-done" disabled={busy} onClick={close}>Done <Check size={16}/></button></div>}
  {photo?<>
   <div className="photo-stage-tools"><span className="photo-role">{photo.id===coverId?<><Check size={13}/>Cover</>:photo.label==='On you'?'On you':'Product photo'}</span>{source&&<div className="version-switch" role="group" aria-label="Photo version">{['Display','Original'].map((label,n)=><button key={label} aria-pressed={original===!!n} onClick={()=>O(!!n)}>{label}</button>)}</div>}</div>
   <div className="photo-workbench-stage" aria-live="polite">{broken?<div className="photo-unavailable"><ImageBroken size={32} weight="light"/><h3>This photo couldn’t load</h3><p>Replace it, or remove it from this item.</p></div>:<img key={displayed.id} src={displayed.url} alt={original?'Original item photograph':item.name} onError={()=>F(ids=>[...ids,displayed.id])}/>}</div>
   <div className="photo-workbench-toolbar"><div>{!(photo.id===coverId)&&photo.label!=='On you'&&photo.url&&!failed.includes(photo.id)&&<button disabled={busy} onClick={()=>change({type:'cover',photoId:photo.id})}><Check size={16}/>Make cover</button>}<button disabled={busy} onClick={()=>{R(photo.id);A(true);}}><ArrowsClockwise size={17}/>Replace</button><button className="photo-remove" disabled={busy} onClick={()=>photo.id===coverId?D(photo.id):change({type:'remove',photoId:photo.id})}><Trash size={17}/>Remove</button></div>{index>=firstMovable&&photos.length-firstMovable>1&&<div className="photo-order"><button disabled={busy||index===firstMovable} aria-label="Move selected photo earlier" onClick={()=>move(index,index-1)}><ArrowLeft size={17}/></button><button disabled={busy||index===photos.length-1} aria-label="Move selected photo later" onClick={()=>move(index,index+1)}><ArrowRight size={17}/></button></div>}</div>
  </>:<div className="photo-workbench-stage"><div className="photo-unavailable"><h3>A place for your photos</h3><p>Add a product photo or one of you wearing it.</p></div></div>}
  <div className="photo-filmstrip" aria-label="Item photos">{photos.map((p,i)=><button className="photo-film" key={p.id} disabled={busy} aria-label={'Select photo '+(i+1)+(p.id===coverId?', cover':'')} aria-pressed={photo?.id===p.id} onClick={()=>choose(p.id)} draggable={!busy&&i>=firstMovable} onDragStart={e=>e.dataTransfer.setData('text/plain',p.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=photos.findIndex(p=>p.id===e.dataTransfer.getData('text/plain'));if(from>=firstMovable&&i>=firstMovable)move(from,i);}}>{(!p.url||failed.includes(p.id))?<ImageBroken size={24} weight="light"/>:<img src={p.url} alt="" onError={()=>F(ids=>[...ids,p.id])}/>}</button>)}<button className="photo-add-tile" disabled={busy} onClick={()=>A(true)}><Plus size={23} weight="light"/><span>Add photo</span></button></div>
  {removing&&<section className="cover-choice" aria-label="Choose replacement cover"><h3>Choose the next cover</h3>{photos.filter(p=>p.id!==removing&&p.label!=='On you'&&p.url&&!failed.includes(p.id)).map(p=><button disabled={busy} key={p.id} onClick={()=>change({type:'remove',photoId:removing,coverId:p.id})}>Use photo {photos.indexOf(p)+1}</button>)}<button disabled={busy} onClick={()=>change({type:'remove',photoId:removing,coverId:null})}>Leave without a cover</button><button onClick={()=>D(null)}>Cancel</button></section>}
  {error&&<p role="alert">{error}</p>}{undo&&<div role="status" className="photo-undo"><span><Check size={15}/> Photos updated</span><button disabled={busy} onClick={()=>change({type:'undo',token:undo})}>Undo</button></div>}
  {busy&&<span className="photo-save-status" role="status">Saving…</span>}
 </section>;
}
