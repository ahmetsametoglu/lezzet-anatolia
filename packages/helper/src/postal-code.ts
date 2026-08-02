/**
 * Posta kodunun KİMLİK biçimi — boşluksuz, büyük harf.
 *
 * ── NEDEN `helper`, NEDEN TEK EV (denetim A2) ────────────────────────────────
 * Aynı gövde üç katmanda üç kez yazılmıştı: `domain-core/delivery/delivery-days` (karşılaştırma),
 * `database/services/delivery-zone` (saklama biçimi), `apps/web/lib/delivery/place-types` (form
 * girdisi). Üçü de "aynı yer" sorusunun cevabını veriyor ve **posta kodu depo çözümünün
 * anahtarı**: biri bir gün ayrışırsa (ör. biri `FR-` önekini soymaya başlarsa) aynı kod iki
 * katmanda farklı depoya çözülür ve bu hiçbir yerde hata vermez — sessizce yanlış depodan satar.
 *
 * Ev `helper` çünkü katman kuralı başka yer bırakmıyor: `domain-core` ile `database` birbirini
 * BİLMEZ (`STACK §4`), ikisinin de altındaki tek ortak paket bu. `slug`/`identity` ile aynı emsal.
 *
 * **Kural veritabanında da var:** `delivery_zone_postal_code` kolonu aynı biçimi `check` ile
 * zorluyor. Buradaki fonksiyon o kısıtın uygulama tarafındaki eşi — ikisi birbirini doğrular.
 */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Biçim doğrulaması — bugün yalnız beş hane (FR ve DE ikisi de öyle).
 *
 * Ülke başına ayrı desen YOK ve bu bilinçli: iki pazarımızın biçimi aynı, üçüncü bir ülke
 * açılırsa kural burada dallanır. Bugünden dallandırmak, olmayan bir ihtiyaç için okunması güç
 * bir tablo kurmak olurdu.
 */
export function isValidPostalCode(raw: string): boolean {
  return /^\d{5}$/.test(normalizePostalCode(raw));
}
