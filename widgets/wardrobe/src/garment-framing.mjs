// Presentation only: never crop source evidence or infer a cutout from its colour.
export function canFrameGarment(item){
 const media=item?.raw?.media||item?.media||[];
 const photo=media[0];
 // Original product cutouts can also contain transparent canvas margins.
 // Measure alpha only; opaque originals retain their full source frame.
 return canFramePhoto(photo)||(photo?.label==='Original'&&photo.contextualRole==='none');
}

export function canFramePhoto(photo){return photo?.backgroundRemoved===true&&photo.kind!=='Fit'&&((photo.label==='Catalog'&&photo.isSourceEvidence!==true)||(photo.label==='Original'&&photo.isSourceEvidence===true));}

// The caller supplies a bounded raster of the already decoded image (max 320px).
// Normalized bounds keep resizing independent of the source image resolution.
export function alphaBounds(pixels,width,height){
 if(width<1||height<1||Math.max(width,height)>320||pixels.length!==width*height*4)return null;
 let left=width,top=height,right=-1,bottom=-1,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(pixels[(y*width+x)*4+3]<=24)continue;
  count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(count<width*height*.01||count>width*height*.98||right<left)return null;
 // Two raster pixels protect antialiasing and soft garment edges.
 left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(width,right+3);bottom=Math.min(height,bottom+3);
 return {left:left/width,top:top/height,width:(right-left)/width,height:(bottom-top)/height};
}

// Gallery-only optical limits. Explicit types preserve long coats, jerseys and
// trousers; unknown types retain the ordinary contain fit. Never distort a photo.
export function galleryHeightLimit(item,width,height){
 const type=String(item?.subcategory||'').trim().toLowerCase();
 const category=item?.category;
 if(category==='Tops'&&/^(sweater|crewneck|henley|polo|polo shirt|shirt|oxford|tee|t-shirt|long sleeve tee|short-sleeve knit)$/.test(type))return Math.min(height*.94,Math.max(width*1.1,height*.8));
 if(category==='Outerwear'&&/^(jacket|blazer|hoodie|overshirt)$/.test(type))return Math.min(height*.94,Math.max(width*1.22,height*.86));
 return height*.94;
}

export function fitGarment(bounds,naturalWidth,naturalHeight,width,height,item){
 if(!bounds||!naturalWidth||!naturalHeight||!width||!height)return null;
 const subjectWidth=bounds.width*naturalWidth,subjectHeight=bounds.height*naturalHeight;
 const footwear=/^(shoes|shoe)$/i.test(String(item?.category||''));
 // A shared sole line keeps boots and low shoes on the same visual shelf.
 // Fit tall shafts above it rather than centering each silhouette independently.
 const scale=Math.min(width*.94/subjectWidth,(footwear?height*.82:galleryHeightLimit(item,width,height))/subjectHeight);
 return {width:naturalWidth*scale,height:naturalHeight*scale,
  left:(width-subjectWidth*scale)/2-bounds.left*naturalWidth*scale,
  top:(footwear?height*.85-subjectHeight*scale:(height-subjectHeight*scale)/2)-bounds.top*naturalHeight*scale};
}
