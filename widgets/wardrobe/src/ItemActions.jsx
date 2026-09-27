import React,{useState,useEffect} from 'react';
import {archiveItem} from './archive.mjs';
import {saveMetadata} from './save.mjs';

const dispositions={returned:'Returned',sold:'Sold',donated:'Donated',gifted:'Gifted',worn_out:'Worn out',never_purchased:'Never purchased',other:'Other'};
export function ItemActions({item,host,onStatusChanged,busyChanged,findDuplicate}){
 const [removing,Removing]=useState(false),[disposition,Disposition]=useState(''),[busy,Busy]=useState(false),[error,Error]=useState('');
 useEffect(()=>{if(busy){busyChanged(true);return()=>busyChanged(false);}},[busy]);
 async function submit(event){
  event?.preventDefault();Busy(true);Error('');
  const status=item.status==='archived'?'active':'archived';
  try{
   if(status==='active')await saveMetadata(host,item.id,{status},item.raw?.duplicateMergeId);else await archiveItem(host,item.id,disposition);
   onStatusChanged(status);
  }catch(error){Error(error.message||'The update could not be confirmed.');}
  finally{Busy(false);}
 }
 return <div className="item-actions">
  {item.status==='active'&&!removing&&<button onClick={findDuplicate}>Review duplicate</button>}
  {item.status==='archived'?<button disabled={busy} onClick={submit}>{busy?'Restoring…':'Restore to wardrobe'}</button>:!removing?<button onClick={()=>Removing(true)}>Remove from wardrobe</button>:<form onSubmit={submit}>
   <fieldset disabled={busy}><legend>What happened?</legend><div className="archive-choices">{Object.entries(dispositions).map(([value,label])=><label key={value}><input type="radio" name="archive-reason" checked={disposition===value} onChange={()=>Disposition(value)}/>{label}</label>)}</div></fieldset>
   <p className="metadata-note">You can restore it from Archived.</p><div className="form-actions"><button type="submit" className="primary" disabled={busy||!disposition}>{busy?'Removing…':'Remove'}</button><button type="button" disabled={busy} onClick={()=>Removing(false)}>Cancel</button></div>
  </form>}{error&&<p role="alert" className="error">{error}</p>}
 </div>;
}
