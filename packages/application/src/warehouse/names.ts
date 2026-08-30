import { ProductService, ProductVariantService } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type ProductDateType } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Varyantın DEPO EKRANLARINDA görünen adı — **dört kapının ortak okuması** (terfi 21.11).
 *
 * Hazırlık kuyruğu, mal kabul formu ve transfer kabulü aynı soruyu soruyor: "bu varyantın ürün adı
 * ve boy etiketi ne". Üç kapı kendi kopyasını taşısaydı üçü de aynı iki sorguyu (varyant → ürün)
 * kurardı ve biri gün gelip ötekinden farklı bir ad üretirdi (ör. boyu parantezle mi yazıyor).
 *
 * **İki tur, varyant başına sorgu YOK** (N+1): kimlikler toplanır, iki `listByIds` ile çözülür.
 *
 * **Operasyon yüzeyi Türkçedir** (CLAUDE.md §2) — çözüm dili sabit `tr`. Depocunun ekranı müşterinin
 * diliyle konuşmaz; koli etiketiyle rafın üstündeki yazı aynı dilde olmalı.
 */

/**
 * Dışa VERİLMEZ ve bu bilinçli: tüketiciler haritanın değerini yapısal olarak okuyor (`.productName`
 * / `.variantLabel`), tipin adına ihtiyaçları yok. İhraç edilseydi paketin kamu yüzeyinde hiç
 * çağrılmayan bir isim dururdu (`knip`).
 */
interface VariantName {
  /** "Fıstıklı Baklava" — ürünün operasyon dilindeki adı. */
  productName: string;
  /** "500 g" gibi boy etiketi; tek boylu üründe boş dize. */
  variantLabel: string;
  /**
   * Varyantın kendi kodu (`product_variant.sku`); girilmemişse `null`.
   *
   * Buraya EKLENDİ çünkü iki kapı aynı kodu ayrı yollardan çözüyordu: plansız kabulün araması
   * (`variant-search`) varyantı ikinci kez `listByIds` ile okuyup SKU'yu alıyor, okutma kapısı
   * (`scan`) hiç okumadığı için satırında kod göstermiyordu. Bu okuma varyant satırını ZATEN
   * elinde tutuyor — kodu buradan vermek hem ikinci turu hem de "SKU nereden gelir" sorusunun
   * ikinci cevabını kaldırıyor (`CLAUDE §1`).
   */
  sku: string | null;
  /**
   * Ürünün TARİH REJİMİ (`product.date_type`) — `DLC` güvenlik, `DDM` kalite tarihi (DOMAIN §4).
   * Mal kabul ekranı "SKT ZORUNLU · DLC" derken bunu okuyor: SKT'nin zorunluluğu her satırda aynı,
   * hangi TÜR tarih yazılacağı ürüne göre değişir ve depocu kutunun üstünde onu arıyor.
   */
  dateType: ProductDateType;
  /**
   * Ürünün toplam raf ömrü (gün); girilmemişse `null` → kalan ömür HESAPLANAMAZ (motorun kararı,
   * `remainingShelfLifePercent`).
   *
   * Bu iki alan buraya 30.08'de geldi ve ikinci bir okumayı KAPATTI: `intake.ts` aynı zinciri
   * (varyant → ürün) `dateRulesOf` adıyla ikinci kez kuruyordu. Bu okuma ürün satırını ZATEN
   * elinde tutuyor — sorular ("ne yazacağım" / "hangi tarih, kaç gün") ayrı olsa da CEVABIN
   * KAYNAĞI tek, ve iki kopya bir gün ayrışacak iki kopyadır (`CLAUDE §1`).
   */
  shelfLifeDays: number | null;
  /** Ürün kapağının public URL'i — okutma çekmecesinin görseli; kapaksız üründe null. */
  imageUrl: string | null;
}

/** Bilinmeyen varyant için gösterilecek ad — uydurma bir metin yerine görünür bir boşluk. */
const UNKNOWN = '—';

export async function variantNames(
  db: SupabaseClient,
  variantIds: readonly string[],
): Promise<Map<string, VariantName>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(ids);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));

  return new Map(
    variants.map((variant) => {
      const product = productOf.get(variant.productId);
      return [
        variant.id,
        {
          productName: resolveLocalizedText(product?.name ?? {}, 'tr'),
          variantLabel: resolveLocalizedText(variant.label, 'tr'),
          sku: variant.sku ?? null,
          // Ürünü okunamayan varyantta `DDM`: kolon veride `not null` ve varsayılanı bu — uydurulmuş
          // bir değer değil, satır okunamadığında şemanın söylediği şey. `DLC` demek daha "güvenli"
          // görünürdü ama depocuya kutuda olmayan bir tarihi arattırırdı.
          dateType: product?.dateType ?? 'DDM',
          shelfLifeDays: product?.shelfLifeDays ?? null,
          imageUrl: publicImageUrl(product?.imageKey, product?.imageUpdatedAt),
        },
      ];
    }),
  );
}

/**
 * Tek satırlık ad — "Ürün (boy)". Boy etiketi yoksa parantez de yoktur: boş parantez, olmayan bir
 * ayrımı varmış gibi gösterir.
 */
export function displayName(name: VariantName | undefined): string {
  if (!name) return UNKNOWN;
  return name.variantLabel ? `${name.productName} (${name.variantLabel})` : name.productName;
}
