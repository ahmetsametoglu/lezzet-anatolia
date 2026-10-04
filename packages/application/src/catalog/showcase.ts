import { AnalyticsProductDailyService, ProductListingService, SettingsService, type ProductListingScope } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, parisDateOf } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { AnalyticsProductSignal, ProductWithRelations } from '@lezzet/types';

import { EMPTY_PRODUCT_CONTEXT, toProduct } from './map';
import { loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import type { PlaceWarehouses, StorefrontProduct } from './storefront-types';

/*
  Vitrin seçkisi iki yüzeyin tek kaynağıdır, ki aynı müşteri iki yüzeyde iki farklı "çok sevilen" listesi görmesin. Sıralama günlük
  özetten (son N günün görüntüleme + sepete ekleme toplamı) gelir; veri birikmemişken katalogla dolar, sayfalanmaz ama sabit sınırlıdır.
*/

/**
 * Seçkinin penceresi (gün) işletme ayarıdır (`DOMAIN §6`). Varsayılan 7, çünkü bandın başlığı "Bu hafta çok sevilenler" diyor ve daha
 * uzun pencere haftalık vaatle aylık sıralama gösterirdi.
 */
const SHOWCASE_WINDOW_KEY = 'showcase_window_days';
const SHOWCASE_WINDOW_DEFAULT = 7;

/** Yüzey sınır vermezse: web anasayfasının dörtlü ızgarası (tasarımın kendi sayısı). */
export const SHOWCASE_LIMIT_DEFAULT = 4;

/**
 * Sinyal kapısından sınırın katı kadar satır istenir, çünkü baştaki ürün pasif ya da bu yerde satılamıyor olabilir ve ray eksik kalırdı.
 */
const overfetchFor = (limit: number): number => limit * 5;

export interface ShowcaseOptions {
  /** Kaç kart — yüzeyin tasarımı belirler (web 4 · native 6). */
  limit?: number;
  /**
   * Fırsatlı ürünü seçkiden eler; native vitrinde fırsat rayı seçkinin hemen üstündedir ve aynı ürünleri gösterirse seçki yankıya döner.
   * Web'de varsayılan kapalı, çünkü eleme bir sunum kararıdır ve iki yüzeyin bant düzeni aynı değil.
   */
  excludeOffers?: boolean;
}

/**
 * **Vitrin seçkisi** — anasayfanın "çok sevilenler" bandı, boş sepetin öneri alanı ve native
 * vitrinin seçki rayı AYNI dörtlüyü/altılıyı okur. Ayrı yazılsalardı müşteri her ekranda başka bir
 * "seçki" görürdü.
 */
export async function readShowcase(
  db: SupabaseClient,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
  options: ShowcaseOptions = {},
): Promise<StorefrontProduct[]> {
  const limit = options.limit ?? SHOWCASE_LIMIT_DEFAULT;
  const rows = await showcaseRows(db, { warehouseId: place.warehouseId, channel: viewer.channel }, limit, options);
  const context = await loadProductContext(db, rows, place, viewer);
  const products = rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
  /* FIRSAT ELEMESİ ANCAK BURADA YAPILABİLİR: `wasCents` bir satır özelliği değil, motorun
     KARARIDIR (teklif normal fiyatı yendi mi) ve o karar `toProduct`ta veriliyor. Bu yüzden
     `showcaseRows` fazladan satır çekiyor — eleme sonrası ray yine dolsun diye. */
  return options.excludeOffers === true ? products.filter((p) => p.wasCents === undefined).slice(0, limit) : products;
}

/**
 * Seçkinin ürün satırları önce ölçütten, eksikse katalogdan gelir; kaynak `product_listing` görünümüdür, çünkü kanalında satılamayan ürün
 * fiyatsız kart olurdu. Süzgeç kaynaktadır, çünkü sabit sayılı bant sonradan elenince eksilirdi.
 */
async function showcaseRows(
  db: SupabaseClient,
  scope: ProductListingScope,
  limit: number,
  options: ShowcaseOptions,
): Promise<ProductWithRelations[]> {
  const products = new ProductListingService(db);
  /* Fırsat elemesi açıkken hedef büyütülür: elenecek kartların yerini dolduracak satır kalsın.
     Kaç fırsat olduğu önden bilinemez (karar motorda), o yüzden pay sabit bir KATTIR. */
  const target = options.excludeOffers === true ? limit * 3 : limit;
  const overfetch = overfetchFor(target);
  const ranked = await rankedProductIds(db, overfetch);
  if (!ranked.length) {
    // **İlk gün hâli birinci sınıf:** sinyal birikmeden band boş kalmaz, katalogla dolar. Bu bir
    // uydurma sıralama değil — "en çok sevilen" iddiası yalnız ölçüt varken kuruluyor.
    return (await products.list({ filters: { status: 'active' }, limit: target, ...scope })).rows;
  }

  const page = await products.list({ filters: { ids: ranked, status: 'active' }, limit: overfetch, ...scope });
  const picked = orderByRank(page.rows, ranked);
  if (picked.length >= target) return picked.slice(0, target);

  // Ölçütü olan ürünlerin bir kısmı pasifleşmişse band yine dolmak ister: kalanı katalogdan.
  // Eksik bir band, tasarımın ızgarasını bozar ve müşteriye "bir şeyler eksik" dedirtir.
  const filler = await products.list({ filters: { status: 'active' }, limit: target + picked.length, ...scope });
  return topUp(picked, filler.rows, target);
}

/**
 * Satırları ÖLÇÜT sırasına dizer — servisin döndürdüğü sıra veritabanınındır, seçkinin değil.
 *
 * Sıralamada olmayan satır sona düşer (`Infinity`): kapı yalnız `ranked` içindeki kimlikleri
 * istedi, yine de savunmacı — bir gün süzgeç genişlerse seçki sessizce rastgele sıralanmasın.
 */
export function orderByRank<T extends { id: string }>(rows: readonly T[], ranked: readonly string[]): T[] {
  const order = new Map(ranked.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
}

/** Eksik kalan bandı tamamlar — zaten seçilmiş ürün ikinci kez girmez. */
export function topUp<T extends { id: string }>(picked: readonly T[], filler: readonly T[], limit: number): T[] {
  const seen = new Set(picked.map((p) => p.id));
  return [...picked, ...filler.filter((p) => !seen.has(p.id))].slice(0, limit);
}

/**
 * Sinyalleri seçkinin ölçütüne göre sıralar: **görüntüleme + sepete ekleme.**
 *
 * Sepete ekleme görüntülemeden daha güçlü bir "sevme" beyanıdır ama ayrı ağırlık VERİLMEDİ: ağırlık
 * seçmek, ölçüsü olmayan bir katsayıyı ekrana yansıtmak olurdu. Toplam yeterince dürüst — ve
 * değiştirmek gerekirse tek satır.
 */
export function rankSignals(signals: readonly AnalyticsProductSignal[]): string[] {
  return signals
    .slice()
    .sort((a, b) => b.viewCount + b.cartCount - (a.viewCount + a.cartCount))
    .map((s) => s.productId);
}

/**
 * Ölçüte göre sıralı ürün kimlikleri, sinyal yoksa boş dizi; pencere günlük özetle aynı Paris günleridir. Ölçüm düşerse seçki düşmez,
 * hata yutulup yedek devreye girer, çünkü analitik vitrinin açılmasını engelleyemez.
 */
async function rankedProductIds(db: SupabaseClient, overfetch: number): Promise<string[]> {
  try {
    const days = await new SettingsService(db).getNumber(SHOWCASE_WINDOW_KEY, SHOWCASE_WINDOW_DEFAULT);
    const to = parisDateOf(new Date());
    return rankSignals(await new AnalyticsProductDailyService(db).signals(addDays(to, -days), to, overfetch));
  } catch {
    // Sinyal okunamadı (tablo yok, RPC düştü): seçki yedeğe düşer, müşteri farkı görmez.
    return [];
  }
}

