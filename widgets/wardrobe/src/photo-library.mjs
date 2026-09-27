// Pure candidate operations. No files are deleted; originals stay in the library.
export function editLibrary(item, action) {
 const next=structuredClone(item), media=next.media||[];
 const visible=media.filter(p=>!p.hidden&&!media.some(c=>!c.hidden&&c.sourcePhotoId===p.id));
 const photo=media.find(p=>p.id===action.photoId);
 if(action.type!=='reorder'&&!photo)throw new Error('Photo no longer available.');
 if(action.type==='remove'){
  if(visible[0]?.id===photo.id){
   if(action.coverId===undefined)throw new Error('Choose a replacement cover or no cover.');
   const cover=media.find(p=>p.id===action.coverId&&!p.hidden&&p.id!==photo.id);
   if(action.coverId!==null&&(!cover||cover.label==='On you'))throw new Error('Choose a product photo as cover.');
   next.imageUrl=cover?.url||null;next.coverPhotoId=cover?.id||null;
   if(cover)next.media=[cover,...media.filter(p=>p.id!==cover.id)];
  }
  photo.hidden=true;
  if(photo.sourcePhotoId){const original=media.find(p=>p.id===photo.sourcePhotoId);if(original)original.hidden=true;}
 }else if(action.type==='cover'){
  if(photo.hidden||photo.label==='On you')throw new Error('Choose a product photo as cover.');
  next.media=[photo,...media.filter(p=>p.id!==photo.id)];next.imageUrl=photo.url;next.coverPhotoId=photo.id;
 }else if(action.type==='reorder'){
  const ids=visible.map(p=>p.id);
  if(action.ids.length!==ids.length||new Set(action.ids).size!==ids.length||action.ids.some(id=>!ids.includes(id)))throw new Error('Photo order changed. Refresh and try again.');
  // Cover is independent of the order of the other photos.
  if(ids[0]!==action.ids[0])throw new Error('Use Make cover to change the first photo.');
  next.media=[...action.ids.map(id=>media.find(p=>p.id===id)),...media.filter(p=>!ids.includes(p.id))];
 }else throw new Error('Unsupported photo action.');
 next.hasImage=!!next.imageUrl;return next;
}
