import React,{useState,useRef,useEffect,useLayoutEffect,useMemo} from 'react';
import {MagnifyingGlass,SlidersHorizontal,ArrowLeft,PencilSimple,X,CaretLeft,CaretRight,Check,DotsThree,ImageBroken} from '@phosphor-icons/react';
import {MetadataEditor} from './MetadataEditor';
import {FilterPanel} from './FilterPanel';
import {InspectionPhoto} from './InspectionPhoto';
import {ItemOverview} from './ItemOverview';
import {visibleCategories} from './metadata.mjs';
import {emptyFacets,matches,facets,displayValue} from './facets.mjs';
import {indexItem,savedItem,readView,findPayload,metadataPatch,initialFilters,applyMetadataPatch,requestFilter} from './model.mjs';
import {saveMetadata} from './save.mjs';
import {PhotoEditor} from './PhotoEditor';
import {PhotoManager} from './PhotoManager';
import {transition,imageTransition} from './motion';
import {restoreNavigation,restoreReceipt,restorePresentation} from './navigation.mjs';
import {ItemActions} from './ItemActions';
import {GarmentPhoto} from './GarmentPhoto';
import {DuplicateEditor} from './DuplicateEditor';
import {undoCombine} from './duplicates.mjs';
import {ItemNotes} from './ItemNotes';
import {CreateOutcome} from './CreateOutcome';
import {PhotoViewer} from './PhotoViewer';
import {WardrobeSort} from './WardrobeSort';
import {sortItems,validSort} from './sort.mjs';
import {WardrobeSearch} from './WardrobeSearch';
import {ClosetPosition} from './ClosetPosition';
import {galleryCapacity} from './layout.mjs';
import {hostLayout} from './layout.mjs';
import {prefetchIds} from './prefetch.mjs';
import {createHydrator} from './hydration.mjs';

export function App({host}){
 const [outcome,Outcome]=useState(null),[presentation,Presentation]=useState(()=>restorePresentation(host.readState?.()?.presentation)||{mode:'browse'}),[reviewed,Reviewed]=useState(()=>{const saved=host.readState?.()?.reviewed;return Array.isArray(saved)?saved.filter(id=>typeof id==='string').slice(0,120):[];});
 const [sort,Sort]=useState(()=>validSort(host.readState?.()?.sort));
 const [photoEdit,PhotoEdit]=useState(false);
 const [receipt,Receipt]=useState(()=>restoreReceipt(host.readState?.()?.receipt));
 const [duplicate,Duplicate]=useState(false);
 const editOriginal=useRef(null);
 const restored=useRef(restoreNavigation(host.readState?.())),restoring=useRef(null);
 const [index,Index]=useState(null),[cache,Cache]=useState({}),[query,Q]=useState(''),[category,C]=useState('All'),[chosen,Choose]=useState(emptyFacets),[filters,F]=useState(false),[selected,S]=useState(null),[draft,D]=useState(null),[page,P]=useState(0),[context,Context]=useState({}),[width,W]=useState(740),[error,E]=useState(''),[busy,B]=useState(false),[loading,Loading]=useState(false),[saved,Saved]=useState(false),[refresh,R]=useState(0);
 const root=useRef(),collection=useRef(),horizontalPosition=useRef(0),position=useRef(0),origin=useRef(),loaded=useRef(false),currentIndex=useRef(null),mounted=useRef(true),initialFilter=useRef({status:'active'});
 const hydration=useRef(null);
 const [scrollWindow,ScrollWindow]=useState({column:0,direction:1});
 const lastColumn=useRef(0);
 const expanded=context.displayMode==='fullscreen';
 useLayoutEffect(()=>{document.documentElement.dataset.theme=context.theme==='dark'?'dark':'light';},[context.theme]);
 const [chrome,Chrome]=useState(240);
 const {budget,safe}=hostLayout(context,chrome);
 const capacity=galleryCapacity(width);
 const {columns,rows}=capacity,size=columns*rows;
 const results=useMemo(()=>sortItems((index||[]).filter(item=>matches(item,query,category,chosen)),sort),[index,query,category,chosen,sort]);
 useLayoutEffect(()=>{P(0);horizontalPosition.current=0;if(collection.current){collection.current.scrollLeft=0;collection.current.scrollTop=0;}},[sort]);
 const currentPage=Math.min(page,Math.max(0,Math.ceil(results.length/size)-1));
 const previousCapacity=useRef({size,expanded});
 useEffect(()=>{
  const previous=previousCapacity.current;
  if(previous.size!==size&&previous.expanded===expanded&&!selected)P(Math.floor(page*previous.size/size));
  previousCapacity.current={size,expanded};
 },[size,expanded]);
 const pageItems=results.slice(currentPage*size,(currentPage+1)*size),item=selected?cache[selected]:null;
 // Fetch and eagerly load two screens ahead, one behind; reverse priority with travel.
 const ids=selected?[selected]:prefetchIds(results,scrollWindow.column,rows,columns,scrollWindow.direction),key=JSON.stringify(ids);
 const eagerIds=new Set(ids);
 const count=Object.values(chosen).reduce((sum,values)=>sum+values.length,0)+(category==='All'?0:1);
 function adoptIndex(items){
  currentIndex.current=items;Index(items);
  const state=restored.current||initialFilters(initialFilter.current,items);
  restoring.current=JSON.stringify([state.query,state.category,state.chosen]);
  Q(state.query);C(state.category);Choose(state.chosen);
  if(restored.current){P(state.page);S(items.some(item=>item.id===state.selected)?state.selected:null);restored.current=null;}
 }
 function ingest(result,initial=false){
  const view=readView(result);if(!view)throw new Error('The wardrobe could not be loaded.');
  if(initial)hydration.current?.reset();
  hydration.current?.seed(view.items.map(item=>item.id));
  Cache(previous=>({...(!initial?previous:{}),...Object.fromEntries(view.items.map(item=>[item.id,savedItem(item)]))}));
  const meta=findPayload(result,v=>v._meta?.wardrobeIndex)?._meta;
  if(initial){
   if(!Array.isArray(meta?.wardrobeIndex))throw new Error('The full wardrobe index is unavailable.');
   const items=meta.wardrobeIndex.map(indexItem);
   if(!currentIndex.current)adoptIndex(items);else{currentIndex.current=items;Index(items);}R(value=>value+1);
  }
  return view;
 }
 async function loadIndex(){
  E('');Loading(true);hydration.current?.reset();
  try{const result=await host.call('fluent_show_closet',{filter:requestFilter(initialFilter.current),limit:1});if(mounted.current)ingest(result,true);}
  catch{if(mounted.current)E('The wardrobe could not load. Try again.');}
  finally{if(mounted.current)Loading(false);}
 }
 useEffect(()=>{
  mounted.current=true;
  hydration.current=createHydrator({
   fetchItems:ids=>host.call('fluent_show_closet',{filter:{status:'any',item_ids:ids},limit:ids.length}),
   accept:result=>ingest(result).items.map(item=>item.id),
   onError:()=>E('Some pieces could not load. Try again.'),
  });
  const unsubscribe=host.subscribe(({view,index:metadata,outcome,createReview})=>{
   if(outcome){loaded.current=true;Outcome(outcome);return;}
   if(loaded.current)return;loaded.current=true;
   if(createReview)restored.current=null;
   initialFilter.current=restored.current?.scope||view.filter||{status:'active'};
   Presentation((!createReview&&restorePresentation(host.readState?.()?.presentation))||view.presentation||{mode:'browse'});
   hydration.current.seed(view.items.map(item=>item.id));
   Cache(Object.fromEntries(view.items.map(item=>[item.id,savedItem(item)])));
   if(metadata&&!restored.current)adoptIndex(metadata.map(indexItem));
   if(view.presentation?.focusedItemId&&!restored.current)S(view.presentation.focusedItemId);
   if(!metadata||restored.current)void loadIndex();
  },Context);
  host.connect().catch(()=>E('Fluent could not connect. Open the wardrobe again.'));
  const timeout=setTimeout(()=>{if(!loaded.current)void loadIndex();},7000);
  return()=>{mounted.current=false;hydration.current?.dispose();clearTimeout(timeout);unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!filters)return;
  const dismiss=event=>{if(event.key==='Escape'){event.preventDefault();closeFilters();}else if(event.type==='pointerdown'&&!event.target.closest('.facet-panel,.filter-button'))F(false);};
  document.addEventListener('keydown',dismiss);document.addEventListener('pointerdown',dismiss);
  return()=>{document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',dismiss);};
 },[filters]);
 useEffect(()=>{const element=root.current;if(!element)return;const observer=new ResizeObserver(()=>{W(element.clientWidth-parseFloat(getComputedStyle(element).paddingLeft)-parseFloat(getComputedStyle(element).paddingRight));if(!expanded&&(index||outcome)){const height=element.getBoundingClientRect().height;if(collection.current)Chrome(Math.ceil(height-collection.current.getBoundingClientRect().height));host.resize(Math.ceil(height));}});observer.observe(element);return()=>observer.disconnect();},[expanded,index,outcome]);
 useEffect(()=>{if(restoring.current){if(restoring.current===JSON.stringify([query,category,chosen]))restoring.current=null;return;}P(0);if(collection.current){collection.current.scrollLeft=0;collection.current.scrollTop=0;}},[query,category,chosen]);
 useEffect(()=>{if(index&&!outcome)host.saveState?.({scope:initialFilter.current,query,category,chosen,sort,page:currentPage,selected,presentation,reviewed,reviewScope:'this widget session only',receipt});},[index,query,category,chosen,currentPage,selected,presentation,reviewed,receipt,outcome,sort]);
 useEffect(()=>{
  if(index)hydration.current?.want(ids);
 },[key,!!index,refresh]);
 useEffect(()=>{lastColumn.current=0;ScrollWindow({column:0,direction:1});},[query,category,chosen,sort]);
 function retryItems(){hydration.current?.reset(Object.keys(cache).filter(id=>!ids.includes(id)));E('');R(value=>value+1);}
 function toggle(field,value){Choose(previous=>({...previous,[field]:previous[field].includes(value)?previous[field].filter(v=>v!==value):[...previous[field],value]}));}
 function open(id){horizontalPosition.current=collection.current?.scrollLeft||0;position.current=expanded?(collection.current?.scrollTop||0):window.scrollY;origin.current=id;imageTransition(()=>{S(id);F(false);Saved(false);E('');},()=>root.current?.querySelector('.detail-top button')?.focus({preventScroll:true}),document.getElementById('item-'+id)?.querySelector('img'),()=>root.current?.querySelector('.inspection-photo img'));}
 function back(){if(duplicate){Duplicate(false);return;}if(photoEdit||draft){transition(()=>{PhotoEdit(false);D(null);E('');});return;}if(draft){transition(()=>{D(null);E('');});return;}imageTransition(()=>{S(null);Saved(false);E('');},()=>{if(collection.current)collection.current.scrollLeft=horizontalPosition.current;if(expanded&&collection.current)collection.current.scrollTop=position.current;else window.scrollTo({top:position.current,behavior:'instant'});document.getElementById('item-'+origin.current)?.focus({preventScroll:true});},root.current?.querySelector('.inspection-photo img'),()=>document.getElementById('item-'+origin.current)?.querySelector('img'));}
 async function refreshItem(){hydration.current?.reset(Object.keys(cache));const result=await host.call('fluent_show_closet',{filter:{status:'any',item_ids:[selected]},limit:1,presentation:{focused_item_id:selected,mode:'detail'}});const view=ingest(result);if(!view.items.some(item=>item.id===selected))throw new Error('The saved item could not be refreshed.');return view.items.find(item=>item.id===selected);}
 function changeStatus(status){initialFilter.current={...initialFilter.current,status};currentIndex.current=null;Index(null);S(null);P(0);void loadIndex();}
 function statusChanged(status){
  const previous=item;Cache(cache=>({...cache,[item.id]:{...item,status}}));
  if(initialFilter.current.status!=='any')Index(items=>items.filter(entry=>entry.id!==item.id));
  S(null);Receipt({id:previous.id,name:previous.name,status,previous:previous.status,createdAt:Date.now()});
 }
 async function combined(result){
  const initialScope={...initialFilter.current};
  Cache(cache=>{const next={...cache};delete next[result.sourceId];delete next[result.targetId];return next;});
  if(initialFilter.current.item_ids)initialFilter.current={...initialFilter.current,item_ids:[...new Set(initialFilter.current.item_ids.map(id=>id===result.sourceId?result.targetId:id))]};
  Duplicate(false);S(null);Receipt({...result,originalScope:initialScope,createdAt:Date.now()});await loadIndex();
 }
 async function undoDuplicate(){B(true);E('');try{await undoCombine(host,receipt);Cache(cache=>{const next={...cache};delete next[receipt.sourceId];delete next[receipt.targetId];return next;});if(receipt.originalScope)initialFilter.current=receipt.originalScope;Receipt(null);await loadIndex();}catch{E('The original records could not be confirmed. Reopen them before retrying.');}finally{B(false);}}
 async function undoArchive(){if(!receipt||receipt.status!=='archived')return;B(true);E('');try{await saveMetadata(host,receipt.id,{status:'active'});Cache(cache=>({...cache,[receipt.id]:{...cache[receipt.id],status:'active'}}));Receipt(null);await loadIndex();}catch{E('The restore could not be confirmed. Check Archived before retrying.');}finally{B(false);}}
 async function save(event){
  event.preventDefault();const patch=metadataPatch(editOriginal.current||item,draft);if(!Object.keys(patch).length){D(null);return;}
  B(true);E('');Saved(false);
  try{
   hydration.current?.reset(Object.keys(cache));
   await saveMetadata(host,item.id,patch);
   Cache(previous=>({...previous,[item.id]:applyMetadataPatch(previous[item.id],patch)}));
   Index(previous=>previous.map(entry=>entry.id===item.id?applyMetadataPatch(entry,patch):entry));D(null);Saved(true);
  }catch{E('The update could not be confirmed. Your edits are still here. Check the saved item before trying again.');}
  finally{B(false);}
 }
 function reviewItem(){Reviewed(previous=>[...new Set([...previous,item.id])]);const next=pageItems.find(entry=>entry.id!==item.id&&cache[entry.id]?.raw.review?.needsReview&&!reviewed.includes(entry.id));if(next)open(next.id);else back();}
 function fullWardrobe(){Presentation({mode:'browse'});restored.current=null;initialFilter.current={status:'active'};currentIndex.current=null;Index(null);S(null);P(0);void loadIndex();}
 function closeFilters(){transition(()=>F(false),()=>root.current?.querySelector('.filter-button')?.focus({preventScroll:true}));}
 return <main className={'production-wardrobe'+(expanded?' expanded-study':'')} style={Object.fromEntries(Object.entries(safe).map(([side,value])=>['--safe-'+side,value+'px']))}>
  <section ref={root} className={'wardrobe compact'+(expanded?' expanded':'')+(filters?' filters-open':'')} data-category={category} style={{'--gallery-budget':budget+'px','--gallery-rows':rows,'--gallery-chrome':chrome+'px','--closet-columns':columns}} aria-label="Wardrobe" aria-busy={busy||loading||(!error&&ids.some(id=>!cache[id]))}>
  {outcome?<CreateOutcome outcome={outcome}/>:!index?<div className="empty" role="status"><h1>Wardrobe</h1><p>{error||'Loading your wardrobe…'}</p>{error&&<button disabled={busy} onClick={loadIndex}>Retry</button>}</div>:!selected?<>
   {['comparison','ingestion_review'].includes(presentation.mode)&&<div className="presentation-context"><span>{presentation.mode==='comparison'?'Selected pieces':'Review new pieces'}</span><button onClick={fullWardrobe}>Full wardrobe</button></div>}
   <header><h1>Wardrobe</h1><WardrobeSearch value={query} change={Q}/><WardrobeSort value={sort} change={value=>{F(false);Sort(value);P(0);horizontalPosition.current=0;if(collection.current){collection.current.scrollLeft=0;collection.current.scrollTop=0;}}}/><button className="filter-button" aria-label={count?`Filters, ${count} active`:"Filters"} aria-expanded={filters} onClick={()=>filters?closeFilters():transition(()=>F(true),()=>root.current?.querySelector(".facet-search input")?.focus({preventScroll:true}))}><SlidersHorizontal size={19}/><span className="filter-label">Filters</span>{count?' · '+count:''}</button></header>
   <div className="category-toolbar"><nav aria-label="Categories">{['All',...visibleCategories(index||[])].map(value=><button key={value} aria-pressed={category===value} onClick={()=>transition(()=>C(value))}>{value}</button>)}</nav>
   <div className="collection-tools">{initialFilter.current.status==='archived'&&<span>Archived</span>}<details><summary aria-label="Wardrobe options"><DotsThree size={21}/></summary><div><button disabled={busy} onClick={()=>changeStatus(initialFilter.current.status==='archived'?'active':'archived')}>{initialFilter.current.status==='archived'?'Active wardrobe':'Archived items'}</button><button disabled={busy} onClick={loadIndex}>Refresh</button></div></details></div></div>
   {count>0&&<div className="active-filters" aria-label="Active filters">{category!=='All'&&<button onClick={()=>C('All')} aria-label={'Remove category: '+category}>{category}<X size={12}/></button>}{Object.keys(facets).flatMap(field=>chosen[field].map(value=><button key={field+value} onClick={()=>toggle(field,value)} aria-label={'Remove '+facets[field]+': '+value}>{displayValue(value,field,category)}<X size={12}/></button>))}</div>}
   {filters&&<FilterPanel items={index} query={query} category={category} setCategory={C} selected={chosen} toggle={toggle} clear={()=>{Choose(emptyFacets());C('All');}} close={closeFilters} total={results.length}/>}
   <div className="collection continuous-closet" ref={collection} tabIndex={0} aria-label="Wardrobe items" onScroll={event=>{const element=event.currentTarget;const column=Math.floor((element.scrollLeft+2)/Math.max(1,(element.clientWidth+14)/columns));if(column!==lastColumn.current){const direction=column>lastColumn.current?1:-1;lastColumn.current=column;ScrollWindow({column,direction});P(Math.floor(column/columns));}}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;const element=event.currentTarget;const delta={ArrowRight:80,ArrowLeft:-80,PageDown:element.clientWidth,PageUp:-element.clientWidth}[event.key];if(delta!==undefined){event.preventDefault();element.scrollLeft+=delta;}else if(event.key==='Home'||event.key==='End'){event.preventDefault();element.scrollLeft=event.key==='Home'?0:element.scrollWidth;}}}><div className="grid">{results.map(entry=>{const garment=cache[entry.id];return <button id={'item-'+entry.id} className="garment" key={entry.id} aria-label={entry.name+(entry.brand?', '+entry.brand:'')} onClick={()=>open(entry.id)}><GarmentPhoto key={(garment?.imageUrl||'loading')+refresh} item={garment} eager={eagerIds.has(entry.id)} name={entry.name} onFailure={()=>E('Some photos could not load. You can still open the items.')}/><span className="caption">{entry.name}</span>{presentation.mode==='comparison'&&<span className="comparison-meta">{[entry.brand,entry.size,entry.colour].filter(Boolean).join(' · ')}</span>}</button>;})}</div>{!results.length&&<div className="empty"><h2>No matching pieces</h2><button onClick={()=>{Q('');C('All');Choose(emptyFacets());}}>Clear search and filters</button></div>}</div>
   {!!results.length&&<div className="gallery-footer continuous-footer"><ClosetPosition key={JSON.stringify([query,category,chosen])} track={collection} initialPage={currentPage}/></div>}
  </>:<>
   <div className="detail-top"><button onClick={back} disabled={busy}><ArrowLeft size={20}/>{draft||photoEdit||duplicate?'Back to item':'Wardrobe'}</button><span role="status">{saved?<><Check size={15}/>Saved</>:busy?'Loading…':''}</span></div>
   {item&&presentation.mode==='recommendation'&&presentation.recommendationReason&&<p className="recommendation-context">{presentation.recommendationReason}</p>}
   {item&&!duplicate&&(draft||photoEdit)&&<section className="item-editor" aria-label="Edit item">
    <div className="editor-heading"><div className="editor-thumbnail"><GarmentPhoto item={item} name={item.name} onFailure={()=>{}}/></div><div><span className="editor-eyebrow">Edit item</span><h2>{item.name}</h2></div></div>
    <div className="editor-tabs" role="tablist" aria-label="Edit item sections">{['Details','Photos'].map((label,n)=><button key={label} role="tab" id={'editor-tab-'+n} aria-controls={'editor-panel-'+n} aria-selected={photoEdit===!!n} tabIndex={photoEdit===!!n?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-n;PhotoEdit(!!next);document.getElementById('editor-tab-'+next)?.focus();}}} disabled={busy} onClick={()=>PhotoEdit(!!n)}>{label}</button>)}</div>
    <div role="tabpanel" id="editor-panel-0" aria-labelledby="editor-tab-0" hidden={photoEdit}>{draft&&<MetadataEditor items={index} original={editOriginal.current||item} draft={draft} change={D} save={save} cancel={back} saving={busy} error={error}/>}</div>
    <div role="tabpanel" id="editor-panel-1" aria-labelledby="editor-tab-1" hidden={!photoEdit}>{host.photoManagement?<PhotoManager embedded item={item} host={host} refresh={refreshItem} busyChanged={B} close={()=>PhotoEdit(false)}/>:<PhotoEditor item={item} host={host} refresh={refreshItem} busyChanged={B} close={()=>PhotoEdit(false)}/>}</div>
   </section>}
   {item&&!duplicate&&!draft&&!photoEdit&&<div className="detail viewing"><ItemPhotos key={item.id} item={item} inspecting editPhotos={()=>{editOriginal.current=item;D({...item});PhotoEdit(true);Saved(false);}} retry={refreshItem}/><ItemOverview item={item} busy={busy} edit={()=>transition(()=>{editOriginal.current=item;D({...item});Saved(false);E('');})} actions={<ItemActions key={item.id} item={item} host={host} onStatusChanged={statusChanged} busyChanged={B} findDuplicate={()=>Duplicate(true)}/>}/></div>}
   {item&&duplicate&&<DuplicateEditor item={item} host={host} busyChanged={B} close={()=>Duplicate(false)} complete={combined}/>}
   {item&&!draft&&!photoEdit&&!duplicate&&presentation.mode==='ingestion_review'&&item.raw.review?.needsReview&&<div className="review-action">{reviewed.includes(item.id)?<span role="status">Checked in this review</span>:<button disabled={busy} onClick={reviewItem}>Looks right</button>}</div>}
  </>}
  {receipt&&<div className="mutation-receipt" role="status"><span>{receipt.kind==='duplicate'?'Combined into':receipt.status==='archived'?'Removed':'Restored'} {receipt.name}</span>{(receipt.kind==='duplicate'||receipt.status==='archived')&&<button disabled={busy} onClick={receipt.kind==='duplicate'?undoDuplicate:undoArchive}>Undo</button>}<button aria-label="Dismiss update" onClick={()=>Receipt(null)}><X size={14}/></button></div>}
  {error&&!draft&&index&&<div className="error" role="alert">{error}<button disabled={busy} onClick={retryItems}>Retry</button></div>}
  </section>
 </main>;
}

function PhotoThumbnail({photo}){
 const [failed,fail]=useState(false);
 useEffect(()=>fail(false),[photo.src]);
 return failed?<ImageBroken size={22} weight="light" aria-hidden="true"/>:<img className={photo.kind==='Fit'?'fit-photo':''} src={photo.src} alt="" onError={()=>fail(true)}/>;
}

function ItemPhotos({item,editing,inspecting,editPhotos,retry}){
 const [selected,S]=useState(0),[failed,F]=useState(false),[viewer,V]=useState(false),[retrying,R]=useState(false);
 useEffect(()=>F(false),[item.photos]);
 async function retryPhoto(){R(true);try{await retry();F(false);}catch{F(true);}finally{R(false);}}const current=Math.min(selected,item.photos.length-1),photo=item.photos[current];
 function choose(next){if(next<0||next>=item.photos.length)return;S(next);F(false);}
 if(inspecting)return <div className="item-photos inspection-gallery"><div className="item-stage photo-stage" data-unavailable={!photo||failed}>{photo&&!failed?<InspectionPhoto key={photo.id} photo={photo} name={item.name} onError={()=>F(true)} onNavigate={step=>choose(current+step)}/>:<div className="photo-unavailable"><ImageBroken size={28} weight="light" aria-hidden="true"/><span>{failed?'Photo unavailable':'No photo yet'}</span>{failed?<button disabled={retrying} onClick={retryPhoto}>{retrying?'Retrying…':'Retry'}</button>:<button onClick={editPhotos}>Add photo</button>}</div>}{item.photos.length>1&&<><button className="photo-arrow previous" aria-label="Previous photo" disabled={!current} onClick={()=>choose(current-1)}><CaretLeft size={19}/></button><button className="photo-arrow next" aria-label="Next photo" disabled={current===item.photos.length-1} onClick={()=>choose(current+1)}><CaretRight size={19}/></button></>}</div>
  <div className="inspection-bar">{item.photos.length>1&&<div className="photo-thumbs" aria-label="Item photos">{item.photos.map((photo,n)=><button key={photo.id} aria-label={'Photo '+(n+1)+': '+photo.label} aria-pressed={current===n} onClick={()=>choose(n)}><PhotoThumbnail photo={photo}/>{current===n&&<span className="photo-indicator"/>}</button>)}</div>}<span className="inspection-caption" role="status">{photo?.source==='generated_metadata'?'Generated image':photo?.label}{item.photos.length>1&&<small>{current+1} / {item.photos.length}</small>}</span></div>
 </div>;
 return <div className="item-photos"><div className="item-stage photo-stage">{photo&&!failed?<InspectionPhoto key={photo.id+String(editing)} photo={photo} name={item.name} disabled={editing} onError={()=>F(true)} onNavigate={step=>choose(current+step)}/>:<div className="photo-unavailable"><ImageBroken size={28} weight="light" aria-hidden="true"/><span>{failed?'Photo unavailable':'No photo yet'}</span>{failed?<button disabled={retrying} onClick={retryPhoto}>{retrying?'Retrying…':'Retry'}</button>:<button onClick={editPhotos}>Add photo</button>}</div>}{!editing&&item.photos.length>1&&<><button className="photo-arrow previous" aria-label="Previous photo" disabled={!current} onClick={()=>choose(current-1)}><CaretLeft size={19}/></button><button className="photo-arrow next" aria-label="Next photo" disabled={current===item.photos.length-1} onClick={()=>choose(current+1)}><CaretRight size={19}/></button></>}</div>{!editing&&item.photos.length>1&&<div className="photo-navigation"><div className="photo-thumbs" aria-label="Item photos">{item.photos.map((photo,n)=><button key={photo.id} aria-label={'Photo '+(n+1)+': '+photo.label} aria-pressed={current===n} onClick={()=>choose(n)}><PhotoThumbnail photo={photo}/>{current===n&&<span className="photo-indicator"/>}</button>)}</div><span className="photo-position" role="status">{current+1} / {item.photos.length}</span></div>}{!editing&&photo&&<div className="photo-detail-actions"><span>{photo.label}{photo.source==='generated_metadata'?' · Generated display':''}</span><button aria-label="Enlarge photo" onClick={()=>V(true)}>{'\u2197'}</button></div>}{viewer&&photo&&<PhotoViewer photos={item.photos} index={current} select={choose} name={item.name} close={()=>V(false)}/>}
 {!editing&&<button className="edit-photos" onClick={editPhotos}>Add photos</button>}</div>;
}
