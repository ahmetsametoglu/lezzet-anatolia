/**
 * Depo okumalarının AYAR anahtarları — üç yüzey aynı satırı okumak zorunda.
 *
 * Gerekçe `cart/settings-keys.ts` ile birebir aynı ve orada bir kez yaşandı (29.07): iki yüzey iki
 * ayrı anahtar okuyunca biri ötekinin vaadini bozar, ve tesadüfen aynı değerdeyken hiç görünmez.
 * Burada aynı zemin vardı: anahtar `apps/web/lib/settings-keys.ts`te tanımlıydı ve mobil uç oraya
 * erişemez — üçüncü bir nüsha yazılsaydı operatör süreyi Ayarlar'dan değiştirdiği gün web'in
 * "gecikmiş" rozeti ile telefonun "tahmini varış" günü ayrışırdı.
 */

/** Depolar arası ulaşım süresi (gün) — sevk önerisinin ömür uyarısı, "gecikmiş" rozeti ve yoldaki sevkiyatın tahmini varışı. */
export const TRANSFER_TRANSIT_DAYS_KEY = 'transfer_transit_days';

/**
 * Ulaşım süresinin SON ÇARE varsayılanı (gün) — yalnız ayar satırı HİÇ yoksa okunur.
 *
 * `1` gün: elimizdeki depolar aynı ülkede ve bir gecelik araç turuyla bağlanıyor. Bu sayı
 * yürürlükteki kural DEĞİLDİR — gerçek değer `settings`tedir ve operatörün kararıdır; sabit,
 * satırı silen bir elin sistemi "aynı gün varır" sanmasını engellemek için durur.
 */
export const TRANSFER_TRANSIT_DAYS_DEFAULT = 1;
