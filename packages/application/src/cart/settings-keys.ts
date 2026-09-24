/**
 * Müşteriye söz veren ayar anahtarları: sepet eşikle söz verir, checkout uygular; ikisi farklı anahtar okursa ekran bir şey vaat eder,
 * kasa başkasını uygular. Anahtarlar bu yüzden tek yerde durur ve web köprüsü (`apps/web/lib/settings-keys.ts`) buradan yeniden ihraç eder.
 */

/** Ücretsiz kargo eşiği (cent). Sepette ilerleme çubuğu, checkout'ta ücret kararı. */
export const FREE_SHIPPING_THRESHOLD_KEY = 'free_shipping_threshold_cents';

/** Asgari sepet tutarı (cent). Sepette "şu kadar daha ekleyin", checkout'ta kapı. */
export const MIN_BASKET_KEY = 'min_basket_cents';

/**
 * Asgari sepetin son çare varsayılanı (cent), yalnız ayar satırı hiç yoksa okunur: migration global satırı her ortamda açtığı için
 * yürürlükteki kural bu sayı değildir. Satırı silen bir el sistemi fark edilmeden sınırsız bırakmasın diye emniyet değeri olarak durur.
 */
export const MIN_BASKET_DEFAULT = 4_000;

/**
 * Ücretsiz kargo eşiğinin varsayılanı (cent), yalnız ayar satırı yoksa okunur; gerçek değeri operatör Ayarlar'dan belirler, gerekçesi
 * `0013_settings.sql` künyesindedir. Kargo soğuk zincir taşımaz: bölge dışına yalnız raf ömürlü ürünler çıkar (`Product.shippable`).
 */
export const FREE_SHIPPING_THRESHOLD_DEFAULT = 10_000;
