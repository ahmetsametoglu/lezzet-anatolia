import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Context } from 'hono';
import type { AppEnv } from '../http/request-log';
import { mcpGuard } from './guard';
import { createMcpServer } from './server-factory';

/**
 * `/mcp` — streamable HTTP taşıması (22.1). Cevap Hono'nun DIŞINDA yazılır: SDK transport'u ham
 * `req`/`res` çiftiyle çalışır (`c.env.incoming/outgoing`, `AppEnv.Bindings`), bu yüzden handler
 * Hono'ya `RESPONSE_ALREADY_SENT` döner — ikinci bir cevap yazılmaz.
 *
 * Oturumsuz mod bilinçli (`sessionIdGenerator: undefined`): protokol durumu hiçbir yerde tutulmaz,
 * her istek kendi Server örneğini kurar (spec 2026-07-28'in stateless çekirdeği; petit emsali —
 * süreç yeniden başlasa bağlantı düşmez). `enableJsonResponse` curl/teşhis kolaylığı: istemci SSE
 * istemezse düz JSON alır.
 *
 * Guard EN ÖNDE ve jenerik 401: anahtar yoksa `tools/list` bile dönmez, hata gövdesi bilgi
 * sızdırmaz (petit guard sözleşmesi).
 */
export async function mcpHandler(c: Context<AppEnv>): Promise<Response> {
  if (!mcpGuard(c.req.header('authorization'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Body yalnız POST'ta var; GET/DELETE (SSE aboneliği, oturum kapama) gövdesiz gelir.
  const body = c.req.method === 'POST' ? await c.req.json().catch(() => undefined) : undefined;

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  await transport.handleRequest(c.env.incoming, c.env.outgoing, body);

  // Cevap ham `res`e yazıldı — Hono'ya "dokunma" denir.
  return RESPONSE_ALREADY_SENT;
}
