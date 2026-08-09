import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * MCP deneme-dilimi kapısı (22.1) — TEK anahtar, `.env`den (`MCP_CONNECTION_KEY`).
 *
 * Üretim kurgusu İKİLİ anahtardır: tablo + SHA-256 hash + iptal/son-kullanım + oran sınırı +
 * kapsamlı oturum anahtarı (`AI_ADMIN_ASSISTANT §4`, petit `routes/mcp/guard.ts` emsali). Deneme
 * diliminde anahtar yönetim paneli olmadığı için anahtar env'de yaşar; o katman panel geldiğinde
 * (Faz 1 sonrası modül işi) bu kapının yerini alır — imza aynı kalır, çağıran değişmez.
 *
 * İki bilinçli ayrıntı:
 * - **Anahtar YOKSA kapı KAPALI** (fail-closed): env'siz süreç MCP'yi sessizce açmaz. "Yapılandırma
 *   unutuldu → herkese açık" en kötü varsayılan olurdu.
 * - Karşılaştırma **sabit zamanlı** ve hash üzerinden: `timingSafeEqual` eşit uzunluk ister, ham
 *   dizgiler uzunluk sızdırır — iki tarafın SHA-256'sı kıyaslanır.
 */
export function mcpGuard(authorizationHeader: string | undefined): boolean {
  const expected = process.env.MCP_CONNECTION_KEY?.trim();
  if (!expected) return false;
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return false;
  const tokenHash = createHash('sha256').update(token).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(tokenHash, expectedHash);
}
