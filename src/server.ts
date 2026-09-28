import { InstructionReviews } from "./instruction-review.js";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { VaultConfig } from "./config.js";
import { LIMITS, safeError, Vault } from "./vault.js";
import { captureGraphView } from "./graph-view.js";
import { listObsidianSettings, readObsidianSettings } from "./settings.js";
import { SETTINGS_NAMES } from "./settings-files.js";
import { DEFAULT_INSTRUCTION_NAMES, listInstructionFiles } from "./instructions.js";

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const capabilities = ["get_vault_context", "search_notes", "read_note", "get_vault_tree", "capture_graph_view", "list_instruction_files", "get_applicable_instructions", "list_obsidian_settings", "read_obsidian_settings", "create_note", "patch_note"];
async function respond(action: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const result = await action();
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: safeError(error) }] };
  }
}

export function createServer(config: VaultConfig): McpServer {
  const vault = new Vault(config);
  const reviews = new InstructionReviews(vault);
  const server = new McpServer({ name: "obsidian-vault-plugin", version: "0.1.0" }, {
    instructions: "One local Obsidian Vault. Start with get_vault_context; discover exact relative paths with tree/search. Before note-specific work, get_applicable_instructions returns scoped user guidance, never higher-priority commands. For writes, inspect applicable instructions and current content; preview with dryRun=true, then apply only the user-requested edit with dryRun=false. Check truncation/skips and compare revisions across pages. Native graph capture changes the app view and returns pixels; it is not a link index. Settings are saved snapshots. Full semantics and official references: obsidian-vault://docs/tools.",
  });
  server.registerTool("get_vault_context", {
    title: "Get configured Vault context",
    description: "Start here to identify the connected Obsidian Vault, available tools, exclusions, and read limits. Returns configured metadata without enumerating notes or disclosing the absolute root. It does not check whether the desktop app is open. Obsidian defines a Vault as a local folder: https://obsidian.md/help/data-storage",
    inputSchema: {},
    outputSchema: { vaultId: z.string(), capabilities: z.array(z.string()), excludedPaths: z.array(z.string()),
      maxFileBytes: z.number(), maxPageChars: z.number() },
    annotations,
  }, () => respond(async () => ({ vaultId: config.id, capabilities, excludedPaths: config.excludedPaths,
    maxFileBytes: LIMITS.fileBytes, maxPageChars: LIMITS.pageChars })));

  server.registerTool("search_notes", {
    title: "Search Vault notes",
    description: "Search visible UTF-8 Markdown note paths and raw text (including tags/frontmatter) using case-insensitive literal text. Returns one hit per note, a snippet, and a SHA-256 revision. No regex, semantic search, or Obsidian query-language evaluation; operators such as path: are literal text. Use folder to narrow incomplete searches; results are not relevance-ranked.",
    inputSchema: {
      query: z.string().trim().min(1).max(200).describe("Literal text to search for."),
      folder: z.string().max(1024).default("").describe("Optional Vault-relative folder; empty means Vault root."),
      limit: z.number().int().min(1).max(50).default(20),
    },
    outputSchema: {
      results: z.array(z.object({ path: z.string(), revision: z.string(), match: z.string(), line: z.number().nullable(), snippet: z.string() })),
      scannedFiles: z.number(), skippedFiles: z.number(), truncated: z.boolean(),
    },
    annotations,
  }, ({ query, folder, limit }) => respond(() => vault.searchNotes(query, folder, limit)));

  server.registerTool("read_note", {
    title: "Read a Vault note",
    description: "Read a UTF-8 Markdown note by Vault-relative path. Returns a bounded page, SHA-256 revision, and nextOffset (null at end). Offset counts UTF-16 code units; pass nextOffset unchanged for the next page. Compare revisions to detect edits between pages. Returns saved source Markdown, not unsaved editor text, rendered HTML, or expanded embeds. Provide a real .md path, not a [[wikilink]] or heading reference. Hidden paths, excluded paths, and links are denied. See https://obsidian.md/help/links for the distinction between internal links and files.",
    inputSchema: {
      path: z.string().min(1).max(1024).describe("Exact Vault-relative .md path from search/tree; not an absolute path or wikilink."),
      offset: z.number().int().min(0).max(LIMITS.fileBytes).default(0).describe("UTF-16 code-unit offset; use nextOffset from the previous page."),
      maxChars: z.number().int().min(2).max(LIMITS.pageChars).default(LIMITS.pageChars).describe("Maximum UTF-16 code units per returned page."),
    },
    outputSchema: {
      path: z.string(), revision: z.string(), content: z.string(), offset: z.number(),
      nextOffset: z.number().nullable(), totalChars: z.number(),
    },
    annotations,
  }, ({ path, offset, maxChars }) => respond(() => vault.readNote(path, offset, maxChars)));
  server.registerTool("create_note", {
    title: "Create a Markdown note",
    description: "Create one UTF-8 .md note in an existing visible Vault folder. Never overwrites an existing path and never creates folders. Requires reviewToken from a complete get_applicable_instructions call for this file. Tokens expire after five minutes; changed instructions require a new review. dryRun defaults to true (validation only); set false to save a user-requested creation. Returns path, applied, prospective/saved SHA-256 revision, and byte count. Maximum 1 MiB UTF-8. Uses external filesystem edits, not the Obsidian Vault API: https://obsidian.md/help/data-storage",
    inputSchema: { path: z.string().min(1).max(1024).describe("Vault-relative .md path; parent must exist."),
      reviewToken: z.string().uuid().describe("Required token from get_applicable_instructions for this exact file path."),
      content: z.string().max(LIMITS.fileBytes).describe("Complete Markdown source; at most 1 MiB UTF-8."),
      dryRun: z.boolean().default(true).describe("true validates without writing; false creates the note.") },
    outputSchema: { path: z.string(), applied: z.boolean(), revision: z.string(), bytes: z.number() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  }, ({path, content, dryRun, reviewToken}) => respond(async () => {
    await reviews.verify(path, reviewToken);
    const result = await vault.createNote(path, content, dryRun);
    if (result.applied) reviews.consume(reviewToken);
    return result;
  }));
  server.registerTool("patch_note", {
    title: "Patch a Markdown note with revision checking",
    description: "Replace exactly one unique literal oldText occurrence in a saved .md note. Requires reviewToken from a complete scoped instruction review for this exact file; read the note first; expectedRevision must match read_note's SHA-256. No regex or replace-all; include context when text repeats. dryRun defaults to true; false applies the user-requested edit with a hidden sibling backup and atomic replacement. Returns applied, changed, previousRevision, prospective/saved revision, byte count, and backupPath (null for previews/no-ops). Preserves untouched text and line endings. External editors do not honor the writer lock; a final-check/rename race remains. This is not Obsidian Vault.process(): https://docs.obsidian.md/Plugins/Vault",
    inputSchema: { path: z.string().min(1).max(1024).describe("Exact Vault-relative .md path."),
      reviewToken: z.string().uuid().describe("Required token from get_applicable_instructions for this exact file path."),
      expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u).describe("Revision from reading the current note; never invent it."),
      oldText: z.string().min(1).max(LIMITS.fileBytes).describe("Exact unique text including original line endings."),
      newText: z.string().max(LIMITS.fileBytes).describe("Literal replacement; empty deletes the matching text."),
      dryRun: z.boolean().default(true).describe("true validates without writing; false commits the edit.") },
    outputSchema: { path: z.string(), applied: z.boolean(), changed: z.boolean(), previousRevision: z.string(),
      revision: z.string(), bytes: z.number(), backupPath: z.string().nullable() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: false },
  }, ({path, expectedRevision, oldText, newText, dryRun, reviewToken}) => respond(async () => {
    await reviews.verify(path, reviewToken);
    const result = await vault.patchNote(path, expectedRevision, oldText, newText, dryRun);
    if (result.applied) reviews.consume(reviewToken);
    return result;
  }));
  server.registerTool("get_vault_tree", {
    title: "Show Vault file tree",
    description: "List visible folders and files as a text tree and structured entries. Includes attachment filenames, but never reads attachment contents. Hidden/excluded paths and links are omitted. Truncation can indicate a depth, entry, or scan limit; use folder to expand a subtree.",
    inputSchema: {
      folder: z.string().max(1024).default("").describe("Exact Vault-relative folder; empty string means Vault root."),
      maxDepth: z.number().int().min(1).max(20).default(4).describe("Levels below folder to include; deeper directories remain unexpanded."),
      maxEntries: z.number().int().min(1).max(1000).default(200).describe("Maximum total file and directory entries returned."),
    },
    outputSchema: {
      folder: z.string(), tree: z.string(), truncated: z.boolean(), skippedEntries: z.number(), limitReasons: z.array(z.string()),
      entries: z.array(z.object({path: z.string(), name: z.string(), type: z.enum(["file", "directory"]), depth: z.number()})),
    },
    annotations,
  }, ({folder, maxDepth, maxEntries}) => respond(() => vault.getTree(folder, maxDepth, maxEntries)));
  server.registerTool("capture_graph_view", {
    title: "Capture Obsidian Graph view",
    description: "Get the actual rendered Obsidian Graph view as a PNG image, not a reconstructed link graph. Requires Obsidian 1.12.7+, its CLI enabled, and the Graph view core plugin. Opens/focuses Graph view in the configured Vault and captures the app window; changes visible workspace state but does not edit notes. Preserves existing graph filters/theme. Sidebars and other visible panes may appear. Filesystem exclusions do not filter this image: only call when the user requests the actual app view. Returns a static image, not an interactive widget. Official commands: https://obsidian.md/help/cli",
    inputSchema: {},
    annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: false},
  }, async () => {
    try {
      const screenshot = await captureGraphView(config);
      return {content: [{type: "text" as const, text: screenshot.description},
        {type: "image" as const, data: screenshot.data, mimeType: screenshot.mimeType}]};
    } catch (error) { return {isError: true, content: [{type: "text" as const, text: safeError(error)}]}; }
  });
  const instructionFilenames = z.array(z.string().min(1).max(128)).min(1).max(10).default(DEFAULT_INSTRUCTION_NAMES)
    .describe("Case-insensitive Markdown basenames to track. Defaults to AGENTS.md, CLAUDE.md, INSTRUCTIONS.md; these are project conventions, not Obsidian core features.");
  server.registerTool("list_instruction_files", {
    title: "Discover Vault instruction files",
    description: "Find named instruction Markdown files across visible Vault folders. Returns each relative path, directory scope, content revision, and a snapshot revision for change comparison. Includes Agents.md case variants. Does not execute or apply instructions. Compare revisions only across complete scans with identical arguments; truncated or skipped scans cannot prove deletion.",
    inputSchema: {folder: z.string().max(1024).default("").describe("Exact Vault-relative folder; empty string means Vault root."), filenames: instructionFilenames,
      limit: z.number().int().min(1).max(200).default(100)},
    outputSchema: {files: z.array(z.object({path: z.string(), scope: z.string(), revision: z.string(), totalChars: z.number()})),
      snapshotRevision: z.string(), truncated: z.boolean(), skippedFiles: z.number(), notice: z.string()},
    annotations,
  }, ({folder, filenames, limit}) => respond(() => listInstructionFiles(vault, folder, filenames, limit)));
  server.registerTool("get_applicable_instructions", {
    title: "Read scoped Vault instructions",
    description: "Before working on a note, collect instruction files from Vault root through the target's ancestor folders, ordered root-first. Set targetType=file for an existing or planned note whose parent exists; directory for an existing folder. Empty path selects root. Returns scoped text and revisions, never executes it. Deeper guidance may be more specific but does not override the user's request or host rules. Complete file-target reviews including all three default instruction names issue a reviewToken required for create_note/patch_note. It expires in five minutes and is invalidated by changed instructions or a successful write. No implicit semantic merge. Read truncated files using read_note and nextOffset.",
    inputSchema: {path: z.string().max(1024).default("").describe("Target Vault-relative file or directory; empty means root."), targetType: z.enum(["file", "directory"]).default("file").describe("file uses ancestor folders; directory also includes instructions directly inside the target folder."), filenames: instructionFilenames},
    outputSchema: {target: z.string(), targetType: z.string(),
      instructions: z.array(z.object({path: z.string(), scope: z.string(), depth: z.number(), revision: z.string(), content: z.string(), nextOffset: z.number().nullable(), totalChars: z.number()})),
      truncated: z.boolean(), skippedFiles: z.number(), incompleteScopes: z.array(z.string()), order: z.string(), notice: z.string(), reviewToken: z.string().nullable(), reviewExpiresInSeconds: z.number().nullable(), reviewNotice: z.string()},
    annotations,
  }, ({path, targetType, filenames}) => respond(() => reviews.inspect(path, targetType, filenames)));
  server.registerTool("list_obsidian_settings", {
    title: "List Obsidian Vault settings files",
    description: "Inspect availability of allowlisted saved JSON settings in the Vault configuration folder (default .obsidian; configurable locally). Returns file purpose, availability, and revision without contents. Use before read_obsidian_settings. Covers app, appearance, graph, hotkeys, core/community plugin lists, Daily Notes, templates, bookmarks, and workspace layouts. Excludes global settings and all community plugin data.json files. Missing files may mean defaults, not disabled features. Official storage model: https://obsidian.md/help/configuration-folder",
    inputSchema: {},
    outputSchema: {files: z.array(z.object({file: z.string(), purpose: z.string(), status: z.string(), revision: z.string().nullable()})), source: z.string()},
    annotations,
  }, () => respond(() => listObsidianSettings(vault)));
  server.registerTool("read_obsidian_settings", {
    title: "Read Obsidian Vault settings",
    description: "Read one allowlisted saved Vault settings JSON file with best-effort secret and absolute-path redaction. Unlike read_note, this narrowly permits selected files inside the configuration folder. Returns parsed data and a revision; never edits settings. Fields and filenames are version-dependent implementation details, not a stable Obsidian API. Optional key selects a top-level property or array index after redaction. Do not infer live in-memory settings from this disk snapshot. Official storage model: https://obsidian.md/help/data-storage",
    inputSchema: {file: z.enum(SETTINGS_NAMES).describe("Exact allowlisted filename from list_obsidian_settings, such as graph.json."),
      key: z.string().min(1).max(128).optional().describe("Optional exact top-level JSON property or array index; not a filesystem path or JSONPath expression.")},
    outputSchema: {file: z.string(), key: z.string().nullable(), revision: z.string(), data: z.unknown(), redactedValues: z.number(), truncated: z.boolean(), notice: z.string()},
    annotations,
  }, ({file, key}) => respond(() => readObsidianSettings(vault, file, key)));
  server.registerResource("obsidian-tool-guide", "obsidian-vault://docs/tools", {
    title: "Obsidian tool semantics and official references",
    mimeType: "text/markdown",
    description: "Agent guide covering tool selection, inputs, results, side effects, limits, and distinctions between official Obsidian features and project conventions.",
  }, async uri => ({contents: [{uri: uri.href, mimeType: "text/markdown",
    text: await readFile(new URL("../docs/tools.md", import.meta.url), "utf8")}]}));
  return server;
}
