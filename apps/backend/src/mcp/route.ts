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
 * Guard EN ÖNDE ve jenerik cevap: anahtar yoksa `tools/list` bile dönmez, gövde bilgi sızdırmaz
 * (petit guard sözleşmesi). İki reddin ayrımı yalnız DURUM KODUNDA: `401` kimlik, `429` oran
 * sınırı. İkincisi ayrı olmalı — istemci "yanlış anahtar" ile "çok hızlısın"ı ayırt edemezse
 * yanlış tepki verir (anahtarı değiştirmeye çalışır, oysa beklemesi gerekir).
 *
 * Kapsam (`read`/`propose`) kapıdan çıkar ve sunucuya VERİLİR — sunucu aynı soruyu ikinci kez
 * sormaz (STACK §4: iki yer bir gün farklı cevap verir).
 */
export async function mcpHandler(c: Context<AppEnv>): Promise<Response> {
  const auth = await mcpGuard(c.req.header('authorization'));
  if (!auth.ok) {
    return auth.status === 429
      ? c.json({ error: 'rate limit' }, 429)
      : c.json({ error: 'unauthorized' }, 401);
  }

  // Body yalnız POST'ta var; GET/DELETE (SSE aboneliği, oturum kapama) gövdesiz gelir.
  const body = c.req.method === 'POST' ? await c.req.json().catch(() => undefined) : undefined;

  const server = createMcpServer({ connectionKeyId: auth.connectionKeyId, scope: auth.scope });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  await transport.handleRequest(c.env.incoming, c.env.outgoing, body);

  // Cevap ham `res`e yazıldı — Hono'ya "dokunma" denir.
  return RESPONSE_ALREADY_SENT;
}
