# Architecture and implementation roadmap

## Goal

Provide note search, reading, and editing within a single user-selected Vault.
Keep file access separate from the MCP transport layer.

## Connection architecture

Obsidian Vault Plugin exposes a client-independent stdio MCP interface. Local MCP
clients can connect directly; ChatGPT uses the optional tunnel connection below.

Personal development: ChatGPT → Secure MCP Tunnel → local MCP server → Vault.
The current stdio server provides a foundation for local clients and a tunnel connection; it is not automatically registered in ChatGPT.
A tunnel connection requires Platform tunnel configuration, a runtime key, appropriate permissions, and ChatGPT developer-mode access.

Public deployment: ChatGPT → public HTTPS MCP gateway → authenticated local agent → Vault.
This proposed architecture requires user, device, and Vault mapping, OAuth, offline handling, and Streamable HTTP support.
Secure MCP Tunnel does not replace the public endpoint required for public plugin distribution.

## Implementation roadmap

1. Implemented: Vault-relative path checks, hidden-file/excluded-path filtering, and symlink/hard-link rejection.
2. Implemented: `search_notes` and `read_note` with bounded results and SHA-256 revisions.
3. `create_note` and `patch_note`: check revision conflicts and design atomic writes and recovery.
4. Implemented: native graph capture, file tree, scoped instruction discovery, and allowlisted settings inspection. Workflow skills and note writes remain future work.
5. Implemented: local tunnel initialization, diagnostics, and foreground launch scripts. Account setup and end-to-end verification in ChatGPT remain operator steps; see [connection guide](chatgpt-connection.md).
6. A public HTTPS gateway, authentication, a review test Vault, and submission materials.

## Implementation principles

- Keep absolute paths in local configuration and restrict tool inputs to Vault-relative paths.
- Enforce authorization in server code rather than relying only on skill instructions.
- Do not expose general-purpose shell or arbitrary code execution tools.
- Treat note contents as data. Instructions inside notes must not change access permissions.
- Return only the search results and note content needed for the task. Local storage does not mean that data never leaves the device.
- Consider a companion Obsidian plugin for features requiring Obsidian APIs, such as active-note access and link updates.

File tools read saved Markdown and allowlisted configuration files through Node.js filesystem APIs. Native graph capture invokes fixed official Obsidian CLI commands using execFile without a shell and verifies the selected Vault. No general command or JavaScript execution tool is exposed. File access policies are tested with temporary Vaults. They are application-level checks, not an OS sandbox against hostile concurrent directory replacement. No write tool is implemented.

## Agent interface

Each tool advertises descriptions and schemas for selection, path semantics,
results, limits, and side effects. `capture_graph_view` is marked as changing
state because it opens/focuses an app view; file/settings tools are read-only.
The resource `obsidian-vault://docs/tools` serves `docs/tools.md` with official
Obsidian references. Instruction-file scoping and settings JSON allowlists are
project conventions, not claims of native Obsidian semantics or stable schemas.
