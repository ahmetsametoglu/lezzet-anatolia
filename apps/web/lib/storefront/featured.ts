/**
 * **Geçiş köprüsü** — `pickFeatured`ın gövdesi `@lezzet/application/catalog/featured`a taşındı
 * (paket kapısının terfisi, 09.08). Künyenin tamamı orada; burada tek satır kalıyor ki bu dosyayı
 * çağıran altı yer (ana sayfa üç bandı + paket köprüsü + testler) yerinden oynamasın.
 *
 * Taşınma sebebi zincirdir, seçim değil: terfi eden paket okuması (`storefront/packages.ts` →
 * `@lezzet/application/catalog/packages`) vitrin şeridini süzerken bu kuralı çağırıyor ve pakette
 * yaşayan bir orkestrasyon `apps/web`ten import EDEMEZ (bağımlılık tek yönlü, STACK §4).
 *
 * `rotateDaily` de 05.23'da AYNI kapıdan geçti: kategori kartı kendi fotoğraf havuzundan güne göre
 * bir kare seçmeye başladı, seçim `toCategory` indirgemesinde yapılıyor ve o indirgemeyi mobil API
 * de çağırıyor — "en az iki yüzey" ölçütü karşılandı. Burada yalnız köprüsü kaldı.
 *
 * `pickRandom` BİLEREK burada: tek tüketeni hâlâ web ana sayfasının fırsat bandı — tek yüzeyin işi
 * kendi uygulamasında kalır.
 */
/**
 * **DERİN YOL, barrel DEĞİL** (15.08 · `not-herkese-application-barreli-istemciye-girmesin`).
 *
 * Bu satır `from '@lezzet/application'` idi ve dosya bu klasördeki dört köprünün **korumasız
 * olanıydı**: ötekiler (`read-viewer`, `batch-view`, b2b ikilisi) `server-only` taşıyor, bu
 * taşımıyordu. Bugün arıza değil — `pickFeatured` yalnız sunucudan çağrılıyor. Ama vitrin seçicisi
 * bir gün istemciye taşınırsa (*"daha fazla göster"*) hata **sessizce** `node:crypto`'ya döner:
 * barrel'dan tek bir DEĞER açmak paketin tamamını çeker — veritabanı istemcisi, e-posta şablonları,
 * `pino`. Bir kez yaşandı ve ödeme sayfasını 500'e düşürdü (10.08, tek dosyadan 48 istemci dosyası).
 *
 * **Çare `server-only` DEĞİL, derin yol seçildi** ve fark önemli: `server-only` yanlış kullanımı
 * okunur bir hataya çevirir, derin yol ise **yanlış kullanımı ortadan kaldırır**. Kaynak modül
 * (`packages/application/src/catalog/featured.ts`) hiç import taşımıyor — tamamen saf, yani
 * istemciden okunması yasaklanması gereken bir şey değil. Bu dosyanın öteki iki dışa verimi
 * (`rotateDaily`, `pickRandom`) da saf; dosya artık bütünüyle istemci-güvenli.
 *
 * Ölçüt "istemci görebiliyor mu", "kural saf mı" değil (notun kendi cümlesi). `export … from` bir
 * import gibi görünmez ve `typecheck` göremez — kırılma yalnız webpack'in istemci grafiğinde.
 */
export { pickFeatured, rotateDaily } from '@lezzet/application/catalog/featured';

/**
 * **HER İSTEKTE rastgele seçim** — fırsat bandı (kullanıcı kararı 09.08).
 *
 * ── NEDEN BURADA `Math.random()` DOĞRU, KOLEKSİYONDA DEĞİLDİ ─────────────────
 * Hemen yukarıdaki `rotateDaily` künyesi random'ı üç sebeple reddediyor ve o gerekçeler orada hâlâ
 * geçerli. Fırsat bandında üçü de düşüyor:
 *   *(1) önbellek* — fırsat bandı zaten önbelleklenemez: teklif partiye bağlıdır, parti eriyip
 *        biter (`physical_qty`), yani içerik dakika dakika değişir.
 *   *(2) "her yenilemede başka vitrin"* — koleksiyonda kusurdu (seçki iddiası taşır), burada
 *        İSTENEN davranış: bant "elimizde şu an ne var" diyor, bir seçki iddiası taşımıyor.
 *   *(3) "dün gördüğüm neydi"* — fırsat zaten yarın olmayabilir; kalıcılık sözü verilmiyor.
 *
 * Kullanıcı bunu açıkça istedi ve gerekçesi ekranda: bant üç kart genişliğinde, dördüncü fırsat
 * alt satıra kayıyordu. Sabit "ilk üç" seçilseydi öteki fırsatlar hiç görünmezdi; rastgele seçim
 * hepsine sıra veriyor, tamamı ise "Daha fazla gör" bağının arkasında duruyor.
 *
 * Havuzdan ÖRNEKLEME yapılır, karıştırma değil: kopya çıkmaz ve havuz sınırdan küçükse olduğu
 * kadarı döner. `pick` parametre — test rastgeleliği sabitleyebilsin (`Math.random` çağıranın
 * varsayılanı, testin işi değil).
 */
export function pickRandom<T>(pool: readonly T[], count: number, pick: () => number = Math.random): T[] {
  const rest = [...pool];
  const take = Math.min(count, rest.length);
  return Array.from({ length: take }, () => rest.splice(Math.floor(pick() * rest.length), 1)[0]!);
}
