// Column-major rail: current screen first, two screens in the direction of
// travel, then one behind. The hydrator retains completed reads across windows.
export function prefetchIds(items,column,rows,columns,direction=1){
 const start=Math.max(0,column)*rows,size=rows*columns;
 const visible=items.slice(start,start+size);
 const ahead=direction<0?items.slice(Math.max(0,start-2*size),start).reverse():items.slice(start+size,start+3*size);
 const behind=direction<0?items.slice(start+size,start+2*size):items.slice(Math.max(0,start-size),start).reverse();
 return [...visible,...ahead,...behind].map(item=>item.id);
}
