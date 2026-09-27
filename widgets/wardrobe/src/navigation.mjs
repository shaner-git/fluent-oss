import {emptyFacets} from './facets.mjs';

export function restoreNavigation(value){
 if(value?.version!==1||!value.scope||typeof value.scope!=='object')return null;
 const chosen=emptyFacets();
 for(const key of Object.keys(chosen))chosen[key]=Array.isArray(value.chosen?.[key])?value.chosen[key].filter(entry=>typeof entry==='string').slice(0,200):[];
 const scope={};
 for(const key of ['status','brand','category','color','query','size','subcategory'])if(typeof value.scope[key]==='string')scope[key]=value.scope[key];
 if(Array.isArray(value.scope.item_ids))scope.item_ids=value.scope.item_ids.filter(id=>typeof id==='string').slice(0,120);
 return {scope,chosen,query:typeof value.query==='string'?value.query:'',category:typeof value.category==='string'?value.category:'All',page:Number.isSafeInteger(value.page)&&value.page>=0?value.page:0,selected:typeof value.selected==='string'?value.selected:null};
}

export function restoreReceipt(value,now=Date.now()){
 if(!value||!Number.isFinite(value.createdAt)||now-value.createdAt>30*60*1000||value.createdAt>now)return null;
 const id=value=>typeof value==='string'&&value.length>0&&value.length<256;
 if(value.kind==='duplicate'){
  if(![value.sourceId,value.targetId,value.mergeId].every(id)||value.sourceId===value.targetId)return null;
  if(![value.sourcePhotos,value.targetPhotos].every(ids=>Array.isArray(ids)&&ids.length<=500&&ids.every(id)))return null;
  const originalScope=restoreNavigation({version:1,scope:value.originalScope})?.scope;
  return {kind:'duplicate',sourceId:value.sourceId,targetId:value.targetId,mergeId:value.mergeId,sourcePhotos:value.sourcePhotos,targetPhotos:value.targetPhotos,name:String(value.name||'item').slice(0,200),createdAt:value.createdAt,originalScope};
 }
 if(!id(value.id)||value.status!=='archived')return null;
 return {id:value.id,status:'archived',name:String(value.name||'item').slice(0,200),createdAt:value.createdAt};
}

export function restorePresentation(value){
 if(!['browse','detail','comparison','recommendation','ingestion_review'].includes(value?.mode))return null;
 return {mode:value.mode,focusedItemId:typeof value.focusedItemId==='string'?value.focusedItemId:null,...(typeof value.recommendationReason==='string'?{recommendationReason:value.recommendationReason.slice(0,2000)}:{})};
}
