import express from 'express';
import multer from 'multer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from './db.mjs';
import {roles,token,digest,passwordHash,passwordMatches,validateContent,publicContent,validateMessage} from './security.mjs';

export function createApp({db,config}){
 const app=express();const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
 const production=config.production;const cookieName=production?'__Host-cn_session':'cn_session';
 const origins=new Set([config.origin,config.websiteOrigin]);
 const mediaStorage=config.mediaStorage||'disk';
 const mediaUrl=storageName=>/^https:\/\//.test(storageName)?storageName:`${config.origin}/uploads/${storageName}`;
 async function putMedia(storageName,buffer,contentType){
  if(mediaStorage==='vercel-blob'){
   const {put}=await import('@vercel/blob');
   const uploaded=await put(storageName,buffer,{access:'public',contentType,addRandomSuffix:false,allowOverwrite:true});
   return uploaded.url;
  }
  const target=path.join(config.uploadDir,storageName);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,buffer,{flag:'wx'});
  return storageName;
 }
 async function replaceMedia(storageName,buffer,contentType){
  if(mediaStorage==='vercel-blob'){
   const {put}=await import('@vercel/blob');
   const pathname=new URL(storageName).pathname.replace(/^\/+/,'');
   const uploaded=await put(pathname,buffer,{access:'public',contentType,addRandomSuffix:false,allowOverwrite:true});
   return uploaded.url;
  }
  const target=path.join(config.uploadDir,storageName);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,buffer);
  return storageName;
 }
 async function deleteMedia(storageName){
  if(mediaStorage==='vercel-blob'){
   const {del}=await import('@vercel/blob');
   await del(storageName);return;
  }
  await unlink(path.join(config.uploadDir,storageName)).catch(e=>{if(e.code!=='ENOENT')throw e});
 }
 app.disable('x-powered-by');
 if(config.proxyHops)app.set('trust proxy',config.proxyHops);
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
  if(production)res.set('Strict-Transport-Security','max-age=31536000');
  if(req.path.startsWith('/api')){
   res.set('Cache-Control','no-store');const origin=req.get('origin');
   if(origin&&origins.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Credentials','true');}
   if(req.method==='OPTIONS'){if(!origins.has(origin))return res.sendStatus(403);res.set('Access-Control-Allow-Headers','Content-Type, X-CSRF-Token');res.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');return res.sendStatus(204);}
   if(!['GET','HEAD'].includes(req.method)&&(!origin||!origins.has(origin)))return res.status(403).json({error:'This request origin is not allowed.'});
  }
  next();
 });
 app.use(express.json({limit:'1mb'}));
 const audit=(actor,action)=>db.query('INSERT INTO activity(actor,action) VALUES($1,$2)',[actor,action]);
 async function limit(req,res,key,max,seconds){
  const fingerprint=digest(`${key}:${req.ip}`,config.secret);
  const {rows}=await db.query(`INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.count+1 END, reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+($2 * interval '1 second') ELSE rate_limits.reset_at END RETURNING count`,[fingerprint,seconds]);
  if(rows[0].count>max){res.set('Retry-After',String(seconds));res.status(429).json({error:'Too many attempts. Please try again later.'});return true;}return false;
 }
 async function auth(req,res,next){
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))return res.status(401).json({error:'Please sign in.'});
  const {rows}=await db.query('SELECT u.id,u.name,u.email,u.role,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[digest(raw,config.secret)]);
  if(!rows[0])return res.status(401).json({error:'Your session has expired. Please sign in.'});
  req.user=rows[0];req.sessionHash=digest(raw,config.secret);
  if(!['GET','HEAD'].includes(req.method)&&req.get('X-CSRF-Token')!==req.user.csrf_token)return res.status(403).json({error:'Security check failed. Refresh and try again.'});
  next();
 }
 const allow=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:'Your role cannot perform this action.'});
 const cookieOptions={httpOnly:true,secure:production,sameSite:'strict',path:'/'};
 app.get('/api/health',async(req,res)=>{await db.query('SELECT 1');res.json({ready:true})});
 app.get('/api/public/content',async(req,res)=>{const {rows}=await db.query('SELECT published,published_revision FROM content WHERE id=1');if(!rows[0])return res.status(503).json({error:'Content is not initialized.'});res.json({content:publicContent(rows[0].published),revision:rows[0].published_revision});});
 app.post('/api/contact',async(req,res)=>{
  if(await limit(req,res,'contact',5,3600))return;
  if(req.body.website)return res.json({ok:true});
  let m;try{m=validateMessage(req.body)}catch(e){return res.status(400).json({error:e.message})}
  const id=randomUUID();await db.query('INSERT INTO messages(id,name,email,company,phone,subject,message) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,m.name,m.email,m.company,m.phone,m.subject,m.message]);
  let emailStatus='not_configured';
  if(config.mailKey&&config.mailFrom&&config.notifyEmail){
   try{const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(7000),headers:{Authorization:`Bearer ${config.mailKey}`,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:config.mailFrom,to:[config.notifyEmail],reply_to:m.email,subject:'New Cloud Nest enquiry',text:`${m.name}\n${m.email}\n${m.subject}\n\n${m.message}`})});emailStatus=r.ok?'sent':'failed'}catch{emailStatus='failed'}
   await db.query('UPDATE messages SET email_status=$1 WHERE id=$2',[emailStatus,id]);
  }
  res.status(201).json({ok:true});
 });
 app.post('/api/auth/login',async(req,res)=>{
  if(req.get('origin')!==config.origin)return res.status(403).json({error:'Sign in from the admin website.'});
  if(await limit(req,res,'login',10,900))return;
  const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
  const {rows}=await db.query('SELECT * FROM users WHERE email=$1 AND active=true',[email]);
  const dummy='scrypt:00000000000000000000000000000000:'+('00'.repeat(64));
  const valid=await passwordMatches(req.body.password,rows[0]?.password_hash||dummy);
  if(!rows[0]||!valid)return res.status(401).json({error:'Email or password is incorrect.'});
  const raw=token(),csrf=token();const seconds=req.body.remember===true?604800:28800;
  await db.query('DELETE FROM sessions WHERE expires_at<now()');
  await db.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+($4 * interval '1 second'))",[digest(raw,config.secret),rows[0].id,csrf,seconds]);
  res.cookie(cookieName,raw,{...cookieOptions,maxAge:seconds*1000});
  const {id,name,role}=rows[0];res.json({user:{id,name,email,role},csrf});
 });
 app.get('/api/auth/me',auth,(req,res)=>{const {csrf_token,...user}=req.user;res.json({user,csrf:csrf_token})});
 app.post('/api/auth/logout',auth,async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.clearCookie(cookieName,cookieOptions).json({ok:true})});
 app.use('/api/admin',auth);
 app.get('/api/admin/overview',async(req,res)=>{
  const [{rows:counts},{rows:recent},{rows:activity},{rows:content}]=await Promise.all([db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='new')::int AS unread FROM messages"),db.query('SELECT id,name,subject,status,created_at FROM messages ORDER BY created_at DESC LIMIT 5'),db.query('SELECT actor,action,created_at FROM activity ORDER BY id DESC LIMIT 8'),db.query('SELECT revision,published_revision,updated_at,published_at FROM content WHERE id=1')]);
  res.json({messages:counts[0],recentMessages:req.user.role==='editor'?[]:recent,activity,content:content[0]});
 });
 app.get('/api/admin/content',allow('super_admin','editor'),async(req,res)=>{const {rows}=await db.query('SELECT draft,revision,published_revision,published_at FROM content WHERE id=1');res.json(rows[0])});
 app.put('/api/admin/content',allow('super_admin','editor'),async(req,res)=>{
  let data;try{data=validateContent(req.body.content,{mediaOrigin:config.origin})}catch(e){return res.status(400).json({error:e.message})}
  const {rows:current}=await db.query('SELECT draft FROM content WHERE id=1');
  if(req.user.role!=='super_admin')data.settings=current[0].draft.settings;
  const {rows}=await db.query('UPDATE content SET draft=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision',[JSON.stringify(data),req.body.revision]);
  if(!rows[0])return res.status(409).json({error:'Another editor saved changes. Reload the latest version before saving.'});
  await audit(req.user.name,'Saved website draft');res.json(rows[0]);
 });
 app.post('/api/admin/publish',allow('super_admin','editor'),async(req,res)=>{
  const {rows}=await db.query('UPDATE content SET published=draft,published_revision=revision,published_at=now() WHERE id=1 AND revision=$1 RETURNING published_revision',[req.body.revision]);
  if(!rows[0])return res.status(409).json({error:'The draft changed. Reload before publishing.'});
  await audit(req.user.name,'Published website content');res.json(rows[0]);
 });
 app.get('/api/admin/messages',allow('super_admin','support'),async(req,res)=>{const {rows}=await db.query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500');res.json(rows)});
 app.put('/api/admin/messages/:id',allow('super_admin','support'),async(req,res)=>{if(!['new','read','replied','closed'].includes(req.body.status))return res.status(400).json({error:'Invalid status.'});const {rowCount}=await db.query('UPDATE messages SET status=$1 WHERE id=$2',[req.body.status,req.params.id]);res.status(rowCount?200:404).json({ok:!!rowCount})});
 app.delete('/api/admin/messages/:id',allow('super_admin','support'),async(req,res)=>{await db.query('DELETE FROM messages WHERE id=$1',[req.params.id]);await audit(req.user.name,'Deleted an enquiry');res.json({ok:true})});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:3}}).single('file');
 app.get('/api/admin/media',allow('super_admin','editor'),async(req,res)=>{const {rows}=await db.query('SELECT * FROM media ORDER BY created_at DESC');res.json(rows.map(m=>({...m,url:mediaUrl(m.storage_name)})))});
 function imageType(b){if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return ['png','image/png'];if(b[0]===255&&b[1]===216&&b[2]===255)return ['jpg','image/jpeg'];if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return ['webp','image/webp'];return null;}
 app.post('/api/admin/media',allow('super_admin','editor'),upload,async(req,res)=>{
  const f=req.file,type=f&&imageType(f.buffer);if(!type)return res.status(400).json({error:'Upload a PNG, JPEG or WebP image (up to 8 MB).'});
  const id=randomUUID(),name=`${id}.${type[0]}`;const stored=await putMedia(name,f.buffer,type[1]);
  try{await db.query('INSERT INTO media(id,filename,storage_name,mime_type,size) VALUES($1,$2,$3,$4,$5)',[id,f.originalname.slice(0,200),stored,type[1],f.size])}catch(e){await deleteMedia(stored);throw e;}
  await audit(req.user.name,'Uploaded an image');res.status(201).json({id,url:mediaUrl(stored)});
 });
 app.put('/api/admin/media/:id',allow('super_admin','editor'),async(req,res)=>{const {filename,alt_text=''}=req.body;if(typeof filename!=='string'||!filename.trim()||filename.length>200||typeof alt_text!=='string'||alt_text.length>500)return res.status(400).json({error:'Check the image name and alt text.'});await db.query('UPDATE media SET filename=$1,alt_text=$2 WHERE id=$3',[filename,alt_text,req.params.id]);res.json({ok:true})});
 app.post('/api/admin/media/:id/replace',allow('super_admin','editor'),upload,async(req,res)=>{
  const {rows}=await db.query('SELECT * FROM media WHERE id=$1',[req.params.id]);if(!rows[0])return res.sendStatus(404);
  const type=req.file&&imageType(req.file.buffer);if(!type||type[1]!==rows[0].mime_type)return res.status(400).json({error:'Replace with the same image format (PNG, JPEG or WebP).'});
  const stored=await replaceMedia(rows[0].storage_name,req.file.buffer,type[1]);await db.query('UPDATE media SET storage_name=$1,size=$2 WHERE id=$3',[stored,req.file.size,req.params.id]);await audit(req.user.name,'Replaced an image');res.json({ok:true});
 });
 app.delete('/api/admin/media/:id',allow('super_admin','editor'),async(req,res)=>{
  const {rows}=await db.query('SELECT * FROM media WHERE id=$1',[req.params.id]);if(!rows[0])return res.sendStatus(404);
  const {rows:c}=await db.query('SELECT draft,published FROM content WHERE id=1');
  if(JSON.stringify(c[0]).includes(rows[0].storage_name))return res.status(409).json({error:'This image is used on the website. Remove it from the draft and publish before deleting.'});
  await deleteMedia(rows[0].storage_name);await db.query('DELETE FROM media WHERE id=$1',[req.params.id]);res.json({ok:true});
 });
 app.get('/api/admin/users',allow('super_admin'),async(req,res)=>{const {rows}=await db.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at');res.json(rows)});
 app.post('/api/admin/users',allow('super_admin'),async(req,res)=>{
  const {name,email,role,password}=req.body;
  if(typeof name!=='string'||!name.trim()||name.length>100||typeof email!=='string'||email.length>200||!/^\S+@\S+\.\S+$/.test(email)||!roles.includes(role))return res.status(400).json({error:'Check the name, email and role.'});
  let hash;try{hash=await passwordHash(password)}catch(e){return res.status(400).json({error:e.message})}
  await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),name,email.toLowerCase(),hash,role]);await audit(req.user.name,'Added an administrator');res.status(201).json({ok:true});
 });
 app.put('/api/admin/users/:id',allow('super_admin'),async(req,res)=>{
  if(req.params.id===req.user.id)return res.status(400).json({error:'You cannot change your own access here.'});
  if(!roles.includes(req.body.role)||typeof req.body.active!=='boolean')return res.status(400).json({error:'Invalid role or status.'});
  await db.query('UPDATE users SET role=$1,active=$2 WHERE id=$3',[req.body.role,req.body.active,req.params.id]);await db.query('DELETE FROM sessions WHERE user_id=$1',[req.params.id]);await audit(req.user.name,'Updated administrator access');res.json({ok:true});
 });
 app.post('/api/admin/password',async(req,res)=>{
  const {rows}=await db.query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
  if(!await passwordMatches(req.body.currentPassword,rows[0].password_hash))return res.status(400).json({error:'Current password is incorrect.'});
  let hash;try{hash=await passwordHash(req.body.password)}catch(e){return res.status(400).json({error:e.message})}
  await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,req.user.id]);await db.query('DELETE FROM sessions WHERE user_id=$1',[req.user.id]);res.clearCookie(cookieName,cookieOptions).json({ok:true});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
 app.use('/uploads',express.static(config.uploadDir,{dotfiles:'deny',index:false,maxAge:0,setHeaders:res=>{res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.set('Cache-Control','no-cache')}}));
 app.get('/admin/runtime.js',(_req,res)=>res.type('js').send('window.CLOUD_NEST_ADMIN_LIVE=true;'));
 app.get('/site-config.js',(_req,res)=>res.type('js').send(`window.CLOUD_NEST_API_ORIGIN=${JSON.stringify(config.origin)};`));
 app.get('/robots.txt',(_req,res)=>res.type('txt').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/admin\nSitemap: ${config.origin}/sitemap.xml\n`));
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 app.get('/sitemap.xml',async(_req,res)=>{const {rows}=await db.query('SELECT published FROM content WHERE id=1');const posts=publicContent(rows[0].published).blog;res.type('xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/',...posts.filter(p=>p.slug).map(p=>'/journal/'+p.slug)].map(p=>`<url><loc>${escape(config.origin+p)}</loc></url>`).join('')}</urlset>`)});
 app.get('/journal/:slug',async(req,res)=>{const {rows}=await db.query('SELECT published FROM content WHERE id=1');const content=publicContent(rows[0].published);const post=content.blog.find(p=>p.slug===req.params.slug);if(!post)return res.status(404).type('html').send(`<h1>Article not found</h1><a href="/">Back to ${escape(content.settings.companyName)}</a>`);res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(post.title)} — ${escape(content.settings.companyName)}</title><meta name="description" content="${escape(post.excerpt)}"><meta property="og:title" content="${escape(post.title)}"><meta property="og:description" content="${escape(post.excerpt)}">${post.image?`<meta property="og:image" content="${escape(new URL(post.image,config.origin).href)}">`:''}<link rel="stylesheet" href="/article.css"></head><body><main><a href="/">← ${escape(content.settings.companyName)}</a><p class="category">${escape(post.category)}</p><h1>${escape(post.title)}</h1><p class="intro">${escape(post.excerpt)}</p>${post.image?`<img src="${escape(post.image)}" alt="${escape(post.title)}">`:''}<article>${post.body.split('\n\n').map(p=>`<p>${escape(p).replaceAll('\n','<br>')}</p>`).join('')}</article><a href="/#journal">Back to journal →</a></main></body></html>`)});
 app.get('/',async(_req,res)=>{
  const {rows}=await db.query('SELECT published FROM content WHERE id=1');const {seo,settings}=rows[0].published;
  let html=await readFile(path.join(root,'index.html'),'utf8');html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(seo.title)}</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(seo.description)}">`);
  html=html.replace('</head>',`<meta property="og:title" content="${escape(seo.ogTitle||seo.title)}"><meta property="og:description" content="${escape(seo.ogDescription||seo.description)}">${seo.ogImage?`<meta property="og:image" content="${escape(new URL(seo.ogImage,config.origin).href)}">`:''}<meta name="keywords" content="${escape(seo.keywords)}"></head>`);
  res.type('html').send(html);
 });
 app.use('/admin',(_req,res,next)=>{res.set('X-Robots-Tag','noindex, nofollow');res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");next()});
 app.use(express.static(root,{dotfiles:'deny'}));
 app.use((err,_req,res,_next)=>{if(err.code==='23505')return res.status(409).json({error:'This record already exists.'});if(err.code==='22P02')return res.status(400).json({error:'Invalid identifier.'});if(err instanceof multer.MulterError)return res.status(400).json({error:'Upload one image, no larger than 8 MB.'});if(err.status===400||err.status===413)return res.status(err.status).json({error:'Invalid or oversized request.'});console.error('Request failed:',err.code||err.name);res.status(500).json({error:'Something went wrong. Please try again.'});});
 return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const production=process.env.NODE_ENV==='production';
 const origin=process.env.PUBLIC_ORIGIN||'http://localhost:3000';
 const secret=process.env.SESSION_SECRET;
 if(!secret||secret.length<32)throw new Error('Set SESSION_SECRET to at least 32 random characters.');
 if(production&&(!origin.startsWith('https://')||(!process.env.UPLOAD_DIR&&!process.env.BLOB_READ_WRITE_TOKEN)))throw new Error('Production requires an HTTPS PUBLIC_ORIGIN and persistent media storage through UPLOAD_DIR or Vercel Blob.');
 const db=database();await db.query('SELECT 1');
 createApp({db,config:{production,origin,secret,proxyHops:Number(process.env.TRUST_PROXY_HOPS)||0,websiteOrigin:process.env.WEBSITE_ORIGIN||origin,uploadDir:process.env.UPLOAD_DIR||path.resolve('uploads'),mediaStorage:process.env.BLOB_READ_WRITE_TOKEN?'vercel-blob':'disk',mailKey:process.env.RESEND_API_KEY,mailFrom:process.env.MAIL_FROM,notifyEmail:process.env.NOTIFY_EMAIL}}).listen(Number(process.env.PORT)||3000,()=>console.log('Cloud Nest backend is ready.'));
}
