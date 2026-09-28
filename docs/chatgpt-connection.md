# Connect the local Vault to ChatGPT

This guide covers private tunnel connections. For mode-specific configuration
and startup see [Tunnel](tunnel-connection.md) or [HTTP](http-connection.md).

## Connection model

```text
ChatGPT → OpenAI Secure MCP Tunnel → tunnel-client on your Mac
                                      → local stdio MCP server → selected Vault
```

The local process must remain running. File operations execute on your computer;
requested note content and tool results travel to ChatGPT. No local HTTP server,
router port forwarding, or public inbound listener is needed.

This follows the local-device usage pattern of
[Desktop Commander Remote MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP#chatgpt--claude-web-remote-mcp).
Desktop Commander uses its own remote service and browser authentication. This
project instead uses OpenAI's tunnel service and runtime key. It does not register
with Desktop Commander's service or implement its device pairing/OAuth flow.
Only this project's Vault tools are exposed; there is no arbitrary shell tool.

## 1. Prepare the account and tunnel client

Follow the official [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels):

1. Open [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels).
2. Create a tunnel and associate it with the intended Platform organization and
   ChatGPT workspace. Save its `tunnel_id` locally.
3. Obtain a runtime API key authorized to use that tunnel. Creating tunnels
   requires Tunnels Read + Manage; running/selecting one requires Read + Use.
4. Download the macOS client using the download link in Platform settings or the
   latest-release link in the official guide. Install the executable on PATH, or
   set `TUNNEL_CLIENT_PATH` below. Verify with `tunnel-client help quickstart`.
5. In ChatGPT, enable Settings → Security and login → Developer mode. Availability
   depends on account/workspace policy and is separate from Platform permissions.

The launcher supports macOS/Linux. It does not install software, create remote
tunnels, grant permissions, or authenticate your account automatically.

## 2. Configure the local checkout

From the repository root, with dependencies installed and `.env` already pointing
at your Vault:

```sh
npm run build
cp .env.tunnel.example .env.tunnel
chmod 600 .env.tunnel
```

Copy the example only on first setup; preserve an existing `.env.tunnel`.
Edit it locally:

```dotenv
OBSIDIAN_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
CONTROL_PLANE_API_KEY=REPLACE_WITH_YOUR_RUNTIME_KEY
OBSIDIAN_TUNNEL_PROFILE=obsidian-vault
# TUNNEL_CLIENT_PATH=/absolute/path/to/tunnel-client
```

The runtime key is distinct from the MCP Inspector session token. Never paste it
into a conversation or commit it. `.env.tunnel` is ignored by Git. Shell environment
variables take precedence over file values. Vault configuration remains in `.env`.

## 3. Initialize and run

```sh
npm run tunnel:init
npm run tunnel:doctor
npm run remote
```

`tunnel:init` invokes the official `sample_mcp_stdio_local` profile initializer
with your tunnel ID, the current Node executable, and absolute `.env` and server
paths. The official client manages its profile outside this project's source.
The key is passed through the process environment, never as a command-line argument.
`tunnel:doctor` invokes the official diagnostic command with `--explain`.
`remote` runs the client in the foreground; the client starts the stdio server.
There is no need to run `npm start` separately. Stop with Ctrl+C.

Use a dedicated profile name to avoid colliding with another tunnel. Reinitialize
the profile after moving the checkout, changing Node installations, or changing
the tunnel ID. To change Vault settings, stop the client, edit `.env`, and restart.
After code changes, stop it, rebuild, and restart. After tool metadata changes,
also refresh the ChatGPT connection and start a new chat.

## 4. Connect in ChatGPT

Following the official [connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt):

1. Keep `npm run remote` running with a healthy tunnel connection.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins) and select the plus button.
3. Use a name such as **Vault** and a description such as
   **Search and inspect my selected local Vault.**
4. Choose **Connection → Tunnel**, then select your tunnel or enter its ID.
5. Create the connection and review the discovered tools.
6. Start a new chat and enable the connection from the tools menu.

Do not enter the Inspector URL (`localhost:6274`) as an MCP endpoint. It is a
local testing interface, and this server uses stdio rather than HTTP.

## 5. Verify the actual connection

Start with small requests and check the displayed tool calls:

| Request | Expected tool |
| --- | --- |
| Identify my connected Vault and its capabilities. | `get_vault_context` |
| Show my Vault tree to depth 2, limited to 30 entries. | `get_vault_tree` |
| Search for a known phrase in my notes. | `search_notes` |
| Read one of those search results. | `read_note` |
| Find AGENTS.md instructions in my Vault. | `list_instruction_files` |
| List available app settings files. | `list_obsidian_settings` |
| Show my native host application Graph view. | `capture_graph_view` |

Graph capture requires the desktop app and official host application CLI. It opens the
Graph view and sends a screenshot that may include sidebars. Filesystem exclusions
do not mask the screenshot. The [tool guide](tools.md) describes all eleven tools.

## Troubleshooting and lifecycle

- **Client not found:** install the official executable and check PATH, or set
  `TUNNEL_CLIENT_PATH` to the executable's absolute path.
- **Tunnel missing in ChatGPT:** verify workspace association and Tunnels Read + Use.
- **Developer mode unavailable:** check the account/workspace policy. A local
  script cannot enable this permission.
- **Tools cannot connect:** keep the Mac awake and `remote` running; run
  `npm run tunnel:doctor` in another terminal. Check the client's local admin UI
  using the address it reports. Do not expose that UI publicly.
- **Stale tools:** rebuild, restart, refresh the connection, and use a new chat.
- **Disconnect:** Ctrl+C stops this foreground client. Remove the ChatGPT connection
  and revoke/delete the tunnel or runtime key in Platform when permanently retiring it.

This is a private developer-mode connection. Public directory distribution needs
a separately designed public HTTPS MCP endpoint and authentication. Desktop
Commander's full hosted-device service is not implemented here.

Local launcher tests use a fake tunnel executable and temporary fixture files.
They do not prove live account access, official-client command parsing, or ChatGPT
tool discovery. Complete the checks above with your own tunnel before calling the
integration end-to-end verified.
