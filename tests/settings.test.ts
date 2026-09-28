import assert from "node:assert/strict";
import { test } from "node:test";
import { realpath, mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../src/vault.js";
import { listObsidianSettings, readObsidianSettings, redactSettings } from "../src/settings.js";

test("settings redaction handles nested secrets, credentials in URLs, and absolute paths", () => {
  const result = redactSettings({apiKey: "secret", nested: {access_token: "secret", url: "https://host/?token=secret", path: "/Users/private", items: ["Bearer secret"]}, theme: "dark"});
  assert.equal(result.redactedValues, 5);
  assert.ok(!JSON.stringify(result.data).includes("secret"));
  assert.equal((result.data as {theme: string}).theme, "dark");
});

test("settings allowlist is separate from note access and denies plugin data, traversal, and symlinks", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "settings-test-")));
  try {
    await mkdir(join(root, ".obsidian"));
    await writeFile(join(root, ".obsidian", "app.json"), JSON.stringify({newFileLocation: "folder", newFileFolderPath: "Inbox", apiKey: "secret"}));
    await writeFile(join(root, ".obsidian", "graph.json"), JSON.stringify({showOrphans: true}));
    await writeFile(join(root, ".obsidian", "hotkeys.json"), "not JSON");
    await writeFile(join(root, "outside.json"), JSON.stringify({secret: "outside"}));
    await symlink(join(root, "outside.json"), join(root, ".obsidian", "appearance.json"));
    const vault = new Vault({root, id: "test", excludedPaths: []});
    const list = await listObsidianSettings(vault);
    assert.equal(list.files.find(item => item.file === "app.json")?.status, "available");
    assert.equal(list.files.find(item => item.file === "templates.json")?.status, "not_found");
    assert.equal(list.files.find(item => item.file === "hotkeys.json")?.status, "unavailable");
    assert.equal(list.files.find(item => item.file === "appearance.json")?.status, "unavailable");
    const read = await readObsidianSettings(vault, "app.json", "apiKey");
    assert.equal(read.data, "[REDACTED]");
    assert.equal((await readObsidianSettings(vault, "app.json", "newFileFolderPath")).data, "Inbox");
    await assert.rejects(() => vault.readSettingsDocument("plugins/test/data.json"));
    await assert.rejects(() => vault.readSettingsDocument("../outside.json"));
    await assert.rejects(() => vault.readSettingsDocument("appearance.json"));
    await assert.rejects(() => vault.readNote(".obsidian/app.json"));
    await assert.rejects(() => vault.getTree(".obsidian"));
    await assert.rejects(() => readObsidianSettings(vault, "app.json", "__proto__"));
    await mkdir(join(root, ".profile"));
    await writeFile(join(root, ".profile", "graph.json"), '{"showTags":true}');
    const profile = new Vault({root, id: "test", excludedPaths: [], configDir: ".profile"});
    assert.deepEqual((await readObsidianSettings(profile, "graph.json")).data, {showTags: true});
  } finally { await rm(root, {recursive: true, force: true}); }
});
