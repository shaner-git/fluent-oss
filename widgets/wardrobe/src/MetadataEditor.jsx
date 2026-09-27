import React,{useState,useRef} from 'react';
import {MagnifyingGlass,Check,Plus,X,CaretDown} from '@phosphor-icons/react';
import {metadataOptions,identity,cleanValue} from './metadata.mjs';
const labels={brand:'Brand',category:'Category',subcategory:'Type',size:'Size',colour:'Colour'};

export function MetadataEditor({items,original,draft,change,save,cancel,saving,error}){
 const [active,A]=useState(null),[query,Q]=useState('');
 const triggers=useRef({});
 const options=active&&active!=='name'?metadataOptions(items,active,draft.category):[];
 const filtered=options.filter(value=>identity(value).includes(identity(query)));
 const exact=options.find(value=>identity(value)===identity(query));
 function close(){const previous=active;A(null);Q('');requestAnimationFrame(()=>triggers.current[previous]?.focus());}
 function pick(value){
  const cleaned=cleanValue(value);
  const next=active==='category'&&cleaned!==draft.category
   ? {...draft,category:cleaned,subcategory:'',size:''}
   : {...draft,[active]:cleaned};
  change(next);close();
 }
 function begin(key){A(key);Q(key==='name'?draft.name:'');}
 return <form className="metadata-editor" onSubmit={e=>{e.preventDefault();if(!active)save(e);}}>
  <label className="editor-name"><span>Name</span><input aria-label="Item name" value={draft.name} required disabled={saving} onChange={e=>change({...draft,name:e.target.value})}/></label>
  <div className="metadata-rows">{Object.entries(labels).map(([key,label])=><div className="metadata-field" key={key}>
   <button type="button" className="metadata-row" ref={el=>triggers.current[key]=el} disabled={saving} aria-expanded={active===key} aria-label={`Change ${label.toLowerCase()}: ${draft[key]||'Not set'}`} onClick={()=>active===key?close():begin(key)}><span>{label}</span><span>{draft[key]||'Add '+label.toLowerCase()}</span><CaretDown size={13}/></button>
   {active===key&&picker()}
  </div>)}</div>
  <div className="form-actions">{error&&<p className="error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={saving||!!active||!cleanValue(draft.name)}>{saving?'Saving…':'Save changes'}</button><button type="button" disabled={saving} onClick={cancel}>Cancel</button></div>
 </form>;
 function picker(){return <section className="metadata-picker" aria-label={active==='name'?'Rename item':`Choose ${labels[active].toLowerCase()}`} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();if(active==='name'&&cleanValue(query))pick(query);}}}>
  <div className="metadata-picker-top"><label className="metadata-search"><MagnifyingGlass size={16}/><input autoFocus aria-label={active==='name'?'Item name':`Search ${labels[active].toLowerCase()}`} placeholder={active==='name'?'Item name':`Find ${labels[active].toLowerCase()}…`} value={query} onChange={e=>Q(e.target.value)} disabled={saving}/></label><button type="button" aria-label="Close value picker" onClick={close}><X size={16}/></button></div>
  {active==='name'?<button type="button" className="metadata-add" disabled={!cleanValue(query)} onClick={()=>pick(query)}>Use name</button>:<>
   {active==='category'&&(draft.subcategory||draft.size)&&<p className="metadata-note">Changing category clears type and size.</p>}
   <div className="metadata-options">{filtered.map(value=><button type="button" key={value} onClick={()=>pick(value)}><span>{value}</span>{identity(draft[active])===identity(value)&&<Check size={14}/>}</button>)}{!filtered.length&&(active==='category'||!cleanValue(query))&&<p className="metadata-note">No saved matches.</p>}</div>
   {active!=='category'&&cleanValue(query)&&!exact&&<button type="button" className="metadata-add" onClick={()=>pick(query)}><Plus size={15}/>Add “{cleanValue(query)}”</button>}
   {active!=='category'&&cleanValue(draft[active])&&<div className="metadata-secondary"><button type="button" aria-label={`Clear ${labels[active].toLowerCase()}`} onClick={()=>pick('')}>Clear</button></div>}
  </>}
 </section>;}
}
