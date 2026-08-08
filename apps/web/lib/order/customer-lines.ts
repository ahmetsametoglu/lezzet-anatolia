import 'server-only';
import { ProductService, ProductVariantService, type Db } from '@lezzet/database';
import { resolveLocalizedText, type OrderItem } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { imageOf } from '@lezzet/application';

/**
 * Sipariş kaleminin MÜŞTERİ künyesi — ürün adı, boy etiketi, görsel.
 *
 * Neden ayrı bir dosya: `order_item` satırı yalnız `variant_id` taşır, ürün adının anlık görüntüsünü
 * TUTMAZ. Yani "Baklava" yazısını ekrana getirmek her seferinde varyant → ürün zincirini çözmek
 * demek. Bu zincir üç ekranda birden gerekiyor (sipariş onayı, siparişler listesi, sipariş detayı);
 * üç kopya yazmak aynı sorguyu üç yerde bakıma mahkûm etmekti (CLAUDE.md §1).
 *
 * **İsim neden siparişte saklanmıyor?** Saklansaydı ürün yeniden adlandırıldığında eski siparişler
 * eski adı gösterirdi — ki bu bazen doğru, bazen kafa karıştırıcıdır. Bugünkü karar: ad CANLI
 * okunur. Fiyat ve indirim ise siparişte donmuş durumda (`unit_price`, `discount_label`) — çünkü
 * onlar paranın kaydıdır, ad değil.
 *
 * Sorgu sayısı kalemle DEĞİL, benzersiz varyant/ürün sayısıyla artar: iki toplu okuma
 * (`listByIds`), kalem başına sorgu yok.
 */
interface CustomerOrderLine {
  /** Ürün adı — bulunamazsa boş; ürün silinmiş olabilir, kalem yine de gösterilir. */
  name: string;
  /** Varyant/boy etiketi ("500 g"). */
  unit: string;
  image: ReturnType<typeof imageOf> | null;
}

/**
 * Verilen kalemlerin varyant kimliğine göre künye haritası.
 *
 * Haritada OLMAYAN varyant çağıranı patlatmaz — ürün ya da varyant silinmişse kalem adsız görünür.
 * Siparişi hiç göstermemektense adsız göstermek daha doğru: müşteri parasının karşılığını görmeli.
 */
export async function resolveOrderLines(
  db: Db,
  items: readonly Pick<OrderItem, 'variantId'>[],
  locale: Locale,
): Promise<Map<string, CustomerOrderLine>> {
  const variantIds = [...new Set(items.map((i) => i.variantId))];
  if (variantIds.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  return new Map(
    variants.map((variant) => {
      const product = productById.get(variant.productId);
      return [
        variant.id,
        {
          name: product ? resolveLocalizedText(product.name, locale) : '',
          unit: resolveLocalizedText(variant.label, locale),
          image: product ? imageOf(product) : null,
        },
      ];
    }),
  );
}
