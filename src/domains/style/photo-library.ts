import { z } from 'zod';
import type { StylePhotoRecord } from './types';
import { isStyleFitPhoto } from './helpers';

export const photoLibraryActionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('remove'),photoId:z.string().min(1),coverId:z.string().min(1).nullable().optional()}),
  z.object({type:z.literal('cover'),photoId:z.string().min(1)}),
  z.object({type:z.literal('reorder'),ids:z.array(z.string().min(1)).max(500)}),
  z.object({type:z.literal('replace'),photoId:z.string().min(1),replacementId:z.string().min(1)}),
  z.object({type:z.literal('undo'),token:z.string().uuid()}),
]);
export type PhotoLibraryAction=z.infer<typeof photoLibraryActionSchema>;
export type PhotoArrangement={hidden:string[];order:string[];hiddenVersions?:Record<string,string>;coverId?:string|null};
export type PhotoLibraryState=PhotoArrangement & {undo?:{token:string;fingerprint:string;before:PhotoArrangement};operationId?:string;actionJson?:string};
export const emptyPhotoLibrary=():PhotoArrangement=>({hidden:[],order:[]});
export function changePhotoArrangement(before:PhotoArrangement,photos:StylePhotoRecord[],action:Exclude<PhotoLibraryAction,{type:'undo'}>,defaultCover:string|null):PhotoArrangement{
 const next=structuredClone(before), visible=photos.filter(p=>!before.hidden.includes(p.id));
 const cover=before.coverId===undefined?defaultCover:before.coverId;
 const find=(id:string)=>{const p=visible.find(p=>p.id===id);if(!p)throw Error('Photo no longer available. Refresh this item.');return p;};
 const product=(id:string)=>{const p=find(id);if(isStyleFitPhoto(p))throw Error('Choose a product photo as cover.');return p;};
 if(action.type==='reorder'){
  const ids=visible.map(p=>p.id);
  if(action.ids.length!==ids.length||new Set(action.ids).size!==ids.length||action.ids.some(id=>!ids.includes(id)))throw Error('Photo order changed. Refresh this item.');
  next.order=action.ids;
 }else if(action.type==='cover'){
  product(action.photoId);next.coverId=action.photoId;
 }else if(action.type==='remove'){
  find(action.photoId);
  if(cover===action.photoId){
   if(action.coverId===undefined)throw Error('Choose a replacement cover or no cover.');
   if(action.coverId!==null){product(action.coverId);if(action.coverId===action.photoId)throw Error('Choose another cover.');}
   next.coverId=action.coverId;
  }
  next.hidden=[...new Set([...next.hidden,action.photoId])];
 }else{
  find(action.photoId);const replacement=find(action.replacementId);
  if(action.photoId===replacement.id)throw Error('Choose a different replacement photo.');
  if(cover===action.photoId){product(replacement.id);next.coverId=replacement.id;}
  next.hidden=[...new Set([...next.hidden,action.photoId])];
  const order=[...before.order,...visible.map(p=>p.id).filter(id=>!before.order.includes(id))];
  next.order=order.filter(id=>id!==replacement.id).map(id=>id===action.photoId?replacement.id:id);
 }
 return next;
}

// Hiding a saved photo must not hide different bytes later written to the same slot.
export function photoVersions(fingerprint:string):Record<string,string>{
 return Object.fromEntries((JSON.parse(fingerprint) as unknown[][]).map(tuple=>[String(tuple[0]),JSON.stringify(tuple)]));
}
export function reconcilePhotoLibrary(state:PhotoLibraryState,fingerprint:string):PhotoLibraryState{
 const versions=photoVersions(fingerprint);
 return {...state,hidden:state.hidden.filter(id=>!state.hiddenVersions?.[id]||state.hiddenVersions[id]===versions[id])};
}
