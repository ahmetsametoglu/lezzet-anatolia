import { z } from 'zod';
import type { TextSegment } from '@lezzet/helper';
import {
  CategorySchema,
  ImageCropSchema,
  ProductSchema,
  ProductVariantSchema,
  UserProfileSchema,
} from '@lezzet/types';

/**
 * `GET /api/v1/me` yanıt sözleşmesi — `UserProfileSchema`'dan `.pick` ile TÜRETİLİR, elle DTO
 * yazılmaz (02-mimari §3.2).
 *
 * Küme MÜŞTERİYE BAKAN alanlardır; operasyon-içi alanlar bilinçli dışarıda: `warehouseIds`
 * (personel kapsamı), `b2bRejectedBy` (personel kimliği), `creditLimitCents`/`discountPercent`
 * (ticari koşullar — hangi uçtan ve nasıl gösterileceği kendi görevlerinin kararı), `isDraft`/
 * `acquisitionSource` (iç yaşam döngüsü). Uç `parse` ile döndürür: pick'te olmayan alan zarfa
 * SIZAMAZ — süzme tipte değil çalışma zamanında da geçerli.
 *
 * Bu şemanın `packages/types`'a terfisi Expo iskeleti (21.2/21.4) cevabı AYNI şemayla parse
 * etmeye başlarken yapılacak (02-mimari §3.2 "sözleşme tek kaynak" — terfi yöneticiye raporlandı).
 */
export const MeSchema = UserProfileSchema.pick({
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  preferredLanguage: true,
  country: true,
  roles: true,
  b2bApproved: true,
  b2bPending: true,
  marketingConsent: true,
  referralCode: true,
  createdAt: true,
});
// `Me` tipi bilerek İHRAÇ EDİLMİYOR: bugün tüketeni yok (knip ölü ihracı yakalar). İlk tüketen
// Expo tarafı olacak ve o gün tip buradan değil, terfi etmiş şemadan (`packages/types`) türeyecek.

// ─────────────────────────────────────────────────────────────────────────────
// KATALOG (21.6) — `/categories` · `/products` · `/products/:slug`
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⚠ **BU SÖZLEŞME BİLEREK YARIMDIR — ticari bağlam (fiyat · stok · teklif) HENÜZ YOK.**
 *
 * Sebep 02-mimari §3.1'dir ("terfi, kopya değil"): vitrinin fiyat/stok okuması bugün
 * `apps/web/lib/storefront`ta yaşıyor ve orası bir web KÜTÜPHANESİ değil, web UYGULAMASININ içi
 * (`'server-only'`, `next/headers` çerezi, React `cache()`). Mobil için gereken parça oradan
 * kopyalanamaz; `packages/application`a terfi etmesi gerekiyor ve terfi web şeridinin alanına
 * dokunduğu için yöneticinin koordine edeceği ayrı bir iştir (rapor: `getCatalogData` ·
 * `loadProductContext` · `map.ts` · `getProductDetail` · `read-place` · `read-viewer`).
 *
 * **Eksik alan YOK sayılmıştır, `null` DEĞİL** (`CLAUDE §1`: ölçülemeyen değer sıfır/boş değildir):
 * `priceCents: null` gönderseydik istemci onu "bu ürünün fiyatı yok → satışa kapalı" diye okur ve
 * yanlış bir ekran çizerdi. Alan hiç olmayınca istemci onu render EDEMEZ; terfi geldiğinde şema
 * `.extend` ile büyür ve eski istemci kırılmaz.
 *
 * Aynı gerekçeyle DIŞARIDA: `family` (çeşit kardeşleri), `similar` (benzer ürünler) — ikisi de
 * başlangıç fiyatı ve "tükendi" kararı olmadan çizilemiyor.
 */

/** Görselin çözülmüş hâli — anahtar değil, public URL + kırpma künyesi (web `map.imageOf` ikizi). */
const CatalogImageSchema = z.object({
  /** `null` = görsel yok ya da R2 taban adresi ayarsız; istemci yer tutucu çizer. */
  url: z.string().nullable(),
  crop: ImageCropSchema,
});

/**
 * Kategori kartı. `name` DÜZ STRING: çok dilli metin SUNUCUDA çözülür (`resolveLocalizedText`),
 * çünkü dil yedek zinciri (seçili → TR → FR → DE) tek yerde yaşamalı — istemciye üç dili birden
 * gönderip orada çözdürmek zinciri ikinci kez yazdırırdı.
 */
export const CatalogCategorySchema = CategorySchema.pick({ id: true, slug: true }).extend({
  name: z.string(),
  image: CatalogImageSchema,
});

/**
 * Satılabilir boy — bugün yalnız KİMLİK ve ETİKET taşır.
 *
 * `netWeightG` fiyat değil ölçüdür (INCO beyanının başlığı "Net ağırlık: 700 g" bundan kurulur),
 * o yüzden ticari bağlam boşluğuna düşmez. Fiyat/stok alanları terfiyle gelecek.
 */
const CatalogVariantSchema = ProductVariantSchema.pick({ id: true, netWeightG: true }).extend({
  label: z.string(),
});

/** Katalog kartı — liste ve detayın ORTAK gövdesi (detay bunu `.extend` eder). */
export const CatalogProductSchema = ProductSchema.pick({ id: true, slug: true, shippable: true }).extend({
  name: z.string(),
  image: CatalogImageSchema,
  /** İlk aktif boyun etiketi ("1 kg"); tek boylu üründe boş olabilir — gösterilecek bir boy adı yok. */
  unitLabel: z.string(),
  /** Yalnız AKTİF boylar, `sort_order` sonra `created_at` sırasında (görünümün `primary_variant`ıyla aynı ölçüt). */
  variants: z.array(CatalogVariantSchema),
});

/**
 * Sayfa zarfı. `nextCursor` **opak bir dize**, keyset nesnesinin kendisi değil: istemci onu
 * yorumlamaz, bir sonraki isteğe `?cursor=` olarak aynen geri verir. Kodlama/çözme tek yerde
 * (`catalog.ts`) kalsın diye — nesne gönderseydik istemci de aynı kodlamayı yazmak zorunda kalırdı.
 *
 * `null` = liste bitti; istemci "daha fazla"yı kapatır (`Page<T>` sözleşmesiyle aynı anlam).
 */
export const CatalogPageSchema = z.object({
  products: z.array(CatalogProductSchema),
  /**
   * Süzgeçli sonuç sayısı ("24 ürün"). Sayaç RPC'si YALNIZ arama + kategori + durum süzgecini
   * tanıyor; bu uç da sadece o üçünü sunduğu için sayı listeyle tutarlıdır. Sayaçtan habersiz bir
   * süzgeç eklenirse (ör. "yalnız indirimliler") bu alan sessizce yalan söylemeye başlar —
   * raporlanan web arızası tam olarak budur.
   */
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});

/**
 * Vurgulu metin parçası. `satisfies` bir SÜS değil KİLİT: `TextSegment` (`@lezzet/helper`)
 * değişirse burada derleme kırılır — parçanın şekli helper'ın tanımından sapamaz, ikinci bir
 * tanım doğmaz. Zod helper'ın kendisinde yok (paket saf TS), o yüzden şema burada yaşıyor.
 */
const TextSegmentSchema = z.object({ text: z.string(), strong: z.boolean() }) satisfies z.ZodType<TextSegment>;

/**
 * Yasal beyan (INCO) — uzaktan satışta satın alma ÖNCESİ erişilebilir olmak zorunda, yani
 * sözleşmenin süsü değil yükü.
 *
 * `ingredients`/`storage` PARÇALARA ayrılmış gelir: operatörün `**vurgu**` işareti sunucuda
 * çözülür (`parseEmphasis`), ham metin cihaza gitmez — işaretin ekranda görünme ihtimali kapanır.
 * Alerjenler KOD taşır (`gluten`); görünen ad istemcinin sözlüğünde çözülür.
 */
const CatalogDeclarationSchema = ProductSchema.pick({ allergens: true, traces: true, nutrition: true }).extend({
  ingredients: z.array(TextSegmentSchema).nullable(),
  storage: z.array(TextSegmentSchema).nullable(),
});

/** Ürün detayı — kartın üstüne açıklama, galeri, kategori ve yasal beyan. */
export const CatalogProductDetailSchema = CatalogProductSchema.extend({
  /** Sayfanın dilinde tek metin; çeviri eksikse yedek dilden. Boş/boşluk metin `null` sayılır. */
  description: z.string().nullable(),
  /** İlk öğe KAPAKTIR; tek görselli üründe şerit çizilmez. */
  gallery: z.array(CatalogImageSchema),
  /** Breadcrumb için; kategorisiz üründe null. */
  category: CatalogCategorySchema.nullable(),
  declaration: CatalogDeclarationSchema,
});
