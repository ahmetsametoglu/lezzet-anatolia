import { z } from 'zod';
import { BundleItemSchema, BundleSchema } from '../entities/bundle.schema';
import { ProductSchema } from '../entities/product.schema';
import { CatalogImageSchema } from './catalog-api.schema';
import { HomePackageSchema } from './home-api.schema';

/**
 * PAKET DETAY SÖZLEŞMESİ (21.14) — mobil `GET /api/v1/packages/:slug` ucunun ve onu tüketen Expo
 * paket ekranının ORTAK dili. Terfi gerekçesi `home-api.schema.ts` ile aynı (02-mimari §3.2
 * "sözleşme tek kaynak"): üreten ve tüketen aynı şemayı çağırır, alan adı değişirse iki taraf
 * birden DERLEME anında kırılır.
 *
 * Alanlar v3 tasarımının paket ekranından (04-vPackage): ad · açıklama · TEK fiyat · görsel ·
 * kargo kısıtı · içerik satırları. "İçerik değiştirilemez" notu SÖZLEŞMEDE YOK: statik metindir,
 * ekranın kendi sözlüğünde yaşar — API biçimli/sabit cümle göndermez (katalog kartının kuralı).
 *
 * ── STOK/YER EKSENİ 10.08'DE AÇILDI (eski `BEKLEYEN(21.14)` kapandı) ─────────
 * Bu künye 10.08'e kadar "`soldOut`/stok zinciri BİLEREK YOK" diyordu ve gerekçesi şuydu: kural
 * web'de yaşıyor (`apps/web/lib/storefront/packages.ts`), kopyalamak yasak, hep `false` basmak ise
 * "tükendi yok" ile "bilinmiyor"u ayırt edilemez yapardı. **Gerekçenin ilk yarısı 09.08'de düştü:**
 * okuma `@lezzet/application`a terfi etti ve kapı `soldOut` · `route`u ZATEN üretiyor. İkinci
 * yarısı hâlâ geçerli ve bu yüzden alanlar uydurulmadan taşınıyor: `route` yer bilinmezken `null`
 * kalır, "bilinmiyor" bir hâl olarak sözleşmede durur.
 *
 * Alanların künyesi ve iki eksenin neden AYRI olduğu tek yerde: `HomePackageSchema` (liste kartı).
 * Detayın farkı, kısıtın kendisini de taşımasıdır (`shippable` — aşağıda): kart müşterinin adresine
 * ne olduğunu söyler, detay ayrıca paketin KENDİ kuralını ("yalnız bölge içi") ilan eder.
 *
 * ── TEK FİYAT KURALI ─────────────────────────────────────────────────────────
 * Kalem fiyatı TAŞINMAZ (web `StorefrontPackageItem`in aynı kararı): "toplam değeri X, sen Y
 * ödüyorsun" kırılımı gösterilmez, hediye kalem "0 €" olarak görünmez. Alan sözleşmede hiç
 * olmayınca ekran onu yanlışlıkla basamaz.
 */

/**
 * Paket içeriğinin TEK satırı — "Pakette neler var?" kartı. Satıra basınca ürün detayına gidilir
 * (yasal gerekçe web içerik kartının künyesinde: alerjen/içindekiler beyanı ürün sayfasındadır ve
 * satın alma ÖNCESİ erişilebilir olmalı; paket sayfası yalnız kapı açar).
 */
export const PackageItemSchema = ProductSchema.pick({ slug: true }).extend({
  /** Ürün adı, seçili dilde çözülmüş (dil yedek zinciri sunucuda — istemci dil bilmez). */
  name: z.string(),
  /**
   * Boy etiketi ("500 g" · "12'li kutu"); tek boylu üründe BOŞ olabilir. Ayrı alan çünkü kalem bir
   * VARYANTA bağlıdır ve boyu düşürmek yanlış bilgi olurdu ("1 kg su böreği"ni "Su Böreği" diye
   * göstermek). v3'ün satır etiketi boyu ada gömülü yazıyor ("500 g fıstıklı baklava") — o el
   * yazısı bir kurgu; gerçek veride iki alandır, cümleyi ekran kurar.
   */
  unitLabel: z.string(),
  qty: BundleItemSchema.shape.qty,
  image: CatalogImageSchema,
});
export type PackageItem = z.infer<typeof PackageItemSchema>;

/** Paket detayı — sayfanın TAMAMI tek turda (içerik satırları dahil; bölüm başına çağrı yok). */
export const PackageDetailSchema = BundleSchema.pick({ id: true, slug: true }).extend({
  name: z.string(),
  /** Seçili dilde tek metin; **`null` = hiç girilmemiş** (boş/boşluk da `null`) → paragraf çizilmez. */
  description: z.string().nullable(),
  /**
   * Paketin TEK fiyatı (TTC, ham cent — `toCents(totalPrice)`, vitrin kartıyla aynı indirgeme).
   * Kalem toplamına eşitliği paketin kendi kısıtıdır; burada ikinci bir doğrulama yapılmaz.
   */
  priceCents: z.number().int(),
  /**
   * Kargoya verilebilir mi — KALEMLERDEN TÜRETİLİR, girilmez: kargolanamayan (soğuk zincir) BİR
   * kalem paketin tamamını bölge-içi teslimata kilitler (web `toCard`ın `inRouteOnly` türetmesinin
   * aynısı, yön çevrilmiş: ekran `!shippable` ile kısıt çipini çizer — ürün detayının okuduğu yön).
   */
  shippable: z.boolean(),
  /**
   * **Hiçbir depoda tam takım yok** (ağ geneli, C3) — künyesi `HomePackageSchema`da. Detayda da
   * gerekli çünkü sayfanın alt barı bir SATIN ALMA kapısıdır: tükenmiş bir pakete "Sepete ekle"
   * göstermek, karşılayamayacağımız bir şeyi teklif etmek olurdu.
   */
  soldOut: HomePackageSchema.shape.soldOut,
  /**
   * **Bu adrese hangi yolla gelir** — künyesi `HomePackageSchema`da; kart ile detay AYNI ekseni
   * aynı adla taşır ki iki ekran aynı cümleyi kursun (ikinci bir sözlük yazılmaz).
   */
  route: HomePackageSchema.shape.route,
  image: CatalogImageSchema,
  /**
   * İçerik satırları, paketin kendi sırasında (`bundle_item.sort_order`). **`min(1)` bir KİLİT**:
   * kalemsiz paket detay olarak da var olamaz (boş kutu satılmaz) — uç onu 404'e çevirir, şema
   * sızmasını derleme/parse anında keser.
   */
  items: z.array(PackageItemSchema).min(1),
  /**
   * **Paylaşılacak TAM web adresi** (08.45) — dil öneki ve dile göre çevrilmiş yol dâhil
   * (`/tr/paket/…` · `/fr/coffret/…` · `/de/paket/…`). Gerekçesi ürün sözleşmesindeki ikiziyle
   * aynı ve orada yazılı: adres web rotasının kuralıdır, mobilde kurmak o kuralın ikinci kopyası
   * olurdu (`CatalogProductDetailSchema.shareUrl` künyesi).
   */
  shareUrl: z.string().url(),
});
export type PackageDetail = z.infer<typeof PackageDetailSchema>;

/**
 * PAKET LİSTE SÖZLEŞMESİ (Fikirler sekmesi) — `GET /api/v1/packages`.
 *
 * Satır şeması `HomePackageSchema`ın KENDİSİDİR (gerekçe `recipe-api.schema.ts`in liste künyesinde,
 * tek yerde): vitrindeki "Hazır paketler" kartı ile liste sayfasının kartı aynı karttır ve aynı
 * okuma kapısından çıkar — ikinci bir tanım, iki şeklin sessizce ayrışmasına kapı olurdu.
 *
 * ── LİSTE İŞARETLİYLE SINIRLI DEĞİL ──────────────────────────────────────────
 * Vitrin YALNIZ `isFeatured` paketleri taşır (işaret seçimdir — `HomePackageSchema` künyesi); bu
 * liste ise YAYINDAKİ paketlerin tamamıdır. Fark sözleşmede değil okumada: kart aynı, süzgeç
 * farklı. Vitrin bir seçki, bu sayfa ise "hepsi" sorusunun cevabı.
 *
 * Sayfalama yok: paket kataloğu doğal tavanlı, operatörün elle kurduğu bir kümedir (CLAUDE §1 "tek
 * turda" dalı) — `BundleService.listWithItems` zaten tek sorgudur ve sınırı yoktur.
 */
export const PackageListSchema = z.object({ packages: z.array(HomePackageSchema) });
export type PackageList = z.infer<typeof PackageListSchema>;
