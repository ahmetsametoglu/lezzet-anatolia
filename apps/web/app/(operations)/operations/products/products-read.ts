import { publicImageUrl } from '@lezzet/storage';
import { titleOf } from '@/lib/catalog/title';
import { resolveLocalizedText, type BundleListRow, type ProductWithRelations } from '@lezzet/types';
import type { BundleView, ProductView } from './products-types';

// Sunucu-tarafı okuma yardımcıları. Ürün sayfası İKİ yerden okunur — ilk sayfa RSC'de (page.tsx),
// devamı action'da (actions/list.ts) — ve ikisi de aynı indirgemeyi yapar: public görsel URL'i +
// çözülmüş kategori/koleksiyon adları. O indirgeme burada TEK yerde durur (no-duplication).

/** Ad çözüm sözlükleri — çağıran zaten elinde olanı geçer, ikinci kez okunmaz. */
interface NameMaps {
  category: Map<string, string>;
  collection: Map<string, string>;
}

/**
 * DB satırlarını client'ın gördüğü view-model'e indirger. `collections` (üyelik id'leri) DIŞARIDA
 * bırakılır: client adları görür, id'leri değil — gereksiz yük tele gitmesin.
 *
 * Görsel URL'i public bucket'tan saf string birleştirmeyle kurulur (05.11) — async değil, ağ turu
 * yok, sonuç sabit ve cache'lenebilir. Sürüm damgası `imageUpdatedAt`'ten gelir.
 */
/** Paket ÖZET satırlarını view-model'e indirger (kalem taşımaz; bkz. `bundle_list_rows()`). */
export function toBundleViews(rows: BundleListRow[]): BundleView[] {
  return rows.map((bundle) => ({
    ...bundle,
    imageUrl: publicImageUrl(bundle.imageKey, bundle.imageUpdatedAt),
    // Ad çözümü BURADA: okuma fonksiyonu ham jsonb döndürüyor, dil yedek zinciri (TR→FR→DE) tek
    // yerde kalsın diye SQL'e kopyalanmadı. Sıra kalemin `sortOrder`'ı (fonksiyon öyle topluyor).
    itemLabels: bundle.itemNames.map(({ p, v }) => titleOf(resolveLocalizedText(p), v ? resolveLocalizedText(v) : '')),
  }));
}

// `toVariantOptions` BURADAN TAŞINDI (22.18) → `@/lib/catalog/variant-options`. Tek çağıranı paket
// eylemleriydi ve o eylemler ortak alana çıktı (kuyruk da aynı formu açıyor); türev onlarla gitti.

export function toProductViews(rows: ProductWithRelations[], names: NameMaps): ProductView[] {
  return rows.map((row) => {
    const { collections, ...product } = row;
    return {
      ...product,
      imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
      categoryName: product.categoryId ? (names.category.get(product.categoryId) ?? '—') : '—',
      collectionNames: collections.map((c) => names.collection.get(c.collectionId) ?? '').filter(Boolean),
    };
  });
}
