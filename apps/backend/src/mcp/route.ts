import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Context } from 'hono';
import type { AppEnv } from '../context';
import { mcpGuard } from './guard';
import { createMcpServer } from './server-factory';

/**
 * `/mcp` taşıması: SDK ham `req`/`res` ile çalıştığı için cevap Hono'nun dışında yazılır ve handler `RESPONSE_ALREADY_SENT` döner;
 * oturumsuzdur, her istek kendi sunucusunu kurar. Guard en önde, `401` kimlik ile `429` oran sınırını ayırır (istemci "yanlış
 * anahtar" ile "çok hızlısın"ı ayırt edebilmeli) ve kapsamı sunucuya verir ki sunucu aynı soruyu ikinci kez sormasın.
 */
/**
 * Keşif adresi (RFC 9728) — web ile aynı alan adı, `/mcp` yalnız yolda ayrışıyor. Jetonsuz gelen
 * istemci jetonu nereden alacağını bu başlıktan öğrenir; olmadan connector ekranı akışı başlatamaz.
 */
const resourceMetadataUrl = (): string =>
  `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lezzetanatolie.com'}/.well-known/oauth-protected-resource`;

export async function mcpHandler(c: Context<AppEnv>): Promise<Response> {
  const auth = await mcpGuard(c.req.header('authorization'));
  if (!auth.ok) {
    if (auth.status === 429) return c.json({ error: 'rate limit' }, 429);
    c.header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl()}"`);
    return c.json({ error: 'unauthorized' }, 401);
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
