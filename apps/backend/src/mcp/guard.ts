import { createHash, timingSafeEqual } from 'node:crypto';
import { McpConnectionKeyService, serviceDb } from '@lezzet/database';
import type { McpScope } from '@lezzet/types';
import { allowRequest } from './rate-limit';

/**
 * MCP kapısı (22.1 deneme dilimi → 22.4 üretim katmanı).
 *
 * Üç şeyi bu sırayla yapar ve sıra bilinçlidir:
 *   1. **Bearer var mı** — yoksa hiçbir iş yapılmaz.
 *   2. **Oran sınırı** — DB'ye GİTMEDEN ÖNCE. Geçersiz anahtarla dövülen bir kapı da sayaç
 *      doldurur; korumanın asıl işi budur (aksi hâlde her sahte istek bir sorgu doğururdu).
 *   3. **Kimlik** — önce tablo (`mcp_connection_key`), bulunamazsa env artçısı.
 *
 * ── ANAHTAR YOKSA KAPI KAPALI (fail-closed) ─────────────────────────────────
 * Ne tabloda satır ne env'de değer varsa kapı kapalıdır. "Yapılandırma unutuldu → herkese açık"
 * en kötü varsayılan olurdu.
 *
 * ── ENV ARTÇISI ve NEDEN `propose` KAPSAMLI ─────────────────────────────────
 * `MCP_CONNECTION_KEY` geçerli kalır. Tablo boş doğduğu için kaldırılsaydı, panelden ilk anahtar
 * üretilene kadar çalışan bağlantı sessizce ölürdü — bir güvenlik yükseltmesi, çalışan bir kurulumu
 * habersiz kısıtlayarak başlamamalı. Kapsamı bugünkü davranışın aynısı: her araç (`propose`).
 * Panelden anahtar üretilip env satırı silindiğinde bu yol da kendiliğinden kapanır.
 *
 * ── KARŞILAŞTIRMA SABİT ZAMANLI ─────────────────────────────────────────────
 * `timingSafeEqual` eşit uzunluk ister ve ham dizgiler uzunluk sızdırır; iki tarafın SHA-256'sı
 * kıyaslanır. Tablo yolunda karşılaştırmayı veritabanı yapar (hash unique) — orada sızacak bir
 * zaman farkı yok, aranan şey zaten hash'in kendisi.
 */

/** Dışa VERİLMİYOR: çağıran sonucu `auth.ok` ile daraltıyor, tipin adını yazmasına gerek yok. */
type McpGuardResult =
  | {
      ok: true;
      /** `null` = env artçısıyla girildi; çağrı izi anahtarsız yazılır (satırı yok, uydurulmaz). */
      connectionKeyId: string | null;
      scope: McpScope;
    }
  | { ok: false; status: 401 | 429 };

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Env artçısı — sabit zamanlı karşılaştırma. Env boşsa bu yol hiç açılmaz. */
function matchesEnvKey(token: string): boolean {
  const expected = process.env.MCP_CONNECTION_KEY?.trim();
  if (!expected) return false;
  return timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(expected).digest());
}

export async function mcpGuard(authorizationHeader: string | undefined): Promise<McpGuardResult> {
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { ok: false, status: 401 };

  const tokenHash = sha256Hex(token);
  if (!allowRequest(tokenHash)) return { ok: false, status: 429 };

  const keys = new McpConnectionKeyService(serviceDb());
  const key = await keys.findByTokenHash(tokenHash);

  if (key) {
    // İptal ve süre AYRI kontrol ediliyor ama cevap aynı: dışarıya "neden reddedildin" denmez.
    if (key.revokedAt || Date.parse(key.expiresAt) <= Date.now()) return { ok: false, status: 401 };
    // Telemetri best-effort: cevabı bekletmez, hatası kapıyı düşürmez.
    void keys.touch(key.id).catch(() => undefined);
    return { ok: true, connectionKeyId: key.id, scope: key.scope };
  }

  if (matchesEnvKey(token)) return { ok: true, connectionKeyId: null, scope: 'propose' };

  return { ok: false, status: 401 };
}

/**
 * Aracın hangi aileye ait olduğu — kapsam denetiminin TEK kuralı.
 *
 * Ayrı bir eşleme tablosu yazılmadı ve bu bilinçli: 25 araçlık bir sözlük, yeni araç eklenip
 * sözlüğe yazılmadığında **sessizce yanlış cevap verir** (bilinmeyen araç hangi ailede sayılır?).
 * Adlandırma sözleşmesi zaten tutarlı — kuyruğa yazan 11 aracın hepsi `propose_` ile başlar — ve
 * bu kural yeni araçta da kendiliğinden işler. Sözleşmeyi test koruyor (`mcp.test.ts`): `propose_`
 * ile başlamayan hiçbir aracın kuyruğa yazmadığı, `propose_`lu olanların hepsinin yazdığı.
 */
export function toolScope(toolName: string): McpScope {
  return toolName.startsWith('propose_') ? 'propose' : 'read';
}

/** `propose` kapsamı `read`i KAPSAR — öneri veren okuyabilmelidir, öneri kör kurulamaz. */
export function scopeAllows(granted: McpScope, required: McpScope): boolean {
  return granted === 'propose' || required === 'read';
}
