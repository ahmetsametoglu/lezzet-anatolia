import { getR2 } from '@lezzet/storage';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductView } from './products-types';

// Sunucu-tarafı okuma yardımcıları. Ürün sayfası İKİ yerden okunur — ilk sayfa RSC'de (page.tsx),
// devamı action'da (actions/list.ts) — ve ikisi de aynı indirgemeyi yapar: imzalı görsel URL'i +
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
 * Görseller R2 private bucket'ta → imzalı okuma URL'i (imzalama yerel hesap, ağ turu değil).
 * (05.11) public bucket'a geçildiğinde bu adım saf string birleştirmeye iner.
 */
export async function toProductViews(rows: ProductWithRelations[], names: NameMaps): Promise<ProductView[]> {
  const r2 = getR2();
  const imageUrls = await Promise.all(rows.map((p) => (r2 && p.imageKey ? r2.getSignedReadUrl(p.imageKey) : Promise.resolve(null))));

  return rows.map((row, i) => {
    const { collections, ...product } = row;
    return {
      ...product,
      imageUrl: imageUrls[i] ?? null,
      categoryName: product.categoryId ? (names.category.get(product.categoryId) ?? '—') : '—',
      collectionNames: collections.map((c) => names.collection.get(c.collectionId) ?? '').filter(Boolean),
    };
  });
}
