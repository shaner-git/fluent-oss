export const columnTarget=(left,pitch,max)=>Math.min(max,Math.max(0,Math.round(left/pitch)*pitch));

// Native wheel/touch motion remains uninterrupted. Only align once it is idle.
export function attachRailSettling(element){
 let timer=0,frame=0,held=false,settling=false;
 const cancel=()=>{clearTimeout(timer);cancelAnimationFrame(frame);settling=false;};
 const schedule=()=>{clearTimeout(timer);if(!held&&!element.classList.contains('scrubbing'))timer=setTimeout(settle,220);};
 function settle(){
  if(held||element.classList.contains('scrubbing'))return;
  const grid=element.firstElementChild,first=grid?.firstElementChild;if(!first)return;
  const pitch=first.getBoundingClientRect().width+(parseFloat(getComputedStyle(grid).columnGap)||0);
  if(!pitch)return;
  const start=element.scrollLeft,target=columnTarget(start,pitch,Math.max(0,element.scrollWidth-element.clientWidth));
  if(Math.abs(target-start)<1)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){element.scrollLeft=target;return;}
  settling=true;const began=performance.now();
  const step=now=>{const t=Math.min(1,(now-began)/160);element.scrollLeft=start+(target-start)*(1-Math.pow(1-t,3));if(t<1)frame=requestAnimationFrame(step);else{frame=0;settling=false;}};
  frame=requestAnimationFrame(step);
 }
 const scroll=()=>{if(!settling)schedule();};
 const wheel=event=>{cancel();const delta=horizontalWheel(event,element.clientWidth);if(delta){const next=Math.max(0,Math.min(element.scrollWidth-element.clientWidth,element.scrollLeft+delta));if(next!==element.scrollLeft){event.preventDefault();element.scrollLeft=next;}}schedule();};
 const down=()=>{held=true;cancel();};
 const up=()=>{held=false;schedule();};
 const key=()=>{cancel();schedule();};
 element.addEventListener('scroll',scroll,{passive:true});
 element.addEventListener('wheel',wheel,{passive:false});
 element.addEventListener('pointerdown',down,{passive:true});
 element.addEventListener('keydown',key);
 window.addEventListener('pointerup',up,{passive:true});
 window.addEventListener('pointercancel',up,{passive:true});
 return()=>{cancel();element.removeEventListener('scroll',scroll);element.removeEventListener('wheel',wheel);element.removeEventListener('pointerdown',down);element.removeEventListener('keydown',key);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
}

export function horizontalWheel(event,width){
 if(event.ctrlKey)return 0;
 const delta=event.shiftKey?(event.deltaX||event.deltaY):(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:0);
 return delta*(event.deltaMode===1?16:event.deltaMode===2?width:1);
}
