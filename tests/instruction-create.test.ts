import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, realpath, rm, readFile, writeFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'instruction-create-')));
  await mkdir(join(root, 'Study'));
  const server = createServer({root, id:'test', excludedPaths:['Private']});
  const client = new Client({name:'instruction-test',version:'1'});
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const call = (name:string, args:Record<string,unknown>) => client.callTool({name,arguments:args});
  const review = async (path:string) => (await call('get_applicable_instructions',{path})).structuredContent?.reviewToken;
  return {root,client,server,call,review,close:async () => {
    await client.close();await server.close();await rm(root,{recursive:true,force:true});
  }};
}

test('instruction creation requires review, previews, persists discoverable scope and invalidates older reviews', async () => {
  const f = await fixture();
  try {
    const path = 'AGENTS.md', content = '# Guidance\nKeep notes concise.\n';
    assert.equal((await f.call('create_instruction_file',{path,content,dryRun:false})).isError,true);
    const oldReview = await f.review('Study/note.md');
    const token = await f.review(path);
    const args = {path,content,reviewToken:token};
    const preview = await f.call('create_instruction_file',args);
    assert.equal(preview.structuredContent?.applied,false);
    assert.equal(preview.structuredContent?.scope,'');
    await assert.rejects(readFile(join(f.root,path)),{code:'ENOENT'});
    const applied = await f.call('create_instruction_file',{...args,dryRun:false});
    assert.equal(applied.structuredContent?.applied,true);
    assert.equal(await readFile(join(f.root,path),'utf8'),content);
    assert.equal((await f.call('create_instruction_file',{...args,dryRun:false})).isError,true);
    assert.equal((await f.call('create_note',{path:'Study/note.md',content:'note',reviewToken:oldReview,dryRun:false})).isError,true);
    const scoped = await f.call('get_applicable_instructions',{path:'Study/note.md'});
    assert.deepEqual((scoped.structuredContent?.instructions as {path:string}[]).map(x=>x.path),['AGENTS.md']);
    const nested = {path:'Study/Agents.md',content:'# Study guidance',reviewToken:await f.review('Study/Agents.md'),dryRun:false};
    assert.equal((await f.call('create_instruction_file',nested)).structuredContent?.scope,'Study');
    const overwrite = await f.call('create_instruction_file',{path,content:'overwrite',reviewToken:await f.review(path),dryRun:false});
    assert.equal(overwrite.isError,true);
    assert.equal(await readFile(join(f.root,path),'utf8'),content);
  } finally {await f.close();}
});

test('instruction creation rejects unsafe targets, stale rules, blank content and guidance that cannot be fully reviewed', async () => {
  const f = await fixture();
  try {
    const token = await f.review('Study/AGENTS.md');
    for (const path of ['Study/rules.md','../AGENTS.md','.hidden/AGENTS.md','Private/AGENTS.md','missing/AGENTS.md']) {
      assert.equal((await f.call('create_instruction_file',{path,content:'rule',reviewToken:token,dryRun:false})).isError,true,path);
    }
    for (const content of [' \n','a'.repeat(20_001)]) {
      assert.equal((await f.call('create_instruction_file',{path:'Study/AGENTS.md',content,reviewToken:token,dryRun:false})).isError,true);
    }
    await writeFile(join(f.root,'AGENTS.md'),'New parent rule');
    assert.equal((await f.call('create_instruction_file',{path:'Study/AGENTS.md',content:'rule',reviewToken:token,dryRun:false})).isError,true);
    await writeFile(join(f.root,'AGENTS.md'),'a'.repeat(20_000));
    await writeFile(join(f.root,'CLAUDE.md'),'b'.repeat(15_000));
    const budgetToken = await f.review('Study/AGENTS.md');
    assert.ok(budgetToken);
    assert.equal((await f.call('create_instruction_file',{path:'Study/AGENTS.md',content:'c'.repeat(6_000),reviewToken:budgetToken,dryRun:false})).isError,true);
    await assert.rejects(readFile(join(f.root,'Study/AGENTS.md')),{code:'ENOENT'});
    await symlink(join(f.root,'AGENTS.md'),join(f.root,'Study/INSTRUCTIONS.md'));
    assert.equal(await f.review('Study/INSTRUCTIONS.md'),null);
  } finally {await f.close();}
});
