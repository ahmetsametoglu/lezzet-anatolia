/**
 * Ayar anahtarları: sepet ve kargo anahtarları `@lezzet/application/cart/settings-keys`ten gelir, çünkü iki yüzey aynı sayıyı okumak
 * zorunda; istemci komponentleri de okuduğu için barrel değil derin yol kullanılır, barrel paketin tamamını tarayıcı paketine sokardı.
 */
/* Köprü yalnız web'in okuduğunu geçirir; varsayılanları sunucudaki ayar çözümü paketten doğrudan okur. */
export { FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY } from '@lezzet/application/cart/settings-keys';

/**
 * Puanı kupona çevirme kuralı: hesap ekranı ile motor aynı sayıyı okumak zorunda, eşik ekrana gömülürse ekranın söylediği kural sistemin
 * kuralı olmaz.
 */
export const POINTS_REDEEM_MIN_KEY = 'points_redeem_min';
export const POINTS_CENT_VALUE_KEY = 'points_cent_value';

/**
 * Depolar arası ulaşım süresi (gün): sevk önerisinin ömür uyarısı ve "gecikmiş" rozeti okur. Tanım pakette, çünkü mobil uç da aynı satırı
 * okumak zorunda ve iki nüsha operatör süreyi değiştirdiği gün web ile telefonu ayrıştırırdı.
 */
export { TRANSFER_TRANSIT_DAYS_DEFAULT, TRANSFER_TRANSIT_DAYS_KEY } from '@lezzet/application/warehouse/settings-keys';
