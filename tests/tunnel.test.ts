import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

test('tunnel launcher uses absolute quoted paths, separates secrets, and propagates failures', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "obsidian tunnel's fixture-")));
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'dist'));
    await copyFile(new URL('../scripts/tunnel.mjs', import.meta.url), join(root, 'scripts/tunnel.mjs'));
    await writeFile(join(root, '.env'), '');
    await writeFile(join(root, 'dist/index.js'), '');
    const output = join(root, 'calls.json');
    const fake = join(root, 'fake-client');
    await writeFile(fake, `#!${process.execPath}\n` +
      `require('node:fs').writeFileSync(process.env.TEST_OUTPUT, JSON.stringify({ args: process.argv.slice(2), hasKey: !!process.env.CONTROL_PLANE_API_KEY }));\n` +
      `process.exit(Number(process.env.TEST_EXIT || 0));\n`, { mode: 0o700 });
    const env = { ...process.env, TUNNEL_CLIENT_PATH: fake, TEST_OUTPUT: output,
      CONTROL_PLANE_API_KEY: 'fixture-secret', VAULT_TUNNEL_ID: 'tunnel_fixture123',
      VAULT_TUNNEL_PROFILE: 'fixture-vault' };
    const invoke = (action: string, overrides = {}) => execFile(process.execPath,
      [join(root, 'scripts/tunnel.mjs'), action], { cwd: tmpdir(), env: { ...env, ...overrides } });
    const calls = async () => JSON.parse(await readFile(output, 'utf8'));
    await invoke('init');
    const init = await calls();
    assert.equal(init.hasKey, true);
    assert.deepEqual(init.args.slice(0, 7), ['init', '--sample', 'sample_mcp_stdio_local',
      '--profile', 'fixture-vault', '--tunnel-id', 'tunnel_fixture123']);
    assert.equal(init.args[7], '--mcp-command');
    assert.ok(!JSON.stringify(init.args).includes('fixture-secret'));
    // Validate spaces/apostrophes in the generated POSIX command using a real shell parser.
    const decoded = await execFile('/bin/sh', ['-c', `set -- ${init.args[8]}; printf '%s\\n' "$@"`]);
    assert.deepEqual(decoded.stdout.trimEnd().split('\n'), [process.execPath,
      `--env-file=${join(root, '.env')}`, join(root, 'dist/index.js')]);
    await invoke('doctor');
    assert.deepEqual((await calls()).args, ['doctor', '--profile', 'fixture-vault', '--explain']);
    await invoke('run');
    assert.deepEqual((await calls()).args, ['run', '--profile', 'fixture-vault']);
    await assert.rejects(invoke('run', { TEST_EXIT: '7' }), { code: 7 });
    await assert.rejects(invoke('init', { VAULT_TUNNEL_ID: 'invalid' }), /Set VAULT_TUNNEL_ID/);
    await assert.rejects(invoke('run', { CONTROL_PLANE_API_KEY: '' }), /Set CONTROL_PLANE_API_KEY/);
    await assert.rejects(invoke('run', { TUNNEL_CLIENT_PATH: join(root, 'missing') }), /Cannot start tunnel-client/);
    await writeFile(join(root, '.env.tunnel'), 'CONTROL_PLANE_API_KEY=file-fixture\nVAULT_TUNNEL_PROFILE=file-profile\n');
    const fileEnv: NodeJS.ProcessEnv = { ...env };
    delete fileEnv.CONTROL_PLANE_API_KEY;
    await execFile(process.execPath, [join(root, 'scripts/tunnel.mjs'), 'run'], { env: fileEnv });
    assert.equal((await calls()).hasKey, true);
    assert.deepEqual((await calls()).args, ['run', '--profile', 'fixture-vault']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
