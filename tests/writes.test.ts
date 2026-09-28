import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, realpath, readFile, readdir, rm, writeFile, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../src/vault.js';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vault-writes-')));
  await mkdir(join(root, 'notes'));
  await mkdir(join(root, 'private'));
  return {root, vault: new Vault({root, id: 'test', excludedPaths: ['private']})};
}

test('create previews without side effects and never overwrites concurrent creations', async () => {
  const {root, vault} = await fixture();
  try {
    const preview = await vault.createNote('notes/새 노트.md', '# Hello 😀\r\n');
    assert.equal(preview.applied, false);
    assert.deepEqual(await readdir(join(root, 'notes')), []);
    const results = await Promise.allSettled([
      vault.createNote('notes/새 노트.md', '# Hello 😀\r\n', false),
      vault.createNote('notes/새 노트.md', 'other', false),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.deepEqual(await readdir(join(root, 'notes')), ['새 노트.md']);
    await assert.rejects(vault.createNote('notes/새 노트.md', 'overwrite', false));
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('patch preserves BOM/CRLF, backs up exact original bytes, and rejects stale or ambiguous edits', async () => {
  const {root, vault} = await fixture();
  try {
    const original = '\uFEFF# 제목\r\nfirst 😀\r\nsecond\r\n';
    await writeFile(join(root, 'notes/test.md'), original);
    const before = await vault.readDocument('notes/test.md');
    const preview = await vault.patchNote('notes/test.md', before.revision, 'first 😀', 'updated');
    assert.equal(preview.applied, false);
    assert.equal(await readFile(join(root, 'notes/test.md'), 'utf8'), original);
    assert.deepEqual(await readdir(join(root, 'notes')), ['test.md']);
    const applied = await vault.patchNote('notes/test.md', before.revision, 'first 😀', 'updated', false);
    assert.equal(applied.applied, true);
    assert.equal(applied.revision, preview.revision);
    assert.equal(await readFile(join(root, applied.backupPath!), 'utf8'), original);
    assert.equal(await readFile(join(root, 'notes/test.md'), 'utf8'), original.replace('first 😀', 'updated'));
    await assert.rejects(vault.patchNote('notes/test.md', before.revision, 'second', 'bad', false), /Revision conflict/);
    await assert.rejects(vault.patchNote('notes/test.md', applied.revision, '\r\n', '\n', false), /ambiguous/);
    await assert.rejects(vault.patchNote('notes/test.md', applied.revision, 'missing', 'x', false), /not found/);
    const noOp = await vault.patchNote('notes/test.md', applied.revision, 'second', 'second', false);
    assert.equal(noOp.applied, false);
    assert.equal(noOp.changed, false);
    const entries = await readdir(join(root, 'notes'));
    assert.equal(entries.filter(n => n.endsWith('.bak')).length, 1);
    assert.ok(!entries.some(n => /\.(tmp|lock)$/.test(n)));
    const tree = await vault.getTree();
    assert.ok(!tree.entries.some(e => e.name.endsWith('.bak')));
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('write access rejects hidden/excluded/traversal paths, links, oversize data and invalid Unicode', async () => {
  const {root, vault} = await fixture();
  try {
    await writeFile(join(root, 'notes/test.md'), 'original');
    await symlink(join(root, 'notes'), join(root, 'linked'));
    await symlink(join(root, 'notes/test.md'), join(root, 'alias.md'));
    await link(join(root, 'notes/test.md'), join(root, 'hard.md'));
    const revision = 'a'.repeat(64);
    for (const path of ['../escape.md', '.obsidian/x.md', 'private/x.md', 'linked/x.md', 'file.txt', 'missing/new.md']) {
      await assert.rejects(vault.createNote(path, 'bad', false));
      await assert.rejects(vault.patchNote(path, revision, 'original', 'bad', false));
    }
    for (const path of ['alias.md', 'hard.md']) {
      await assert.rejects(vault.createNote(path, 'bad', false));
      await assert.rejects(vault.patchNote(path, revision, 'original', 'bad', false));
    }
    await assert.rejects(vault.createNote('huge.md', '한'.repeat(400000), false), /1 MiB/);
    await assert.rejects(vault.createNote('invalid.md', '\ud800', false), /Unicode/);
    assert.equal(await readFile(join(root, 'notes/test.md'), 'utf8'), 'original');
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('competing patches do not both apply the same revision', async () => {
  const {root, vault} = await fixture();
  try {
    const note = await vault.createNote('note.md', 'initial', false);
    const results = await Promise.allSettled([
      vault.patchNote('note.md', note.revision, 'initial', 'one', false),
      vault.patchNote('note.md', note.revision, 'initial', 'two', false),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(['one', 'two'].includes(await readFile(join(root, 'note.md'), 'utf8')));
    assert.equal((await readdir(root)).filter(n => n.endsWith('.bak')).length, 1);
  } finally { await rm(root, {recursive: true, force: true}); }
});
