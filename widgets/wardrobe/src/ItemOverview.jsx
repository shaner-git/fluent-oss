import React,{useState,useId} from 'react';
import {PencilSimple,DotsThree} from '@phosphor-icons/react';

export function ItemOverview({item,edit,busy,actions}){
 const [options,Options]=useState(false);const id=useId();
 const product=item.productReference?.reference;
 const confirmed=product?.status==='confirmed';
 return <div className="facts item-overview">
  <div className="item-overline">{item.brand&&<p className="garment-brand">{item.brand}</p>}<div className="item-heading-actions"><button disabled={busy} onClick={edit}><PencilSimple size={18}/>Edit</button><button disabled={busy} aria-label="Item options" title="Item options" aria-expanded={options} aria-controls={id} onClick={()=>Options(!options)}><DotsThree size={22}/></button></div></div>
  <div className="item-heading"><h2>{item.name}</h2></div>
  {(item.size||item.colour)&&<p className="identity-meta">{[item.size?'Size '+item.size:null,item.colour].filter(Boolean).join(' · ')}</p>}
  {/* Profile commentary remains in item.raw for reasoning; it is not owner testimony. */}
  {confirmed&&<section className="product-information" aria-label="Product information">
   <dl>{[['composition','Material'],['care','Care']].map(([key,label])=>product.facts?.[key]?.value&&<div key={key}><dt>{label}</dt><dd>{product.facts[key].value}</dd></div>)}</dl>
   {/^https:\/\//.test(product.product_url)&&<a href={product.product_url} target="_blank" rel="noopener noreferrer">View product <span aria-hidden="true">↗</span></a>}
  </section>}
  {options&&<div id={id} className="item-management">{actions}</div>}
 </div>;
}
