/**
 * Gel-al bekleme eşiği — anahtar ve fabrika değeri TEK yerde (CLAUDE §1): ayar sözlüğü, sipariş listesi, pano ve depo kapısı
 * aynı satırı okur. Migration'daki varsayılanla nöbet testi eşleşir (`settings-catalog.test`).
 *
 * Randevu sistem dışıdır (telefon); hazır siparişin ayrılmış malı bu kadar gün bekleyince ofis görür ve karar verir.
 */
export const PICKUP_WAIT_DAYS_KEY = 'pickup_wait_days';
export const PICKUP_WAIT_DAYS_DEFAULT = 7;
