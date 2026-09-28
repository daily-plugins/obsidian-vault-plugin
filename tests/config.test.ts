import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../src/config.js';

test('neutral configuration takes precedence and legacy settings remain readable', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vault-config-')));
  const keys = ['VAULT_PATH', 'VAULT_ID', 'VAULT_CONFIG_DIR', 'VAULT_EXCLUDED_PATHS',
    'OBSIDIAN_VAULT_PATH', 'OBSIDIAN_VAULT_ID', 'OBSIDIAN_CONFIG_DIR', 'OBSIDIAN_EXCLUDED_PATHS'];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.OBSIDIAN_VAULT_PATH = root;
    assert.equal((await loadConfig()).configDir, '.obsidian');
    process.env.VAULT_PATH = root;
    process.env.OBSIDIAN_VAULT_PATH = '/does-not-exist';
    process.env.VAULT_ID = 'neutral';
    process.env.VAULT_EXCLUDED_PATHS = '["Private"]';
    const config = await loadConfig();
    assert.equal(config.root, root);
    assert.equal(config.configDir, '.vault');
    assert.equal(config.id, 'neutral');
    assert.deepEqual(config.excludedPaths, ['Private']);
    process.env.VAULT_CONFIG_DIR = '../outside';
    await assert.rejects(loadConfig, /hidden folder/);
    process.env.VAULT_CONFIG_DIR = '.custom';
    assert.equal((await loadConfig()).configDir, '.custom');
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, {recursive:true, force:true});
  }
});
