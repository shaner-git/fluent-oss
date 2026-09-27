import {fitGarment} from './garment-framing.mjs';

// Zoom is centered on the visible subject, or the entire original photograph.
export function inspectionFrame(bounds,naturalWidth,naturalHeight,width,height){
 const subject=bounds||{left:0,top:0,width:1,height:1};
 const image=fitGarment(subject,naturalWidth,naturalHeight,width,height);
 return image?{image,subjectWidth:image.width*subject.width,subjectHeight:image.height*subject.height,width,height}:null;
}

export function inspectionOffset(frame,scale,x,y){
 if(!frame)return {x:0,y:0};
 const mx=Math.max(0,(frame.subjectWidth*scale-frame.width)/2);
 const my=Math.max(0,(frame.subjectHeight*scale-frame.height)/2);
 return {x:mx?Math.max(-mx,Math.min(mx,x)):0,y:my?Math.max(-my,Math.min(my,y)):0};
}
