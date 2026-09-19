// One-time migration from our authored static article and service data.
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const base=new URL('../dist/',import.meta.url);
const source=await readFile(new URL('app.js',base),'utf8');
const content=JSON.parse(await readFile(new URL('content-seed.json',base),'utf8'));
const articleSource=source.match(/const articles=(\{[\s\S]*?\n\});/)[1];
const articles=vm.runInNewContext('('+articleSource+')',Object.create(null),{timeout:100});
content.blog=Object.entries(articles).map(([slug,a])=>({id:slug,slug,title:a.title,category:slug==='brand'?'Brand strategy':slug==='project'?'Studio notes':'Web design',excerpt:a.body[0][1],body:a.body.map(([heading,text])=>heading+'\n'+text).join('\n\n'),image:'',status:'published'}));
const serviceSource=source.match(/const serviceDetails=(\{[\s\S]*?\n\});/)[1];
const services=Object.values(vm.runInNewContext('('+serviceSource+')',Object.create(null),{timeout:100}));
content.services.forEach((s,i)=>{s.description=services[i].summary;s.deliverables=services[i].deliverables.join('\n');s.process=services[i].process.join('\n')});
await writeFile(new URL('content-seed.json',base),JSON.stringify(content,null,2));
