import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {migrateBrand} from '../brand-migration.mjs';

test('brand migration hook keeps Cloud Nest content unchanged',async()=>{
 const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const seed=JSON.parse(await readFile(new URL('../../dist/content-seed.json',import.meta.url),'utf8'));
  const published=structuredClone(seed);
  published.settings.companyName='Cloud Nest';
  published.settings.logo='/assets/cloud-nest-logo.png';
  published.settings.favicon='';
  const draft=structuredClone(published);
  draft.settings.logo='/uploads/custom-logo.png';
  draft.settings.email='owner@example.com';
  draft.home.description='Unpublished work';
  await db.query('INSERT INTO content(id,draft,published,revision,published_revision) VALUES(1,$1,$2,5,3)',[JSON.stringify(draft),JSON.stringify(published)]);
  const before=(await db.query('SELECT * FROM content')).rows[0];
  await migrateBrand(db);
  const first=(await db.query('SELECT * FROM content')).rows[0];
  assert.deepEqual(first,before);
  assert.equal(first.draft.settings.companyName,'Cloud Nest');
  assert.equal(first.draft.settings.logo,'/uploads/custom-logo.png');
  assert.equal(first.draft.settings.email,'owner@example.com');
  assert.equal(first.draft.home.description,'Unpublished work');
  assert.equal(first.published.home.description,published.home.description);
  assert.equal(first.published.settings.logo,'/assets/cloud-nest-logo.png');
  assert.equal(first.revision,5);assert.equal(first.published_revision,3);
  await migrateBrand(db);
  assert.deepEqual((await db.query('SELECT * FROM content')).rows[0],first);
 }finally{await db.close()}
});
