import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server.mjs';
import {validateContent,passwordHash,passwordMatches,safeURL} from '../security.mjs';
const seed=JSON.parse(await readFile(new URL('../../dist/content-seed.json',import.meta.url),'utf8'));
let db,server,origin,uploadDir,admin,editor,support;
const password='Local-test-password-2026!';
async function request(url,{method='GET',body,session,headers={}}={}){
 const r=await fetch(origin+'/api'+url,{method,headers:{origin,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...headers},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 const result=await r.json().catch(()=>({}));return {status:r.status,body:result,headers:r.headers};
}
async function login(email){const r=await request('/auth/login',{method:'POST',body:{email,password}});assert.equal(r.status,200,JSON.stringify(r.body));return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.body.csrf};}
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO content(id,draft,published) VALUES(1,$1,$1)',[JSON.stringify(validateContent(seed))]);
 const hash=await passwordHash(password);
 for(const role of ['super_admin','editor','support'])await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),role,role+'@example.test',hash,role]);
 uploadDir=await mkdtemp(path.join(tmpdir(),'cloudnest-test-'));
 const config={origin:'',websiteOrigin:'https://public.example',secret:'test-secret-not-used-in-production-123456',production:false,uploadDir};
 const adapter={query:async(...args)=>{const r=await db.query(...args);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 server=createApp({db:adapter,config}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;config.origin=origin;
 // The middleware's origin allowlist is constructed at creation, so rebuild for the chosen port.
 await new Promise(r=>server.close(r));server=createApp({db:adapter,config}).listen(Number(new URL(origin).port),'127.0.0.1');await new Promise(r=>server.once('listening',r));
 admin=await login('super_admin@example.test');editor=await login('editor@example.test');support=await login('support@example.test');
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db?.close();if(uploadDir)await rm(uploadDir,{recursive:true,force:true})});
test('seed is valid; unsafe URLs and malformed records are rejected',()=>{
 assert.equal(validateContent(seed).services.length,5);
 for(const v of ['javascript:alert(1)','//evil.example','/assets/../secret','https://user:pass@example.com','data:image/svg+xml,hi'])assert.equal(safeURL(v,{image:true}),false);
 const invalid=structuredClone(seed);invalid.home.buttonLink='javascript:alert(1)';assert.throws(()=>validateContent(invalid));
});
test('own media URLs normalize across image fields and reject external HTTP',()=>{
 const data=structuredClone(seed),mediaOrigin='http://localhost:3001';
 data.home.image=mediaOrigin+'/uploads/photo.jpg';data.settings.logo=data.home.image;data.seo.ogImage=data.home.image;data.founders[0].image=data.home.image;
 data.projects=[{id:'photo-project',status:'published',image:data.home.image,gallery:mediaOrigin+'/uploads/second.webp\nhttps://example.com/photo.png'}];
 const result=validateContent(data,{mediaOrigin});
 assert.equal(result.home.image,'/uploads/photo.jpg');assert.equal(result.settings.logo,'/uploads/photo.jpg');assert.equal(result.seo.ogImage,'/uploads/photo.jpg');
 assert.equal(result.founders[0].image,'/uploads/photo.jpg');assert.equal(result.projects[0].gallery,'/uploads/second.webp\nhttps://example.com/photo.png');
 for(const url of ['http://evil.example/uploads/a.jpg','http://localhost:3002/uploads/a.jpg','http://user:pass@localhost:3001/uploads/a.jpg','http://localhost:3001/private/a.jpg','//localhost:3001/uploads/a.jpg','data:image/png,abc']){
  data.home.image=url;assert.throws(()=>validateContent(data,{mediaOrigin}),url);
 }
});
test('password hashes verify without exposing the original password',async()=>{const h=await passwordHash(password);assert.ok(!h.includes(password));assert.equal(await passwordMatches(password,h),true);assert.equal(await passwordMatches('wrong',h),false);});
test('anonymous writes, support content edits and missing CSRF are blocked',async()=>{
 assert.equal((await request('/admin/content')).status,401);
 assert.equal((await request('/admin/content',{session:support})).status,403);
 assert.equal((await request('/admin/users',{session:editor})).status,403);
 assert.equal((await request('/admin/content',{method:'PUT',body:{content:seed,revision:1},session:admin,headers:{'X-CSRF-Token':'bad'}})).status,403);
 assert.equal((await request('/auth/login',{method:'POST',body:{email:'super_admin@example.test',password},headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await request('/auth/login',{method:'POST',body:{email:'super_admin@example.test',password:'wrong'}})).status,401);
});
test('draft save, conflict detection, role restrictions and publishing persist correctly',async()=>{
 const changed=structuredClone(seed);changed.home.line1='A new chapter.';changed.settings.companyName='Editor must not change this';changed.services.push({...changed.services[0],id:'hidden-service',status:'draft'});
 const saved=await request('/admin/content',{method:'PUT',session:editor,body:{content:changed,revision:1}});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.revision,2);
 let pub=await request('/public/content');assert.equal(pub.body.content.home.line1,seed.home.line1);
 const draft=await request('/admin/content',{session:admin});assert.equal(draft.body.draft.settings.companyName,seed.settings.companyName);
 assert.equal((await request('/admin/content',{method:'PUT',session:admin,body:{content:seed,revision:1}})).status,409);
 assert.equal((await request('/admin/publish',{method:'POST',session:admin,body:{revision:1}})).status,409);
 assert.equal((await request('/admin/publish',{method:'POST',session:editor,body:{revision:2}})).status,200);
 pub=await request('/public/content');assert.equal(pub.body.content.home.line1,'A new chapter.');assert.equal(pub.body.content.services.length,5);
});
test('enquiries are stored and support can update them without CMS access',async()=>{
 let r=await request('/contact',{method:'POST',body:{name:'Test visitor',email:'visitor@example.test',subject:'Website design',message:'Please discuss a new website.'},headers:{origin:'https://public.example'}});assert.equal(r.status,201,JSON.stringify(r.body));
 r=await request('/admin/messages',{session:support});assert.equal(r.body.length,1);assert.equal(r.body[0].email_status,'not_configured');
 assert.equal((await request('/admin/messages/'+r.body[0].id,{method:'PUT',session:support,body:{status:'read'}})).status,200);
 assert.equal((await request('/admin/messages',{session:editor})).status,403);
 const dashboard=await request('/admin/overview',{session:admin});assert.equal(dashboard.status,200);assert.equal(dashboard.body.messages.total,1);
});
test('image uploads require an editor and a supported file signature',async()=>{
 let form=new FormData();form.append('file',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/svg+xml'}),'evil.svg');
 assert.equal((await request('/admin/media',{method:'POST',session:admin,body:form})).status,400);
 form=new FormData();form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDlkAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
 assert.equal((await request('/admin/media',{method:'POST',session:support,body:form})).status,403);
 const upload=await request('/admin/media',{method:'POST',session:admin,body:form});assert.equal(upload.status,201,JSON.stringify(upload.body));
 const m=await request('/admin/media',{session:editor});assert.equal(m.body.length,1);assert.ok(m.body[0].url.startsWith(origin));
 assert.equal((await fetch(m.body[0].url)).status,200);
 const initial=await request('/admin/content',{session:admin});
 const changed=structuredClone(initial.body.draft);changed.founders[0].image=upload.body.url;
 const saved=await request('/admin/content',{method:'PUT',session:admin,body:{content:changed,revision:initial.body.revision}});
 assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal((await request('/admin/publish',{method:'POST',session:admin,body:{revision:saved.body.revision}})).status,200);
 const pub=await request('/public/content');assert.equal(pub.body.content.founders[0].image,new URL(upload.body.url).pathname);
 assert.equal((await fetch(origin+pub.body.content.founders[0].image)).status,200);
 assert.equal((await request('/admin/media/'+upload.body.id,{method:'DELETE',session:admin})).status,409);
 const restored=await request('/admin/content',{method:'PUT',session:admin,body:{content:initial.body.draft,revision:saved.body.revision}});
 assert.equal(restored.status,200);assert.equal((await request('/admin/publish',{method:'POST',session:admin,body:{revision:restored.body.revision}})).status,200);
 assert.equal((await request('/admin/media/'+upload.body.id,{method:'DELETE',session:admin})).status,200);
});
test('admin runtime, public metadata, articles, robots and sitemap are served',async()=>{
 const runtime=await fetch(origin+'/admin/runtime.js');assert.match(await runtime.text(),/ADMIN_LIVE=true/);
 const panel=await fetch(origin+'/admin/');assert.equal(panel.status,200);assert.equal(panel.headers.get('x-robots-tag'),'noindex, nofollow');
 const homepage=await (await fetch(origin+'/')).text();assert.match(homepage,/property="og:title"/);
 assert.equal((await fetch(origin+'/journal/website')).status,200);assert.equal((await fetch(origin+'/journal/no-such-post')).status,404);
 assert.match(await (await fetch(origin+'/sitemap.xml')).text(),/journal\/website/);
 assert.match(await (await fetch(origin+'/robots.txt')).text(),/Disallow: \/admin/);
});
test('logout invalidates a session on the server',async()=>{
 assert.equal((await request('/auth/logout',{method:'POST',session:support,body:{}})).status,200);
 assert.equal((await request('/auth/me',{session:support})).status,401);
});
