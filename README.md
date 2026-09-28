# Obsidian ChatGPT Plugin

A local, single-Vault MCP integration for ChatGPT.

## Getting started

Requires Node.js 20.20 or later. Run commands from the project root.

```sh
npm ci
cp .env.example .env
# Set OBSIDIAN_VAULT_PATH in .env to your Vault's absolute path.
npm run typecheck
npm run build
npm start
```

The stdio server waits for MCP client requests. It does not open an HTTP port.
Use `npm run dev` to run the TypeScript source directly.

## Local inspection

```sh
npx @modelcontextprotocol/inspector node --env-file=.env dist/index.js
```

Open the full terminal URL containing `MCP_PROXY_AUTH_TOKEN`, or enter the
current session token under Configuration → Proxy Session Token in Inspector.
This is a local Inspector token, not an OpenAI API key. Keep it private.

Call `get_vault_context` without arguments to verify the configured Vault ID.
The initial scaffold does not read or modify notes. ChatGPT connection wiring
and public deployment are not implemented yet.

Keep `.env` and actual Vault contents out of Git.
