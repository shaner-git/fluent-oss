import React,{useState,useId} from 'react';
import {Plus} from '@phosphor-icons/react';
import {noteSections,detailSections} from './notes.mjs';

function NoteSection({section}){
 const [more,More]=useState(false),[open,Open]=useState(false);const id=useId();
 const {title,summary,entries}=section;
 if(section.inline)return <p className="garment-note">{section.inline.key.startsWith('silhouette-')?<>{section.inline.text} silhouette</>:<>{section.inline.label&&<span>{section.inline.label}: </span>}{section.inline.text}</>}</p>;
 if(!entries.length)return <div className="note-summary"><span>{title}</span><span>{summary}</span></div>;
 return <section className="note-disclosure" data-open={open}><h3><button aria-expanded={open} aria-controls={id} onClick={()=>Open(!open)}><span>{title}</span>{summary&&<span className="note-verdict">{summary}</span>}<Plus size={17} weight="light"/></button></h3><div className="note-reveal" id={id} inert={!open} aria-hidden={!open}><div><div className="note-content">
  {[...entries,...(more?section.more:[])].map(({key,label,text})=><div className="note-entry" key={key}>{label&&<span className="note-label">{label}</span>}<p>{text}</p></div>)}
  {section.more.length>0&&<button type="button" className="note-more" aria-expanded={more} onClick={()=>More(!more)}>{more?'Less':'More fit notes'}</button>}
 </div></div></div></section>;
}
export function ItemNotes({detail,primarySize,curated=false}){
 const sections=(curated?detailSections:noteSections)(detail,primarySize);
 return sections.length?<div className="item-notes">{sections.map(section=><NoteSection key={section.title} section={section}/>)}</div>:null;
}
