import { z } from 'zod';
import { BundleItemSchema, BundleSchema } from '../entities/bundle.schema';
import { ProductSchema } from '../entities/product.schema';
import { CatalogImageSchema } from './catalog-api.schema';

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
 * ── `soldOut`/STOK ZİNCİRİ BİLEREK YOK ───────────────────────────────────────
 * Web'in paket okuması stok/tükenme kararını kalem zincirinden türetiyor (`apps/web/lib/storefront/
 * packages.ts` — "BİR kalem bile yetmiyorsa paket tükendi") ama o kural HÂLÂ web'de yaşıyor,
 * `@lezzet/application`a terfi etmedi. Kopyalamak yasak (CLAUDE §1); alanı taşıyıp hep `false`
 * basmak ise ekranı "tükendi yok" ile "tükendi bilinmiyor"u ayırt edemez hâlde bırakırdı
 * (ölçülemeyen değer sıfır değildir). Vitrin kartıyla aynı karar (`HomePackageSchema` künyesi):
 * kural terfi ettiği gün alan burada, tükendi hâli ekranda birlikte açılır. BEKLEYEN(21.14).
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
export const PackageDetailSchema = BundleSchema.pick({ slug: true }).extend({
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
  image: CatalogImageSchema,
  /**
   * İçerik satırları, paketin kendi sırasında (`bundle_item.sort_order`). **`min(1)` bir KİLİT**:
   * kalemsiz paket detay olarak da var olamaz (boş kutu satılmaz) — uç onu 404'e çevirir, şema
   * sızmasını derleme/parse anında keser.
   */
  items: z.array(PackageItemSchema).min(1),
});
export type PackageDetail = z.infer<typeof PackageDetailSchema>;
