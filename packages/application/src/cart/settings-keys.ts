/**
 * Müşteriye SÖZ VEREN ayar anahtarları — sepeti okuyan her yüzey AYNI satırı okumak zorunda.
 *
 * Neden tek yerde: sepet "60 € üzeri kargo ücretsiz" diye söz verir, checkout ücreti keser. İkisi
 * farklı anahtar okursa ekran bir şey vaat eder, kasa başkasını uygular. Yaşandı (29.07): sepet
 * `free_shipping_cents` okuyordu, öyle bir ayar hiç yoktu — sessizce koddaki varsayılana düşüyor,
 * checkout ise gerçek ayarı (`free_shipping_threshold_cents`) okuyordu. İkisi tesadüfen aynı
 * değerde olduğu için görünmüyordu; operatör eşiği değiştirdiği an sepetin sözü yalan olacaktı.
 *
 * ── TERFİ (aşama 1/3) · KAPSAM UYARISI ───────────────────────────────────────
 * Kaynağı `apps/web/lib/settings-keys.ts`ti ve buraya YALNIZ sepet okumasının kullandığı üç
 * anahtar + üç varsayılan geldi. Oradaki dosya bugün checkout'a da hizmet ediyor ve köprü olarak
 * duruyor; **web tarafının bu paketten yeniden ihraç etmesi bu terfinin İLK benimseme adımıdır**
 * (rapora yazıldı). İki nüsha kaldığı sürece anahtarın biri değişip öteki değişmeyebilir — yani
 * 29.07'de yaşanan arızanın tam olarak zemini. Paket alanı `cart/` ile sınırlı olduğu için dosya
 * şimdilik burada; checkout terfi ettiğinde ikisinin ortak evi `settings/` klasörü olur.
 */

/** Ücretsiz kargo eşiği (cent). Sepette ilerleme çubuğu, checkout'ta ücret kararı. */
export const FREE_SHIPPING_THRESHOLD_KEY = 'free_shipping_threshold_cents';

/** Asgari sepet tutarı (cent). Sepette "şu kadar daha ekleyin", checkout'ta kapı. */
export const MIN_BASKET_KEY = 'min_basket_cents';

/**
 * Asgari sepetin SON ÇARE varsayılanı (cent) — yalnız ayar satırı HİÇ yoksa okunur.
 *
 * Gerçek değer `settings`'tedir ve migration (`0013`) global satırı her ortamda açtığı için bu
 * sabit normalde hiç okunmaz — **buradaki sayı yürürlükteki kural DEĞİLDİR** (ölçüldü 08.08:
 * global satır 0 = b2c'de alt sınır yok; b2b kanalı 120 €, bir bölge 45 €). İşletme değerini
 * operatör Ayarlar'dan belirler. Bu sabit, satırı silen bir elin sistemi fark edilmeden sınırsız
 * bırakmaması için emniyet değeri olarak durur.
 */
export const MIN_BASKET_DEFAULT = 4_000;

/**
 * Kargo ücreti (cent). Checkout'ta kesilen tutar; sepette **kargo grubunun** blokunda yazılır.
 *
 * Sepet uzun süre ücreti hiç yazmadı ve bu doğruydu: ücret teslimat türüne bağlı, tür de adresten
 * çıkıyordu. Kargo grubunda o belirsizlik YOK — grubun tanımı zaten "kargoyla gidecek": türü
 * biliniyor, tutarı biliniyor. Bilinen bir sayıyı saklamak, müşteriyi checkout'ta sürprizle
 * karşılamaktır.
 */
export const SHIPPING_FEE_KEY = 'shipping_fee_cents';

/** Kargo ücretinin varsayılanı (cent) — ayar satırı yoksa geçerli. */
export const SHIPPING_FEE_DEFAULT = 790;

/**
 * Ücretsiz kargo eşiğinin varsayılanı (cent) — ayar satırı yoksa geçerli.
 *
 * 60,00 € · kullanıcı kararı 04.08. Eşik, kargo ücretinin (7,90 €) belirgin üstünde olmalı; yoksa
 * her sepet ücretsiz olur ve ücret satırı anlamını yitirir. **Kargo soğuk zincir taşımaz** — bölge
 * dışına yalnız raf ömürlü ürünler çıkar (`Product.shippable`), dondurulmuş ürünler yalnız kendi
 * aracımızla teslim edilir. Admin ayarı girildiğinde bu değer hiç okunmaz.
 */
export const FREE_SHIPPING_THRESHOLD_DEFAULT = 6_000;
