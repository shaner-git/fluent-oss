import React,{useRef,useState,useLayoutEffect} from 'react';
import {MagnifyingGlassPlus,MagnifyingGlassMinus} from '@phosphor-icons/react';
import {alphaBounds,canFramePhoto} from './garment-framing.mjs';
import {inspectionFrame,inspectionOffset} from './inspection.mjs';

export function InspectionPhoto({photo,name,disabled,onError,onNavigate}){
 const [scale,Scale]=useState(1),[offset,Offset]=useState({x:0,y:0});
 const [tracking,Tracking]=useState(false),[pinching,Pinching]=useState(false);
 const [bounds,Bounds]=useState(null),[natural,Natural]=useState({width:0,height:0}),[size,Size]=useState({width:0,height:0}),[corsFallback,CorsFallback]=useState(false);
 const frame=useRef(null),points=useRef(new Map()),gesture=useRef(null),skip=useRef(false);
 const optical=canFramePhoto(photo)&&!corsFallback;
 const geometry=inspectionFrame(bounds,natural.width,natural.height,size.width,size.height);
 const subjectAspect=natural.height?natural.width*(bounds?.width||1)/(natural.height*(bounds?.height||1)):1;
 const zoomed=scale>1;
 useLayoutEffect(()=>{const element=frame.current;const resize=()=>{Size({width:element.clientWidth,height:element.clientHeight});Offset({x:0,y:0});};resize();const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();},[]);
 function loaded(event){
  const img=event.currentTarget;Natural({width:img.naturalWidth,height:img.naturalHeight});
  if(!optical)return;
  try{const ratio=Math.min(1,320/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;context.drawImage(img,0,0,canvas.width,canvas.height);Bounds(alphaBounds(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height));}catch{Bounds(null);}
 }
 function update(nextScale,x=offset.x,y=offset.y){const next=Math.max(1,Math.min(4,nextScale));Scale(next);Offset(inspectionOffset(geometry,next,x,y));}
 function aim(e,nextScale=scale){const r=frame.current.getBoundingClientRect();Offset(inspectionOffset(geometry,nextScale,(r.width/2-(e.clientX-r.left))*(nextScale-1),(r.height/2-(e.clientY-r.top))*(nextScale-1)));}
 function toggle(e){if(skip.current){skip.current=false;return;}Tracking(false);if(zoomed)update(1,0,0);else{Scale(2.5);if(e.detail)aim(e,2.5);else Offset({x:0,y:0});}}
 function down(e){
  if(e.button!==0)return;e.stopPropagation();skip.current=false;
  points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});e.currentTarget.setPointerCapture(e.pointerId);
  if(points.current.size>1)Pinching(true);
  const ps=[...points.current.values()];gesture.current={scale,offset,x:e.clientX,y:e.clientY,moved:false,multi:ps.length>1,distance:ps.length>1?Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y):0};
 }
 function move(e){
  e.stopPropagation();
  if(points.current.has(e.pointerId))points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const ps=[...points.current.values()],g=gesture.current;
  if(zoomed)Tracking(true);
  if(g&&ps.length>1&&g.distance){g.moved=true;update(g.scale*Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y)/g.distance,g.offset.x,g.offset.y);return;}
  if(g&&ps.length){const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)+Math.abs(dy)>10)g.moved=true;if(zoomed)update(scale,g.offset.x+dx,g.offset.y+dy);}
  else if(zoomed&&e.pointerType==='mouse')aim(e);
 }
 function up(e){
  e.stopPropagation();const g=gesture.current;points.current.delete(e.pointerId);if(!g)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;skip.current=g.moved||g.multi;
  if(!g.multi&&g.scale===1&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)onNavigate(dx<0?1:-1);
  if(points.current.size<2)Pinching(false);
  if(!points.current.size)gesture.current=null;
  else if(g.multi&&points.current.size===1){const remaining=[...points.current.values()][0];gesture.current={scale,offset,x:remaining.x,y:remaining.y,moved:true,multi:true,distance:0};}
 }
 return <button ref={frame} className={'inspect-photo inspection-photo'+(zoomed?' is-zoomed':'')+(tracking?' is-tracking':'')+(pinching?' is-pinching':'')} data-landscape={subjectAspect>1.35} data-framing={bounds?'outline':'original'} data-ready={!!geometry} disabled={disabled} aria-label={zoomed?`Zoom out ${name} photo`:`Zoom into ${name} photo`} aria-pressed={zoomed} onClick={toggle}
  onKeyDown={e=>{Tracking(false);if(e.key==='Escape'&&zoomed){e.preventDefault();e.stopPropagation();update(1,0,0);}else if(zoomed&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();update(scale,offset.x+(e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0),offset.y+(e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0));}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();update(scale+(e.key==='-'?-.5:.5));}}}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{points.current.delete(e.pointerId);gesture.current=null;skip.current=true;Pinching(false);}}>
  <span className="inspection-pan" style={{transform:`translate(${offset.x}px,${offset.y}px)`}}><span className="inspection-plane" style={{transform:`scale(${scale})`}}>
   <img src={photo.src} data-photo-id={photo.id} data-subject={bounds?JSON.stringify(bounds):undefined} alt={`${name} — ${photo.label}`} className={photo.kind==='Fit'||photo.src.startsWith('blob:')?'fit-photo':''} crossOrigin={optical?'anonymous':undefined} style={geometry?.image||undefined} draggable="false" onLoad={loaded} onError={()=>{if(optical){CorsFallback(true);Bounds(null);}else onError();}}/>
  </span></span>
  {!disabled&&<span className="inspection-hint" aria-hidden="true">{zoomed?<MagnifyingGlassMinus size={19}/>:<MagnifyingGlassPlus size={19}/>}</span>}
 </button>;
}
