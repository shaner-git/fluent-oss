import {findPayload} from './model.mjs';

export function verifyPhoto(result,itemId,role,input){
 if(result?.isError)throw new Error('The photo update was rejected.');
 const ack=findPayload(result,value=>value.kind==='style_item_image_set'&&value.readAfterWrite);
 if(ack?.payload?.durable!==true||ack.target?.id!==itemId||ack.target?.type!=='style_item'||ack.payload.imageType!==role)throw new Error('The photo update could not be confirmed.');
 const expected=input.image_data_url?'inline_data_url':'reference_url';
 if(ack.payload.imageInput!==expected)throw new Error('The photo storage could not be confirmed.');
 const read=ack.readAfterWrite,root=read.updatedItem||read,record=root.payload||root;
 if(record.id!==itemId||read.hasImage!==true)throw new Error('The saved photo targeted a different item.');
 if(input.photo_action==='add'&&(ack.payload.photoAction!=='add'||typeof ack.payload.photoId!=='string'))throw new Error('The photo addition could not be confirmed.');
 const photo=record.photos?.find(photo=>photo.id===(input.photo_action==='add'?ack.payload.photoId:`style-photo:${itemId}:${role}`));
 if(!photo||photo.itemId!==itemId||(photo.isFit||photo.kind==='fit')!==(role==='fit'))throw new Error('The saved photo role did not match.');
 if(expected==='reference_url'&&photo.sourceUrl!==input.image_url)throw new Error('The saved photo did not match the selected source.');
 if(expected==='inline_data_url'&&!photo.artifactId)throw new Error('The uploaded photo was not stored.');
 return ack;
}

export function fileDataUrl(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6000000)throw new Error('Choose a JPG, PNG or WebP under 6 MB.');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The photo could not be opened.'));reader.readAsDataURL(file);});
}
