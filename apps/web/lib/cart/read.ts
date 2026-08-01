import 'server-only';
import { ProductService, ProductVariantService, SettingsService, serviceDb } from '@lezzet/database';
import { meetsMinBasket, type DiscountableLine } from '@lezzet/domain-core';
import { CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toVariant } from '@/lib/storefront/map';
import { loadProductContext } from '@/lib/storefront/read-context';
import { getPackagesByIds } from '@/lib/storefront/packages';
import type { StorefrontPackageDetail } from '@/lib/storefront/storefront-types';
import { FREE_SHIPPING_THRESHOLD_DEFAULT, FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY } from '@/lib/settings-keys';
import { resolveCartDiscount } from './discount';
import { EMPTY_CART, cartKey, discountAmountOf, type CartEntry, type CartLine, type CartView } from './cart-types';

/**
 * Sepet okuması (08.4) — NİYETİ bugünkü görünüme çevirir.
 *
 * Girdi yalnız `{variantId, qty, stockId}` üçlüsüdür; ad, fiyat, stok ve tavan burada YENİDEN
 * çözülür. Sebep DOMAIN §5: sepetteki fiyat bağlayıcı değildir, gösterimdir. Sepet aylarca
 * bekleyebilir — fiyat da stok da o arada değişir.
 *
 * Tek turda okur: varyantlar → ürünler → fiyat/stok/teklif bağlamı. Sepette 20 kalem olsa da sorgu
 * sayısı sabittir (kalem başına sorgu N+1 doğurur).
 *
 * **Çıpalı parti kontrolü:** teklif kalemi eklendiği partiye bağlıdır. O parti tükendiyse indirim
 * başka partiye TAŞINMAZ; satır bugünkü çözümde teklifsiz görünür ve fiyatı normale döner
 * (müşteriye checkout'ta bildirilir — 07.4'ün işi).
 */
export async function getCartView(
  locale: Locale,
  entries: readonly CartEntry[],
  /**
   * İndirim bağlamı. Sepetin parası zaten burada hesaplandığı için indirim de burada çözülür:
   * ayrı bir okumaya alınsaydı ürün/kategori/koleksiyon ikinci kez çekilir ve iki okuma arasında
   * fiyat değiştiğinde ekran kendi toplamıyla çelişirdi.
   */
  opts: {
    customerId?: string | null;
    couponCode?: string | null;
    /**
     * Sunucu sepetinde SAKLANAN fiyatlar (`cartKey` → cent). Bugünkü çözümle karşılaştırılır;
     * artış varsa satır `priceChange` taşır (DOMAIN §5). Verilmezse karşılaştırma yapılmaz —
     * ziyaretçide saklanan fiyat yoktur.
     */
    previousPrices?: ReadonlyMap<string, number>;
    /**
     * Müşterinin yerinden çözülen depo (DOMAIN §17). Null = yer bilinmiyor: sepet depo-ÜSTÜ okunur
     * ve "burada satılmıyor" denmez — yalnız hiçbir depoda yoksa tükendi denir (C3).
     *
     * Adlandırılmış alan, konumsal parametre DEĞİL: sepet okumasının imzası zaten üç şey taşıyordu
     * ve araya girecek dördüncü bir konum, mevcut çağrıları sessizce kaydırırdı.
     * BEKLEYEN(19.7): yer bağlamı v2 bunu dolduracak.
     */
    warehouseId?: string | null;
  } = {},
): Promise<CartView> {
  const db = serviceDb();
  const settings = new SettingsService(db);
  // İkisi de DOMAIN §6'ya göre PARAMETRİK — kod sabiti değil, işletme ayarı.
  //
  // Anahtarlar ORTAK sabitten gelir (`lib/settings-keys`): burada `free_shipping_cents` yazıyordu
  // ve öyle bir ayar hiç yoktu — okuma sessizce varsayılana düşüyor, checkout ise gerçek ayarı
  // okuyordu. İkisi tesadüfen aynı değerde olduğu için görünmüyordu (29.07).
  const [minBasketCents, freeShippingCents] = await Promise.all([
    settings.getNumber(MIN_BASKET_KEY, 0),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT),
  ]);
  if (entries.length === 0) return { ...EMPTY_CART, freeShippingCents, ...meets(0, minBasketCents) };
  // Motorun kalem sözleşmesi: satır çözülürken doldurulur (kategori/koleksiyon oradan gelir).
  const discountable: DiscountableLine[] = [];

  // İki tür satır, iki okuma — ikisi de TOPLU. Paketler kendi kapısından gelir (`lib/storefront`),
  // türetme (stok, kargo, ağırlık) orada tek yerde durur; sepette ikinci kez yazılsaydı vitrindeki
  // kartla sepetteki satır aynı paket için farklı "tükendi" diyebilirdi.
  const bundleIds = [...new Set(entries.map((e) => e.bundleId).filter((id): id is string => id !== undefined))];
  const variantIds = [...new Set(entries.map((e) => e.variantId).filter((id): id is string => id !== undefined))];

  const [variants, packageRows] = await Promise.all([
    new ProductVariantService(db).listByIds(variantIds),
    getPackagesByIds(bundleIds, locale),
  ]);
  const packages = new Map(packageRows.map((p) => [p.id, p]));
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const productIds = [...new Set(variants.map((v) => v.productId))];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds }, limit: productIds.length });
  const byProduct = new Map(page.rows.map((p) => [p.id, p]));
  const context = await loadProductContext(db, page.rows, opts.warehouseId ?? null);

  const lines: CartLine[] = [];
  for (const entry of entries) {
    // PAKET satırı ayrı bir kapıdan çözülür: fiyatı kendi alanından gelir (kalem toplamı değil),
    // stok kararı kalemlerinin en zayıfına bağlıdır ve teklif/parti kavramı hiç yoktur.
    if (entry.kind === 'bundle') {
      const line = bundleLine(entry.bundleId, entry.qty, packages.get(entry.bundleId));
      lines.push({ ...line, ...priceChangeOf(entry, line.unitPriceCents, opts.previousPrices) });
      // Pakete indirim BİNMEZ (DOMAIN §13) — motor bunu `bundleId` dolu olduğu için kendisi eler;
      // satır yine de gönderilir ki pay dizisi kalem sırasıyla hizalı kalsın.
      discountable.push({ variantId: '', qty: entry.qty, unitPriceCents: line.unitPriceCents ?? 0, bundleId: entry.bundleId });
      continue;
    }
    const variant = byVariant.get(entry.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    // Varyant ya da ürün kaybolduysa (silinmiş/pasifleşmiş) satır SESSİZCE DÜŞMEZ: müşteri neyi
    // kaybettiğini görmeli. Elimizdeki tek şey kimlik, o yüzden adsız ama engelleyen satır kurulur.
    if (!variant || !product) {
      lines.push(orphanLine(entry));
      // Kaynağı kayboldu → fiyatı da yok; matraha 0 ile girer, payı 0 olur.
      discountable.push({ variantId: entry.variantId, qty: entry.qty, unitPriceCents: 0 });
      continue;
    }

    const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
    const view = toVariant(variant, locale, ctx);
    // Sepetteki çıpa bugünkü teklifle uyuşmuyorsa teklif bu satırda GEÇERSİZDİR.
    const offerHolds = entry.stockId !== null && view.stockId === entry.stockId;
    const unitPriceCents = view.priceCents;

    lines.push({
      ...entry,
      slug: product.slug,
      name: resolveLocalizedText(product.name, locale),
      image: imageOf(product),
      unitLabel: view.label,
      unitPriceCents,
      wasCents: offerHolds ? view.wasCents : undefined,
      limitCap: offerHolds && view.limitLabel ? Number(view.limitLabel) : null,
      lineTotalCents: unitPriceCents === null ? null : unitPriceCents * entry.qty,
      // Satışa kapalı ya da tükendi → çıkarılmadan devam edilemez.
      blocked: unitPriceCents === null || view.soldOut,
      contents: [],
      shippable: product.shippable,
      vatRate: product.vatRate,
      ...priceChangeOf(entry, unitPriceCents, opts.previousPrices),
    });

    discountable.push({
      variantId: entry.variantId,
      qty: entry.qty,
      unitPriceCents: unitPriceCents ?? 0,
      categoryId: product.categoryId,
      collectionIds: product.collections?.map((row) => row.collectionId) ?? [],
      // Teklif satırı kendi özel fiyatındadır: indirim matrahına GİRMEZ (DOMAIN §5).
      offerStockId: offerHolds ? entry.stockId : null,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  const discount = await resolveCartDiscount(db, {
    lines: discountable,
    customerId: opts.customerId,
    couponCode: opts.couponCode,
  });

  return {
    lines,
    subtotalCents,
    discount,
    // Sepetin ödenecek hâli — kargo HARİÇ (o adreste belli olur).
    totalCents: Math.max(0, subtotalCents - discountAmountOf(discount)),
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    hasBlocked: lines.some((l) => l.blocked),
    freeShippingCents,
    ...meets(subtotalCents, minBasketCents),
  };
}

/**
 * Fiyat değişimi işareti (DOMAIN §5). **Yalnız ARTIŞ** döner: düşen fiyat sessizce uygulanır.
 *
 * Saklanan fiyat 0 ise karşılaştırma yapılmaz — o, fiyatın "henüz çözülmedi" hâlidir (niyet
 * sunucuya yazılırken 0 girer, çözülen değeri `writeCartAction` üstüne yazar). Sıfırı geçerli bir
 * "önceki fiyat" saymak, her yeni kalemi "zamlandı" diye işaretlerdi.
 */
function priceChangeOf(
  entry: CartEntry,
  currentCents: number | null,
  previous?: ReadonlyMap<string, number>,
): { priceChange?: { previousCents: number } } {
  if (!previous || currentCents === null) return {};
  const previousCents = previous.get(cartKey(entry));
  if (!previousCents || currentCents <= previousCents) return {};
  return { priceChange: { previousCents } };
}

function meets(subtotalCents: number, minBasketCents: number) {
  const { ok, missingCents } = meetsMinBasket(subtotalCents, minBasketCents);
  return { minBasketOk: ok, missingForMinBasketCents: missingCents, minBasketCents };
}

/** Kaynağı kaybolmuş satır — adı yok ama sepette duruyor; çıkarılmadan devam edilemez. */
function orphanLine(entry: CartEntry): CartLine {
  return {
    ...entry,
    slug: '',
    name: '',
    image: { url: null, crop: CROP_CENTER },
    unitLabel: '',
    unitPriceCents: null,
    limitCap: null,
    lineTotalCents: null,
    blocked: true,
    contents: [],
    vatRate: 0,
    // Kaynağı kayboldu: kargolanıp kargolanamayacağı da bilinmiyor. `true` demek kısıt uyarısını
    // yutmak olurdu; satır zaten engelli, çıkarılmadan devam edilemiyor.
    shippable: false,
  };
}

/**
 * Paket satırı. Fiyat paketin KENDİ alanından gelir — kalemlerin toplamı değil (tek fiyat kuralı,
 * DOMAIN §13). Teklif/parti kavramı yok: indirim pakete uygulanmaz, bu yüzden `wasCents` ve
 * `limitCap` daima boştur.
 *
 * Paket bu arada satıştan kalkmışsa (`packages` içinde yok) satır SESSİZCE DÜŞMEZ: kimliğiyle ve
 * engelli olarak durur — müşteri sepetinden bir şeyin kaybolduğunu görmeli.
 */
function bundleLine(bundleId: string, qty: number, pack: StorefrontPackageDetail | undefined): CartLine {
  if (!pack) return orphanLine({ kind: 'bundle', bundleId, qty });
  return {
    kind: 'bundle',
    bundleId,
    qty,
    slug: pack.slug,
    name: pack.name,
    image: pack.image,
    unitLabel: '',
    unitPriceCents: pack.priceCents,
    limitCap: null,
    lineTotalCents: pack.priceCents * qty,
    blocked: pack.soldOut,
    contents: pack.items.map((item) => ({ name: item.name, qty: item.qty })),
    vatRate: pack.vatRate,
    // Pakette TEK bir soğuk zincir kalemi bile varsa paketin tamamı rota içi kalır (05.5).
    shippable: !pack.inRouteOnly,
  };
}
