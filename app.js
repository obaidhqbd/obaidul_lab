/* Obaidul Mentor Lab - client-side learning workspace */
(() => {
  'use strict';

  const state = {
    catalog: null,
    password: null,
    current: null,
    monaco: null,
    editor: null,
    models: new Map(),
    files: new Map(),
    originalZip: null,
    saveTimer: null,
    hintIndex: 0,
    selectionToken: 0,
    dark: localStorage.getItem('oml:theme') !== 'light'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const els = {
    year: $('#year'), toast: $('#toast'), heroAccess: $('#hero-access'), lock: $('#lock-button'),
    classGrid: $('#class-grid'), blogGrid: $('#blog-grid'), classSearch: $('#class-search'), blogSearch: $('#blog-search'),
    workspaceTitle: $('#workspace-title'), workspaceSubtitle: $('#workspace-subtitle'), fileList: $('#file-list'), fileCount: $('#file-count'),
    editor: $('#editor'), fallback: $('#fallback-editor'), activeFile: $('#active-file'), saveState: $('#save-state'),
    preview: $('#preview-frame'), refreshPreview: $('#refresh-preview'), openPreview: $('#open-preview'), format: $('#format-code'),
    originalZip: $('#download-original'), editedZip: $('#download-edited'), taskList: $('#task-list'), taskProgress: $('#task-progress-label'), hintBox: $('#hint-box'),
    unlockForm: $('#unlock-form'), password: $('#access-password'), unlockError: $('#unlock-error'), article: $('#article-content'), articleBack: $('#article-back'), theme: $('#theme-toggle')
  };
  els.year.textContent = new Date().getFullYear();
  function setBrandFromCatalog(site){
    if(!site) return;
    const brandName = site.name || 'Obaidul Mentor Lab';
    const role = site.role || 'web development mentor';
    const mentor = site.mentor || 'Obaidul';
    document.title = brandName;
    document.querySelectorAll('.brand-copy strong').forEach(el=>el.textContent=brandName);
    document.querySelectorAll('.site-footer strong').forEach(el=>el.textContent=brandName);
    document.querySelectorAll('.site-footer span').forEach(el=>{ if(el.textContent.trim()==='web development mentor') el.textContent=role; });
    const p=$('#portfolio-link');
    if(p){
      if(site.portfolioUrl){p.href=site.portfolioUrl;p.textContent=`${site.portfolioLabel||'Portfolio'} ↗`;p.hidden=false;}
      else p.hidden=true;
    }
  }
  loadJson('./data/site.json').then(setBrandFromCatalog).catch(()=>{});

  function toast(msg) {
    els.toast.textContent = msg; els.toast.classList.add('show'); clearTimeout(toast.t);
    toast.t = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function setTheme() {
    document.body.classList.toggle('light', !state.dark);
    els.theme.textContent = state.dark ? '☼' : '☾';
    localStorage.setItem('oml:theme', state.dark ? 'dark' : 'light');
  }
  setTheme(); els.theme.addEventListener('click', () => { state.dark = !state.dark; setTheme(); });

  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('active-view', v.dataset.view === name));
    $$('.topnav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  window.addEventListener('hashchange', route);
  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }
  function route() {
    const rawHash = location.hash.replace(/^#/, '');
    const [name, rawId] = rawHash.split('/');
    const id = safeDecode(rawId || '');
    const query = new URLSearchParams(location.search);
    const queryClass = safeDecode(query.get('class') || '');
    const queryBlog = safeDecode(query.get('blog') || '');

    if (queryClass) {
      if (!state.catalog) { state.pendingRoute = {type:'class', id:queryClass}; showView('login'); return; }
      openClass(queryClass); return;
    }
    if (queryBlog) {
      if (!state.catalog) { state.pendingRoute = {type:'article', id:queryBlog}; showView('login'); return; }
      openArticle(queryBlog); return;
    }
    if (!name || name === 'home') { showView('home'); return; }
    if (name === 'classes') { requireUnlock('classes'); return; }
    if (name === 'blogs') { requireUnlock('blogs'); return; }
    if (name === 'workspace') { state.current ? showView('workspace') : requireUnlock('workspace'); return; }
    if (name === 'article' && id) {
      if (!state.catalog) { state.pendingRoute = {type:'article', id}; showView('login'); return; }
      openArticle(id); return;
    }
    showView('home');
  }
  $$('[data-route]').forEach(a => a.addEventListener('click', e => {
    const r = a.dataset.route;
    if (r === 'home') return;
    e.preventDefault();
    requireUnlock(r);
    history.replaceState(null, '', `#${r}`);
  }));

  function requireUnlock(target) {
    if (state.catalog) { showView(target); return; }
    state.pendingRoute = typeof target === 'string' ? {type:'view', view:target} : target;
    showView('login');
    els.password.focus();
  }

  els.heroAccess.addEventListener('click', () => requireUnlock('classes'));
  els.lock.addEventListener('click', () => {
    state.catalog = null; state.password = null; state.current = null; state.files.clear(); state.originalZip = null;
    destroyEditor(); els.preview.srcdoc = ''; els.fileList.innerHTML = ''; els.taskList.innerHTML = '';
    showView('home'); els.lock.hidden = true; state.pendingRoute = null;
    history.replaceState(null, '', '#home');
    toast('Library locked on this browser.');
  });

  async function loadJson(path) {
    const res = await fetch(path, {cache:'no-store'}); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json();
  }

  function hexToBytes(hex) { return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b,16))); }
  function base64ToBytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i=0;i<s.length;i++) out[i]=s.charCodeAt(i); return out; }
  async function deriveKey(password, envelope) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:hexToBytes(envelope.salt),iterations:envelope.iterations,hash:'SHA-256'}, base, {name:'AES-GCM',length:256}, false, ['decrypt']);
  }
  async function decryptEnvelope(envelope, password) {
    const key = await deriveKey(password, envelope);
    const iv = base64ToBytes(envelope.iv), tag = base64ToBytes(envelope.tag), data = base64ToBytes(envelope.data);
    const full = new Uint8Array(data.length + tag.length); full.set(data); full.set(tag, data.length);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128,additionalData:new TextEncoder().encode(envelope.aad || '')}, key, full);
    return new Uint8Array(plain);
  }
  function bytesToText(bytes){ return new TextDecoder().decode(bytes); }

  els.unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault(); els.unlockError.textContent = 'Checking…';
    try {
      const envelope = await loadJson('./data/catalog.enc.json');
      const plain = await decryptEnvelope(envelope, els.password.value);
      const catalog = JSON.parse(bytesToText(plain));
      if (!catalog || !Array.isArray(catalog.classes) || !Array.isArray(catalog.blogs)) throw new Error('Invalid catalog');
      setBrandFromCatalog(catalog.site);
      state.password = els.password.value; state.catalog = catalog; els.password.value=''; els.unlockError.textContent=''; els.lock.hidden=false;
      renderCatalog(); toast('Student library unlocked.');
      const pending = state.pendingRoute; state.pendingRoute = null;
      if (pending?.type === 'class') openClass(pending.id);
      else if (pending?.type === 'article') openArticle(pending.id);
      else showView(pending?.view || 'classes');
    } catch (err) {
      console.error(err); els.unlockError.textContent='That password did not unlock the student library.'; els.password.select();
    }
  });

  function renderCatalog() {
    renderClasses(); renderBlogs();
  }
  function card(item, type) {
    const tags = (item.tags || []).slice(0,4).map(t=>`<span class="badge">${escapeHtml(t)}</span>`).join('');
    const action = type==='class' ? `open-class="${escapeAttr(item.id)}"` : `open-blog="${escapeAttr(item.id)}"`;
    return `<article class="content-card"><div><div class="badge-row">${tags || `<span class="badge">${type}</span>`}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || item.summary || '')}</p></div><div class="card-meta"><span>${escapeHtml(item.level||'All levels')}</span><button class="tiny-btn" ${action}>${type==='class'?'Open class':'Read article'} →</button></div></article>`;
  }
  function renderClasses() {
    const q=els.classSearch.value.trim().toLowerCase(); const list=[...(state.catalog?.classes||[])]
      .sort((a,b)=>(Number(a.order??999)-Number(b.order??999)) || String(a.title).localeCompare(String(b.title)))
      .filter(x=>`${x.title} ${x.description} ${(x.tags||[]).join(' ')}`.toLowerCase().includes(q));
    els.classGrid.innerHTML=list.map(x=>card(x,'class')).join(''); $('#classes-empty').hidden=list.length>0;
    $$('[open-class]').forEach(b=>b.addEventListener('click',()=>openClass(b.getAttribute('open-class'))));
  }
  function renderBlogs() {
    const q=els.blogSearch.value.trim().toLowerCase(); const list=[...(state.catalog?.blogs||[])]
      .sort((a,b)=>(Number(a.order??999)-Number(b.order??999)) || String(a.title).localeCompare(String(b.title)))
      .filter(x=>`${x.title} ${x.description} ${(x.tags||[]).join(' ')}`.toLowerCase().includes(q));
    els.blogGrid.innerHTML=list.map(x=>card(x,'blog')).join(''); $('#blogs-empty').hidden=list.length>0;
    $$('[open-blog]').forEach(b=>b.addEventListener('click',()=>openArticle(b.getAttribute('open-blog'))));
  }
  els.classSearch.addEventListener('input', renderClasses); els.blogSearch.addEventListener('input', renderBlogs);

  async function openClass(id) {
    if (!state.catalog || !state.password) { state.pendingRoute={type:'class',id}; showView('login'); return; }
    const meta = state.catalog.classes.find(x=>x.id===id); if(!meta) { toast('Class not found in the current library.'); return; }
    toast('Opening class…');
    try {
      const env = await loadJson(meta.resource);
      const zipBytes = await decryptEnvelope(env, state.password);
      const zip = await JSZip.loadAsync(zipBytes);
      const files = new Map();
      for (const name of Object.keys(zip.files)) {
        const f = zip.files[name];
        if (f.dir) continue;
        files.set(normalizePath(name), await f.async('uint8array'));
      }
      if (!files.size) throw new Error('The class package contains no files.');
      state.current={meta, type:'class'};
      state.files=files;
      state.originalZip=zipBytes;
      await openWorkspace();
      history.replaceState(null, '', `#workspace`);
    } catch(err) {
      console.error('Class open failed:', err);
      toast('This class could not be opened. The package may be invalid or unavailable.');
    }
  }

  async function openWorkspace(){
    showView('workspace'); els.workspaceTitle.textContent=state.current.meta.title; els.workspaceSubtitle.textContent=state.current.meta.description||'';
    els.fileCount.textContent=`${state.files.size} files`; els.fileList.innerHTML='';
    destroyEditor();
    const names=[...state.files.keys()].sort((a,b)=>fileSort(a)-fileSort(b));
    names.forEach((name)=>{ const b=document.createElement('button'); b.className='file-item'; b.dataset.file=name; b.innerHTML=`<span>${fileIcon(name)}</span><span>${escapeHtml(name)}</span>`; b.addEventListener('click',()=>selectFile(name)); els.fileList.appendChild(b); });
    const first=names.find(n=>/\.(html?|css)$/i.test(n)) || names[0]; if(first) await selectFile(first); renderTasks();
    els.originalZip.disabled=false; els.editedZip.disabled=false;
  }
  function fileSort(a){ if(/^index\.html$/i.test(a)) return -10; if(/\.html?$/i.test(a)) return 0; if(/\.css$/i.test(a)) return 1; return 2; }
  function fileIcon(n){ if(/\.html?$/i.test(n)) return '◇'; if(/\.css$/i.test(n)) return '#'; if(/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(n)) return '▧'; return '·'; }
  function textFile(n){ return /\.(html?|css|md|txt|json)$/i.test(n); }
  function normalizePath(p){ return p.replace(/\\/g,'/').replace(/^\.\//,''); }

  async function readSaved(classId, file){
    try { const v=localStorage.getItem(`oml:code:${classId}:${file}`); return v===null?null:v; } catch { return null; }
  }
  function saveFile(classId,file,text){ try{ localStorage.setItem(`oml:code:${classId}:${file}`,text); }catch{} }

  async function selectFile(name){
    const token=++state.selectionToken;
    $$('.file-item').forEach(b=>b.classList.toggle('active',b.dataset.file===name));
    els.activeFile.textContent=name;
    if(!textFile(name)){
      els.fallback.value='Binary/asset file. Use the live preview or download it.';
      toggleFallback(true);
      return;
    }
    const bytes=state.files.get(name);
    if(!bytes){ toast('File data is unavailable.'); return; }
    let text=bytesToText(bytes);
    const saved=await readSaved(state.current.meta.id,name);
    if(token!==state.selectionToken) return;
    if(saved!==null) text=saved;
    await setupEditor(name,text);
    if(token!==state.selectionToken) return;
    updatePreviewDebounced();
  }
  function toggleFallback(on){ els.editor.style.display=on?'none':''; els.fallback.hidden=!on; }
  function langFor(name){ if(/\.css$/i.test(name)) return 'css'; if(/\.json$/i.test(name)) return 'json'; if(/\.html?$/i.test(name)) return 'html'; return 'plaintext'; }

  async function setupEditor(name,text){
    if(!state.monaco) state.monaco=await Promise.race([window.monacoReady, new Promise(r=>setTimeout(()=>r(null), 9500))]);
    if(state.monaco){
      toggleFallback(false);
      const lang=langFor(name); let model=state.models.get(name);
      if(model) model.setValue(text); else { model=state.monaco.editor.createModel(text,lang, state.monaco.Uri.parse(`inmemory://model/${encodeURIComponent(name)}`)); state.models.set(name,model); }
      if(!state.editor){ state.editor=state.monaco.editor.create(els.editor,{model,fontSize:13,lineHeight:20,theme:state.dark?'vs-dark':'vs',automaticLayout:true,minimap:{enabled:false},wordWrap:'on',padding:{top:10},scrollBeyondLastLine:false,tabSize:2,insertSpaces:true,formatOnPaste:true,formatOnType:false,suggest:{showMethods:true,showFunctions:true,showConstructors:true}}); state.editor.onDidChangeModelContent(()=>onEditorChange()); }
      else state.editor.setModel(model);
      state.monaco.editor.setTheme(state.dark?'vs-dark':'vs');
      state.editor.focus();
    } else {
      toggleFallback(true); els.fallback.value=text; els.fallback.oninput=onEditorChange; els.fallback.focus();
    }
  }
  function destroyEditor(){ state.models.forEach(m=>m.dispose()); state.models.clear(); if(state.editor){state.editor.dispose();state.editor=null;} toggleFallback(false); }
  function currentText(){ if(!state.current || !els.activeFile.textContent) return ''; if(state.editor) return state.editor.getValue(); return els.fallback.value; }
  function onEditorChange(){
    const file=els.activeFile.textContent; if(!state.current || !file) return; saveFile(state.current.meta.id,file,currentText()); els.saveState.textContent='Saved locally';
    clearTimeout(state.saveTimer); state.saveTimer=setTimeout(()=>{state.saveState.textContent='Autosaved';updatePreview();},450);
  }
  function updatePreviewDebounced(){ clearTimeout(state.previewTimer); state.previewTimer=setTimeout(updatePreview,180); }
  function archivePath(value){
    const raw=normalizePath(String(value||'').split('#')[0].split('?')[0]);
    if(!raw) return '';
    const parts=[];
    for(const part of raw.split('/')){
      if(!part || part==='. ') continue;
      if(part==='..'){ parts.pop(); continue; }
      if(part!=='.') parts.push(part);
    }
    return parts.join('/');
  }
  function resolveArchivePath(ref,baseFile=''){
    const raw=String(ref||'');
    if(!raw || /^(?:[a-z]+:|\/\/|data:|#)/i.test(raw)) return '';
    const base=baseFile.includes('/')?baseFile.slice(0,baseFile.lastIndexOf('/')+1):'';
    return archivePath(`${base}${raw}`);
  }
  function fileForReference(ref,baseFile=''){
    const clean=resolveArchivePath(ref,baseFile);
    const candidates=[clean,normalizePath(ref),[...state.files.keys()].find(k=>normalizePath(k).endsWith('/'+clean))].filter(Boolean);
    return candidates.find(x=>state.files.has(x)) || null;
  }
  function inlineCssAssets(css,cssFile){
    return String(css||'').replace(/url\((["']?)([^)"']+)\1\)/gi,(m,q,p)=>{
      const key=fileForReference(p.trim(),cssFile); if(!key) return m;
      const b=state.files.get(key); const ext=key.split('.').pop().toLowerCase();
      const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'}[ext]||'application/octet-stream';
      let s=''; for(let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
      return `url(${q}data:${mime};base64,${btoa(s)}${q})`;
    });
  }
  function updatePreview(){
    if(!state.current) return;
    const htmlName=[...state.files.keys()].find(n=>/^index\.html$/i.test(n)) || [...state.files.keys()].find(n=>/\.html?$/i.test(n));
    if(!htmlName) return;
    let doc=getFileText(htmlName);
    const cssFiles=[...state.files.keys()].filter(n=>/\.css$/i.test(n));
    for(const c of cssFiles){
      const css=inlineCssAssets(getFileText(c),c);
      const escapedCandidates=[c,c.split('/').pop(),resolveArchivePath(c,htmlName)];
      let replaced=false;
      for(const href of escapedCandidates.filter(Boolean)){
        const rx=new RegExp(`<link([^>]+)href=["']${escapeRegExp(href)}["']([^>]*)>`, 'ig');
        if(rx.test(doc)){ doc=doc.replace(rx,`<style data-source="${escapeAttr(c)}">\n${css}\n</style>`); replaced=true; break; }
      }
      if(!replaced && cssFiles.length===1) {
        doc=doc.replace(/<\/head>/i,`<style data-source="${escapeAttr(c)}">\n${css}\n</style></head>`);
      }
    }
    doc=doc.replace(/(<img[^>]+src=)["']([^"']+)["']/gi,(m,p,q)=>{
      const key=fileForReference(q,htmlName); if(!key) return m;
      const b=state.files.get(key); const ext=key.split('.').pop().toLowerCase();
      const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',avif:'image/avif'}[ext]||'application/octet-stream';
      let s=''; for(let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
      return `${p}"data:${mime};base64,${btoa(s)}"`;
    });
    els.preview.srcdoc=doc;
  }

  els.refreshPreview.addEventListener('click',updatePreview); els.openPreview.addEventListener('click',()=>{const w=window.open();if(w){w.document.open();w.document.write(els.preview.srcdoc);w.document.close();}});
  els.format.addEventListener('click',()=>{
    if(!state.editor) return toast('Use Monaco formatting or the browser fallback.');
    state.editor.getAction('editor.action.formatDocument')?.run().then(()=>toast('Formatter applied.')).catch(()=>toast('Formatter is not available for this file.'));
  });

  function normalizeTasks(raw){
    if(!Array.isArray(raw)) return [];
    return raw.map((t,i)=>{
      if(typeof t==='string') return {title:t,description:'',checks:[]};
      return {...t,title:t?.title||`Task ${i+1}`,description:t?.description||'',checks:Array.isArray(t?.checks)?t.checks:[]};
    });
  }
  function readDone(classId,count){
    try{
      const raw=JSON.parse(localStorage.getItem(`oml:tasks:${classId}`)||'[]');
      return Array.from({length:count},(_,i)=>Boolean(raw[i]));
    }catch{return Array.from({length:count},()=>false);}
  }
  function renderTasks(){
    const tasks=normalizeTasks(state.current.meta.homework?.tasks);
    const done=readDone(state.current.meta.id,tasks.length);
    els.taskList.innerHTML=tasks.length
      ? tasks.map((t,i)=>`<div class="task-item"><input class="task-check" type="checkbox" data-task="${i}" ${done[i]?'checked':''}><div class="task-copy"><strong>${escapeHtml(t.title)}</strong><p>${escapeHtml(t.description)}</p></div><button class="check-btn" data-check="${i}" type="button">Check</button></div>`).join('')
      : `<div class="hint-box"><p>No homework metadata yet. Add <code>homework.tasks</code> to the class metadata JSON.</p></div>`;
    els.taskProgress.textContent=`${done.filter(Boolean).length} / ${tasks.length}`;
    $$('.task-check').forEach(c=>c.addEventListener('change',()=>{
      const d=readDone(state.current.meta.id,tasks.length);
      d[+c.dataset.task]=c.checked;
      try{localStorage.setItem(`oml:tasks:${state.current.meta.id}`,JSON.stringify(d));}catch{}
      renderTasks();
    }));
    $$('[data-check]').forEach(b=>b.addEventListener('click',()=>checkTask(+b.dataset.check)));
    const hints=(state.current.meta.homework?.hints||[]).filter(Boolean);
    els.hintBox.innerHTML=hints.length
      ? `<div class="hint">${escapeHtml(hints[state.hintIndex%hints.length])}</div>`
      : '<p>Small hint: read the requirement first, then inspect the starter files before writing code.</p>';
  }
  async function checkTask(i){
    const tasks=normalizeTasks(state.current.meta.homework?.tasks);
    const task=tasks[i]; if(!task) return;
    const ok=task.checks.length ? await evaluateChecks(task.checks) : false;
    const d=readDone(state.current.meta.id,tasks.length); d[i]=ok;
    try{localStorage.setItem(`oml:tasks:${state.current.meta.id}`,JSON.stringify(d));}catch{}
    renderTasks();
    toast(ok?'Task passed ✓':'Not quite yet. Read the requirement and try again.');
    if(ok) confetti();
  }
  async function evaluateChecks(checks){
    if(!Array.isArray(checks) || !checks.length) return false;
    for(const c of checks){
      const ok=await evalCheck(c);
      if(c?.mode==='any') { if(ok) return true; }
      else if(!ok) return false;
    }
    return true;
  }
  async function evalCheck(c){
    if(!c || typeof c!=='object') return false;
    if(c.mode==='any'){
      const children=Array.isArray(c.checks)?c.checks:[];
      for(const child of children) if(await evalCheck(child)) return true;
      return false;
    }
    if(c.mode==='all'){
      const children=Array.isArray(c.checks)?c.checks:[];
      for(const child of children) if(!(await evalCheck(child))) return false;
      return true;
    }
    if(c.type==='files_exist') return (c.files||[]).every(f=>state.files.has(normalizePath(f)));
    const file=normalizePath(c.file||'');
    if(!file || !state.files.has(file)) return false;
    const text=getFileText(file);
    if(c.type==='contains') return c.value==null?false:(c.flags==='i'?text.toLowerCase().includes(String(c.value).toLowerCase()):text.includes(String(c.value)));
    if(c.type==='not_contains') return !text.includes(String(c.value));
    if(c.type==='regex'){try{return new RegExp(c.pattern,c.flags||'').test(text)}catch{return false}}
    if(c.type==='min_length') return text.length>=Number(c.value||0);
    if(c.type==='html_elements'){
      const tag=String(c.tag||'').replace(/[^a-z0-9-]/gi,''); if(!tag) return false;
      const re=new RegExp(`<${tag}(?:\\s|>)`,'ig'); return (text.match(re)||[]).length>=Number(c.min||1);
    }
    if(c.type==='css_property') return new RegExp(`${escapeRegExp(c.property)}\\s*:\\s*${escapeRegExp(String(c.value||''))}`,'i').test(text);
    return false;
  }

  async function downloadZip(edited){
    if(!state.current || !window.JSZip) return; const zip=new JSZip();
    for(const [name,bytes] of state.files.entries()){ let data=bytes; if(edited && textFile(name)) data=new TextEncoder().encode(getFileText(name)); zip.file(name,data); }
    const blob=await zip.generateAsync({type:'blob'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${safeFileName(state.current.meta.title)}-${edited?'edited':'provided'}.zip`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }
  els.originalZip.addEventListener('click',()=>downloadZip(false)); els.editedZip.addEventListener('click',()=>downloadZip(true));

  async function openArticle(id){
    if(!state.catalog || !state.password){state.pendingRoute={type:'article',id};showView('login');return;}
    const meta=state.catalog.blogs.find(x=>x.id===id);
    if(!meta){toast('Article not found in the current library.');return;}
    toast('Opening article…');
    try{
      const env=await loadJson(meta.resource);
      const bytes=await decryptEnvelope(env,state.password);
      const zip=await JSZip.loadAsync(bytes);
      let md='';
      for(const n of ['article.md','index.md','README.md','readme.md']){
        if(zip.files[n]){md=await zip.files[n].async('text');break;}
      }
      if(!md){
        for(const n of Object.keys(zip.files)){
          if(/\.md$/i.test(n)){md=await zip.files[n].async('text');break;}
        }
      }
      if(!md) throw new Error('No Markdown article found.');
      els.article.innerHTML=markdown(md,meta);
      showView('article');
      history.replaceState(null,'',`#article/${encodeURIComponent(id)}`);
    }catch(err){console.error('Article open failed:',err);toast('This article could not be opened.');}
  }
  els.articleBack.addEventListener('click',()=>{location.hash='blogs';showView('blogs');});

  function markdown(src,meta){
    const lines=String(src||'').replace(/\r/g,'').split('\n'); let out=`<div class="article-content"><div class="eyebrow">${escapeHtml((meta.tags||[]).join(' · ')||'Mentor note')}</div><h1>${escapeHtml(meta.title||'Article')}</h1><p>${escapeHtml(meta.description||'')}</p>`; let inCode=false, code=[];
    for(const line of lines){if(line.trim().startsWith('```')){if(!inCode){inCode=true;code=[]}else{out+=`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;inCode=false}continue}if(inCode){code.push(line);continue}if(/^###\s+/.test(line))out+=`<h3>${inlineMd(line.replace(/^###\s+/,''))}</h3>`;else if(/^##\s+/.test(line))out+=`<h2>${inlineMd(line.replace(/^##\s+/,''))}</h2>`;else if(/^#\s+/.test(line))out+=`<h2>${inlineMd(line.replace(/^#\s+/,''))}</h2>`;else if(/^[-*]\s+/.test(line))out+=`<ul><li>${inlineMd(line.replace(/^[-*]\s+/,''))}</li></ul>`;else if(line.trim())out+=`<p>${inlineMd(line)}</p>`;
    } return out+'</div>';
  }
  function inlineMd(s){return escapeHtml(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https?:[^\)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');}
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function escapeAttr(s){return escapeHtml(s).replace(/`/g,'&#96;')}
  function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  function safeFileName(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'student-project'}
  function confetti(){const n=18;for(let i=0;i<n;i++){const x=document.createElement('span');x.textContent='✦';x.style.cssText=`position:fixed;z-index:200;left:${45+Math.random()*10}%;top:${42+Math.random()*10}%;color:${i%2?'#22d3ee':'#a78bfa'};font-size:${9+Math.random()*8}px;pointer-events:none;animation:conf 850ms ease-out forwards;`;document.body.appendChild(x);setTimeout(()=>x.remove(),900)}}
  const st=document.createElement('style');st.textContent='@keyframes conf{to{transform:translate(${Math.random()*220-110}px,${Math.random()*240-120}px) rotate(240deg);opacity:0}}';document.head.appendChild(st);

  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  route();
})();
