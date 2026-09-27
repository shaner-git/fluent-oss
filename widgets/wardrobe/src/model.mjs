const categoryNames={TOP:'Tops',BOTTOM:'Bottoms',OUTERWEAR:'Outerwear',SHOE:'Shoes',ACCESSORY:'Accessories'};
export const displayCategory=value=>categoryNames[value]||value||'Unspecified';
export const storedCategory=value=>Object.keys(categoryNames).find(key=>categoryNames[key]===value)||value;
export function requestFilter(filter={}){
 const result={};
 for(const key of ['brand','category','color','query','size','subcategory'])if(typeof filter[key]==='string'&&filter[key].trim())result[key]=filter[key];
 if(['active','archived','any'].includes(filter.status))result.status=filter.status;
 if(Array.isArray(filter.item_ids))result.item_ids=filter.item_ids.filter(id=>typeof id==='string'&&id.length>0);
 return result;
}
export function initialFilters(filter={},items=[]){
 const category=filter.category?displayCategory(filter.category):'All';
 const chosen={brand:filter.brand?[filter.brand]:[],colour:filter.color?[filter.color]:[],subcategory:[],size:[]};
 for(const key of ['subcategory','size'])if(filter[key])chosen[key]=[...new Set(items.filter(item=>(category==='All'||item.category===category)&&item[key]===filter[key]).map(item=>`${item.category} · ${item[key]}`))];
 return {category,query:filter.query||'',chosen};
}
export function indexItem(item){return {...item,name:item.name||'Untitled item',category:displayCategory(item.category),colour:item.colour??item.colorFamily??'',brand:item.brand||'',size:item.size||'',subcategory:item.subcategory||''};}
export function savedItem(item){
 const photos=(item.media||[]).filter(photo=>!photo.hidden&&!(item.media||[]).some(c=>!c.hidden&&c.id!==photo.id&&c.sourcePhotoId===photo.id)).filter(photo=>typeof photo.url==='string'&&/^(https:\/\/|\/(?!\/))/.test(photo.url)).map(photo=>({id:photo.id,src:photo.url,label:photo.label,kind:photo.label==='On you'?'Fit':'Product',source:photo.source,isSourceEvidence:photo.isSourceEvidence,backgroundRemoved:photo.backgroundRemoved}));
 // The server orders the selected presentation first. Grid thumbnails and detail
 // URLs may differ; comparing those URLs would lose that authoritative ordering.
 return {...indexItem(item),photos,imageUrl:item.imageUrl||null,raw:item};
}
export function findPayload(value,predicate,depth=0){
 if(!value||depth>6)return null;
 if(typeof value==='string'){try{return findPayload(JSON.parse(value),predicate,depth+1);}catch{return null;}}
 if(typeof value!=='object')return null;
 if(predicate(value))return value;
 for(const key of ['structuredContent','result','output','value','params','payload','data','content','text','toolResponseMetadata','toolOutput','call_tool_result','mcp_tool_result','_meta','styleClosetReview','styleCreateOutcome','viewModel']){
  const candidate=value[key];
  for(const entry of Array.isArray(candidate)?candidate:[candidate]){const found=findPayload(entry,predicate,depth+1);if(found)return found;}
 }
 return null;
}
export const readView=value=>findPayload(value,v=>v.surface==='style_closet'&&Array.isArray(v.items));
export const readCreateOutcome=value=>findPayload(value,v=>v.surface==='style_closet_create_outcome'&&v.experience==='style_create_outcome'&&['duplicate_warning','failure','validation_only'].includes(v.status));
export function metadataPatch(original,draft){
 const patch={};
 for(const key of ['name','brand','category','subcategory','size','colour']){
  const before=original[key]||null,after=draft[key]?.trim()||null;
  if(before!==after)patch[key==='colour'?'color':key]=key==='category'?storedCategory(after):after;
 }
 return patch;
}
export function applyMetadataPatch(item,patch){
 const next={...item};
 for(const [key,value] of Object.entries(patch))next[key==='color'?'colour':key]=key==='category'?displayCategory(value):value||'';
 return next;
}
export function verifyPatch(result,itemId,patch){
 if(result?.isError)throw new Error('The update was rejected.');
 const ack=findPayload(result,v=>v.kind==='style_item_patch'&&v.target&&v.readAfterWrite);
 if(!ack||ack.payload?.durable!==true||ack.target.id!==itemId||ack.target.type!=='style_item')throw new Error('The update could not be confirmed.');
 const read=ack.readAfterWrite,root=read.updatedItem||read,payload=root.payload||root;
 const field=key=>Object.hasOwn(read,key)?read[key]:Object.hasOwn(root,key)?root[key]:Object.hasOwn(payload,key)?payload[key]:key==='color'?payload.colorFamily??payload.color_family:undefined;
 if(field('id')!==itemId)throw new Error('The update confirmed a different item.');
 for(const [key,expected] of Object.entries(patch))if((field(key)??null)!==expected)throw new Error('The saved value did not match the edit.');
 return ack;
}
