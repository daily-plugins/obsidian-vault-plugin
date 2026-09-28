import assert from "node:assert/strict";
import { test } from "node:test";
import { realpath, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureGraphView, type CliRunner } from "../src/graph-view.js";

test("native capture verifies Vault, opens graph, returns PNG, and cleans up", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "graph-cli-test-")));
  const calls: string[][] = [];
  let output = "";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=", "base64");
  const run: CliRunner = async args => {
    calls.push(args);
    if (args[1] === "vault") return root;
    if (args[1] === "commands") return "graph:animate\ngraph:open";
    if (args[1] === "dev:screenshot") {
      output = args[2]!.slice("path=".length);
      await writeFile(output, png);
    }
    return "";
  };
  try {
    const result = await captureGraphView({root, id: "test", excludedPaths: []}, run, 0);
    assert.equal(result.data, png.toString("base64"));
    assert.deepEqual(calls.map(call => call[1]), ["vault", "commands", "command", "dev:screenshot"]);
    assert.equal(calls[2]?.[2], "id=graph:open");
    assert.ok(calls.every(call => call[0]!.startsWith("vault=")));
    await assert.rejects(() => access(output));
    await assert.rejects(() => captureGraphView({root, id: "test", excludedPaths: []}, async () => "/missing-vault", 0), /different Vault/);
    await assert.rejects(() => captureGraphView({root, id: "test", excludedPaths: []}, async args => args[1] === "vault" ? root : "", 0), /Graph view core plugin/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
