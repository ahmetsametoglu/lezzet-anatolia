import {
  BundleService,
  CategoryService,
  CollectionService,
  ProductService,
  ProductVariantService,
  StockService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { missingDeclarations, resolveLocalizedText } from '@lezzet/types';

/**
 * Katalog ve stok gözü (22.1 · Faz A) — asistanın "neyi tamamlamam gerekiyor" ve "neyin ömrü
 * doluyor" sorularına cevabı.
 *
 * **Kural KOPYALANMAZ, motordan okunur** (STACK §4): beyanın eksik olup olmadığına
 * `missingDeclarations` karar verir — ekran, sunucu süzgeci ve bu araç aynı listeyi izler.
 * Sayaçlar da uydurulmaz: `ProductService.counts()` RPC'si zaten "kaç ürün eksik beyanlı"yı
 * söylüyor, burada yeniden sayılmaz.
 *
 * **Vitrin doluluğu SAYI olarak döner, YORUM olarak değil:** "6 kategori işaretli" denir,
 * "6/6 dolu" denmez — slot sayıları müşteri yüzeyinin tasarım kararıdır (`HOME_PACKAGE_LIMIT`
 * gibi) ve buraya kopyalansa iki yerde iki farklı doğru olurdu.
 */

/** Katalogun tamamlanmışlık tablosu + vitrin işaretleri. */
export async function catalogHealth(limit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const db = serviceDb();
  const products = new ProductService(db);

  const [counts, incomplete, featured] = await Promise.all([
    products.counts(),
    // Süzgeç SUNUCUDA (`onlyIncomplete`) — tüm katalogu çekip uygulamada elemek, katalog
    // büyüdükçe sessizce yavaşlayan bir okuma olurdu.
    products.list({ filters: { onlyIncomplete: true, status: 'active' }, limit: clamped }),
    featuredOverview(),
  ]);

  return {
    totals: {
      products: counts.total,
      candidates: counts.candidate,
      incompleteDeclarations: counts.incomplete,
    },
    // Hangi ürünün NEYİ eksik — asistan "ürün detayını tamamla" işine buradan başlar.
    incompleteProducts: incomplete.rows.map((p) => ({
      name: resolveLocalizedText(p.name, 'tr'),
      slug: p.slug,
      missing: missingDeclarations(p),
      hasImage: p.imageKey !== null,
      shelfLifeDays: p.shelfLifeDays,
    })),
    featured,
  };
}

/** Vitrine işaretli kayıtlar — üç varlıkta ayrı ayrı (aktif olan / işaretli olan). */
async function featuredOverview() {
  const db = serviceDb();
  const [categories, collections, bundles] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true, featuredOnly: true }),
    new CollectionService(db).list({ activeOnly: true, featuredOnly: true }),
    new BundleService(db).listAll({ activeOnly: true, featuredOnly: true }),
  ]);
  return {
    categories: categories.map((c) => resolveLocalizedText(c.name, 'tr')),
    collections: collections.map((c) => resolveLocalizedText(c.name, 'tr')),
    bundles: bundles.map((b) => resolveLocalizedText(b.name, 'tr')),
  };
}

/**
 * Ömrü dolan partiler + tarihi geçmiş stok. Depo ekseni KORUNUR (DOMAIN §17): parti bir depoda
 * durur, "toplam 12 kutu" diye bir gerçek yoktur — satırlar depo koduyla gelir.
 */
export async function stockWatch(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const [batches, warehouses] = await Promise.all([
    new StockService(db).listInStockDetailed(),
    new WarehouseService(db).list({ activeOnly: true }),
  ]);
  const codeById = new Map(warehouses.map((w) => [w.id, w.code]));

  const today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + clamped);
  const horizonDay = horizon.toISOString().slice(0, 10);

  const rows = batches
    .filter((b) => b.expiryDate <= horizonDay)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .map((b) => ({
      product: resolveLocalizedText(b.variant.product.name, 'tr'),
      unit: resolveLocalizedText(b.variant.label, 'tr'),
      warehouse: codeById.get(b.warehouseId) ?? '?',
      expiryDate: b.expiryDate,
      dateType: b.variant.product.dateType,
      physicalQty: b.physicalQty,
      // Tarihi GEÇMİŞ mi yoksa yaklaşıyor mu — ikisi ayrı iş: geçen DLC imha, yaklaşan teklif.
      expired: b.expiryDate < today,
    }));

  return {
    horizonDays: clamped,
    expiredCount: rows.filter((r) => r.expired).length,
    upcomingCount: rows.filter((r) => !r.expired).length,
    // Parti sayısı katalogla büyür; liste kesilir ve KESİLDİĞİ SÖYLENİR (sessiz kesme, "hepsi bu"
    // diye okunur ve bir gün imha edilmeyen parti buradan doğar).
    truncated: rows.length > 40,
    batches: rows.slice(0, 40),
  };
}

/** Satılabilir ama hiçbir depoda kalmamış varyantlar — "vitrinde duruyor, satılamıyor" hâli. */
export async function soldOutWatch(limit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const db = serviceDb();
  const page = await new ProductService(db).list({ filters: { status: 'active' }, limit: 500 });
  const variants = await new ProductVariantService(db).listByProducts(page.rows.map((p) => p.id));
  const active = variants.filter((v) => v.isActive);
  const stock = await new StockService(db).getNetworkAvailabilityMap(active.map((v) => v.id));

  const nameById = new Map(page.rows.map((p) => [p.id, resolveLocalizedText(p.name, 'tr')]));
  const empty = active
    .filter((v) => (stock.get(v.id)?.availableQty ?? 0) <= 0)
    .map((v) => ({ product: nameById.get(v.productId) ?? '?', unit: resolveLocalizedText(v.label, 'tr') }));

  return { totalActiveVariants: active.length, soldOutCount: empty.length, truncated: empty.length > clamped, soldOut: empty.slice(0, clamped) };
}
