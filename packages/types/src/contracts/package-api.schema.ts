import { z } from 'zod';
import { BundleItemSchema, BundleSchema } from '../entities/bundle.schema';
import { ProductSchema } from '../entities/product.schema';
import { CatalogImageSchema } from './catalog-api.schema';
import { HomePackageSchema } from './home-api.schema';

/**
 * Mobil paket ucunun (`GET /api/v1/packages/:slug`) ve native paket ekranının ortak şeması: alan değişirse iki taraf da derlemede
 * kırılır. Kalem fiyatı bilerek taşınmaz — paket tek fiyattır ve alan hiç yokken ekran kırılımı yanlışlıkla basamaz.
 */

/**
 * Paket içeriğinin TEK satırı — "Pakette neler var?" kartı. Satıra basınca ürün detayına gidilir
 * (yasal gerekçe web içerik kartının künyesinde: alerjen/içindekiler beyanı ürün sayfasındadır ve
 * satın alma ÖNCESİ erişilebilir olmalı; paket sayfası yalnız kapı açar).
 */
export const PackageItemSchema = ProductSchema.pick({ slug: true }).extend({
  /** Ürün adı, seçili dilde çözülmüş (dil yedek zinciri sunucuda — istemci dil bilmez). */
  name: z.string(),
  /** Boy etiketi ("500 g"); tek boylu üründe boş. Addan ayrı alan, çünkü kalem bir boya bağlı ve cümleyi ekran kurar. */
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
   * Paylaşılacak tam web adresi, dil öneki ve çevrilmiş yol dâhil. Adres web rotasının kuralıdır; mobilde kurmak o kuralın
   * ikinci kopyası olurdu.
   */
  shareUrl: z.string().url(),
});
export type PackageDetail = z.infer<typeof PackageDetailSchema>;

/**
 * Paket listesi (`GET /api/v1/packages`): satır vitrinin paket kartıyla aynı şema, çünkü iki yer aynı kartı aynı okumadan çizer.
 * Vitrinden farkı süzgeçtir, burada yayındaki paketlerin tamamı var; sayfalama yok, çünkü operatörün elle kurduğu küçük bir
 * küme tek turda okunur.
 */
export const PackageListSchema = z.object({ packages: z.array(HomePackageSchema) });
export type PackageList = z.infer<typeof PackageListSchema>;
