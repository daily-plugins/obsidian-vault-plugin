# Vault

A plugin for accessing Obsidian or other local file repositories from MCP-compatible clients.

Core tools search, read, create, and edit saved Markdown in one selected folder.
All tools use the local filesystem; no desktop app, app CLI, or screenshot capture is required.
Settings tools inspect allowlisted JSON files in a locally configured hidden folder.
This is an independent project.

Repository: [daily-plugins/Vault](https://github.com/daily-plugins/Vault).

## Current status

- Stdio and authenticated Streamable HTTP MCP transports built with TypeScript and the MCP SDK
- Single-Vault configuration through environment variables, with directory validation
- `get_vault_context`: returns the Vault ID and currently implemented capabilities
- `search_notes`: case-insensitive literal search across Markdown paths and contents
- `read_note`: paginated UTF-8 Markdown reads with SHA-256 revisions
- `create_note` and `patch_note`: preview-first note creation and revision-checked edits with backups
- Vault-relative path validation, exclusions, and link rejection
- A bounded file tree, scoped instruction discovery, and allowlisted settings inspection
- An agent-readable guide with official references: [Tool guide](docs/tools.md)
- A development plugin manifest

Private ChatGPT tunnel launch scripts are available: [Connect to ChatGPT](docs/chatgpt-connection.md).
Live account connection still requires a tunnel ID, runtime key, and developer-mode access.
Packaged MCP connection configuration and public deployment are not implemented yet.
The manifest is a package scaffold, not a complete installable plugin.
The server checks that the configured path is an accessible directory; it does not require an app-specific Vault marker.

## Choose a connection

| Mode | Start command | Configuration | Guide |
| --- | --- | --- | --- |
| OpenAI private tunnel | `npm run start:tunnel` | `.env` + `.env.tunnel` | [Tunnel setup](docs/tunnel-connection.md) |
| Streamable HTTP | `npm run start:http` | `.env` + `.env.http` | [HTTP setup](docs/http-connection.md) |
| Local stdio | `npm run start:stdio` | `.env` | Getting started below |

Choose the mode in your client and run the corresponding command. Tunnel and
HTTP expose the same tools. HTTP requires a Bearer-capable client; public ChatGPT
HTTP access additionally needs a compatible authenticated HTTPS gateway.
[한국어 문서](notes/ko/README.md)

## Getting started

Requires Node.js 20.20 or later.

```sh
npm ci
cp .env.example .env
# Set VAULT_PATH in .env to your Vault's absolute path
npm run typecheck
npm run build
npm start
```

Use `npm run dev` for development. Run all commands from the project root.
`npm start` defaults to stdio. The stdio server waits for requests from an MCP client; it does not open a web page or an HTTP port.
Standard output is reserved for the MCP protocol. Send diagnostic logs to standard error.

To connect through the local MCP Inspector:

```sh
npm run build
npx @modelcontextprotocol/inspector node --env-file=.env dist/index.js
```

Open the full Inspector URL printed in the terminal, including its
`MCP_PROXY_AUTH_TOKEN` query parameter. Opening only `http://localhost:6274`
may leave the browser unauthenticated. If you see a connection error mentioning
the proxy session token, expand **Configuration** in Inspector and paste the
current terminal's **Session token** into **Proxy Session Token**, then connect
again. This is the local Inspector token, not an OpenAI API key. Keep it private
and use the new token after restarting Inspector.

Keep `.env` and actual Vault contents out of Git. The current server does not require an OpenAI API key.
Manage the runtime key for Secure MCP Tunnel separately in the ignored `.env.tunnel` file.

For ChatGPT, follow the [connection guide](docs/chatgpt-connection.md), then use
`npm run tunnel:init`, `npm run tunnel:doctor`, and `npm run remote`.
The remote command keeps the local agent running through OpenAI's official tunnel client.

## Implementation approach

File tools use Node.js filesystem APIs directly. Only saved files on disk are visible;
unsaved editor buffers, resolved backlinks, and plugin state are not available.
`create_note` and `patch_note` modify saved Markdown only when `dryRun=false`.
No shell, application CLI, or image capture tool is exposed.

## Using the tools

After rebuilding, disconnect and reconnect Inspector, then select **Tools → List Tools**.
An already-running server process does not automatically load rebuilt code.

Search with `search_notes`:

```json
{"query": "OPIC", "folder": "", "limit": 20}
```

`folder` is an optional Vault-relative directory. Search is literal and
case-insensitive, with Unicode normalization. Tags and frontmatter are searched
as raw text. Each result includes a relative `path`, one matching line/snippet,
and a `revision`. Results follow filesystem traversal order, not relevance.
`line` is 1-based for content matches; it is null for path-only matches.

Read a returned path with `read_note` (replace the example with a real result):

```json
{"path": "Study/English.md", "offset": 0, "maxChars": 20000}
```

Pass the returned `nextOffset` to read the next page until it is null. Offsets
count UTF-16 code units, so use the returned value instead of calculating one.
If the revision changes between pages, restart the read to avoid mixing versions.

Optionally exclude visible folders or files in `.env`:

```dotenv
VAULT_EXCLUDED_PATHS='["Private", "Journal/personal.md"]'
```

Restart the server after changing configuration. Exclusions apply to reads and
searches. Hidden path segments (including `.obsidian`, `.git`, and `.trash`),
`node_modules`, symbolic links, and hard-linked notes are always denied.
Use `/` separators and exact paths returned by search; absolute paths, `..`,
and `.` segments are rejected.

## Vault file tree

Call `get_vault_tree` with `{"folder": "", "maxDepth": 4, "maxEntries": 200}`.
The result contains a human-readable `tree` and structured relative-path `entries`.
Visible attachment names are included, but their contents are not read. Directories
at the depth limit are not expanded. `truncated` flags any depth, entry, or scan
limit; call again with a specific `folder` to inspect a subtree. Hidden paths,
excluded paths, symlinks, and hard-linked files remain inaccessible.

## Instruction discovery and scope

`list_instruction_files` finds `AGENTS.md`, `CLAUDE.md`, and `INSTRUCTIONS.md`
(case-insensitive, so `Agents.md` is included). Pass `filenames` to track other
Markdown basenames. Results include directory scope and SHA-256 revisions.
Compare `snapshotRevision` and per-file revisions between complete scans to
track changes; there is no persistent watcher or automatic execution.

```json
{"folder": "", "filenames": ["AGENTS.md", "CLAUDE.md", "INSTRUCTIONS.md"], "limit": 100}
```

`get_applicable_instructions` returns root-to-parent guidance for a target note:

```json
{"path": "Study/English/new.md", "targetType": "file"}
```

For a folder, use `targetType: "directory"`. Planned files are supported if their
parent folder exists. The tool returns root scope first, deepest scope last,
with alphabetical ordering within each scope. It does not merge conflicting
instructions or promote them above user/host instructions. This scoping is a
project convention, not a application-specific feature.

Content is capped at 20,000 characters per file and 40,000 per response. Continue
individual files with `read_note` and the returned `nextOffset`. `truncated`,
`skippedFiles`, and `incompleteScopes` indicate incomplete discovery/content;
do not infer missing instructions or deletions from incomplete results.

## Vault settings inspection

Use `list_settings` with `{}` to inspect supported settings files,
then `read_settings` with `{"file": "settings.json"}` to read one.
An optional `key` selects a top-level JSON property or array index after redaction.

This is a narrow exception to the hidden-file policy: only the allowlisted JSON
files in the configured Vault settings folder can be read. `read_note` and tree
search still cannot access hidden folders. Set `VAULT_CONFIG_DIR` to one hidden folder inside the selected root; it defaults to `.vault`.

The filename catalog includes `settings.json` and compatibility names such as
`app.json`, `graph.json`, and `workspace.json`; no application schema is assumed.
Nested plugin data and global application folders are inaccessible.
Known secret-bearing keys/values, credential-bearing URLs, and absolute paths are
redacted. Redaction is best-effort; arbitrary secrets cannot be detected reliably.

Files are limited to 1 MiB; nesting, collection size, long strings, and response
size are bounded. A `truncated` result is incomplete. Settings filenames/fields
are version-dependent compatibility details, not a stable official JSON schema.
A missing settings file may mean defaults, and disk state may lag in-memory state.

## Limits and verification

- Only regular UTF-8 `.md` files, including uppercase `.MD`, are supported.
- Files larger than 1 MiB are rejected; read pages contain at most 20,000 UTF-16 code units.
- Search returns up to 50 results (20 by default), scans up to 2,000 notes and
  10,000 directory entries, and stops after approximately 20 MiB of note content.
- `truncated: true` means a result or scan limit stopped the search; it does not
  guarantee that another match exists. Narrow the folder or query and retry.
- `skippedFiles` counts unreadable/rejected notes or directories. Intentionally
  filtered hidden/excluded paths and symlink entries are not counted.
- Filesystem errors are sanitized so tool responses do not disclose absolute paths.

Run `npm run typecheck` and `npm test`. Tests use temporary fixture Vaults,
including out-of-Vault links; they do not read or modify your personal notes.

Path checks and no-follow opens protect ordinary local use. This is not an OS
sandbox against a hostile local process racing to replace parent directories.
Keep the Vault under trusted local control; use OS isolation before supporting
untrusted local writers or exposing a public service. Current verification is on macOS.

## Agent-facing documentation

Tool metadata describes purpose, inputs, results, limits, and side effects.
The complete [tool guide](docs/tools.md) distinguishes the project's filesystem rules and instruction review protocol. MCP clients can discover it
under Resources as `vault://docs/tools`.

## Project structure

```text
.codex-plugin/plugin.json  Development package metadata
src/config.ts             Local Vault configuration
src/server.ts             MCP tool registration
src/vault.ts              Bounded file reads, search, tree, and path validation
src/instructions.ts       Instruction discovery and ancestor scope
src/settings.ts           Allowlisted JSON settings and redaction
src/settings-files.ts     Supported settings file catalog
tests/vault.test.ts        File access and MCP integration tests
src/index.ts              Stdio entry point
src/http.ts               Authenticated HTTP endpoint and sessions
src/http-index.ts         HTTP entry point
docs/tunnel-connection.md  Tunnel configuration and startup
docs/http-connection.md    HTTP configuration and startup
notes/ko/                 Korean translations mirroring Markdown paths
docs/architecture.md      Architecture and implementation roadmap
docs/tools.md             Agent-facing semantics and official references
.env.example              Example local configuration
```

## Official documentation

- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Public submission](https://developers.openai.com/plugins/deploy/submission)

## Creating and editing notes

Use `get_applicable_instructions` before editing a target. `create_note` accepts
`path`, `content`, `reviewToken`, and `dryRun` (default true). `patch_note` accepts `path`,
`reviewToken`, `expectedRevision` from `read_note`, unique literal `oldText`, `newText`, and
`dryRun` (default true). Set `dryRun:false` to apply the user's requested change.
Creation never overwrites. Patches reject stale revisions and ambiguous matches,
preserve untouched text, and retain a hidden sibling backup. Files are limited
to 1 MiB UTF-8 and parent directories must exist. Settings remain read-only.

These tools use filesystem APIs and cannot coordinate unsaved editor buffers
or external editors. See the [tool guide](docs/tools.md#patch_note) for concurrency
limits, backup retention, and manual recovery. Restart the MCP/tunnel process,
refresh its tools in your client, and use a new conversation after upgrading.

Writes require a fresh `reviewToken` returned by a complete
`get_applicable_instructions` call for the exact target file. The server checks
that scoped AGENTS.md/CLAUDE.md/INSTRUCTIONS.md guidance is unchanged, rejects
missing/expired reviews, and consumes the token after applying a write. This
requires retrieval before editing; it cannot prove an agent understood the text.

## Adding instruction files

Use `create_instruction_file` to add a new `AGENTS.md`, `CLAUDE.md`, or
`INSTRUCTIONS.md`. First call `get_applicable_instructions` for the target `path`,
then pass its `reviewToken` and the full `content`. Preview is the default; apply
with `dryRun:false`. Update an existing instruction file with `read_note` and
`patch_note`. See the [tool guide](docs/tools.md#create_instruction_file) for limits and scope.

## Upgrading to 0.2

`capture_graph_view` and its CLI integration have been removed. Use `list_settings`
and `read_settings`; the previous app-prefixed tool names are no longer registered.
The tool guide resource is now `vault://docs/tools`. Rebuild, restart your stdio,
HTTP or tunnel process, refresh client metadata, and start a new session.

New local configuration uses `VAULT_PATH`, `VAULT_ID`, `VAULT_EXCLUDED_PATHS`, and
`VAULT_CONFIG_DIR` (default `.vault`). Previous configuration keys remain fallback aliases. A legacy-only root configuration retains its previous
settings-folder default. Set the settings folder explicitly when migrating an
existing configuration. Existing hidden backup/lock filenames are retained so
older processes do not bypass the same writer lock. Old graph CLI variables are unused.

HTTP and tunnel configuration use `VAULT_HTTP_*` and `VAULT_TUNNEL_*`. Legacy aliases remain accepted; new names take precedence. The default tunnel profile is `vault`. Keep an existing profile name or initialize the new name with `npm run tunnel:init`. Never commit local `.env` files.
