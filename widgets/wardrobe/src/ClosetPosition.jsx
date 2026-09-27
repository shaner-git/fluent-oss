import React,{useState,useLayoutEffect,useRef} from 'react';
import {attachRailSettling} from './rail-scroll.mjs';

export function ClosetPosition({track,initialPage=0}){
 const [visible,Visible]=useState(1);
 const input=useRef(null);
 useLayoutEffect(()=>{
  const element=track.current;if(!element)return;
  element.scrollLeft=initialPage*(element.clientWidth+14);
  const detachSettling=attachRailSettling(element);
  let animation=0;
  const read=()=>{animation=0;const extent=element.scrollWidth-element.clientWidth;const value=extent>0?element.scrollLeft/extent*1000:0;if(input.current){input.current.value=String(Math.round(value));input.current.setAttribute('aria-valuetext',value<1?'Beginning of wardrobe':value>999?'End of wardrobe':'Within wardrobe');}};
  const onScroll=()=>{if(!animation)animation=requestAnimationFrame(read);};
  const resize=()=>{Visible(element.clientWidth/Math.max(1,element.scrollWidth));onScroll();};
  resize();element.addEventListener('scroll',onScroll,{passive:true});const observer=new ResizeObserver(resize);observer.observe(element);if(element.firstElementChild)observer.observe(element.firstElementChild);
  return()=>{detachSettling();element.removeEventListener('scroll',onScroll);observer.disconnect();cancelAnimationFrame(animation);};
 },[]);
 const settle=()=>{
  const element=track.current;if(!element)return;
  element.classList.remove('scrubbing');
  const grid=element.firstElementChild,first=grid?.firstElementChild;
  if(!first)return;
  const pitch=first.getBoundingClientRect().width+(parseFloat(getComputedStyle(grid).columnGap)||0);
  const left=Math.min(element.scrollWidth-element.clientWidth,Math.max(0,Math.round(element.scrollLeft/pitch)*pitch));
  element.scrollTo({left,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };
 if(visible>=.999)return null;
 return <div className="closet-position"><input ref={input} onPointerDown={event=>{track.current?.classList.add('scrubbing');event.currentTarget.setPointerCapture(event.pointerId);}} onLostPointerCapture={settle} onKeyUp={settle} type="range" min="0" max="1000" step="1" defaultValue="0" aria-label="Position in wardrobe" aria-valuetext="Beginning of wardrobe" style={{'--thumb-fraction':visible}} onChange={event=>{const element=track.current;if(element)element.scrollLeft=Number(event.target.value)/1000*(element.scrollWidth-element.clientWidth);}}/></div>;
}
