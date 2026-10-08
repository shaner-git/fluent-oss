export const sortOptions=[['recent','Recently added'],['name','Name · A–Z'],['brand','Brand · A–Z'],['category','Category']];
export const validSort=value=>sortOptions.some(([key])=>key===value)?value:'recent';
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const compare=(a,b)=>!a?(!b?0:1):!b?-1:collator.compare(a,b);
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
const categories=['Tops','Bottoms','Dresses & jumpsuits','Outerwear','Shoes','Accessories'];
const typeGroup=item=>{
 const type=item.subcategory?.trim()||'';
 // Preserve saved descriptions while grouping explicit shorts types together.
 return item.category==='Bottoms'&&/\bshorts?$/i.test(type)?'Short':type;
};
export function sortItems(items,mode){
 return [...items].sort((a,b)=>{
  let primary=0;
  if(mode==='brand')primary=compare(a.brand,b.brand);
  else if(mode==='category'){const rank=x=>categories.includes(x)?categories.indexOf(x):categories.length;primary=rank(a.category)-rank(b.category)||compare(a.category,b.category)||compare(typeGroup(a),typeGroup(b));}
  else if(mode!=='name')primary=date(b.createdAt)-date(a.createdAt);
  return primary||compare(a.name,b.name)||compare(a.id,b.id);
 });
}
