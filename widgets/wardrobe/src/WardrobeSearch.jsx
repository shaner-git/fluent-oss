import React,{useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {MagnifyingGlass,X} from '@phosphor-icons/react';
export function WardrobeSearch({value,change}){
 const [opened,Open]=useState(false),input=useRef(null),trigger=useRef(null);
 const active=opened||!!value;
 function expand(){flushSync(()=>Open(true));input.current?.focus({preventScroll:true});}
 function collapse(){if(value)return;Open(false);trigger.current?.focus({preventScroll:true});}
 return <div className={'search-disclosure'+(active?' is-open':'')} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget)&&!value)Open(false);}}>
  <button ref={trigger} className="search-launch" aria-label="Open search" aria-expanded={active} onClick={expand}><MagnifyingGlass size={20}/><span>Search</span></button>
  <div className="search" role="search" aria-hidden={!active} inert={!active}><MagnifyingGlass size={20}/><input ref={input} aria-label="Search your wardrobe" placeholder="Search your wardrobe…" value={value} onChange={event=>change(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&!value){event.preventDefault();collapse();}}}/><button aria-label={value?'Clear search':'Close search'} onClick={()=>{if(value){change('');input.current?.focus({preventScroll:true});}else collapse();}}><X size={16}/></button></div>
 </div>;
}
