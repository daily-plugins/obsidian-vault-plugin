import { loadConfig } from './config.js';
import { createHttpEndpoint } from './http.js';

async function main() {
  const host = process.env.OBSIDIAN_HTTP_HOST || '127.0.0.1';
  const port = Number(process.env.OBSIDIAN_HTTP_PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('OBSIDIAN_HTTP_PORT must be 1–65535.');
  const list = (value: string | undefined, fallback: string[]) => value ? value.split(',').map(s => s.trim()).filter(Boolean) : fallback;
  const endpoint = createHttpEndpoint(await loadConfig(), {
    token: process.env.OBSIDIAN_HTTP_TOKEN || '',
    allowedHosts: list(process.env.OBSIDIAN_HTTP_ALLOWED_HOSTS, [`127.0.0.1:${port}`, `localhost:${port}`]).map(s => s.toLowerCase()),
    allowedOrigins: list(process.env.OBSIDIAN_HTTP_ALLOWED_ORIGINS, []),
  });
  await new Promise<void>((resolve, reject) => {
    endpoint.server.once('error', reject);
    endpoint.server.listen(port, host, resolve);
  });
  console.error(`Obsidian Vault Plugin HTTP listening at ${host}:${port}/mcp (Bearer authentication required)`);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void endpoint.close().catch(() => { process.exitCode = 1; });
  });
}
main().catch(() => { console.error('HTTP startup failed. Check Vault configuration, HTTP token, host, and port.'); process.exitCode = 1; });
