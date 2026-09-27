import React,{useRef,useState} from 'react';

export function InspectPhoto({photo,name,disabled,transitionName,onError,onNavigate}){
 const [zoom,Z]=useState(false),[offset,O]=useState({x:0,y:0});
 const frame=useRef(null),image=useRef(null),start=useRef(null),skip=useRef(false);
 function limits(){return {x:Math.max(0,(image.current.clientWidth*2.5-frame.current.clientWidth)/2),y:Math.max(0,(image.current.clientHeight*2.5-frame.current.clientHeight)/2)};}
 function position(x,y){const l=limits();O({x:Math.max(-l.x,Math.min(l.x,x)),y:Math.max(-l.y,Math.min(l.y,y))});}
 function aim(e){const r=frame.current.getBoundingClientRect(),l=limits();O({x:(.5-(e.clientX-r.left)/r.width)*2*l.x,y:(.5-(e.clientY-r.top)/r.height)*2*l.y});}
 function toggle(e){if(skip.current){skip.current=false;return;}if(!zoom&&e.detail)aim(e);else O({x:0,y:0});Z(!zoom);}
 return <button ref={frame} className={'inspect-photo'+(zoom?' is-zoomed':'')} disabled={disabled} aria-label={zoom?`Zoom out ${name} photo`:`Zoom into ${name} photo`} aria-pressed={zoom} onClick={toggle}
  onKeyDown={e=>{if(e.key==='Escape'&&zoom){e.preventDefault();e.stopPropagation();Z(false);O({x:0,y:0});}else if(zoom&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();position(offset.x+(e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0),offset.y+(e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0));}}}
  onPointerDown={e=>{e.stopPropagation();skip.current=false;start.current={x:e.clientX,y:e.clientY,offset};if(zoom)e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{e.stopPropagation();if(!zoom)return;if(e.pointerType==='mouse')aim(e);else if(start.current)position(start.current.offset.x+e.clientX-start.current.x,start.current.offset.y+e.clientY-start.current.y);}}
  onPointerUp={e=>{e.stopPropagation();if(!start.current)return;const dx=e.clientX-start.current.x,dy=e.clientY-start.current.y;skip.current=Math.abs(dx)+Math.abs(dy)>10;if(!zoom&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)onNavigate(dx<0?1:-1);start.current=null;}}
  onPointerCancel={e=>{e.stopPropagation();start.current=null;skip.current=true;}}>
  <img ref={image} src={photo.src} alt={`${name} — ${photo.label}`} className={photo.kind==='Fit'||photo.src.startsWith('blob:')?'fit-photo':''} style={{viewTransitionName:transitionName||(photo.kind==='Fit'?'none':'wardrobe-garment'),transform:zoom?`translate(${offset.x}px,${offset.y}px) scale(2.5)`:undefined}} draggable="false" onError={onError}/>
 </button>;
}
