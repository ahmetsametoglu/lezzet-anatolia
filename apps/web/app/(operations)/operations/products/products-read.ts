import { publicImageUrl } from '@lezzet/storage';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductView } from './products-types';

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
