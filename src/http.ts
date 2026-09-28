import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from './server.js';
import type { VaultConfig } from './config.js';

export type HttpOptions = { token: string; allowedHosts: string[]; allowedOrigins: string[] };
const digest = (value: string) => createHash('sha256').update(value).digest();
const respond = (res: ServerResponse, status: number, message: string) => {
  res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify({error: message}));
};
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function createHttpEndpoint(config: VaultConfig, options: HttpOptions) {
  if (options.token.length < 32 || /\s/u.test(options.token)) throw new Error('VAULT_HTTP_TOKEN must contain at least 32 non-whitespace characters.');
  if (!options.allowedHosts.length) throw new Error('At least one HTTP Host must be allowed.');
  type Session = {mcp: ReturnType<typeof createServer>; transport: StreamableHTTPServerTransport; touched: number; active: number};
  const sessions = new Map<string, Session>();
  const all = new Set<Session>();
  const remove = async (session: Session) => {
    all.delete(session);
    if (session.transport.sessionId) sessions.delete(session.transport.sessionId);
    await session.mcp.close();
  };
  const timer = setInterval(() => {
    for (const session of all) if (!session.active && Date.now() - session.touched > 30 * 60_000) void remove(session).catch(() => {});
  }, 60_000).unref();
  const server = createHttpServer(async (req, res) => {
    // Validate explicit Host/Origin values; never trust forwarded headers implicitly.
    if (!req.headers.host || !options.allowedHosts.includes(req.headers.host.toLowerCase())) return respond(res, 403, 'Host not allowed');
    if (req.headers.origin && !options.allowedOrigins.includes(req.headers.origin)) return respond(res, 403, 'Origin not allowed');
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), digest(`Bearer ${options.token}`))) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="vault"');
      return respond(res, 401, 'Authentication required');
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/healthz' && req.method === 'GET') return respond(res, 200, 'ok');
    if (req.url !== '/mcp') return respond(res, 404, 'Not found');
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'POST, GET, DELETE');
      return respond(res, 405, 'Method not allowed');
    }
    let session: Session | undefined;
    let fresh = false;
    try {
      if (req.method === 'POST' && !req.headers['content-type']?.toLowerCase().startsWith('application/json')) return respond(res, 415, 'Use application/json');
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const id = req.headers['mcp-session-id'];
      if (typeof id === 'string') {
        session = sessions.get(id);
        if (!session) return respond(res, 404, 'Session expired or unknown; initialize again');
      } else if (!id && req.method === 'POST' && isInitializeRequest(body)) {
        if (all.size >= 32) return respond(res, 503, 'Session limit reached');
        const mcp = createServer(config);
        const transport = new StreamableHTTPServerTransport({sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: sid => { sessions.set(sid, session!); }});
        session = {mcp, transport, touched: Date.now(), active: 0};
        all.add(session);
        fresh = true;
        mcp.server.onclose = () => {
          all.delete(session!);
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await mcp.connect(transport);
      } else return respond(res, 400, 'Initialize a session first');
      const current = session;
      current.active++;
      current.touched = Date.now();
      let finished = false;
      res.once('close', () => {
        if (!finished) { finished = true; current.active--; current.touched = Date.now(); }
      });
      await current.transport.handleRequest(req, res, body);
      if (req.method === 'DELETE' || (fresh && !current.transport.sessionId)) await remove(current);
    } catch (error) {
      if (fresh && session) await remove(session).catch(() => {});
      if (!res.headersSent && !res.destroyed) respond(res, error instanceof SyntaxError ? 400 : 500, 'Unable to process MCP request');
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  return {server, close: async () => {
    clearInterval(timer);
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.allSettled([...all].map(remove));
    server.closeAllConnections();
    await closed;
  }};
}
