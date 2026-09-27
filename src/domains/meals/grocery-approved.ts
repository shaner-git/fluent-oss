import { groceryAisleScript } from './grocery-aisles';
/** Approved grocery presentation. Shares the established host adapter in grocery-list.ts. */
export const approvedGroceryStyles = `<style>
#grocery-list-root .ag{--ag-ink:#161916;--ag-muted:#626760;--ag-line:#e5e6e2;--ag-paper:#fff;--ag-soft:#f5f5f1;box-sizing:border-box;width:100%;max-width:none;min-width:0;margin:0;border:1px solid var(--ag-line);border-radius:12px;color:var(--ag-ink);background:var(--ag-paper);font:16px/1.45 system-ui,sans-serif}
.ag *{box-sizing:border-box;min-width:0}.ag header,.ag footer,.ag-panel{padding:16px}.ag header{border-bottom:1px solid var(--ag-line)}.ag-top,.ag-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.ag h1{font-size:18px;line-height:1.3;font-weight:650;margin:0}.ag p{margin:0}.ag-count,.ag-week,.ag-qty,.ag footer{font-size:13px;color:var(--ag-muted)}.ag-tools{margin-top:8px}.ag button,.ag input{font:inherit;color:inherit;min-height:44px;border:1px solid var(--ag-line);border-radius:8px;background:var(--ag-paper);padding:8px 12px;max-width:100%;white-space:normal;overflow-wrap:anywhere}.ag button{cursor:pointer}.ag button:disabled{cursor:default;opacity:.65}.ag .ag-toggle:disabled{opacity:1}.ag button:focus-visible,.ag input:focus-visible{outline:2px solid #765249;outline-offset:2px}.ag .ag-text-button{border-color:transparent;background:transparent;font-size:13px}.ag-primary{background:var(--ag-soft)!important}.ag-menu{display:flex;flex-wrap:wrap;gap:4px;border-top:1px solid var(--ag-line);padding-top:8px}.ag-form{display:flex;gap:8px;flex-wrap:wrap;padding-top:12px}.ag-form input{flex:1 1 100px;width:100px}.ag-row{padding:2px 16px}.ag-row-main{display:flex;align-items:center;gap:8px;min-height:48px}.ag .ag-toggle{flex:1;display:flex;align-items:center;gap:14px;text-align:left;border:0;border-radius:0;background:transparent;padding:0;min-height:44px}.ag-mark{flex:0 0 20px;width:20px;height:20px;border:1px solid #b8beb5;border-radius:6px;display:grid;place-items:center;font-size:14px;line-height:1;font-weight:650;transition:background .18s ease,border-color .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}.ag-selected .ag-mark{background:#656c5e;border-color:#656c5e;color:white}.ag-saved .ag-mark{background:#656c5e;border-color:#656c5e;color:#fff}.ag-toggle:active .ag-mark{transform:scale(.88)}.ag-pending .ag-mark{opacity:.65}.ag[data-theme="dark"] :is(.ag-selected,.ag-saved) .ag-mark{background:#d3d7bb;border-color:#d3d7bb;color:#252920}@media(prefers-reduced-motion:reduce){.ag-mark{transition:none}.ag-toggle:active .ag-mark{transform:none}}.ag-copy{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;overflow-wrap:anywhere}.ag-name{font-weight:550}.ag-saved .ag-name{text-decoration:line-through;color:var(--ag-muted);font-weight:400}.ag-disclosure{padding:8px 0 12px 34px}.ag-disclosure p{font-size:13px;margin-bottom:8px}.ag-disclosure button{font-size:13px;margin:0 6px 4px 0}.ag-error{color:#963b2d;font-size:13px;padding:8px 0;overflow-wrap:anywhere}.ag footer{border-top:1px solid var(--ag-line);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;min-height:64px}.ag-group{font-size:13px;color:var(--ag-muted);padding:12px 16px 4px}.ag-activity{padding:10px 0;border-bottom:1px solid var(--ag-line);overflow-wrap:anywhere}.ag [hidden]{display:none!important}
#grocery-list-root .ag[data-theme="dark"]{--ag-ink:#f2f3ef;--ag-muted:#b4b9ae;--ag-line:#41473e;--ag-paper:#222620;--ag-soft:#30372c}.ag[data-theme="dark"] .ag-error{color:#ffb4a5}
/* Local design candidate: restrained shopping-list presentation. */
#grocery-list-root .ag{--ag-paper:#f5f2eb;--ag-soft:#ebe7dc;--ag-line:#dcd8cd;--ag-ink:#292b24;--ag-muted:#676b60;border-radius:14px;overflow:visible}
.ag header{position:relative;padding:22px 24px 18px}.ag .ag-top{flex-wrap:nowrap;gap:16px}.ag h1{font-family:Georgia,serif;font-size:30px;font-weight:400;letter-spacing:-.8px}.ag .ag-heading{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.ag .ag-count{font-variant-numeric:tabular-nums}.ag .ag-week{display:block;margin-top:5px;font-size:12px}.ag [data-ag-controls]{display:flex;gap:4px;align-items:center}.ag .ag-add{background:var(--ag-soft);border:1px solid var(--ag-line);padding:8px 14px;white-space:nowrap;font-size:14px}.ag .ag-options{font-size:22px;min-width:44px;padding:0;border:0;background:transparent}
.ag .ag-menu{position:absolute;right:24px;top:72px;z-index:10;display:flex;flex-direction:column;min-width:190px;padding:6px;border:1px solid var(--ag-line);border-radius:12px;background:var(--ag-paper);box-shadow:0 12px 32px #0002;animation:ag-menu-in .16s ease-out}.ag .ag-menu button{text-align:left;border:0;background:transparent;font-size:14px}.ag .ag-menu button:hover{background:var(--ag-soft)}
.ag .ag-row{padding:0 24px}.ag .ag-row-main{min-height:54px}.ag .ag-toggle{min-height:54px;gap:14px;border-radius:6px}.ag .ag-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:baseline;flex:1}.ag .ag-name{font-size:15px;font-weight:500}.ag .ag-qty{font-size:13px;text-align:right;max-width:150px;line-height:1.4;font-variant-numeric:tabular-nums}.ag .ag-mark{transition:background .18s,border-color .18s,transform .18s,opacity .18s}.ag .ag-name{transition:color .18s}.ag-row+.ag-row .ag-row-main{border-top:1px solid color-mix(in srgb,var(--ag-line) 40%,transparent)}.ag .ag-toggle:focus-visible{outline:2px solid #909a75;outline-offset:3px}.ag [data-ag-list]{padding:8px 0}.ag .ag-row{position:relative}.ag .ag-row-status:not(.ag-row-error){position:absolute;right:24px;bottom:0;padding:0;font-size:10px}.ag .ag-row-status{font-size:12px;color:var(--ag-muted);padding:0 0 10px 34px}.ag .ag-row-status button{font-size:12px;min-height:36px;margin-left:8px;background:transparent}.ag .ag-row-status:empty{display:none}.ag .ag-row-error{color:#963b2d}.ag[data-theme="dark"] .ag-row-error{color:#ffb4a5}
.ag [data-ag-more]{padding:0 24px 14px}.ag [data-ag-more] button{padding:6px 0;min-height:40px;color:var(--ag-muted);font-size:13px}.ag footer{padding:0 24px;min-height:0;border:0;position:relative}.ag footer:has(.ag-error:not([hidden])){padding-top:8px;padding-bottom:12px}.ag [data-ag-status]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.ag .ag-form{padding-top:18px;gap:8px}.ag .ag-form input{background:var(--ag-paper);font-size:14px}.ag .ag-form button{font-size:13px}.ag .ag-group{padding:16px 24px 4px;text-transform:uppercase;font-size:10px;letter-spacing:1.2px}.ag .ag-panel{padding:20px 24px}
@keyframes ag-menu-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:480px){.ag header{padding:18px 18px 14px}.ag h1{font-size:27px}.ag .ag-heading{gap:4px;display:block}.ag .ag-heading .ag-count{margin-top:3px}.ag .ag-row{padding:0 18px}.ag .ag-copy{gap:10px}.ag .ag-qty{max-width:110px}.ag .ag-menu{right:18px;top:70px}.ag [data-ag-more]{padding-left:18px}.ag .ag-add{padding:8px 11px}.ag .ag-form input:first-child{flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.ag .ag-menu{animation:none}.ag .ag-name{transition:none}}
</style>`;

export const approvedGroceryScript = groceryAisleScript + String.raw`
    var ag = { queue:new Map(), draining:false, listId:null, rows:new Map(), order:[], selected:new Map(), saved:new Map(), conflicts:new Map(), quantityDrafts:new Map(), open:new Set(), expanded:false, grouped:false, menu:false, panel:'', activity:[], busy:false, job:null, notice:'', error:'', retryRead:false, draftName:'', draftQuantity:'', add:false };
    function agEntries(vm) {
      return (vm.buckets || []).flatMap(function(bucket) { return (bucket.items || []).map(function(item) {
        var actions = (item.syncActions || []).concat(item.syncAction || []);
        return {item:Object.assign({},item,{aisle:inferAisle(item)}),bucket:bucket.id,actions:actions,key:item.itemKey,
          buy:actions.find(function(a){return a.id === 'mark_bought';}),
          enough:actions.find(function(a){return a.id === 'already_have_enough';}),
          need:actions.find(function(a){return a.id === 'need_to_buy';})};
      }); });
    }
    function agGap(entry) { return String(entry.key||'').indexOf('meal-coverage:')===0; }
    function agFingerprint(entry) { return JSON.stringify([entry.item.displayName,entry.item.quantityDisplay,entry.buy && shoppingResultItemKey({item:entry.item,action:entry.buy})]); }
    function agPruneSaved(entries) {
      ag.saved.forEach(function(_,key){if(!entries.some(function(e){return e.key===key&&e.bucket==='covered';}))ag.saved.delete(key);});
    }
    function agPersist() {
      var data = {queue:Array.from(ag.queue),listId:ag.listId,order:ag.order,selected:Array.from(ag.selected),quantityDrafts:Array.from(ag.quantityDrafts),saved:Array.from(ag.saved),expanded:ag.expanded,grouped:ag.grouped,draftName:ag.draftName,draftQuantity:ag.draftQuantity,add:ag.add,job:ag.job,activity:ag.activity};
      try { sessionStorage.setItem('fluent-approved-grocery:'+ag.listId,JSON.stringify(data)); } catch(_) {}
      try { var api=getOpenAI();if(api.setWidgetState)api.setWidgetState(Object.assign({},api.widgetState||{},{approvedGrocery:data})); } catch(_) {}
    }
    async function agCall(name,args) {
      // Select one transport; never replay an ambiguous mutation through another.
      var api=getOpenAI(),transport=typeof api.callTool==='function'?'native':'bridge';
      if(transport==='native')return api.callTool(name,args);
      if(getBridgeTargets().length)return callToolViaBridge(name,args);
      throw new Error('Tool calls unavailable');
    }
    function agButton(label,action,cls) { var b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls||'';b.addEventListener('click',action);return b; }
    function agMessage(text) { ag.notice=text;clearTimeout(ag.noticeTimer);ag.noticeTimer=setTimeout(function(){ag.notice='';renderApprovedGrocery();},4000); }
    function agInit(vm) {
      ag.listId=vm.listId;
      try { var saved=JSON.parse(sessionStorage.getItem('fluent-approved-grocery:'+ag.listId)||'null')||getOpenAI().widgetState?.approvedGrocery;
        if(saved && saved.listId===ag.listId){ag.order=saved.order||[];ag.selected=new Map(saved.selected||[]);ag.quantityDrafts=new Map(saved.quantityDrafts||[]);ag.saved=new Map(saved.saved||[]);ag.expanded=!!saved.expanded;ag.grouped=!!saved.grouped;ag.draftName=saved.draftName||'';ag.draftQuantity=saved.draftQuantity||'';ag.add=!!saved.add;ag.job=saved.job;ag.activity=saved.activity||[];ag.queue=new Map(saved.queue||[]);if(!ag.job)ag.selected.clear();}
      } catch(_) {}
      root.innerHTML='<article class="ag"><header><div class="ag-top"><div><div class="ag-heading"><h1>Groceries</h1><p class="ag-count"></p></div><span class="ag-week"></span></div><div data-ag-controls></div></div><div class="ag-menu" hidden></div><form class="ag-form" hidden><input aria-label="Item name" placeholder="Item" required><input aria-label="Quantity" placeholder="Quantity"><button type="submit">Add to list</button></form></header><div class="ag-panel" hidden></div><div data-ag-list></div><div data-ag-more></div><footer><span role="status" aria-live="polite" data-ag-status></span><div data-ag-actions></div><p class="ag-error" role="alert" hidden></p></footer></article>';
      var controls=root.querySelector('[data-ag-controls]');
      controls.append(agButton('+ Add',function(){ag.add=!ag.add;agPersist();renderApprovedGrocery();if(ag.add)root.querySelector('input').focus();},'ag-add'));
      ag.options=agButton('⋯',function(){ag.menu=!ag.menu;renderApprovedGrocery();},'ag-options');ag.options.setAttribute('aria-label','List options');controls.append(ag.options);
      var form=root.querySelector('form'),inputs=form.querySelectorAll('input');form.append(agButton('Cancel',function(){ag.add=false;agPersist();renderApprovedGrocery();controls.querySelector('button').focus();},'ag-text-button'));
      inputs[0].value=ag.draftName;inputs[1].value=ag.draftQuantity;
      inputs[0].addEventListener('input',function(){ag.draftName=this.value;agPersist();});inputs[1].addEventListener('input',function(){ag.draftQuantity=this.value;agPersist();});
      form.addEventListener('submit',function(event){event.preventDefault();void agAdd();});
      document.addEventListener('click',function(e){if(ag.menu&&!root.querySelector('.ag-menu').contains(e.target)&&!ag.options.contains(e.target)){ag.menu=false;renderApprovedGrocery();}});
      root.addEventListener('keydown',function(event){if(event.key==='Escape'&&ag.menu){ag.menu=false;renderApprovedGrocery();ag.options.focus();}});
      if(ag.job){ag.error='Checking your previous change…';Promise.resolve().then(function(){void agCheck();});}else{Promise.resolve().then(function(){void agRefreshUI();});}
    }
    function renderApprovedGrocery() {
      var vm=getViewModel();if(!vm){renderEmpty();return;}
      if(!ag.listId)agInit(vm);
      root.querySelector('.ag').dataset.build='approved-authoritative-state-2';
      root.querySelector('.ag').dataset.theme=groceryHostTheme||getOpenAI().theme||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
      var allEntries=agEntries(vm);var entries=allEntries.filter(function(e){return e.bucket!=='covered'||ag.saved.has(e.key)||ag.selected.has(e.key);});ag.selected.forEach(function(snapshot,key){if(!entries.some(function(e){return e.key===key;})){entries.push(Object.assign({},snapshot.entry,{missing:true}));ag.conflicts.set(key,'This selected item is no longer on the list. Remove it from this selection.');}}); entries.forEach(function(e){if(!ag.order.includes(e.key))ag.order.push(e.key);}); entries.sort(function(a,b){return ag.order.indexOf(a.key)-ag.order.indexOf(b.key);}); var activeRow=document.activeElement?.closest('.ag-row'), activeKey=activeRow?.dataset.key; var different=vm.listId!==ag.listId,mutable=hostToolCapability==='mutable'&&!different;
      var count=entries.filter(function(e){return e.buy&&!e.missing&&!ag.saved.has(e.key);}).length;
      var gaps=entries.filter(function(e){return agGap(e)&&!e.missing;}).length;
      var check=entries.filter(function(e){return !e.buy&&!agGap(e)&&e.bucket!=='covered'&&!ag.saved.has(e.key);}).length;
      root.querySelector('.ag-count').textContent=count+' left'+(check?' · '+check+' to check':'')+(gaps?' · '+gaps+' meal'+(gaps===1?'':'s')+' not verified':'');
      root.querySelector('.ag-week').textContent=formatWeekStart(vm.weekStart)||'This week';
      root.querySelector('form').hidden=!ag.add;root.querySelectorAll('form input,form button').forEach(function(el){el.disabled=ag.busy||!!ag.job||!mutable;});
      ag.options.setAttribute('aria-expanded',String(ag.menu));
      var menu=root.querySelector('.ag-menu');menu.hidden=!ag.menu;menu.replaceChildren();
      
      if(ag.grouped)entries.sort(function(a,b){return groceryAisleOrder.indexOf(a.item.aisle)-groceryAisleOrder.indexOf(b.item.aisle)||ag.order.indexOf(a.key)-ag.order.indexOf(b.key);});
      if(ag.menu){[['Refresh list',function(){ag.menu=false;void agRefreshUI();}],[ag.grouped?'Remove aisle groups':'Group by aisle',function(){ag.grouped=!ag.grouped;ag.menu=false;agPersist();renderApprovedGrocery();ag.options.focus();}],['List details',function(){ag.panel='details';ag.menu=false;renderApprovedGrocery();}],['Activity',function(){ag.panel='activity';ag.menu=false;renderApprovedGrocery();}]].forEach(function(pair){menu.append(agButton(pair[0],pair[1],'ag-text-button'));});}
      var panel=root.querySelector('.ag-panel');panel.hidden=!ag.panel;panel.replaceChildren();
      if(ag.panel){panel.append(agButton('Back to list',function(){ag.panel='';renderApprovedGrocery();ag.options.focus();},'ag-text-button'));var p=document.createElement('p');p.textContent=ag.panel==='details'?(vm.staleReasons||[]).join(' ')||'List for '+(formatWeekStart(vm.weekStart)||vm.weekStart):ag.activity.length?'':'No changes recorded in this session.';panel.append(p);if(ag.panel==='details'){var covered=allEntries.filter(function(e){return e.bucket==='covered'&&!ag.saved.has(e.key);});if(covered.length){var title=document.createElement('p');title.textContent='Already covered';panel.append(title);covered.forEach(function(e){var item=document.createElement('p');item.className='ag-activity';item.textContent=e.item.displayName+(e.item.quantityDisplay?' · '+e.item.quantityDisplay:'');panel.append(item);});}}if(ag.panel==='activity')ag.activity.forEach(function(a){var line=document.createElement('p');line.className='ag-activity';line.textContent=a;panel.append(line);});}
      var list=root.querySelector('[data-ag-list]');list.hidden=!!ag.panel;
      if(entries.slice(10).some(function(e){return ag.selected.has(e.key)||ag.open.has(e.key);}))ag.expanded=true;
      var visible=ag.expanded?entries:entries.slice(0,10),seen=new Set();
      list.querySelectorAll('.ag-group').forEach(function(n){n.remove();});
      var group='';
      visible.forEach(function(entry){
        seen.add(entry.key);var row=ag.rows.get(entry.key);if(!row){row=document.createElement('div');row.className='ag-row';row.dataset.key=entry.key;ag.rows.set(entry.key,row);}
        var saved=ag.saved.get(entry.key),pending=ag.queue.get(entry.key),selected=pending?pending.checked:ag.selected.has(entry.key),covered=entry.bucket==='covered',conflict=ag.conflicts.get(entry.key);
        var signature=JSON.stringify([entry.item.displayName,entry.item.quantityDisplay,selected,saved,pending,covered,!!entry.buy,ag.open.has(entry.key),conflict,(!entry.buy&&!saved)?ag.busy:false,mutable]);
        if(row.dataset.signature!==signature){var focused=row.contains(document.activeElement);row.dataset.signature=signature;var retained=(entry.buy||saved)&&row.querySelector('.ag-toggle[role=checkbox]');if(!retained)row.replaceChildren();
          row.className='ag-row'+(selected?' ag-selected':'')+(saved&&(!pending||pending.checked)?' ag-saved':covered&&!pending?' ag-covered':'')+(pending?' ag-pending':'');
          var main=retained?row.querySelector('.ag-row-main'):document.createElement('div');main.className='ag-row-main';
          row._entry=entry;row._saved=saved;var toggle=retained||agButton('',function(){var entry=row._entry,saved=row._saved;if(entry.buy||saved){agToggle(entry);return;}else{if(ag.open.has(entry.key))ag.open.delete(entry.key);else ag.open.add(entry.key);}agPersist();renderApprovedGrocery();},'ag-toggle');
          toggle.disabled=!mutable||(!entry.buy&&!saved&&covered)||(!!saved&&typeof saved!=='object');
          if(entry.buy||saved||covered){toggle.setAttribute('role','checkbox');toggle.setAttribute('aria-checked',String(pending?pending.checked:selected||!!saved));}else toggle.setAttribute('aria-expanded',String(ag.open.has(entry.key)));
          toggle.setAttribute('aria-label',entry.item.displayName+', '+(entry.item.quantityDisplay||'')+(pending?', saving':saved?', purchase saved, uncheck to undo':covered?', already covered':selected?', selected to record':''));
          var mark=retained?row.querySelector('.ag-mark'):document.createElement('span');mark.className='ag-mark';mark.textContent=(pending?pending.checked:selected||!!saved)?'✓':covered&&!pending?'–':entry.buy||saved?'':ag.open.has(entry.key)?'⌄':'›';mark.setAttribute('aria-hidden','true');
          var copy=retained?row.querySelector('.ag-copy'):document.createElement('span');copy.className='ag-copy';var name=retained?row.querySelector('.ag-name'):document.createElement('span');name.className='ag-name';name.textContent=entry.item.displayName;var qty=retained?row.querySelector('.ag-qty'):document.createElement('span');qty.className='ag-qty';qty.textContent=entry.buy||saved||covered?entry.item.quantityDisplay||'':agGap(entry)?'Not verified':'Check at home';if(!retained){copy.append(name,qty);toggle.append(mark,copy);main.append(toggle);row.append(main);}
          if(!entry.buy&&!covered&&!saved&&ag.open.has(entry.key)){var disclosure=document.createElement('div');disclosure.className='ag-disclosure';var question=document.createElement('p');question.textContent=agGap(entry)?'Fluent could not verify the groceries for this meal. Compare its ingredients with this list, then confirm in the conversation.':'Do you need '+entry.item.displayName.toLowerCase()+'?';disclosure.append(question);if(entry.enough)disclosure.append(agButton('Have enough',function(){void agListAnswer(entry,entry.enough);}));if(entry.need)disclosure.append(agButton('Add to list',function(){void agListAnswer(entry,entry.need);}));if(!entry.enough&&!entry.need&&!agGap(entry)){question.textContent='Confirm the quantity with Fluent to update this item.';}disclosure.querySelectorAll('button').forEach(function(b){b.disabled=ag.busy||!!ag.job||!mutable;});row.append(disclosure);}
          if(conflict){var warning=document.createElement('div');warning.className='ag-disclosure';var text=document.createElement('p');text.textContent=conflict;warning.append(text);if(entry.buy&&!entry.missing)warning.append(agButton('Use '+(entry.item.quantityDisplay||'this item'),function(){ag.selected.set(entry.key,{entry:entry,fingerprint:agFingerprint(entry)});ag.conflicts.delete(entry.key);agPersist();renderApprovedGrocery();}));if(!entry.missing){var amount=document.createElement('input');amount.setAttribute('aria-label','Amount actually bought for '+entry.item.displayName);amount.placeholder='Amount you bought';amount.value=ag.quantityDrafts.get(entry.key)||'';amount.addEventListener('input',function(){ag.quantityDrafts.set(entry.key,this.value);agPersist();});warning.append(amount);warning.append(agButton('Continue with Fluent',function(){void agQuantityConversation(entry);}));}warning.append(agButton('Remove from selection',function(){if(ag.busy||ag.job)return;ag.selected.delete(entry.key);ag.conflicts.delete(entry.key);agPersist();renderApprovedGrocery();}));warning.querySelectorAll('button,input').forEach(function(b){b.disabled=ag.busy||!!ag.job||!mutable;});row.append(warning);}
          if(focused)toggle.focus();
        }
        var rowStatus=row.querySelector('.ag-row-status');if(!rowStatus){rowStatus=document.createElement('div');rowStatus.className='ag-row-status';row.append(rowStatus);}rowStatus.replaceChildren();if(ag.job?.key===entry.key&&ag.error){rowStatus.classList.add('ag-row-error');rowStatus.append(document.createTextNode('Not saved yet.'));rowStatus.append(agButton('Check',function(){void agCheck();}));if(ag.job.retryAllowed)rowStatus.append(agButton('Retry',function(){void agRetry();}));}else{rowStatus.classList.remove('ag-row-error');if(pending)rowStatus.textContent='Saving…';}
        if(ag.grouped){var aisle=entry.item.aisle||'Other';if(aisle!==group){group=aisle;var heading=document.createElement('div');heading.className='ag-group';heading.textContent=aisle;list.append(heading);}}
        list.append(row);
      });
      ag.rows.forEach(function(row,key){if(!seen.has(key))row.remove();});
      var more=root.querySelector('[data-ag-more]');more.hidden=!!ag.panel;more.replaceChildren();if(entries.length>10)more.append(agButton(ag.expanded?'Show less ↑':'Show all '+entries.length+' items ↓',function(){ag.expanded=!ag.expanded;agPersist();renderApprovedGrocery();if(!ag.expanded)root.querySelector('header').scrollIntoView({block:'nearest',behavior:'auto'});},'ag-text-button'));
      var actions=root.querySelector('[data-ag-actions]');actions.replaceChildren();
      if(ag.job&&ag.job.kind!=='checkbox'){actions.append(agButton('Check status',function(){void agCheck();}));if(ag.job.retryAllowed)actions.append(agButton(ag.job.kind==='purchase'?'Retry purchase':'Retry change',function(){void agRetry();}));}
      else if(ag.retryRead)actions.append(agButton('Retry check',function(){void agRefreshUI();}));

      actions.querySelectorAll('button').forEach(function(b){if(ag.busy)b.disabled=true;});
      root.querySelector('[data-ag-status]').textContent=ag.draining?'Saving…':ag.busy?'Checking…':ag.notice||(!mutable?'Ask Fluent in the conversation to update this list.':ag.selected.size?'':gaps?'Groceries for '+gaps+' meal'+(gaps===1?' are':'s are')+' not verified yet. Ask Fluent to check '+(gaps===1?'it':'them')+' before you shop.':count?'Check items as you buy them. Uncheck to undo.':check?'Check the remaining items at home.':'Nothing left to get.');
      var error=root.querySelector('.ag-error');error.hidden=!(different||(ag.error&&ag.job?.kind!=='checkbox'));error.textContent=different?'This is a different list. Reopen it to make changes.':ag.error;
      if(activeKey){var focusRow=ag.rows.get(activeKey);if(focusRow&&focusRow.isConnected)focusRow.querySelector('button:not(:disabled)')?.focus();} notifyHeight();
    }
    async function agQuantityConversation(entry){
      if(ag.busy||ag.job)return;var amount=(ag.quantityDrafts.get(entry.key)||'').trim();if(!amount){ag.error='Enter the amount you bought.';renderApprovedGrocery();return;}
      var text='I bought '+entry.item.displayName+': '+amount+'. The quantity changed on my grocery list for '+getViewModel().weekStart+'. Please help record this exact amount using the current Fluent list and supported actions. This item has not been recorded by the widget; keep other selected items unchanged.';
      ag.busy=true;ag.error='';renderApprovedGrocery();try{var api=getOpenAI();var result;
        if(typeof api.sendFollowUpMessage==='function')result=await api.sendFollowUpMessage({prompt:text});
        else if(getBridgeTargets().length)result=await bridgeRequest('ui/message',{role:'user',content:[{type:'text',text:text}]},20000);
        else throw new Error('Conversation unavailable');
        if(result?.isError)throw new Error('Conversation rejected');agMessage('Continue in the conversation. Nothing recorded here.');
      }catch(_){ag.error='Tell Fluent in the conversation: “I bought '+amount+' of '+entry.item.displayName+'.” Nothing has been recorded here.';}finally{ag.busy=false;renderApprovedGrocery();}
    }
    async function agRefresh() {
      var vm=getViewModel(),result=await agCall('fluent_render_surface',{surface:'meals_grocery_list',week_start:vm.weekStart});
      var next=result?._meta?.groceryList||result?.toolResponseMetadata?.groceryList||findGroceryList(result);var rawList=findAuthoritativeBundle(result)?.groceryList;var hostMeta=getOpenAI().toolResponseMetadata;if(!next&&hostMeta?.groceryList?.listId===rawList?.listId&&hostMeta?.groceryList?.version===rawList?.version)next=hostMeta.groceryList;if(!next||!Array.isArray(next.buckets)||next.listId!==ag.listId){console.warn('[Fluent grocery] '+JSON.stringify({stage:'refresh-readback',hasList:!!next,hasBuckets:Array.isArray(next?.buckets),sameList:next?.listId===ag.listId}));throw new Error('Same-list readback unavailable');}
      var evidence=result?._meta?.groceryShoppingEvidence||result?.toolResponseMetadata?.groceryShoppingEvidence;
      ag.evidence=evidence?.groceryList?.listId===next.listId&&evidence?.groceryList?.version===next.version?evidence:null;
      var entries=agEntries(normalizeGroceryListForWidget(next));agPruneSaved(entries);ag.conflicts.clear();
      if(Array.isArray(ag.evidence?.checkboxPurchases)){
        ag.saved.forEach(function(value,key){if(typeof value==='object')ag.saved.delete(key);});
        ag.evidence.checkboxPurchases.forEach(function(purchase){var entry=agPurchasedEntry(entries,purchase);if(entry)ag.saved.set(entry.key,purchase);});
      }
      ag.selected.forEach(function(snapshot,key){var entry=entries.find(function(e){return e.key===key;});if(!entry)ag.conflicts.set(key,'This selected item is no longer on the list.');else if(agFingerprint(entry)!==snapshot.fingerprint)ag.conflicts.set(key,'Changed on the list: '+(snapshot.entry.item.quantityDisplay||'unknown quantity')+' → '+(entry.item.quantityDisplay||'unknown quantity')+'. How much did you buy?');});
      publishViewModel(next,{clearMissingLocalEdits:true});ag.retryRead=false;return getViewModel();
    }
    async function agRefreshUI() {if(ag.busy)return;ag.busy=true;ag.error='';renderApprovedGrocery();try{await agRefresh();if(ag.conflicts.size)ag.error='A selected item changed. Check its quantity before recording.';}catch(_){ag.retryRead=true;ag.error='Couldn’t check for the latest list. Your selection is kept.';}finally{ag.busy=false;renderApprovedGrocery();if(!ag.error)void agDrain();}}
    function agPurchasedEntry(entries,purchase){
      var covered=entries.filter(function(e){return e.bucket==='covered';});
      var exact=covered.filter(function(e){return (e.item.manualIntentId||e.key)===purchase.itemKey;});
      if(exact.length===1)return exact[0];
      var named=covered.filter(function(e){return String(e.item.displayName).trim().toLowerCase()===String(purchase.name).trim().toLowerCase();});
      return named.length===1?named[0]:null;
    }
    function agQueueFingerprint(entry){return JSON.stringify([entry.item.displayName,entry.item.quantityDisplay,entry.item.manualIntentId||entry.key]);}
    function agToggle(entry){
      var current=ag.queue.get(entry.key),checked=current?current.checked:!!ag.saved.get(entry.key);
      ag.queue.set(entry.key,{entry:entry,checked:!checked,fingerprint:agQueueFingerprint(entry)});
      ag.error='';agPersist();renderApprovedGrocery();void agDrain();
    }
    async function agDrain(){
      if(ag.draining||ag.busy||ag.job||!ag.queue.size)return;
      ag.draining=true;ag.busy=true;renderApprovedGrocery();
      try{while(ag.queue.size&&!ag.job){
        var key=ag.queue.keys().next().value;await agRefresh();var pending=ag.queue.get(key);if(!pending)continue;
        var saved=ag.saved.get(key);if(pending.checked===!!saved){ag.queue.delete(key);agPersist();continue;}
        var vm=getViewModel(),entry=agEntries(vm).find(function(e){return e.key===key;});
        if(!entry||pending.checked&&(!entry.buy||agQueueFingerprint(entry)!==pending.fingerprint)){
          ag.queue.delete(key);agPersist();ag.error='This item changed. Review it before checking it again.';break;
        }
        var itemKey=pending.checked?shoppingResultItemKey({item:entry.item,action:entry.buy}):saved.itemKey;
        var args={approval:'explicit_user_approved',selection:{kind:'item_checkbox',item_key:itemKey,checked:pending.checked},
          list_id:vm.listId,list_version:vm.version,week_start:vm.weekStart,idempotency_key:'grocery-checkbox-'+crypto.randomUUID(),response_mode:'full'};
        if(!pending.checked)args.selection.purchase_id=saved.purchaseId;
        ag.job={kind:'checkbox',key:key,args:args};agPersist();
        try{await agCall('fluent_apply_grocery_shopping_result',args);}catch(_){}
        await agReconcile();
      }}catch(_){ag.retryRead=!ag.job;ag.error='Couldn’t confirm your change. Your items are kept for retry.';}
      finally{ag.draining=false;ag.busy=false;agPersist();renderApprovedGrocery();}
    }
    async function agRecord() {
      if(ag.busy||ag.job||!ag.selected.size)return;ag.busy=true;ag.error='';renderApprovedGrocery();
      try{var vm=await agRefresh();if(ag.conflicts.size){ag.error='A selected item changed. Check its quantity before recording.';return;}if(vm.stale){ag.error='This list is from an earlier plan. Ask Fluent to check the selected items.';return;}
        var entries=agEntries(vm),chosen=Array.from(ag.selected.keys()).map(function(key){return entries.find(function(e){return e.key===key&&e.buy;});});if(chosen.some(function(e){return !e;}))throw new Error('Selected item unavailable');
        var id='grocery-'+crypto.randomUUID(),args={approval:'explicit_user_approved',selection:{kind:'selected_items',bought_items:chosen.map(function(e){return {item_key:shoppingResultItemKey({item:e.item,action:e.buy}),status:'bought'};})},list_id:vm.listId,list_version:vm.version,week_start:vm.weekStart,idempotency_key:id,response_mode:'full'};
        ag.job={kind:'purchase',args:args,entries:chosen};agPersist();try{await agCall('fluent_apply_grocery_shopping_result',args);}catch(_){}await agReconcile();
      }catch(_){ag.retryRead=!ag.job;ag.error='Couldn’t confirm this purchase. Your selection is kept.';}finally{ag.busy=false;renderApprovedGrocery();}
    }
    async function agReconcile() {
      var job=ag.job;if(!job)return;
      if(job.kind==='checkbox'){
        await agRefresh();var receipt=ag.evidence?.receipts?.find(function(r){return r.idempotencyKey===job.args.idempotency_key;});
        if(!receipt?.checkbox||receipt.checkbox.itemKey!==job.args.selection.item_key||receipt.checkbox.checked!==job.args.selection.checked){
          job.retryAllowed=ag.evidence?.receiptsComplete===true&&!receipt;agPersist();ag.error='Couldn’t confirm this change. Check status or retry.';return;
        }
        var pending=ag.queue.get(job.key);if(pending&&pending.checked===job.args.selection.checked)ag.queue.delete(job.key);
        ag.job=null;ag.error='';agPersist();agMessage(receipt.checkbox.checked?'Purchase saved':'Purchase undone');return;
      }
      if(job.kind!=='purchase'){
        var refreshed=await agRefresh(),current=agEntries(refreshed),settled=false;
        if(job.kind==='list'&&job.key){var item=current.find(function(e){return e.key===job.key;});settled=!!item&&(job.status==='already_have_enough'?item.bucket==='covered':!!item.buy);}
        if(job.kind==='add'){
          var raw=ag.evidence?.groceryList;if(!raw)throw new Error('Authoritative list evidence unavailable');
          settled=raw?.listId===ag.listId&&(raw.intents||[]).some(function(i){return i.displayName.trim().toLowerCase()===job.name.toLowerCase()&&i.status==='pending'&&(i.quantity??null)===(job.args.change.quantity??null)&&(i.unit||'')===(job.args.change.unit||'');});
        }
        if(!settled){job.retryAllowed=refreshed.version===job.args.list_version;agPersist();ag.error=job.retryAllowed?'This change is not confirmed. You can retry the same change.':'The list has changed. Check this item with Fluent before trying again.';return;}
        if(job.kind==='list')ag.open.delete(job.key);
        if(job.kind==='add'){ag.expanded=true;ag.draftName='';ag.draftQuantity='';ag.add=false;root.querySelectorAll('form input').forEach(function(i){i.value='';});}
        ag.activity.unshift('List updated. Kitchen unchanged.');ag.job=null;ag.error='';agPersist();agMessage('List updated');return;
      }
      var next=await agRefresh(),bundle=ag.evidence;
      if(!bundle||!Array.isArray(bundle.receipts)||!Array.isArray(bundle.inventory))throw new Error('Authoritative purchase evidence unavailable');
      if(bundle.groceryList?.weekStart!==job.args.week_start)throw new Error('Purchase evidence belongs to a different week');
      var receipt=bundle.receipts.find(function(r){return r?.idempotencyKey===job.args.idempotency_key;});var inventory=bundle.inventory;
      var confirmed=receipt&&receipt.idempotencyKey===job.args.idempotency_key&&receipt.listId===ag.listId&&receipt.outcome==='confirmed'&&job.args.selection.bought_items.every(function(item){var row=receipt.rows?.find(function(r){return r.itemKey===item.item_key&&r.requestedStatus==='bought';});return row?.outcome==='confirmed'&&row.result?.inventoryRefreshed===true&&inventory.some(function(i){return i.status==='present'&&String(i.name).trim().toLowerCase()===String(row.result.name).trim().toLowerCase();});});
      var entries=agEntries(next);
      confirmed=confirmed&&job.entries.every(function(old){return entries.some(function(e){return e.bucket==='covered'&&(e.key===old.key||e.item.manualIntentId===shoppingResultItemKey({item:old.item,action:old.buy}));});});
      if(!confirmed){job.retryAllowed=bundle?.groceryList?.listId===ag.listId&&bundle.receiptsComplete===true&&!receipt;agPersist();ag.error=job.retryAllowed?'No purchase was found. You can retry the same purchase.':'This purchase is not confirmed yet. Check status before trying again.';return;}
      job.entries.forEach(function(e){ag.saved.set(e.key,true);ag.selected.delete(e.key);ag.conflicts.delete(e.key);});ag.activity.unshift('Purchase saved: '+job.entries.map(function(e){return e.item.displayName+(e.item.quantityDisplay?' · '+e.item.quantityDisplay:'');}).join(', ')+'. List and kitchen updated.');ag.job=null;ag.error='';agPersist();agMessage('Purchase saved');
    }
    async function agCheck(){if(ag.busy||!ag.job)return;ag.busy=true;renderApprovedGrocery();try{await agReconcile();}catch(_){ag.error='Couldn’t check the saved result. Your change is kept.';}finally{ag.busy=false;renderApprovedGrocery();void agDrain();}}
    async function agRetry(){if(ag.busy||!ag.job||!ag.job.retryAllowed)return;ag.busy=true;ag.error='';ag.job.retryAllowed=false;agPersist();renderApprovedGrocery();try{try{await agCall((ag.job.kind==='purchase'||ag.job.kind==='checkbox')?'fluent_apply_grocery_shopping_result':'fluent_apply_grocery_list_change',ag.job.args);}catch(_){}await agReconcile();}catch(_){ag.error='Couldn’t confirm this purchase. Check status before trying again.';}finally{ag.busy=false;renderApprovedGrocery();void agDrain();}}
    async function agListAnswer(entry,action) {
      if(ag.busy||ag.job)return;ag.busy=true;ag.error='';renderApprovedGrocery();
      try{var vm=await agRefresh(),fresh=agEntries(vm).find(function(e){return e.key===entry.key;});if(!fresh||agFingerprint(fresh)!==agFingerprint(entry))throw new Error('Item changed');var allowed=fresh.actions.find(function(a){return a.id===action.id;});if(!allowed||vm.stale)throw new Error('Item needs review');
        var change=allowed.args?.change?cloneJson(allowed.args.change):{kind:'mark_plan_item',item_key:allowed.args?.item_key||entry.key,status:action.id==='already_have_enough'?'already_have_enough':'needs_purchase'};
        var args=publicGroceryListChangeArgs(vm,change,{});ag.job={kind:'list',args:args,key:entry.key,status:change.status};agPersist();try{await agCall('fluent_apply_grocery_list_change',args);}catch(_){}await agReconcile();
      }catch(_){ag.error=ag.job?'This list change is not confirmed. Check status before trying again.':'This item changed. Check it with Fluent.';}finally{ag.busy=false;renderApprovedGrocery();}
    }
    async function agAdd(){if(ag.busy||ag.job||!ag.draftName.trim())return;ag.busy=true;ag.error='';renderApprovedGrocery();try{var vm=await agRefresh(),name=ag.draftName.trim(),quantity=ag.draftQuantity.trim();var beforeKeys=new Set(agEntries(vm).map(function(e){return e.key;}));var change={kind:'add_item',display_name:name};if(quantity){var parsed=quantity.match(/^([0-9]+(?:[.][0-9]+)?)\s*(.*)$/);if(!parsed||!Number.isFinite(Number(parsed[1]))||Number(parsed[1])<=0){ag.error='Enter a quantity such as 2 bags or leave it blank.';return;}change.quantity=Number(parsed[1]);if(parsed[2])change.unit=parsed[2];}
      var args=publicGroceryListChangeArgs(vm,change,{});ag.job={kind:'add',args:args,name:name,beforeKeys:Array.from(beforeKeys)};agPersist();try{await agCall('fluent_apply_grocery_list_change',args);}catch(_){}await agReconcile();
    }catch(_){ag.error='Couldn’t confirm the new item. Your draft is kept.';}finally{ag.busy=false;renderApprovedGrocery();}}
`;


