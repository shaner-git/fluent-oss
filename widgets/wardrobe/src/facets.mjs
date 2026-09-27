export const facets = {brand:'Brand',subcategory:'Type',size:'Size',colour:'Colour'};
export const emptyFacets = () => ({brand:[],subcategory:[],size:[],colour:[]});
export function valueFor(item,key){
 const value=item[key]?.trim()||'Not recorded';
 return key==='size'||key==='subcategory'?`${item.category} · ${value}`:value;
}
export function matches(item,query,category,selected,except){
 return (category==='All'||item.category===category)&&
 [item.name,item.brand,item.colour,item.category,item.subcategory].join(' ').toLowerCase().includes(query.toLowerCase())&&
 Object.keys(facets).every(key=>key===except||!selected[key].length||selected[key].includes(valueFor(item,key)));
}
export function optionsFor(items,query,category,selected,key){
 const counts=new Map(selected[key].map(value=>[value,0]));
 for(const item of items)if(matches(item,query,category,selected,key)){
  const value=valueFor(item,key);counts.set(value,(counts.get(value)||0)+1);
 }
 return [...counts].map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value,undefined,{numeric:true}));
}

export function displayValue(value,key,category){
 const prefix=category+' · ';
 return (key==='subcategory'||key==='size')&&category!=='All'&&value.startsWith(prefix)?value.slice(prefix.length):value;
}
