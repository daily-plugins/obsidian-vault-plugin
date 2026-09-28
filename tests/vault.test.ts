import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, link, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault, LIMITS } from "../src/vault.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "vault-test-")));
  const root = join(temp, "vault");
  await mkdir(root);
  for (const name of ["notes", ".obsidian", "private", "node_modules"]) await mkdir(join(root, name));
  await writeFile(join(root, "notes", "학습.md"), "# English\nOPIC practice 😀\n#study\n");
  await writeFile(join(root, "Other.MD"), "Unrelated note");
  for (const name of [".obsidian", "private", "node_modules"]) await writeFile(join(root, name, "secret.md"), "OPIC secret");
  await writeFile(join(temp, "outside.md"), "OPIC OUTSIDE SECRET");
  await symlink(join(temp, "outside.md"), join(root, "escape.md"));
  await symlink(temp, join(root, "escape-dir"));
  await symlink(join(root, "notes", "학습.md"), join(root, "internal-link.md"));
  await link(join(temp, "outside.md"), join(root, "hardlink.md"));
  return { temp, root, vault: new Vault({root, id: "test", excludedPaths: ["private"]}) };
}

test("reads paginated Unicode text with stable revisions and detects subsequent changes", async () => {
  const f = await fixture();
  try {
    let offset = 0, content = "", revision = "";
    do {
      const page = await f.vault.readNote("notes/학습.md", offset, 3);
      if (revision) assert.equal(page.revision, revision);
      revision = page.revision;
      content += page.content;
      assert.ok(!page.content.includes("\uFFFD"));
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    } while (true);
    assert.equal(content, "# English\nOPIC practice 😀\n#study\n");
    await writeFile(join(f.root, "notes", "학습.md"), "Changed");
    assert.notEqual((await f.vault.readNote("notes/학습.md")).revision, revision);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("denies traversal, absolute paths, hidden/excluded paths, links, and non-Markdown files", async () => {
  const f = await fixture();
  try {
    for (const path of ["../outside.md", join(f.temp, "outside.md"), "notes/../../outside.md", "notes/../Other.MD", ".obsidian/secret.md", "private/secret.md", "node_modules/secret.md", "escape.md", "escape-dir/outside.md", "internal-link.md", "hardlink.md", "notes\\학습.md", "C:/outside.md", "file.txt"]) {
      await assert.rejects(() => f.vault.readNote(path), undefined, path);
    }
    await assert.rejects(() => f.vault.searchNotes("secret", "../"));
    await assert.rejects(() => f.vault.searchNotes("secret", "private"));
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("searches literal text and paths, narrows folders, and reports incomplete results", async () => {
  const f = await fixture();
  try {
    const result = await f.vault.searchNotes("opic");
    assert.deepEqual(result.results.map(r => r.path), ["notes/학습.md"]);
    assert.equal(result.results[0]?.line, 2);
    assert.equal(result.skippedFiles, 1); // hard link rejected
    assert.equal((await f.vault.searchNotes("학습", "notes")).results.length, 1);
    assert.equal((await f.vault.searchNotes("#study")).results.length, 1);
    assert.equal((await f.vault.searchNotes(".*")).results.length, 0);
    assert.equal((await f.vault.searchNotes("OPIC", "notes", 1)).truncated, true);
    assert.equal((await f.vault.searchNotes("Unrelated")).results[0]?.path, "Other.MD");
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("rejects oversized and invalid UTF-8 notes and invalid offsets", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, "large.md"), Buffer.alloc(LIMITS.fileBytes + 1));
    await writeFile(join(f.root, "binary.md"), Buffer.from([0xff]));
    await assert.rejects(() => f.vault.readNote("large.md"), /limit/);
    await assert.rejects(() => f.vault.readNote("binary.md"), /UTF-8/);
    await assert.rejects(() => f.vault.readNote("Other.MD", 9999), /Offset/);
    assert.equal((await f.vault.searchNotes("OPIC")).results.length, 1);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("MCP stdio exposes tools, validates inputs, and returns sanitized errors", async () => {
  const f = await fixture();
  const client = new Client({name: "integration-test", version: "1.0.0"});
  try {
    await client.connect(new StdioClientTransport({command: process.execPath, args: ["dist/index.js"],
      env: {OBSIDIAN_VAULT_PATH: f.root, OBSIDIAN_VAULT_ID: "test", OBSIDIAN_EXCLUDED_PATHS: '["private"]'}}));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_vault_context", "search_notes", "read_note"]);
    const search = await client.callTool({name: "search_notes", arguments: {query: "OPIC"}});
    assert.equal(search.isError, undefined);
    assert.deepEqual((search.structuredContent?.results as {path: string}[]).map(r => r.path), ["notes/학습.md"]);
    const read = await client.callTool({name: "read_note", arguments: {path: "notes/학습.md"}});
    assert.equal(read.structuredContent?.content, "# English\nOPIC practice 😀\n#study\n");
    for (const path of ["missing.md", "../outside.md", "escape.md", "private/secret.md"]) {
      const result = await client.callTool({name: "read_note", arguments: {path}});
      assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result).includes(f.temp));
      assert.ok(!JSON.stringify(result).includes("OUTSIDE SECRET"));
    }
    const invalid = await client.callTool({name: "search_notes", arguments: {query: "", limit: 100}});
    assert.equal(invalid.isError, true);
  } finally { await client.close(); await rm(f.temp, { recursive: true, force: true }); }
});
