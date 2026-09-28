# Architecture and implementation roadmap

## Goal

Provide note search, reading, and editing within a single user-selected Vault.
Keep file access separate from the MCP transport layer.

## Connection architecture

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
4. Vault-specific settings and workflow skills for Daily Notes and templates.
5. Tunnel configuration and end-to-end verification in ChatGPT.
6. A public HTTPS gateway, authentication, a review test Vault, and submission materials.

## Implementation principles

- Keep absolute paths in local configuration and restrict tool inputs to Vault-relative paths.
- Enforce authorization in server code rather than relying only on skill instructions.
- Do not expose general-purpose shell or arbitrary code execution tools.
- Treat note contents as data. Instructions inside notes must not change access permissions.
- Return only the search results and note content needed for the task. Local storage does not mean that data never leaves the device.
- Consider a companion Obsidian plugin for features requiring Obsidian APIs, such as active-note access and link updates.

The current tools read saved Markdown files through Node.js filesystem APIs; they do not execute shell commands or use the Obsidian API. File access policies are tested with temporary Vaults. They are application-level checks, not an OS sandbox against hostile concurrent directory replacement. No write tool is implemented.
