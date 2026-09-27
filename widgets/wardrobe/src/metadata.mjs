export const categories=['Tops','Bottoms','Outerwear','Shoes','Accessories'];
export const cleanValue=value=>String(value??'').trim().replace(/\s+/g,' ');
export const identity=value=>cleanValue(value).toLocaleLowerCase();
export function metadataOptions(items,key,category){
 if(key==='category')return categories;
 const seen=new Map();
 for(const item of items){
  if((key==='size'||key==='subcategory')&&item.category!==category)continue;
  const value=cleanValue(item[key]);
  if(value&&!seen.has(identity(value)))seen.set(identity(value),value);
 }
 return [...seen.values()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
