# HTTP connection: configuration and startup

## When to choose HTTP

Use Streamable HTTP for an MCP client that connects to a URL and can send a
Bearer token. The default endpoint is `http://127.0.0.1:3000/mcp`. All eleven
Vault tools and mandatory instruction reviews are available. HTTP is a transport
option; it does not guarantee that a client will display MCP image content.

## Configuration

From the repository root, install dependencies, configure the shared `.env`
using `.env.example`, and build:

```sh
npm ci
npm run build
cp .env.http.example .env.http
chmod 600 .env.http
openssl rand -hex 32
```

Copy only during first setup. Paste the generated value into `.env.http`:

```dotenv
OBSIDIAN_HTTP_TOKEN=PASTE_GENERATED_TOKEN_HERE
OBSIDIAN_HTTP_HOST=127.0.0.1
OBSIDIAN_HTTP_PORT=3000
OBSIDIAN_HTTP_ALLOWED_HOSTS=127.0.0.1:3000,localhost:3000
OBSIDIAN_HTTP_ALLOWED_ORIGINS=
```

The token must contain at least 32 non-whitespace characters. This is a locally
chosen HTTP credential, not an OpenAI runtime API key. Never commit it. The
launcher loads `.env` then `.env.http`; shell variables take precedence.
`ALLOWED_HOSTS` contains exact incoming Host values (including non-default ports).
Requests without an Origin header are accepted; requests with Origin require an
exact comma-separated allowlist match. Browser CORS/preflight is not implemented;
use an MCP client backend, not a direct browser fetch.

## Startup and shutdown

```sh
npm run start:http
```

For development use `npm run dev:http`. Keep the process running; Ctrl+C shuts
it down. `npm run start:stdio` remains available for local process-based clients.
HTTP needs neither `tunnel-client` nor `.env.tunnel`.

## Connect and verify

Configure your MCP client with:

```text
Transport: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Authorization: Bearer <OBSIDIAN_HTTP_TOKEN>
```

Header configuration differs by client. Use the same values in MCP Inspector's
Streamable HTTP connection and authentication settings. List tools, call
`get_vault_context`, then test a small tree query. `/healthz` accepts authenticated
GET requests and returns a minimal liveness response; it does not validate the
the host application GUI or end-to-end tool execution.

Use an MCP-aware client that preserves `Mcp-Session-Id` between calls. Each
session has its own instruction review tokens. At most 32 sessions are retained;
inactive sessions expire after 30 minutes. Disconnect with MCP session deletion
when available. Reinitialize after expiry/restart and review instructions again.
POST bodies are capped at 8 MiB; individual note limits remain 1 MiB.

## Remote HTTP and ChatGPT

`127.0.0.1` is reachable only from this computer. A remote client needs a reachable
HTTPS endpoint. For a trusted private network, configure the bind address,
firewall, exact Host allowlist, and a TLS reverse proxy intentionally. The app
never trusts forwarded Host/Origin headers automatically. Forward MCP session,
protocol-version, Accept, and Authorization headers and support GET/POST/DELETE.

This server provides static Bearer authentication, not an OAuth authorization
server or discovery endpoints. A ChatGPT-compatible public deployment needs an
OAuth-capable gateway that authenticates users, restricts access to this one
Vault, and supplies the backend Bearer credential. Do not assume the local token
can be pasted into ChatGPT's OAuth fields. Shared-token HTTP is for one trusted
owner, not multi-user Vault isolation. Public deployment is not implemented by
this checkout alone. For a direct private ChatGPT connection, use the
[tunnel guide](tunnel-connection.md).

## Troubleshooting

- Startup fails: check `.env`, token length, bind address, and available port.
- 401: supply the exact Bearer token on every request, including session deletion.
- 403: inspect Host/Origin allowlists; do not add wildcards.
- 404 at `/mcp`: session expired/unknown; initialize again. Other routes are absent.
- 400: malformed JSON or a missing initialization/session.
- 503: close unused sessions or wait for idle expiry.
- Write blocked: use a fresh complete instruction review in the same session.
- Stale tool list: rebuild, restart, reconnect, and refresh client metadata.

References: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and [ChatGPT connection requirements](https://developers.openai.com/plugins/deploy/connect-chatgpt).
