import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type BundleListRow, type ProductPool, type ProductWithRelations } from '@lezzet/types';
import type { BundleView, ProductView, VariantOption } from './products-types';

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
    itemLabels: bundle.itemNames.map(({ p, v }) => {
      const productName = resolveLocalizedText(p);
      const boy = v ? resolveLocalizedText(v) : '';
      return boy ? `${productName} · ${boy}` : productName;
    }),
  }));
}

/**
 * Katalogdaki TÜM satılabilir birimler, "Ürün · boy" adıyla. Boy etiketi boşsa (tek boylu ürün)
 * yalnız ürün adı kalır — "Baklava · " gibi sarkan bir ayraç bırakılmaz.
 *
 * PASİF OLAN DA GELİR: havuz hem "pakete ne eklenebilir" (yalnız aktif) hem "pakette duran kalemin adı
 * ne" (hepsi) sorusuna hizmet ediyor. Aktifle sınırlıyken pasif ürünün kalemi adsız kalıyordu ve ekran
 * onu "silinmiş" sanıyordu — oysa pakette duran varyant FK gereği (`restrict`) silinemez. Eklenebilirlik
 * artık ayrı bir alan (`addable`), süzgeç değil.
 *
 * TEK KAYNAK: paket formunun seçicisi de, liste satırındaki kalem adları da bunu kullanır. İki yerde
 * ayrı kurulsaydı biri "500 g" öbürü "Baklava 500 g" yazar, aynı kalem iki adla görünürdü.
 */
export function toVariantOptions(
  rows: ProductPool[],
  listPrices: Map<string, number>,
  unitCosts: Map<string, number>,
): VariantOption[] {
  return rows.flatMap((p) => {
    const productName = resolveLocalizedText(p.name);
    const imageUrl = publicImageUrl(p.imageKey, p.imageUpdatedAt);
    // Ürün düzeyindeki engel varyantın hepsini kapsar; boy düzeyindeki yalnız o boyu.
    const productBlock = p.status === 'active' ? null : p.status === 'candidate' ? 'aday ürün' : 'pasif ürün';
    return p.variants.map((v) => {
      const boy = resolveLocalizedText(v.label);
      const blockedReason = productBlock ?? (v.isActive ? null : 'pasif boy');
      return {
        variantId: v.id,
        label: boy ? `${productName} · ${boy}` : productName,
        imageUrl,
        listPrice: listPrices.get(v.id) ?? null,
        // Maliyet ve KDV oranı ÜRÜNDEN gelir; marj ikisi olmadan hesaplanamaz.
        unitCost: unitCosts.get(v.id) ?? null,
        vatRate: p.vatRate,
        targetMarginPercent: p.targetMarginPercent ?? null,
        addable: blockedReason === null,
        blockedReason,
      };
    });
  });
}

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
