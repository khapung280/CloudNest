import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {validateContent} from '../security.mjs';
const root=new URL('../../dist/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const html=await read('index.html'),adminHTML=await read('admin/index.html'),adminJS=await read('admin/admin.js');
const seed=JSON.parse(await read('content-seed.json'));
const scripts={};for(const file of ['cms.js','motion.js','app.js'])scripts[file]=await read(file);
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let i=0;i<50;i++){if(fn())return;await tick()}assert.fail('Expected UI state was not reached')}
function setup(markup,url){
 const dom=new JSDOM(markup,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const errors=[];
 w.addEventListener('error',e=>errors.push(e.error));w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.CSS={escape:v=>v};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 return {dom,w,errors};
}
async function publicPage({preview,apiContent}={}){
 const p=setup(html,'https://cloudnest.example/'+(preview?'?preview=admin':''));const {w,errors}=p;const calls=[];
 if(preview)w.sessionStorage.setItem('cn-preview-content',JSON.stringify(preview));
 if(apiContent)w.CLOUD_NEST_API_ORIGIN='https://backend.example';
 w.fetch=async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/content')?{content:apiContent}:{ok:true}}};
 const original=w.document.body.append.bind(w.document.body);
 w.document.body.append=(...nodes)=>{for(const node of nodes){if(node.tagName==='SCRIPT'){try{w.eval(scripts[node.src.split('/').pop()]);node.onload()}catch(e){errors.push(e);node.onerror?.()}}else original(node)}};
 await w.eval(scripts['cms.js']);return {...p,calls};
}
function assertUniqueAndLinked(document){
 const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length,'Duplicate DOM IDs');
 for(const el of document.querySelectorAll('a[href^="#"]'))assert.ok(document.getElementById(el.hash.slice(1)),`Broken anchor: ${el.hash}`);
}
test('public website has unique sections, service cards, discipline labels and working contact links',async()=>{
 const {dom,w,errors}=await publicPage();const d=w.document;
 assertUniqueAndLinked(d);
 const labels=[...d.querySelectorAll('.capabilities-strip span')].map(v=>v.textContent);assert.equal(labels.length,4);assert.equal(new Set(labels).size,4);
 const cards=[...d.querySelectorAll('[data-service]')];assert.equal(cards.length,5);assert.equal(new Set(cards.map(c=>c.dataset.service)).size,5);
 assert.doesNotMatch(d.querySelector('#pricing').textContent,/custom software/i);assert.doesNotMatch(d.querySelector('#faq').textContent,/custom software/i);
 assert.equal(d.querySelectorAll('.founder-card').length,2);assert.ok(d.querySelector('a[href="tel:9817387000"]'));assert.ok(d.querySelector('a[href="mailto:anishjha553@gmail.com"]'));
 for(const card of cards){card.click();assert.equal(d.querySelector('#service-dialog-title').textContent,card.dataset.service);d.querySelector('#service-dialog .dialog-close').click();await tick();assert.equal(d.querySelector('#service-dialog').open,false);assert.equal(d.body.style.overflow,'');}
 for(const article of d.querySelectorAll('[data-article]')){article.click();assert.ok(d.querySelector('#article-body p').textContent.length>20);d.querySelector('.article-done').click();await tick();assert.equal(d.querySelector('#article-dialog').open,false);}
 const menu=d.querySelector('.menu-button');menu.click();assert.equal(menu.getAttribute('aria-expanded'),'true');d.querySelector('#navigation a').click();assert.equal(menu.getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);dom.window.close();
});
test('static contact form downloads once and does not pretend to send an enquiry',async()=>{
 const {dom,w,calls,errors}=await publicPage();const form=w.document.querySelector('#project-form');
 form.elements.name.value='Local visitor';form.elements.email.value='visitor@example.test';form.elements.message.value='Please discuss our next website.';
 let downloads=0;w.URL.createObjectURL=()=> 'blob:local-brief';w.URL.revokeObjectURL=()=>{};
 w.document.addEventListener('click',e=>{if(e.target.download){e.preventDefault();downloads++}});
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(downloads,1);assert.equal(calls.length,0);assert.match(w.document.querySelector('#form-status').textContent,/Nothing has been sent/);assert.deepEqual(errors,[]);dom.window.close();
});
test('CMS hero changes reach the animated image layer without duplicating founders',async()=>{
 const data=structuredClone(seed);data.home.image='https://images.example/new-hero.webp';
 const {dom,w,errors}=await publicPage({preview:data});
 assert.equal(w.document.querySelector('.hero-art').style.getPropertyValue('--hero-image'),'url("https://images.example/new-hero.webp")');
 assert.equal(w.document.querySelector('.hero-art').style.backgroundImage,'');assert.equal(w.document.querySelectorAll('.founder-card').length,2);
 assertUniqueAndLinked(w.document);assert.deepEqual(errors,[]);dom.window.close();
});
test('connected contact form sends one enquiry and preserves confirmation feedback',async()=>{
 const {dom,w,errors,calls}=await publicPage({apiContent:seed});const form=w.document.querySelector('#project-form');
 form.elements.name.value='Connected visitor';form.elements.email.value='visitor@example.test';form.elements.message.value='Please discuss our new website.';
 let downloads=0;w.URL.createObjectURL=()=>{downloads++;return 'blob:unexpected'};
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>w.document.querySelector('#form-status').textContent.includes('received'));
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(downloads,0);assert.equal(w.document.querySelector('#form-status').classList.contains('brief-ready'),true);assert.deepEqual(errors,[]);dom.window.close();
});
test('damaged preview data falls back to the usable website',async()=>{
 const {dom,w,errors}=await publicPage({preview:{home:{}}});w.document.querySelector('.service-card').click();assert.equal(w.document.querySelector('#service-dialog').open,true);assert.deepEqual(errors,[]);dom.window.close();
});
test('Publish does not secretly submit the content form',async()=>{
 const {dom,w}=setup(adminHTML,'https://cloudnest.example/admin/#content');w.fetch=async()=>({ok:true,json:async()=>structuredClone(seed)});w.eval(adminJS);
 await until(()=>w.document.querySelector('#content-form'));const input=w.document.querySelector('[name=line1]');input.value='Unsaved change';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const publish=w.document.querySelector('[data-action=publish]');assert.equal(publish.type,'button');publish.click();await tick();assert.equal(w.sessionStorage.getItem('cn-admin-draft'),null);assert.equal(input.value,'Unsaved change');dom.window.close();
});
test('logged-out admin cannot reopen cached content through a navigation hash',async()=>{
 const {dom,w,errors}=setup(adminHTML,'https://cloudnest.example/admin/');w.CLOUD_NEST_ADMIN_LIVE=true;let signedIn=true;
 const user={name:'Test admin',role:'super_admin',id:'test'};
 w.fetch=async url=>{let payload;if(url==='/content-seed.json')payload=seed;else if(url==='/api/auth/me')payload={user,csrf:'csrf'};else if(url==='/api/admin/content')payload={draft:seed,revision:1,published_revision:1};else if(url==='/api/admin/media')payload=[];else if(url==='/api/admin/overview')payload={messages:{unread:0},activity:[]};else if(url==='/api/auth/logout'){signedIn=false;payload={ok:true}}else throw Error('Unexpected request '+url);return {ok:true,json:async()=>structuredClone(payload)}};
 w.eval(adminJS);await until(()=>w.document.querySelector('.stats'));w.document.querySelector('[data-action=logout]').click();await until(()=>w.document.querySelector('#login-form'));assert.equal(signedIn,false);
 w.location.hash='content';await tick();assert.ok(w.document.querySelector('#login-form'));assert.equal(w.document.querySelector('#content-form'),null);assert.deepEqual(errors,[]);dom.window.close();
});
test('blog slugs cannot produce broken double-slash article URLs',()=>{for(const slug of ['/article','article/','a--b']){const data=structuredClone(seed);data.blog[0].slug=slug;assert.throws(()=>validateContent(data));}});
