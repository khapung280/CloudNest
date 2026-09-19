import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../../dist/admin/index.html',import.meta.url),'utf8');
const js=await readFile(new URL('../../dist/admin/admin.js',import.meta.url),'utf8');
const seed=JSON.parse(await readFile(new URL('../../dist/content-seed.json',import.meta.url),'utf8'));
async function until(fn){for(let i=0;i<30;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail('DOM did not reach the expected state')}
test('admin preview edits real content, retains drafts and does not claim live publication',async()=>{
 const dom=new JSDOM(html,{url:'https://cloudnest.example/admin/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.structuredClone=structuredClone;w.fetch=async()=>({ok:true,json:async()=>structuredClone(seed)});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(js);await until(()=>w.document.querySelector('.stats'));
 assert.match(w.document.body.textContent,/Preview mode/);assert.match(w.document.body.textContent,/Active services/);
 w.location.hash='content';await until(()=>w.document.querySelector('#content-form'));
 const field=w.document.querySelector('[name=line1]');field.value='A better idea.';field.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('#content-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>w.sessionStorage.getItem('cn-admin-draft'));assert.equal(JSON.parse(w.sessionStorage.getItem('cn-admin-draft')).home.line1,'A better idea.');
 w.document.querySelector('[data-action=publish]').click();assert.match(w.document.querySelector('#editor-dialog').textContent,/PostgreSQL/);w.document.querySelector('#editor-dialog').close();
 w.location.hash='services';await until(()=>w.document.querySelector('[data-action=add]'));assert.equal(w.document.querySelectorAll('tbody tr').length,5);
 w.document.querySelector('[data-action=add]').click();w.document.querySelector('#record-form [name=name]').value='New service';w.document.querySelector('#record-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>w.document.querySelectorAll('tbody tr').length===6);assert.equal(JSON.parse(w.sessionStorage.getItem('cn-admin-draft')).services.length,6);
 w.document.querySelector('[data-action=preview]').click();assert.ok(w.document.querySelector('#preview-dialog iframe'));assert.equal(JSON.parse(w.sessionStorage.getItem('cn-preview-content')).home.line1,'A better idea.');
 dom.window.close();
});

test('live image picker preserves founder edits through upload failure, selection and URL entry',async()=>{
 const dom=new JSDOM(html,{url:'https://cloudnest.example/admin/#founders',runScripts:'outside-only'});
 const w=dom.window;w.structuredClone=structuredClone;w.CLOUD_NEST_ADMIN_LIVE=true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let fail=true;
 w.fetch=async(url,options={})=>{
  let value={};
  if(url==='/content-seed.json')value=structuredClone(seed);
  if(url==='/api/auth/me')value={user:{name:'Admin',role:'super_admin'},csrf:'token'};
  if(url==='/api/admin/content')value={draft:structuredClone(seed),revision:1,published_revision:1};
  if(url==='/api/admin/media'){
   if(options.method==='POST'){
    assert.equal(options.headers['X-CSRF-Token'],'token');
    assert.equal(options.body.get('file').name,'portrait.jpg');
    if(fail)return {ok:false,status:400,json:async()=>({error:'Upload failed. Try again.'})};
    value={id:'photo',url:'/uploads/portrait.jpg'};
   }else value=[];
  }
  return {ok:true,json:async()=>value};
 };
 w.eval(js);await until(()=>w.document.querySelector('[data-action=edit]'));
 w.document.querySelector('[data-action=edit]').click();
 const name=w.document.querySelector('#record-form [name=name]');name.value='Unsaved founder name';
 w.document.querySelector('[data-action=pick-image]').click();
 const upload=w.document.querySelector('#picker-upload-form');
 Object.defineProperty(upload.elements.file,'files',{value:[new w.File(['photo'],'portrait.jpg',{type:'image/jpeg'})]});
 const submit=()=>upload.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 submit();await until(()=>w.document.querySelector('#confirm-dialog .dialog-error').textContent);
 assert.equal(name.value,'Unsaved founder name');assert.equal(w.document.querySelector('#confirm-dialog').open,true);
 fail=false;submit();await until(()=>!w.document.querySelector('#confirm-dialog').open);
 assert.equal(name.value,'Unsaved founder name');
 assert.equal(w.document.querySelector('#record-form [name=image]').value,'/uploads/portrait.jpg');
 w.document.querySelector('[data-action=pick-image]').click();
 assert.match(w.document.querySelector('#confirm-dialog').textContent,/portrait.jpg/);
 const urlForm=w.document.querySelector('#picker-url-form');
 urlForm.elements.imageUrl.value='https://example.com/another.jpg';
 urlForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.document.querySelector('#record-form [name=image]').value,'https://example.com/another.jpg');
 assert.equal(name.value,'Unsaved founder name');
 dom.window.close();
});
