import path from 'node:path';
import {createApp} from '../backend/server.mjs';
import {database} from '../backend/db.mjs';

const production=process.env.NODE_ENV==='production'||Boolean(process.env.VERCEL);
const origin=process.env.PUBLIC_ORIGIN||(
 process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'http://localhost:3000'
);
const secret=process.env.SESSION_SECRET;
if(!secret||secret.length<32)throw new Error('Set SESSION_SECRET to at least 32 random characters.');

const db=database();

export default createApp({
 db,
 config:{
  production,
  origin,
  secret,
  proxyHops:Number(process.env.TRUST_PROXY_HOPS)||1,
  websiteOrigin:process.env.WEBSITE_ORIGIN||origin,
  uploadDir:process.env.UPLOAD_DIR||path.resolve('/tmp/cloud-nest-uploads'),
  mediaStorage:process.env.BLOB_READ_WRITE_TOKEN?'vercel-blob':'disk',
  mailKey:process.env.RESEND_API_KEY,
  mailFrom:process.env.MAIL_FROM,
  notifyEmail:process.env.NOTIFY_EMAIL
 }
});
