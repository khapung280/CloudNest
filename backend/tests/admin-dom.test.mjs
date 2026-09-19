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
