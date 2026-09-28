# Tunnel connection: configuration and startup

## When to choose a tunnel

Choose OpenAI Secure MCP Tunnel for private ChatGPT access to this computer's
Vault. It forwards requests to the local stdio MCP process over an outbound
connection. It does not start this project's HTTP server or require `.env.http`.

## Configuration

1. Configure your Vault in `.env` using `.env.example`.
2. Install the official `tunnel-client` from the download links in the
   [OpenAI guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
3. Create a tunnel in [Platform settings](https://platform.openai.com/settings/organization/tunnels)
   and associate the intended ChatGPT workspace. Prepare a runtime API key with
   Tunnels Read + Use. Creation requires Read + Manage.
4. From the repository root:

```sh
npm ci
npm run build
cp .env.tunnel.example .env.tunnel
chmod 600 .env.tunnel
```

Copy only on first setup. Edit locally:

```dotenv
OBSIDIAN_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
CONTROL_PLANE_API_KEY=REPLACE_WITH_RUNTIME_KEY
OBSIDIAN_TUNNEL_PROFILE=obsidian-vault
TUNNEL_CLIENT_PATH=/absolute/path/to/tunnel-client
```

`TUNNEL_CLIENT_PATH` is optional if the executable is on PATH. The runtime key
comes from [Platform API keys](https://platform.openai.com/settings/organization/api-keys).
It is distinct from the HTTP token and Inspector proxy token. Keep it private.

## First initialization

```sh
npm run tunnel:init
npm run tunnel:doctor
```

Initialize again after moving the checkout, changing Node installations, or
changing the tunnel ID. The client stores its own local execution profile.

## Startup and shutdown

```sh
npm run start:tunnel
```

`npm run remote` is an equivalent alias. Keep the process running. Ctrl+C stops
it; no separate `npm start` is required. After edits, rebuild and restart.

## Connect and verify

Enable ChatGPT developer mode, create a connection with **Connection → Tunnel**,
and select the tunnel. Refresh metadata after changes and start a new chat.
Account/workspace permissions determine availability. See the detailed
[ChatGPT connection guide](chatgpt-connection.md) for account setup, verification,
troubleshooting, and disconnection. This route is for private connections;
it does not replace a public endpoint for public plugin distribution.
