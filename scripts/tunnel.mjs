import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2] ?? 'run';

async function main() {
  if (!['init', 'doctor', 'run'].includes(action) || process.argv.length > 3) {
    throw new Error('Usage: node scripts/tunnel.mjs <init|doctor|run>');
  }
  if (process.platform === 'win32') {
    throw new Error('This launcher supports macOS/Linux. See the official tunnel-client guide for Windows.');
  }
  try {
    loadEnvFile(join(root, '.env.tunnel'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read .env.tunnel.');
  }
  const profile = process.env.OBSIDIAN_TUNNEL_PROFILE || 'obsidian-vault';
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('Invalid OBSIDIAN_TUNNEL_PROFILE.');
  if (!process.env.CONTROL_PLANE_API_KEY?.trim()) {
    throw new Error('Set CONTROL_PLANE_API_KEY in .env.tunnel or the environment. See docs/chatgpt-connection.md.');
  }
  for (const file of ['.env', 'dist/index.js']) {
    try { await access(join(root, file), constants.R_OK); }
    catch { throw new Error(`Missing or unreadable ${file}. Configure .env and run npm run build first.`); }
  }
  let args;
  if (action === 'init') {
    const id = process.env.OBSIDIAN_TUNNEL_ID;
    if (!id || !/^tunnel_[a-zA-Z0-9]+$/.test(id)) {
      throw new Error('Set OBSIDIAN_TUNNEL_ID to the tunnel ID from Platform settings.');
    }
    // tunnel-client parses a command string. Quote each POSIX word, including paths with spaces.
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const command = [process.execPath, `--env-file=${join(root, '.env')}`, join(root, 'dist/index.js')]
      .map(quote).join(' ');
    args = ['init', '--sample', 'sample_mcp_stdio_local', '--profile', profile,
      '--tunnel-id', id, '--mcp-command', command];
  } else {
    args = [action, '--profile', profile, ...(action === 'doctor' ? ['--explain'] : [])];
  }
  const child = spawn(process.env.TUNNEL_CLIENT_PATH || 'tunnel-client', args, {
    cwd: root, env: process.env, stdio: 'inherit', shell: false,
  });
  const handlers = new Map(['SIGINT', 'SIGTERM'].map((signal) => {
    const handler = () => child.kill(signal);
    process.on(signal, handler);
    return [signal, handler];
  }));
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
  child.once('error', () => {
    cleanup();
    console.error('Cannot start tunnel-client. Install the official binary or set TUNNEL_CLIENT_PATH.');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
