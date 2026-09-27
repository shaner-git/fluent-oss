import React from 'react';

// A create warning is not a saved garment and must never hydrate the whole closet.
export function CreateOutcome({outcome}){
 return <div className="create-outcome" role="status"><h1>{outcome.title||'Item not created'}</h1><p>{outcome.message}</p>{outcome.duplicateCandidates?.length>0&&<ul>{outcome.duplicateCandidates.map((candidate,n)=><li key={candidate.id||n}><strong>{candidate.name||'Existing item'}</strong>{candidate.reason&&<span>{candidate.reason}</span>}</li>)}</ul>}</div>;
}
