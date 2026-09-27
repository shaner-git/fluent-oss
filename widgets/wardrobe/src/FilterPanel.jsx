import React,{useState} from 'react';
import {MagnifyingGlass,Check,X,ArrowLeft} from '@phosphor-icons/react';
import {transition} from './motion';
import {categories} from './metadata.mjs';
import {facets,matches,optionsFor,displayValue} from './facets.mjs';
export function FilterPanel({items,query,category,setCategory,selected,toggle,clear,close,total}){
 const [active,A]=useState('category'),[search,S]=useState('');
 const fields={category:'Category',...facets};
 const options=active==='category'?['All',...categories].map(value=>({value,count:items.filter(item=>matches(item,query,value,selected)).length})):optionsFor(items,query,category,selected,active);
 const checked=value=>active==='category'?category===value:selected[active].includes(value);
 const visible=options.filter(o=>o.value.toLowerCase().includes(search.toLowerCase()));
 return <section className="facet-panel" role="dialog" aria-label="Wardrobe filters" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
  <div className="facet-heading"><h2>Filters</h2><button aria-label="Close filters" onClick={close}><X size={18}/></button></div>
  <div className="facet-body"><div className="facet-types" aria-label="Filter fields">{Object.entries(fields).map(([key,label])=><button key={key} aria-pressed={active===key} onClick={()=>transition(()=>{A(key);S('');})}>{label}<span>{key==='category'?(category==='All'?'':1):selected[key].length||''}</span></button>)}</div>
  <div className="facet-values"><label className="facet-search"><MagnifyingGlass size={17}/><input aria-label={`Search ${fields[active].toLowerCase()} options`} placeholder={`Find ${fields[active].toLowerCase()}…`} value={search} onChange={e=>S(e.target.value)}/>{search&&<button aria-label="Clear option search" onClick={()=>S('')}><X size={14}/></button>}</label>

  <div className="facet-list" style={{height:Math.min(264,Math.max(132,visible.length*44))}} role="group" aria-label={`${fields[active]} options`}>{visible.map(({value,count})=><label key={value} className="facet-option"><input type={active==='category'?'radio':'checkbox'} name={active==='category'?'wardrobe-category':undefined} checked={checked(value)} onChange={()=>active==='category'?setCategory(value):toggle(active,value)}/><span className="facet-check" aria-hidden="true">{checked(value)&&<Check size={13}/>}</span><span>{displayValue(value,active,category)}</span><small>{count}</small></label>)}{!visible.length&&<p className="facet-empty">No matching options.</p>}</div></div></div>
  <div className="facet-footer"><button onClick={clear}>Clear filters</button><button className="primary" onClick={close}><ArrowLeft size={16}/>Show {total} {total===1?'piece':'pieces'}</button></div>
 </section>;
}
