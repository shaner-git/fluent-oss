import {findPayload} from './model.mjs';

// One tool per photo change. Maps a manager action onto its tool and arguments.
export function photoChangeCall(action){
 if(action.type==='cover')return ['fluent_set_closet_item_cover',{photo_id:action.photoId}];
 if(action.type==='reorder')return ['fluent_reorder_closet_item_photos',{photo_ids:action.ids}];
 if(action.type==='remove')return ['fluent_hide_closet_item_photo',{photo_id:action.photoId,...(action.coverId!==undefined?{next_cover_photo_id:action.coverId}:{})}];
 if(action.type==='replace')return ['fluent_replace_closet_item_photo',{photo_id:action.photoId,replacement_photo_id:action.replacementId}];
 if(action.type==='undo')return ['fluent_undo_closet_item_photo_change',{undo_token:action.token}];
 throw new Error('Unknown photo change.');
}

export function verifyPhoto(result,itemId,role,input,added=false){
 if(result?.isError)throw new Error('The photo update was rejected.');
 const ack=findPayload(result,value=>value.kind==='style_item_image_set'&&value.readAfterWrite);
 if(ack?.payload?.durable!==true||ack.target?.id!==itemId||ack.target?.type!=='style_item'||ack.payload.imageType!==role)throw new Error('The photo update could not be confirmed.');
 const expected=input.image_data_url?'inline_data_url':'reference_url';
 if(ack.payload.imageInput!==expected)throw new Error('The photo storage could not be confirmed.');
 const read=ack.readAfterWrite,root=read.updatedItem||read,record=root.payload||root;
 if(record.id!==itemId||read.hasImage!==true)throw new Error('The saved photo targeted a different item.');
 if(added&&(ack.payload.photoAction!=='add'||typeof ack.payload.photoId!=='string'))throw new Error('The photo addition could not be confirmed.');
 const photo=record.photos?.find(photo=>photo.id===(added?ack.payload.photoId:`style-photo:${itemId}:${role}`));
 if(!photo||photo.itemId!==itemId||(photo.isFit||photo.kind==='fit')!==(role==='fit'))throw new Error('The saved photo role did not match.');
 if(expected==='reference_url'&&photo.sourceUrl!==input.image_url)throw new Error('The saved photo did not match the selected source.');
 if(expected==='inline_data_url'&&!photo.artifactId)throw new Error('The uploaded photo was not stored.');
 return ack;
}

export function fileDataUrl(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6000000)throw new Error('Choose a JPG, PNG or WebP under 6 MB.');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The photo could not be opened.'));reader.readAsDataURL(file);});
}
