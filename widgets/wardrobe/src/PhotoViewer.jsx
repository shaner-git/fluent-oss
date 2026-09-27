import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus,Minus,CaretLeft,CaretRight} from '@phosphor-icons/react';

export function PhotoViewer({photos,index,select,name,close}){
 const dialog=useRef(null),stage=useRef(null),img=useRef(null),points=useRef(new Map()),gesture=useRef(null),lastTap=useRef(0);
 const [view,V]=useState({scale:1,x:0,y:0}),[broken,B]=useState(false);
 const state=useRef(view);state.current=view;
 const photo=photos[index];
 function bounded(next){const s=stage.current,im=img.current;if(!s||!im)return next;const mx=Math.max(0,(im.clientWidth*next.scale-s.clientWidth)/2),my=Math.max(0,(im.clientHeight*next.scale-s.clientHeight)/2);return {...next,x:Math.max(-mx,Math.min(mx,next.x)),y:Math.max(-my,Math.min(my,next.y))};}
 function update(next){const v=bounded(next);state.current=v;V(v);}
 function zoom(scale){update({...state.current,scale:Math.max(1,Math.min(4,scale))});}
 useEffect(()=>{const before=document.activeElement;dialog.current.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';const resize=()=>update(state.current);window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);document.body.style.overflow=old;before?.focus({preventScroll:true});};},[]);
 useEffect(()=>{V({scale:1,x:0,y:0});B(false);points.current.clear();gesture.current=null;},[photo.id]);
 function down(e){if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const ps=[...points.current.values()];gesture.current={start:{...state.current},x:e.clientX,y:e.clientY,moved:false,distance:ps.length===2?Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y):0};}
 function move(e){if(!points.current.has(e.pointerId)||!gesture.current)return;points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const ps=[...points.current.values()],g=gesture.current;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)+Math.abs(dy)>5)g.moved=true;if(ps.length===2&&g.distance){const scale=Math.max(1,Math.min(4,g.start.scale*Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y)/g.distance));update({...g.start,scale});}else if(ps.length===1&&g.start.scale>1)update({...g.start,x:g.start.x+dx,y:g.start.y+dy});}
 function up(e){const g=gesture.current;if(!g)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;const multi=points.current.size>1;points.current.delete(e.pointerId);if(!multi&&g.start.scale===1&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)select(Math.max(0,Math.min(photos.length-1,index+(dx<0?1:-1))));else if(!multi&&!g.moved&&e.pointerType==='touch'){const now=Date.now();if(now-lastTap.current<300){zoom(state.current.scale>1?1:2);lastTap.current=0;}else lastTap.current=now;}gesture.current=null;}
 return createPortal(<dialog ref={dialog} className="photo-viewer" aria-label={`${name} photo viewer`} onCancel={e=>{e.preventDefault();close();}} onKeyDown={e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(view.scale+.5);}if(e.key==='-'){e.preventDefault();zoom(view.scale-.5);}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(Math.max(0,Math.min(photos.length-1,index+(e.key==='ArrowRight'?1:-1))));}}}>
  <header className="viewer-toolbar"><span>{name}</span><button autoFocus aria-label="Close photo viewer" onClick={close}><X size={21}/></button></header>
  <div ref={stage} className="zoom-stage" style={{cursor:view.scale>1?'grab':'zoom-in'}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{points.current.clear();gesture.current=null;}} onDoubleClick={()=>zoom(view.scale>1?1:2)}>
   {!broken?<img ref={img} key={photo.id} src={photo.src} alt={`${name} — ${photo.label}`} draggable="false" onError={()=>B(true)} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}/>:<p>Photo couldn’t load.</p>}
  </div>
  <footer className="viewer-controls"><div><button aria-label="Previous enlarged photo" disabled={index===0} onClick={()=>select(index-1)}><CaretLeft size={20}/></button><span role="status">{index+1} / {photos.length}{photo.kind?' · '+photo.kind:''}</span><button aria-label="Next enlarged photo" disabled={index===photos.length-1} onClick={()=>select(index+1)}><CaretRight size={20}/></button></div><div><button aria-label="Zoom out" disabled={view.scale===1||broken} onClick={()=>zoom(view.scale-.5)}><Minus size={19}/></button><button className="zoom-reset" disabled={broken} aria-label="Fit photo" onClick={()=>zoom(1)}>{view.scale===1?'Fit':Math.round(view.scale*100)+'%'}</button><button aria-label="Zoom in" disabled={view.scale===4||broken} onClick={()=>zoom(view.scale+.5)}><Plus size={19}/></button></div></footer>
 </dialog>,document.body);
}
