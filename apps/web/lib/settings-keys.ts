/**
 * Müşteriye SÖZ VEREN ayar anahtarları — sepet ve checkout AYNI satırı okumak zorunda.
 *
 * Neden tek yerde: sepet "60 € üzeri kargo ücretsiz" diye söz verir, checkout ücreti keser. İkisi
 * farklı anahtar okursa ekran bir şey vaat eder, kasa başkasını uygular. Yaşandı (29.07): sepet
 * `free_shipping_cents` okuyordu, öyle bir ayar hiç yoktu — sessizce koddaki varsayılana düşüyor,
 * checkout ise gerçek ayarı (`free_shipping_threshold_cents`) okuyordu. İkisi tesadüfen aynı
 * değerde olduğu için görünmüyordu; operatör eşiği değiştirdiği an sepetin sözü yalan olacaktı.
 *
 * Buraya YALNIZ iki yüzeyde birden okunan, müşteriye görünen ayarlar girer. Tek yerde okunan
 * ayarların (kapıda ödeme tavanı, kesim saati) anahtarını okuduğu dosyada tutmak doğru — bir
 * sabit dosyası her ayarı toplarsa okuyan kişi anlamı için iki dosya gezer.
 */

/** Ücretsiz kargo eşiği (cent). Sepette ilerleme çubuğu, checkout'ta ücret kararı. */
export const FREE_SHIPPING_THRESHOLD_KEY = 'free_shipping_threshold_cents';

/** Asgari sepet tutarı (cent). Sepette "şu kadar daha ekleyin", checkout'ta kapı. */
export const MIN_BASKET_KEY = 'min_basket_cents';

/**
 * Ücretsiz kargo eşiğinin varsayılanı (cent) — ayar satırı yoksa geçerli.
 *
 * 60,00 €: soğuk zincir kargosunun kendisi ~7-8 € tuttuğu için eşik onun belirgin üstünde olmalı,
 * yoksa her sepet ücretsiz olur. Admin ayarı girildiğinde bu değer hiç okunmaz.
 */
export const FREE_SHIPPING_THRESHOLD_DEFAULT = 6_000;
