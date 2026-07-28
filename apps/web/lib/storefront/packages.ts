import 'server-only';
import { BundleService, ProductService, ProductVariantService, StockService, serviceDb } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { imageOf } from './map';
import type { StorefrontPackage } from './storefront-types';

/**
 * Paket okuması (05.5'in müşteri tarafı) — vitrinin paket KAPISI.
 *
 * **Kartın bilgileri TÜRETİLİR, girilmez** (tasarım sözleşmesi): kalem sayısı · stok · kargo kısıtı ·
 * toplam net ağırlık. Operatörden bunları ayrıca istemek, paketi her düzenlediğinde dört alanı elle
 * tazelemesini istemek olurdu — ilk unutulanda ekran yalan söylerdi.
 *
 * Türetmenin üç kuralı, üçü de tasarımdan:
 *   stok  → BİR kalem bile yetmiyorsa paket tükendi. Paket bütün olarak satılır; "yarısı var" diye
 *           bir hâli yok.
 *   kargo → kargolanamayan (soğuk zincir) BİR kalem varsa paketin tamamı yalnız rota içi.
 *   ağırlık → bir kalemin net ağırlığı bilinmiyorsa toplam UYDURULMAZ, satır hiç basılmaz.
 *
 * **Tek turda okur.** Paket sayısı operatörün elle kurduğu bir seçkidir (CLAUDE.md §1: doğal tavanı
 * olan küme), veriyle büyümez — keyset sayfalama gerekmez. Tasarımın "12 + daha fazla" düzeni bir
 * GÖSTERİM kararıdır ve ekranda çözülür; sorgu bölünmez.
 */

/** Anasayfa bandının sabit sınırı — editoryal seçki, liste değil (CLAUDE.md §1). */
export const HOME_PACKAGE_LIMIT = 3;

export async function listStorefrontPackages(locale: Locale): Promise<StorefrontPackage[]> {
  const db = serviceDb();
  // `listSellable` pasif paketi ve kalemi satıştan kalkmış paketi zaten düşürür; STOK burada
  // bakılmaz çünkü tükenmiş paket GİZLENMEZ — sona alınır (tasarım: link boşa düşmesin).
  const bundles = await new BundleService(db).listSellable();
  if (bundles.length === 0) return [];

  const variantIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.variantId)))];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const productIds = [...new Set(variants.map((v) => v.productId))];

  // Kargo kısıtı ÜRÜNÜN alanı (`shippable`), varyantın değil — soğuk zincir ürünün özelliği.
  // Küme paketlerin kalemleriyle sınırlı olduğu için tam satır okumak burada ucuz; `limit` açıkça
  // verilir, yoksa `getPage` varsayılan sayfa boyunda keser ve bazı ürünler sessizce düşerdi.
  const [products, stock] = await Promise.all([
    new ProductService(db).list({ filters: { ids: productIds }, limit: productIds.length }),
    new StockService(db).getAvailableMap(variantIds),
  ]);
  const shippable = new Map(products.rows.map((p) => [p.id, p.shippable]));

  const rows = bundles.map((bundle) => {
    const items = bundle.items.map((item) => ({ item, variant: byVariant.get(item.variantId) }));

    // Ağırlık: kalemlerden BİRİ bile bilinmiyorsa toplam yok. Eksik veriyi 0 saymak, 4,2 kg'lık bir
    // paketi 3,1 kg gösterip müşteriyi yanıltmak olurdu.
    const weights = items.map(({ item, variant }) => (variant?.netWeightG != null ? variant.netWeightG * item.qty : null));
    const totalWeightG = weights.every((w) => w !== null) ? weights.reduce((sum: number, w) => sum + (w ?? 0), 0) : null;

    return {
      id: bundle.id,
      slug: bundle.slug,
      name: resolveLocalizedText(bundle.name, locale),
      description: bundle.description ? resolveLocalizedText(bundle.description, locale) : '',
      image: imageOf(bundle),
      itemCount: bundle.items.length,
      priceCents: toCents(bundle.totalPrice),
      serves: bundle.serves,
      totalWeightG,
      inRouteOnly: items.some(({ variant }) => variant !== undefined && shippable.get(variant.productId) === false),
      soldOut: items.some(({ item }) => (stock.get(item.variantId)?.availableQty ?? 0) < item.qty),
    } satisfies StorefrontPackage;
  });

  // Tükenmiş paket listeden DÜŞMEZ, sonuna gider (tasarım kararı: paket bir pazarlama aracı —
  // sosyal medyada dolaşan link boşa düşmemeli, "yakında yeniden" beklentisi sürmeli).
  // Sıralama kararlı: aynı gruptakiler yönetimin verdiği `sortOrder`'da kalır.
  return [...rows.filter((p) => !p.soldOut), ...rows.filter((p) => p.soldOut)];
}
