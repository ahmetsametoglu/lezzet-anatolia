/**
 * Anahtar başına kayan-pencere çağrı sınırı (22.4 · `AI_ADMIN_ASSISTANT §4.3`).
 *
 * **Neden gerekti:** model bir döngüye girerse ya da anahtar sızarsa, kapıda onu durduran hiçbir
 * şey yoktu. Onay kuyruğu YAZMAYI denetler; okumayı ve kaynak tüketimini denetlemez — 25 aracın
 * hepsi veritabanına gidiyor.
 *
 * **BELLEKTE ve tek-süreç varsayımlı.** Backend bugün tek süreç koşuyor; cluster'a/çoklu örneğe
 * geçilirse her sürecin kendi sayacı olur ve gerçek sınır örnek sayısıyla ÇARPILIR. O gün sayaç
 * merkezîye (DB/Redis) taşınmalı — varsayım burada yazılı olduğu için sessizce kaymayacak.
 *
 * Sınır parametrik (`MCP_RATE_LIMIT_PER_MINUTE`, varsayılan 60 — referans projenin ölçüsü).
 * `settings` tablosuna KONMADI bilinçle: o tablo işin sahibinin kararlarını taşır (kesim saati,
 * eşikler); oran sınırı bir işletme kararı değil teknik korumadır ve her çağrıda bir ayar
 * çözümü, korumanın kendisine maliyet eklerdi.
 */

const WINDOW_MS = 60_000;

/** Pencere başına tavan. `<= 0` verilirse sınır KAPALI sayılmaz — varsayılana düşer (fail-safe). */
function maxPerWindow(): number {
  const raw = Number(process.env.MCP_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

const hits = new Map<string, number[]>();

/**
 * `true` = izinli. Pencere dışı damgalar her çağrıda budanır — harita anahtar başına en fazla
 * `maxPerWindow()` damga tutar, yani bellek sınırlıdır.
 */
export function allowRequest(tokenHash: string): boolean {
  const now = Date.now();
  const limit = maxPerWindow();
  const list = (hits.get(tokenHash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= limit) {
    hits.set(tokenHash, list);
    return false;
  }
  list.push(now);
  hits.set(tokenHash, list);
  return true;
}

/** Testlerin sayacı sıfırlaması için — süreç ömrü boyunca biriken durum, dosyalar arası sızmasın. */
export function resetRateLimit(): void {
  hits.clear();
}
