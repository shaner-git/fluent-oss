import React,{useState,useRef,useLayoutEffect} from 'react';
import {alphaBounds,canFrameGarment,fitGarment} from './garment-framing.mjs';
// Reuse outline measurements when the gallery remounts after inspecting an item.
const measurements=new Map();
export const GarmentPhoto=React.memo(function GarmentPhoto({item,name,onFailure,eager=false}){
 const [failed,Failed]=useState(false);
 const cached=measurements.get(item?.imageUrl);
 const [ready,Ready]=useState(false);
 const [corsFallback,CorsFallback]=useState(false),[bounds,Bounds]=useState(cached?.bounds||null),[frame,Frame]=useState({width:0,height:0});
 const container=useRef(),image=useRef();
 const optical=canFrameGarment(item)&&!corsFallback;
 useLayoutEffect(()=>{
  const element=container.current;if(!element)return;
  const resize=()=>Frame({width:element.clientWidth,height:element.clientHeight});
  resize();if(image.current?.complete&&image.current.naturalWidth)loaded({currentTarget:image.current});const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();
 },[!!item?.imageUrl,failed]);
 function loaded(event){
  Ready(true);
  if(!optical)return;
  const img=event.currentTarget;
  const previous=measurements.get(item.imageUrl);
  if(previous){Bounds(previous.bounds);return;}
  try{
   const ratio=Math.min(1,320/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
   const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
   context.drawImage(img,0,0,canvas.width,canvas.height);
   const next=alphaBounds(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
   measurements.set(item.imageUrl,{bounds:next});
   if(measurements.size>300)measurements.delete(measurements.keys().next().value);
   Bounds(next);
  }catch{Bounds(null);}
 }
 if(!item)return <span className="missing-photo photo-pending"><span className="photo-placeholder" aria-hidden="true"/><span>{name}</span><small>Loading photo</small></span>;
 if(!item.imageUrl||failed)return <span className="missing-photo"><span>{name}</span><small>{failed?'Photo unavailable':'No photo'}</small></span>;
 const fitted=fitGarment(bounds,image.current?.naturalWidth,image.current?.naturalHeight,frame.width,frame.height,item);
 return <span className="garment-frame" ref={container} data-ready={ready&&frame.width>0&&frame.height>0} data-framing={fitted?'outline':'original'}><img ref={image} data-photo-id={item.photos?.[0]?.id} data-subject={bounds?JSON.stringify(bounds):undefined} loading={eager?"eager":"lazy"} decoding="async" crossOrigin={optical?'anonymous':undefined} src={item.imageUrl} alt={name} style={fitted||undefined} onLoad={loaded} onError={()=>{if(optical){CorsFallback(true);Bounds(null);return;}Failed(true);onFailure();}}/></span>;
},(previous,next)=>previous.item===next.item&&previous.name===next.name&&previous.eager===next.eager);
