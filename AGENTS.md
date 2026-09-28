# Project workflow

- Keep primary project documentation in English. Maintain Korean translations under `notes/ko`, mirroring each source Markdown path, as requested by the user.
- Complete work in focused, reviewable task-sized changes.
- Run checks appropriate to each change, then commit that task before starting the next task.
- Use concise commit messages that describe the change.
- Never commit `.env`, credentials, personal Vault contents, dependencies, or build output.
- Do not push commits unless the user requests it.
- Ground Obsidian-specific tool descriptions in official documentation and link the relevant sources.
- Document each tool's purpose, path conventions, outputs, limits, and side effects; distinguish project conventions from native Obsidian behavior.
- Keep `docs/tools.md` and the MCP tool metadata consistent when changing behavior.
