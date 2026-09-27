const present=value=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.trim().toLowerCase()===b.trim().toLowerCase();
const groups=[
 ['Fit',[['ownedSize','Owned size'],['fitObservations',null],['lengthNote','Length'],['silhouette','Shape']]],
 ['Wear & pair',[['styleRole','Role'],['pairingNotes','Pairing'],['bestOccasions','Occasions'],['useCases','Wear for'],['avoidOccasions','Avoid occasions'],['avoidUseCases','Avoid for'],['seasonality','Seasons']]],
 ['Materials & details',[['fabricHand','Fabric'],['texture','Texture'],['structureLevel','Structure'],['visualWeight','Weight'],['polishLevel','Polish'],['qualityTier','Quality'],['dressCodeMinimum','Dress code minimum'],['dressCodeMaximum','Dress code maximum'],['tags','Tags']]],
];

// Presentation only: keep every saved note verbatim, with longer fit notes
// available on demand. Matching size metadata is already visible above.
export function noteSections(detail,primarySize){
 if(!detail)return [];
 return groups.map(([title,fields])=>{
  const entries=fields.flatMap(([key,label])=>!present(detail[key])||(key==='ownedSize'&&same(detail[key],primarySize))?[]:(Array.isArray(detail[key])?detail[key]:[detail[key]]).map((text,index)=>({key:key+'-'+index,label:index===0?label:null,text})));
  const summary=title==='Fit'&&present(detail.fitSummary)?detail.fitSummary:null;
  return {title,summary,entries: title==='Fit'?entries.slice(0,2):entries,more:title==='Fit'?entries.slice(2):[]};
 }).filter(section=>section.summary||section.entries.length);
}

// The detail view prioritizes useful garment facts; full records stay accessible.
export function detailSections(detail,primarySize){
 const sections=noteSections(detail,primarySize);
 const fit=sections.find(s=>s.title==='Fit');
 const fabric=sections.find(s=>s.title==='Materials & details');
 const selected=[];
 if(fit)selected.push({...fit,title:'Fit & notes'});
 if(fabric){const entries=fabric.entries.filter(e=>/^(fabricHand|texture)-/.test(e.key));if(entries.length)selected.push({title:'Fabric & details',entries,more:[],summary:null});}
 return selected.map(section=>{
  const all=[...(section.summary?[{key:'summary',label:null,text:section.summary}]:[]),...section.entries,...section.more];
  return {...section,inline:all.length===1&&typeof all[0].text==='string'&&all[0].text.length<=100?all[0]:null};
 });
}
