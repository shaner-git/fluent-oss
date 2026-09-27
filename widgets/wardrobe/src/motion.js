import {flushSync} from 'react-dom';

let running;
let movingImage;
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// Navigation only: typing, filtering values and resize never wait for an animation.
export function transition(update, after, {capture=true}={}){
 movingImage?.();
 const commit=()=>{flushSync(update);after?.();};
 if(!capture||!document.startViewTransition||reducedMotion()){running?.skipTransition();commit();return;}
 running?.skipTransition();
 const next=document.startViewTransition(commit);
 running=next;
 next.finished.catch(()=>{}).finally(()=>{if(running===next)running=null;});
}

// Move only the photograph. Native page snapshots can crash the host when a
// returning gallery measures its outlines and changes the iframe height.
export function imageTransition(update,after,source,destination){
 movingImage?.();running?.skipTransition();
 const commit=()=>{flushSync(update);after?.();};
 if(!source?.complete||!source.naturalWidth||reducedMotion()){commit();return;}
 const original=paintedRect(source),from=photoRect(source),sourceUrl=source.currentSrc||source.src,photoId=source.getAttribute('data-photo-id'),copy=document.createElement('span'),image=source.cloneNode();
 if(!from.width||!from.height){commit();return;}
 image.removeAttribute('id');image.removeAttribute('class');image.removeAttribute('loading');image.alt='';
 copy.setAttribute('aria-hidden','true');copy.setAttribute('data-wardrobe-motion','image');
 Object.assign(copy.style,{position:'fixed',display:'block',overflow:'hidden',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',padding:'0',margin:'0',border:'0',transformOrigin:'0 0',pointerEvents:'none',zIndex:'20',mixBlendMode:getComputedStyle(source).mixBlendMode});
 Object.assign(image.style,{position:'absolute',left:(original.left-from.left)+'px',top:(original.top-from.top)+'px',width:original.width+'px',height:original.height+'px',maxWidth:'none',maxHeight:'none',padding:'0',margin:'0',transform:'none',viewTransitionName:'none',objectFit:'fill'});
 copy.append(image);
 document.body.append(copy);
 let target,visibility,animation,frame,stopped=false;
 const hidden=()=>{if(document.hidden)finish();};
 const finish=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(frame);animation?.cancel();copy.remove();if(target)target.style.visibility=visibility;document.removeEventListener('pointerdown',finish,true);document.removeEventListener('keydown',finish,true);document.removeEventListener('visibilitychange',hidden);if(movingImage===finish)movingImage=null;};
 movingImage=finish;
 document.addEventListener('pointerdown',finish,{capture:true,once:true});document.addEventListener('keydown',finish,{capture:true,once:true});
 document.addEventListener('visibilitychange',hidden);
 try{commit();target=destination();if(!target){finish();return;}visibility=target.style.visibility;target.style.visibility='hidden';}
 catch(error){finish();throw error;}
 // Let cached image load handlers and outline measurements settle. Navigation
// and focus have already committed; the temporary image never receives input.
 let attempts=0,previousRect;
 const move=()=>{
  if(stopped)return;
  if(!target.isConnected){finish();return;}
  if(!target.complete||!target.naturalWidth||target.closest('[data-ready]')?.getAttribute('data-ready')!=='true'){if(attempts++<10){frame=requestAnimationFrame(move);return;}finish();return;}
  // Gallery thumbnails and inspection images may be different signed sizes of
  // the same photo. Use media identity, never mistake a fit photo for the cover.
  if(!(photoId&&target.getAttribute('data-photo-id')===photoId)&&(target.currentSrc||target.src)!==sourceUrl){finish();return;}
  const to=photoRect(target);
  if(!to.width||!to.height){finish();return;}
  // A ready image can still resize as its outline and gallery frame settle.
  if(!sameRect(previousRect,to)&&attempts++<20){previousRect=to;frame=requestAnimationFrame(move);return;}
  animation=copy.animate([{transform:'none'},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`}],{duration:250,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  animation.finished.then(finish,finish);
 };
 frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(move);});
}

export function sameRect(a,b){return !!a&&['left','top','width','height'].every(key=>Math.abs(a[key]-b[key])<.5);}

export function containedRect(rect,naturalWidth,naturalHeight,fit){
 if(fit!=='contain'||!naturalWidth||!naturalHeight)return rect;
 const scale=Math.min(rect.width/naturalWidth,rect.height/naturalHeight);
 const width=naturalWidth*scale,height=naturalHeight*scale;
 return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};
}
function photoRect(image){
 const rect=paintedRect(image);let subject;
 try{subject=JSON.parse(image.getAttribute('data-subject'));}catch{}
 return subjectRect(rect,subject);
}
export function subjectRect(rect,bounds){
 if(!bounds)return rect;
 return {left:rect.left+bounds.left*rect.width,top:rect.top+bounds.top*rect.height,width:bounds.width*rect.width,height:bounds.height*rect.height};
}
function paintedRect(image){
 const r=image.getBoundingClientRect();
 return containedRect({left:r.left,top:r.top,width:r.width,height:r.height},image.naturalWidth,image.naturalHeight,getComputedStyle(image).objectFit);
}

let finishPage;
export function pageTransition(container,update,direction){
 finishPage?.();
 const previous=container?.querySelector('.grid');
 if(!previous||!direction||reducedMotion()){flushSync(update);if(container)container.scrollTop=0;return;}
 const ghost=previous.cloneNode(true);
 ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
 ghost.setAttribute('aria-hidden','true');ghost.inert=true;
 Object.assign(ghost.style,{position:'absolute',top:-container.scrollTop+'px',left:'0',width:previous.getBoundingClientRect().width+'px',margin:'0',pointerEvents:'none',zIndex:'2'});
 flushSync(update);container.scrollTop=0;
 const next=container.querySelector('.grid');container.append(ghost);
 const distance=container.clientWidth+14;
 const height=container.getBoundingClientRect().height,oldHeight=container.style.height,oldOverflow=container.style.overflow;
 container.style.height=height+'px';container.style.overflow='hidden';
 const ease='cubic-bezier(.33,0,.2,1)';
 const departing=ghost.animate([{transform:'translateX(0)'},{transform:'translateX('+(-direction*distance)+'px)'}],{duration:320,easing:ease,fill:'forwards'});
 const arriving=next.animate([{transform:'translateX('+(direction*distance)+'px)'},{transform:'translateX(0)'}],{duration:320,easing:ease});
 const cleanup=()=>{departing.cancel();arriving.cancel();ghost.remove();container.style.height=oldHeight;container.style.overflow=oldOverflow;if(finishPage===cleanup)finishPage=null;};
 finishPage=cleanup;return Promise.allSettled([departing.finished,arriving.finished]).then(cleanup);
}
