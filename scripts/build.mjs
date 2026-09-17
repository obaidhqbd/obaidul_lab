import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'obaidul-lab-'));
const ITERATIONS = 600_000;
const PASSWORD = process.env.CLASS_ACCESS_PASSWORD || 'demo-only-change-me';
const IS_PROD = Boolean(process.env.GITHUB_ACTIONS);

if (IS_PROD && PASSWORD === 'demo-only-change-me') {
  throw new Error('CLASS_ACCESS_PASSWORD GitHub Secret is required for production builds.');
}

function cleanDir(dir){ if(fs.existsSync(dir))fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true}); }
function safeId(value){return String(value||'item').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'item';}
function titleFromName(name){return String(name).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim();}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function readSiteConfig(){
  const file=path.join(ROOT,'site-config.json');
  if(!fs.existsSync(file)) return {brand:{name:'Obaidul Mentor Lab',mentor:'Mohammed Obaidul Hoque',role:'web development mentor',portfolioUrl:'',portfolioLabel:'Portfolio'},site:{}};
  const raw=readJson(file);
  const brand={name:'Obaidul Mentor Lab',mentor:'Mohammed Obaidul Hoque',role:'web development mentor',portfolioUrl:'',portfolioLabel:'Portfolio',...(raw.brand||{})};
  if(brand.portfolioUrl){
    let u; try{u=new URL(brand.portfolioUrl); if(!['http:','https:'].includes(u.protocol)) throw new Error('Portfolio URL must use http/https.');}
    catch(err){throw new Error(`Invalid portfolioUrl in site-config.json: ${err.message}`);}
    brand.portfolioUrl=u.toString();
  }
  return {brand,site:{description:'A focused premium support lab for students learning web design with HTML and CSS.',...(raw.site||{})}};
}
function htmlEscapeAttr(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function copy(src,dst){fs.cpSync(src,dst,{recursive:true});}
function listFiles(dir,base=dir,out=[]){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','.DS_Store'].includes(ent.name))continue;const abs=path.join(dir,ent.name);if(ent.isDirectory())listFiles(abs,base,out);else out.push(path.relative(base,abs).replaceAll(path.sep,'/'));}return out;}
function firstMarkdownParagraph(file){if(!fs.existsSync(file))return '';const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);for(const line of lines){const s=line.trim();if(!s||s.startsWith('#')||s.startsWith('```')||s.startsWith('- ')||s.startsWith('* '))continue;return s.replace(/[*_`]/g,'').slice(0,280);}return '';}
function parseMeta(dir,type,name){
  const metaFile=path.join(dir,'metadata.json'); let meta={};
  if(fs.existsSync(metaFile)){try{meta=readJson(metaFile)}catch(err){console.warn(`Invalid metadata.json in ${name}: ${err.message}`)}}
  const readme=path.join(dir,'README.md');
  const blogMd=['article.md','README.md','readme.md'].map(n=>path.join(dir,n)).find(fs.existsSync);
  const title=meta.title || (()=>{if(fs.existsSync(readme)){const h=fs.readFileSync(readme,'utf8').match(/^#\s+(.+)$/m);if(h)return h[1].trim();}if(blogMd){const h=fs.readFileSync(blogMd,'utf8').match(/^#\s+(.+)$/m);if(h)return h[1].trim();}return titleFromName(name)})();
  const description=meta.description || meta.summary || firstMarkdownParagraph(blogMd || readme);
  const defaults=type==='class'?{
    level:'Beginner',duration:'Self-paced',tags:['HTML','CSS'],order:999,featured:false,
    homework:{tasks:[],hints:['Read the task carefully before coding.','Change one thing at a time and use the live preview.']}
  }:{level:'General',duration:'5 min read',tags:['Web design'],order:999,featured:false};
  return {...defaults,...meta,id:safeId(meta.id || name),title,description,summary:meta.summary||description,type};
}
function findSourceDir(input,extractTo){
  if(fs.statSync(input).isDirectory()) return input;
  fs.mkdirSync(extractTo,{recursive:true}); execFileSync('unzip',['-q',input,'-d',extractTo]);
  const entries=fs.readdirSync(extractTo,{withFileTypes:true});
  if(entries.length===1 && entries[0].isDirectory()) return path.join(extractTo,entries[0].name);
  const candidates=[extractTo,...entries.filter(e=>e.isDirectory()).map(e=>path.join(extractTo,e.name))];
  return candidates.find(d=>fs.existsSync(path.join(d,'metadata.json'))||fs.existsSync(path.join(d,'README.md'))||fs.existsSync(path.join(d,'index.html'))) || extractTo;
}
function aesEncrypt(input, password, aad){
  const salt=crypto.randomBytes(16); const iv=crypto.randomBytes(12); const key=crypto.pbkdf2Sync(Buffer.from(password),salt,ITERATIONS,32,'sha256');
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(Buffer.from(aad)); const data=Buffer.concat([cipher.update(input),cipher.final()]); const tag=cipher.getAuthTag();
  return {version:1,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:salt.toString('hex'),iv:iv.toString('base64'),tag:tag.toString('base64'),aad,data:data.toString('base64')};
}
function makeZip(sourceDir,outZip){
  const prev=process.cwd(); process.chdir(sourceDir); try {execFileSync('zip',['-qr',outZip,'.','-x','*.DS_Store','.git/*','node_modules/*']);} finally {process.chdir(prev);} return fs.readFileSync(outZip);
}
function copySiteShell(siteConfig){
  cleanDir(DIST);
  for(const file of ['index.html','styles.css','app.js','sw.js','site.webmanifest','robots.txt','404.html']) fs.copyFileSync(path.join(ROOT,file),path.join(DIST,file));
  copy(path.join(ROOT,'assets'),path.join(DIST,'assets'));
  const indexFile=path.join(DIST,'index.html');
  let index=fs.readFileSync(indexFile,'utf8');
  const brand=siteConfig.brand;
  const replacements={
    '__BRAND_NAME__': brand.name,
    '__BRAND_MENTOR__': brand.mentor,
    '__BRAND_ROLE__': brand.role,
    '__PORTFOLIO_URL__': brand.portfolioUrl || '#',
    '__PORTFOLIO_LABEL__': brand.portfolioLabel || 'Portfolio',
    '__SITE_DESCRIPTION__': siteConfig.site.description || ''
  };
  for(const [token,value] of Object.entries(replacements)){
    const attrToken = token === '__SITE_DESCRIPTION__' ? token : token;
    index=index.replaceAll(token,htmlEscapeAttr(value));
  }
  fs.writeFileSync(indexFile,index);
}
function ensureDir(p){fs.mkdirSync(p,{recursive:true});}
function processCollection(folderName,type,catalog,manifestEntries){
  const sourceRoot=path.join(ROOT,folderName); if(!fs.existsSync(sourceRoot))return;
  const workRoot=path.join(WORK,folderName); ensureDir(workRoot); const inputs=fs.readdirSync(sourceRoot,{withFileTypes:true}).filter(e=>!e.name.startsWith('.'));
  const seen=new Set();
  for(const inputEnt of inputs){
    const input=path.join(sourceRoot,inputEnt.name); let tempExtract=path.join(WORK,'extract',safeId(inputEnt.name)); ensureDir(tempExtract);
    let src=findSourceDir(input,tempExtract); if(!fs.existsSync(src))continue;
    const meta=parseMeta(src,type,inputEnt.name); let id=meta.id; let n=2; while(seen.has(id)||catalog.some(x=>x.id===id)){id=`${id}-${n++}`;} seen.add(id); meta.id=id;
    const zipPath=path.join(workRoot,`${id}.zip`); const zipBuf=makeZip(src,zipPath); const envelope=aesEncrypt(zipBuf,PASSWORD,`${type}:${id}:package:v1`);
    const targetDir=path.join(DIST,'data',type==='class'?'classes':'blogs');ensureDir(targetDir); const resourceFolder=type==='class'?'classes':'blogs'; const resRel=`./data/${resourceFolder}/${id}.enc.json`; fs.writeFileSync(path.join(targetDir,`${id}.enc.json`),JSON.stringify(envelope));
    const packageMeta={...meta,resource:resRel,updatedAt:new Date().toISOString()}; delete packageMeta.internal;
    manifestEntries.push(packageMeta);
  }
}

const siteConfig=readSiteConfig();
copySiteShell(siteConfig);
ensureDir(path.join(DIST,'data/classes')); ensureDir(path.join(DIST,'data/blogs'));
const catalog={site:{...siteConfig.brand,description:siteConfig.site.description},classes:[],blogs:[],generatedAt:new Date().toISOString()};
processCollection('Classes','class',catalog.classes,catalog.classes);
processCollection('Blogs','blog',catalog.blogs,catalog.blogs);
for(const collection of [catalog.classes,catalog.blogs]){
  collection.sort((a,b)=>(Number(a.order??999)-Number(b.order??999)) || String(a.title).localeCompare(String(b.title)));
}
const catalogEnvelope=aesEncrypt(Buffer.from(JSON.stringify(catalog)),PASSWORD,'catalog:v1');
fs.writeFileSync(path.join(DIST,'data/catalog.enc.json'),JSON.stringify(catalogEnvelope));
fs.writeFileSync(path.join(DIST,'data/site.json'),JSON.stringify(catalog.site,null,2));

const siteOrigin=(process.env.SITE_URL||'https://example.github.io/mentor-lab').replace(/\/$/,'');
const urls=[`${siteOrigin}/`,'']
  .concat(catalog.classes.map(x=>`${siteOrigin}/?class=${encodeURIComponent(x.id)}`))
  .concat(catalog.blogs.map(x=>`${siteOrigin}/?blog=${encodeURIComponent(x.id)}`));
const sitemap=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',...urls.filter(Boolean).map(u=>`  <url><loc>${u}</loc></url>`),'</urlset>'].join('\n');
fs.writeFileSync(path.join(DIST,'sitemap.xml'),sitemap);
fs.writeFileSync(path.join(DIST,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`);
fs.writeFileSync(path.join(DIST,'.nojekyll'),'');
const buildInfo={
  schemaVersion:1,
  builtAt:new Date().toISOString(),
  commit:process.env.GITHUB_SHA || null,
  ref:process.env.GITHUB_REF_NAME || null,
  node:process.version,
  counts:{classes:catalog.classes.length,blogs:catalog.blogs.length},
  resourceFormat:'AES-256-GCM',
  resourceVersion:1
};
ensureDir(path.join(DIST,'data'));
fs.writeFileSync(path.join(DIST,'data','build-info.json'),JSON.stringify(buildInfo,null,2));

console.log(`Built ${catalog.classes.length} classes and ${catalog.blogs.length} blogs.`);
if(!IS_PROD)console.log('Development build used demo password. Set CLASS_ACCESS_PASSWORD for a real build.');
