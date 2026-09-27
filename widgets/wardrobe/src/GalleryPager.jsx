import React,{useState,useRef,useEffect,useId} from 'react';
import {CaretLeft,CaretRight,CaretUp,X} from '@phosphor-icons/react';

export function GalleryPager({page,pages,change}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),id=useId();
 function close(){setOpen(false);trigger.current?.focus({preventScroll:true});}
 useEffect(()=>{
  if(!open)return;
  root.current?.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
  const dismiss=event=>{if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();close();}else if(event.type==='pointerdown'&&!root.current?.contains(event.target))setOpen(false);};
  document.addEventListener('keydown',dismiss);document.addEventListener('pointerdown',dismiss);
  return()=>{document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',dismiss);};
 },[open]);
 function choose(value){change(value);close();}
 function move(event){
  const buttons=[...root.current.querySelectorAll('.page-grid button')],index=buttons.indexOf(event.target);
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-5,ArrowDown:5}[event.key];
  if(index<0)return;
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:delta===undefined?null:Math.max(0,Math.min(buttons.length-1,index+delta));
  if(next!==null){event.preventDefault();buttons[next].focus();}
 }
 return <nav ref={root} className="gallery-pager" aria-label="Wardrobe pages" onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button aria-label="Previous page" disabled={page===0} onClick={()=>change(page-1)}><CaretLeft size={18}/></button>
  <button ref={trigger} className="page-trigger" aria-label={'Choose page, page '+(page+1)+' of '+pages} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><strong>{page+1}</strong><span>/ {pages}</span><CaretUp size={12}/></button>
  <button aria-label="Next page" disabled={page===pages-1} onClick={()=>change(page+1)}><CaretRight size={18}/></button>
  {open&&<section className="page-panel" id={id} aria-label="Choose page"><div className="page-panel-heading"><span>Go to page</span><button aria-label="Close page chooser" onClick={close}><X size={16}/></button></div><div className="page-grid" onKeyDown={move}>{Array.from({length:pages},(_,value)=><button key={value} aria-label={'Page '+(value+1)} aria-current={page===value?'page':undefined} onClick={()=>choose(value)}>{value+1}</button>)}</div></section>}
 </nav>;
}
