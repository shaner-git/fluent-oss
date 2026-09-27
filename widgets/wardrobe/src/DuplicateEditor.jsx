import React,{useState,useEffect} from 'react';
import {findPayload,readView,savedItem} from './model.mjs';
import {combineItems} from './duplicates.mjs';

export function DuplicateEditor({item,host,close,complete,busyChanged}){
 const [options,Options]=useState([]),[query,Q]=useState(''),[target,Target]=useState(null),[busy,Busy]=useState(false),[error,Error]=useState('');
 useEffect(()=>{if(busy){busyChanged(true);return()=>busyChanged(false);}},[busy]);
 useEffect(()=>{let active=true;Busy(true);host.call('fluent_render_style_closet_surface',{filter:{status:'active'},limit:1}).then(result=>{const index=findPayload(result,value=>Array.isArray(value._meta?.wardrobeIndex))?._meta.wardrobeIndex;if(!index)throw new Error('Could not load matches.');if(active)Options(index.filter(entry=>entry.id!==item.id));}).catch(()=>{if(active)Error('The wardrobe could not load. Close and try again.');}).finally(()=>{if(active)Busy(false);});return()=>{active=false;};},[item.id]);
 async function choose(id){Busy(true);Error('');try{const result=await host.call('fluent_render_style_closet_surface',{filter:{status:'active',item_ids:[id]},limit:1,presentation:{mode:'detail',focused_item_id:id}});const candidate=readView(result)?.items.find(entry=>entry.id===id);if(!candidate)throw new Error();Target(savedItem(candidate));}catch{Error('That item could not load. Choose another or try again.');}finally{Busy(false);}}
 async function combine(){Busy(true);Error('');try{complete(await combineItems(host,item.id,target.id,crypto.randomUUID()));}catch(error){Error(error.message);}finally{Busy(false);}}
 const matches=options.filter(entry=>[entry.name,entry.brand,entry.size,entry.subcategory].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <section className="duplicate-editor" aria-label="Combine duplicate items"><h3>{target?'Are these the same piece?':'Find the matching item'}</h3>
  {!target?<><input autoFocus aria-label="Search matching items" placeholder="Name or brand…" disabled={busy} value={query} onChange={event=>Q(event.target.value)}/><div className="duplicate-options">{matches.slice(0,20).map(entry=><button disabled={busy} key={entry.id} onClick={()=>choose(entry.id)}><span>{entry.name}</span><small>{[entry.brand,entry.size].filter(Boolean).join(' · ')}</small></button>)}</div>{matches.length>20&&<p className="metadata-note">Search to narrow {matches.length} items.</p>}</>:<><div className="duplicate-preview">{[item,target].map((entry,n)=><div key={entry.id}>{entry.imageUrl&&<img src={entry.imageUrl} alt={entry.name}/>}<strong>{entry.name}</strong><small>{entry.brand}</small><span>{n?'Keep this record':'Combine into the other record'}</span></div>)}</div><p className="metadata-note">Photos and missing details move into {target.name}. You can undo this.</p></>}
  {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions">{target&&<><button className="primary" disabled={busy} onClick={combine}>{busy?'Combining…':'Combine'}</button><button disabled={busy} onClick={()=>Target(null)}>Choose another</button></>}<button disabled={busy} onClick={close}>{target?'Keep both':'Cancel'}</button></div>
 </section>;
}
