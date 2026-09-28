import {request} from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpEndpoint} from '../src/http.js';

test('HTTP authenticates, rejects unexpected origins/hosts, and preserves per-session write reviews', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'http-vault-')));
  const token = 'test-token-'.repeat(4);
  const options = {token, allowedHosts: [] as string[], allowedOrigins: [] as string[]};
  options.allowedHosts.push('127.0.0.1');
  const endpoint = createHttpEndpoint({root, id: 'http-test', excludedPaths: []}, options);
  await new Promise<void>(resolve => endpoint.server.listen(0, '127.0.0.1', resolve));
  const address = endpoint.server.address();
  assert.ok(address && typeof address !== 'string');
  options.allowedHosts.push(`127.0.0.1:${address.port}`);
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const headers = {Authorization: `Bearer ${token}`};
  const client = new Client({name: 'http-test', version: '1'});
  const other = new Client({name: 'other-session', version: '1'});
  const transport = new StreamableHTTPClientTransport(url, {requestInit: {headers}});
  const otherTransport = new StreamableHTTPClientTransport(url, {requestInit: {headers}});
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, {headers: {...headers, Origin: 'https://untrusted.example'}})).status, 403);
    const badHost = await new Promise<number>(resolve => {
      const req = request(url, {headers: {...headers, Host: 'untrusted.example'}}, res => { res.resume(); resolve(res.statusCode!); });
      req.end();
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(url, {method: 'POST', headers: {...headers, 'Content-Type':'application/json'}, body:'{broken'})).status, 400);
    await client.connect(transport);
    await other.connect(otherTransport);
    assert.equal((await client.listTools()).tools.length, 11);
    const review = await client.callTool({name: 'get_applicable_instructions', arguments: {path:'new.md'}});
    const args = {path:'new.md', content:'# HTTP', dryRun:false, reviewToken:review.structuredContent?.reviewToken};
    assert.equal((await other.callTool({name:'create_note', arguments:args})).isError, true);
    const created = await client.callTool({name:'create_note', arguments:args});
    assert.equal(created.structuredContent?.applied, true);
    assert.equal(await readFile(join(root,'new.md'),'utf8'), '# HTTP');
    const patchReview = await client.callTool({name:'get_applicable_instructions',arguments:{path:'new.md'}});
    await writeFile(join(root,'AGENTS.md'),'New rule');
    const denied = await client.callTool({name:'patch_note',arguments:{path:'new.md',expectedRevision:created.structuredContent?.revision,
      oldText:'# HTTP',newText:'changed',dryRun:false,reviewToken:patchReview.structuredContent?.reviewToken}});
    assert.equal(denied.isError,true);
    await transport.terminateSession();
    await otherTransport.terminateSession();
  } finally {
    await Promise.allSettled([client.close(),other.close()]);
    await endpoint.close();
    await rm(root,{recursive:true,force:true});
  }
});
