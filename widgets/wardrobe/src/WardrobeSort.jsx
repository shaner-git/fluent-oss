import React,{useState,useRef,useEffect,useId} from 'react';
import {SortAscending,Check} from '@phosphor-icons/react';
import {sortOptions} from './sort.mjs';
export function WardrobeSort({value,change}){
 const [open,Open]=useState(false),root=useRef(),trigger=useRef(),id=useId();
 const label=sortOptions.find(([key])=>key===value)?.[1];
 const close=()=>{Open(false);trigger.current?.focus();};
 useEffect(()=>{
  if(!open)return;
  root.current?.querySelector('[aria-checked="true"]')?.focus();
  const outside=e=>{if(!root.current?.contains(e.target))Open(false);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 function keys(e){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  const options=[...root.current.querySelectorAll('[role="menuitemradio"]')],current=options.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();options[e.key==='Home'?0:e.key==='End'?options.length-1:(current+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}
 }
 return <div className="wardrobe-sort" ref={root} onKeyDown={keys} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))Open(false);}}>
  <button ref={trigger} className="sort-trigger" aria-label={'Sort: '+label} title={'Sort: '+label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>Open(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();Open(true);}}}><SortAscending size={19}/><span>Sort</span></button>
  {open&&<div id={id} className="sort-menu" role="menu" aria-label="Sort wardrobe">{sortOptions.map(([key,label])=><button key={key} role="menuitemradio" aria-checked={value===key} tabIndex={value===key?0:-1} onClick={()=>{change(key);close();}}><span>{label}</span>{value===key&&<Check size={16}/>}</button>)}</div>}
 </div>;
}
