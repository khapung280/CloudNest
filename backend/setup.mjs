import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {database} from './db.mjs';
import {passwordHash,validateContent} from './security.mjs';
const db=database();
try{
 if(process.argv[2]==='migrate'){
  await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  const data=validateContent(JSON.parse(await readFile(new URL('../dist/content-seed.json',import.meta.url),'utf8')));
  await db.query('INSERT INTO content(id,draft,published) VALUES(1,$1,$1) ON CONFLICT(id) DO NOTHING',[JSON.stringify(data)]);
  console.log('Database ready. Existing content was preserved.');
 }else if(process.argv[2]==='admin'){
  // Supply the password through the host secret environment, not command arguments.
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const email=(await rl.question('Admin email: ')).trim().toLowerCase();
  const name=(await rl.question('Admin name: ')).trim();rl.close();
  if(!/^\S+@\S+\.\S+$/.test(email)||!name)throw new Error('A name and valid email are required.');
  const hash=await passwordHash(process.env.ADMIN_PASSWORD);
  await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'super_admin') ON CONFLICT(email) DO UPDATE SET password_hash=$4",[randomUUID(),name,email,hash]);
  await db.query('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email]);
  console.log('Admin password saved. Remove ADMIN_PASSWORD from the environment.');
 }else throw new Error('Use migrate or admin.');
}finally{await db.end()}
