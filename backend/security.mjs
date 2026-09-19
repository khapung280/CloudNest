import {randomBytes, scrypt as derive, timingSafeEqual, createHmac} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export const roles=['super_admin','editor','support'];
export const token=()=>randomBytes(32).toString('hex');
export const digest=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Use a password with 12–128 characters.');
 const salt=randomBytes(16).toString('hex');
 const hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function passwordMatches(password,encoded){
 if(typeof password!=='string'||password.length>128)return false;
 const [kind,salt,hash]=encoded.split(':');if(kind!=='scrypt'||!salt||hash?.length!==128)return false;
 const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export function safeURL(value,{image=false}={}){
 if(value==='')return true;if(typeof value!=='string'||value.length>2048)return false;
 if(/[\s\\\u0000-\u001f]/.test(value))return false;
 if(image&&/^\/(assets|uploads)\/[a-zA-Z0-9._/-]+$/.test(value)&&!value.includes('..'))return true;
 if(!image&&/^#[a-zA-Z][\w-]*$/.test(value))return true;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}
}
const objectFields={
 home:['label','line1','line2','line3','description','buttonText','buttonLink','secondaryText','secondaryLink','image','aboutTitle','aboutDescription','servicesTitle','servicesDescription','projectsTitle','projectsDescription','contactTitle','contactDescription'],
 settings:['companyName','tagline','logo','favicon','email','phone','address','facebook','instagram','linkedin','youtube','copyright'],
 seo:['title','description','slug','ogTitle','ogDescription','ogImage','keywords']
};
const listFields={services:['name','shortDescription','description','tags','icon','deliverables','process','image'],founders:['name','role','email','phone','image'],pricing:['name','description','price','note','label','features','recommended'],faq:['question','answer'],blog:['title','category','excerpt','body','image','slug'],projects:['title','client','category','description','image','gallery','url','technologies']};
// Own media URLs become portable paths; arbitrary HTTP image URLs stay rejected.
export function normalizeMediaURL(value,mediaOrigin){
 if(!mediaOrigin||typeof value!=='string'||/[\s\\\u0000-\u001f]/.test(value))return value;
 try{
  const u=new URL(value),origin=new URL(mediaOrigin);
  if(['http:','https:'].includes(u.protocol)&&u.origin===origin.origin&&!u.username&&!u.password&&!u.search&&!u.hash&&safeURL(u.pathname,{image:true}))return u.pathname;
 }catch{}
 return value;
}
export function validateContent(input,{mediaOrigin}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid content.');
 const output={};
 function record(value,keys,isList){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid record.');
  const r={};for(const key of keys){
   let v=value[key]??(key==='recommended'?false:'');
   if(key==='recommended'){if(typeof v!=='boolean')throw new Error('Invalid recommended flag.');r[key]=v;continue;}
   if(typeof v!=='string'||v.length>(['body','description','deliverables','process','features','answer','gallery'].includes(key)?20000:2048))throw new Error(`Check ${key}: text is too long or invalid.`);
   if(['image','logo','favicon','ogImage'].includes(key)){v=normalizeMediaURL(v,mediaOrigin);if(!safeURL(v,{image:true}))throw new Error(`Choose an uploaded image or use an HTTPS image URL for ${key}.`);}
   if(['buttonLink','secondaryLink','url','facebook','instagram','linkedin','youtube'].includes(key)&&!safeURL(v))throw new Error(`Use a valid HTTPS link or section anchor for ${key}.`);
   if(key==='gallery'){v=v.split('\n').map(u=>normalizeMediaURL(u.trim(),mediaOrigin)).join('\n');if(v.split('\n').filter(Boolean).some(u=>!safeURL(u,{image:true})))throw new Error('Choose uploaded images or use HTTPS image URLs in the gallery.');}
   if(key==='slug'&&v&&!(isList?/^[a-z0-9]+(?:-[a-z0-9]+)*$/:/^\/$/).test(v))throw new Error('Use a slug with lowercase letters, numbers and single hyphens, without a leading slash.');
   if(key==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw new Error('Check the email address.');
   r[key]=v;
  }
  if(isList){if(typeof value.id!=='string'||!/^[\w.-]{1,100}$/.test(value.id))throw new Error('Invalid record ID.');if(!['draft','published'].includes(value.status))throw new Error('Invalid status.');r.id=value.id;r.status=value.status;}
  return r;
 }
 for(const [key,fields]of Object.entries(objectFields))output[key]=record(input[key],fields,false);
 if(output.seo.slug!=='/')throw new Error('The homepage path is fixed at /.');
 for(const [key,fields]of Object.entries(listFields)){
  if(!Array.isArray(input[key])||input[key].length>100)throw new Error(`Invalid ${key} collection.`);
  output[key]=input[key].map(v=>record(v,fields,true));
  if(new Set(output[key].map(v=>v.id)).size!==output[key].length)throw new Error('Duplicate record IDs.');
  if(key==='blog'){
   const slugs=output[key].map(v=>v.slug).filter(Boolean);
   if(new Set(slugs).size!==slugs.length)throw new Error('Each article needs a unique URL slug.');
   if(output[key].some(v=>v.status==='published'&&!v.slug))throw new Error('Published articles need a URL slug.');
  }
 }
 return output;
}
export function publicContent(content){
 const result=structuredClone(content);
 for(const key of Object.keys(listFields))result[key]=result[key].filter(r=>r.status==='published');
 return result;
}
export function validateMessage(x){
 const out={};for(const [key,max]of Object.entries({name:100,email:200,company:150,phone:30,subject:200,message:5000})){
  if(x[key]!=null&&typeof x[key]!=='string')throw new Error('Invalid enquiry.');out[key]=(x[key]||'').trim();if(out[key].length>max)throw new Error(`${key} is too long.`);
 }
 if(!out.name||!/^\S+@\S+\.\S+$/.test(out.email)||out.message.length<10)throw new Error('Add your name, a valid email and a message of at least 10 characters.');
 return out;
}
