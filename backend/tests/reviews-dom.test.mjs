import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const root=new URL('../../dist/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const script=await readFile(new URL('experience.js',root),'utf8');
const until=async fn=>{for(let i=0;i<50;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}assert.fail('Expected UI state was not reached')};
test('reviews escape visitor content, paginate, retain failed forms and show pending confirmation',async()=>{
 const dom=new JSDOM(html,{url:'https://studio.example',runScripts:'outside-only'}),w=dom.window,d=w.document;
 let fail=true,sent;
 w.fetch=async(url,options={})=>{
  if(options.method==='POST'){
   sent=JSON.parse(options.body);
   return {ok:!fail,json:async()=>fail?{error:'Please try again later.'}:{ok:true,status:'pending'}};
  }
  const page=url.endsWith('page=2')?2:1;
  return {ok:true,json:async()=>({reviews:[{id:page,name:'<img src=x onerror=alert(1)>',rating:5,comment:'<script>bad()</script>',reply:'Thanks <b>friend</b>',created_at:'2026-09-26T10:00:00Z'}],summary:{total:7,average:5},page,hasMore:page===1})};
 };
 w.eval(script);await until(()=>d.querySelector('.review-card'));
 assert.equal(d.querySelector('.review-card img'),null);assert.equal(d.querySelector('.review-card script'),null);assert.match(d.querySelector('.review-card').textContent,/<script>bad/);
 d.querySelector('#reviews-more').click();await until(()=>d.querySelectorAll('.review-card').length===2);assert.equal(d.querySelector('#reviews-more').hidden,true);
 const form=d.querySelector('#review-form');form.elements.name.value='A visitor';form.elements.email.value='visitor@example.test';form.elements.comment.value='A helpful and thoughtful studio.';form.querySelector('[value="4"]').checked=true;
 const submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 submit();await until(()=>d.querySelector('#review-status').textContent.includes('try again'));
 assert.equal(form.elements.name.value,'A visitor');assert.equal(form.querySelector('button').disabled,false);
 fail=false;submit();await until(()=>d.querySelector('#review-status').textContent.includes('after admin approval'));
 assert.equal(d.querySelector('#review-receipt').hidden,false);assert.match(d.querySelector('#review-receipt').textContent,/awaiting approval/);assert.equal(d.querySelector('#review-status').dataset.state,'success');assert.equal(sent.rating,4);assert.equal(form.elements.name.value,'');assert.equal(d.querySelectorAll('.review-card').length,2);
 w.close();
});
test('planner preserves visitor message and transfers selected scope to the enquiry',()=>{
 const dom=new JSDOM(html,{url:'https://studio.example',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.fetch=async()=>({ok:true,json:async()=>({reviews:[],summary:{total:0,average:0},page:1,hasMore:false})});
 w.eval(script);
 const planner=d.querySelector('#planner-form');planner.elements.kind.value='Online store';planner.querySelector('[value="Online payments"]').checked=true;
 planner.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.match(d.querySelector('#planner-features').textContent,/Online payments/);
 const message=d.querySelector('#project-form textarea');message.value='Keep my original goals.';
 planner.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.match(message.value,/Keep my original goals/);assert.match(message.value,/Online store/);assert.match(message.value,/Online payments/);assert.equal(w.location.hash,'#contact');
 // Allow the initial reviews promise to finish before releasing the document.
 return new Promise(r=>setTimeout(()=>{w.close();r()},10));
});
