import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../src/vault.js';
import { InstructionReviews } from '../src/instruction-review.js';
import { DEFAULT_INSTRUCTION_NAMES as names } from '../src/instructions.js';

test('write review binds complete default guidance to path, time, scope revisions and server instance', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'review-test-')));
  try {
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'AGENTS.md'), 'Root guidance');
    let now = 1000;
    const vault = new Vault({root, id: 'test', excludedPaths: []});
    const reviews = new InstructionReviews(vault, () => now);
    const first = await reviews.inspect('notes/new.md', 'file', names);
    assert.ok(first.reviewToken);
    await reviews.verify('notes/new.md', first.reviewToken!);
    await assert.rejects(reviews.verify('other.md', first.reviewToken!), /review required/);
    await assert.rejects(new InstructionReviews(vault).verify('notes/new.md', first.reviewToken!), /review required/);
    assert.equal((await reviews.inspect('notes/new.md', 'file', ['OTHER.md'])).reviewToken, null);
    await writeFile(join(root, 'notes/Agents.md'), 'New nested guidance');
    await assert.rejects(reviews.verify('notes/new.md', first.reviewToken!), /instructions changed/);
    const second = await reviews.inspect('notes/new.md', 'file', names);
    now += 300001;
    await assert.rejects(reviews.verify('notes/new.md', second.reviewToken!), /review required/);
    const third = await reviews.inspect('notes/new.md', 'file', names);
    reviews.consume(third.reviewToken!);
    await assert.rejects(reviews.verify('notes/new.md', third.reviewToken!), /review required/);
    await writeFile(join(root, 'notes/Agents.md'), 'x'.repeat(20001));
    assert.equal((await reviews.inspect('notes/new.md', 'file', names)).reviewToken, null);
    await rm(join(root, 'notes/Agents.md'));
    await symlink(join(root, 'AGENTS.md'), join(root, 'notes/AGENTS.md'));
    assert.equal((await reviews.inspect('notes/new.md', 'file', names)).reviewToken, null);
    await rm(join(root, 'notes/AGENTS.md'));
    const excluded = new InstructionReviews(new Vault({root, id: 'test', excludedPaths: ['AGENTS.md']}));
    assert.equal((await excluded.inspect('notes/new.md', 'file', names)).reviewToken, null);
    await rm(join(root, 'AGENTS.md'));
    const empty = await reviews.inspect('notes/new.md', 'file', names);
    assert.equal(empty.instructions.length, 0);
    assert.ok(empty.reviewToken); // Absence must also be checked, not assumed.
  } finally { await rm(root, {recursive: true, force: true}); }
});
