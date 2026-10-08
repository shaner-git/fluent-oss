export const categories=['Tops','Bottoms','Dresses & jumpsuits','Outerwear','Shoes','Accessories'];
// Newer categories appear as tabs only when the closet has an item in them; the editor always offers every category.
const optionalCategories=new Set(['Dresses & jumpsuits']);
export const visibleCategories=(items=[])=>categories.filter(value=>!optionalCategories.has(value)||items.some(item=>item?.category===value));
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
