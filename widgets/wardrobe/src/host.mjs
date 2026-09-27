import {readView,readCreateOutcome,findPayload} from './model.mjs';

export function createWardrobeHost(win=window){
 let sequence=0,ready=null,context={intrinsicSizing:typeof win.openai?.notifyIntrinsicHeight==='function'},listener=null,transport=null,lastHeight=null;
 const pending=new Map();
 function notify(method,params){win.parent.postMessage({jsonrpc:'2.0',method,params},'*');}
 function request(method,params,timeout=20000){
  if(!win.parent||win.parent===win)return Promise.reject(new Error('Open Wardrobe from Fluent to continue.'));
  const id='wardrobe-'+(++sequence);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Fluent did not confirm the request.'));},timeout);
   pending.set(id,{resolve,reject,timer});win.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');
  });
 }
 function receive(payload,meta){
  const outcome=readCreateOutcome(meta)||readCreateOutcome(payload);
  if(outcome){listener?.({outcome});return;}
  const view=readView(meta)||readView(payload);if(!view)return;
  const envelope=findPayload(meta,v=>v._meta?.wardrobeIndex)||findPayload(payload,v=>v._meta?.wardrobeIndex);
  const createReview=Boolean(findPayload(meta,value=>value.styleClosetReview)||findPayload(payload,value=>value.styleClosetReview));
  listener?.({view,index:meta?.wardrobeIndex||envelope?._meta?.wardrobeIndex,createReview});
 }
 function message(event){
  if(event.source!==win.parent)return;
  const data=event.data;if(!data||data.jsonrpc!=='2.0')return;
  const call=pending.get(data.id);
  if(call){pending.delete(data.id);clearTimeout(call.timer);data.error?call.reject(new Error('Fluent could not complete the request.')):call.resolve(data.result);return;}
  if(data.method==='ui/notifications/tool-result')receive(data.params);
  if(data.method==='ui/notifications/host-context-changed'){context={...context,...data.params};onContext?.(context);}
 }
 function globals(event){
  const values=event.detail?.globals||win.openai||{};
  for(const key of ['theme','displayMode','maxHeight','safeArea','containerDimensions','locale'])if(values[key]!==undefined)context[key]=values[key];
  onContext?.({...context});
  const metadata=values.toolResponseMetadata||win.openai?.toolResponseMetadata;
  if(values.toolOutput||metadata)receive(values.toolOutput||metadata,metadata);
 }
 let onContext=null;
 win.addEventListener('message',message);win.addEventListener('openai:set_globals',globals);
 async function connect(){
  if(!ready)ready=request('ui/initialize',{appInfo:{name:'Fluent Wardrobe',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'},6000).then(result=>{
   transport='bridge';
   // ChatGPT's MCP bridge reports the current inline iframe height as a
   // container height, including the loading placeholder. Inline cards still
   // size intrinsically through size-changed; this is not a fixed-height host.
   context={...context,...result?.hostContext,intrinsicSizing:context.intrinsicSizing||/^chatgpt$/i.test(result?.hostInfo?.name||'')};
   onContext?.(context);notify('ui/notifications/initialized',{});if(lastHeight!==null)publishHeight(lastHeight);
  }).catch(error=>{if(win.openai?.callTool){transport='native';globals({detail:{globals:win.openai}});if(lastHeight!==null)publishHeight(lastHeight);return;}ready=null;throw error;});
  return ready;
 }
 function publishHeight(height){
  if(context.displayMode==='fullscreen')return;
  if(win.openai?.notifyIntrinsicHeight)win.openai.notifyIntrinsicHeight(height);
  else if(transport==='bridge')notify('ui/notifications/size-changed',{height});
 }
 return {
  photoManagement:true,
  readState(){return win.openai?.widgetState?.wardrobe;},
  saveState(state){try{win.openai?.setWidgetState?.({...win.openai.widgetState,wardrobe:{version:1,...state}});}catch{/* Persistence is optional; in-frame browsing remains usable. */}},
  subscribe(callback,contextCallback){listener=callback;onContext=contextCallback;globals({detail:{globals:win.openai||{}}});return()=>{listener=null;onContext=null;};},
  connect,
  async call(name,args){
   // Negotiate with the immediate MCP Apps host first, as the existing Closet
   // does. Native fallback is allowed only before a tool call, never after a write.
   await connect();
   if(transport==='native')return win.openai.callTool(name,args);
   return request('tools/call',{name,arguments:args});
  },
  async displayMode(mode){
   const result=win.openai?.requestDisplayMode?await win.openai.requestDisplayMode({mode}):await request('ui/request-display-mode',{mode});
   if(result?.mode!==mode)throw new Error('This view is unavailable in the current host.');
   context={...context,displayMode:mode};onContext?.(context);return result;
  },
  resize(height){if(context.displayMode==='fullscreen')return;lastHeight=height;if(transport)publishHeight(height);},
  dispose(){win.removeEventListener('message',message);win.removeEventListener('openai:set_globals',globals);for(const call of pending.values()){clearTimeout(call.timer);call.reject(new Error('View closed.'));}pending.clear();},
 };
}
