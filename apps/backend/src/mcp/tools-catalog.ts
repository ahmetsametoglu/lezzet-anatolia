import {
  BundleService,
  CategoryService,
  CollectionService,
  PriceService,
  ProductService,
  ProductVariantService,
  StockService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { offerDecisionOf, productPublishGaps, suggestedOfferPriceCents } from '@lezzet/domain-core';
import { missingDeclarations, resolveLocalizedText, type Product } from '@lezzet/types';
import { LOCALES } from '@lezzet/i18n';

/**
 * Katalog ve stok okumaları — asistanın "neyi tamamlamalıyım" ve "neyin ömrü doluyor" sorularının cevabı.
 * Eksik beyan kuralı ve sayaçlar motordan okunur; vitrin doluluğu yorumsuz sayı döner, çünkü slot sayısı müşteri yüzeyinin kararıdır.
 */

/** Katalogun tamamlanmışlık tablosu + vitrin işaretleri. */
export async function catalogHealth(limit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const db = serviceDb();
  const products = new ProductService(db);

  const [counts, incomplete, candidates, featured] = await Promise.all([
    products.counts(),
    // Süzgeç sunucuda — tüm kataloğu çekip uygulamada elemek katalog büyüdükçe sessizce yavaşlardı.
    products.list({ filters: { onlyIncomplete: true, status: 'active' }, limit: clamped }),
    // Yayın kuralının kolonu yok, adaylar burada süzülür; aday kümesini operatör kurar ve tek turda okunur.
    products.listCandidates(),
    featuredOverview(),
  ]);

  // Beyanı eksik aday da yayına çıkamaz, ama yayın kuralı açıklamayı da arar; iki liste birlikte bakılır.
  const notReady = candidates
    .map((p) => ({ p, publishGaps: productPublishGaps(p), missing: missingDeclarations(p) }))
    .filter((c) => c.publishGaps.length > 0 || c.missing.length > 0);

  return {
    totals: {
      products: counts.total,
      candidates: counts.candidate,
      incompleteDeclarations: counts.incomplete,
    },
    // Satıştaki üründe hangi beyan eksik — asistan "ürün detayını tamamla" işine buradan başlar.
    incompleteProducts: incomplete.rows.map((p) => ({ ...productRef(p), missing: missingDeclarations(p) })),
    candidatesNotReady: notReady.slice(0, clamped).map(({ p, publishGaps, missing }) => ({ ...productRef(p), publishGaps, missing })),
    candidatesNotReadyTotal: notReady.length,
    featured,
  };
}

/** Satırın kimliği — öneri araçları `productId` ister, asistan adı ve görsel durumunu okur. */
function productRef(p: Product) {
  return {
    productId: p.id,
    name: resolveLocalizedText(p.name, 'tr'),
    slug: p.slug,
    hasImage: p.imageKey !== null,
    shelfLifeDays: p.shelfLifeDays,
  };
}

/**
 * Vitrin — işaretliler ve adaylar (aktif ama işaretsiz); adaylar olmadan asistan varlığını bilmediği kaydı öneremez.
 * Kümeler operatörün kurduğu cinsten, sayfalanmaz; tavan kesince bunu söyler.
 */
async function featuredOverview() {
  const db = serviceDb();
  const [categories, collections, bundles] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    new CollectionService(db).list({ activeOnly: true }),
    new BundleService(db).listAll({ activeOnly: true }),
  ]);

  const CANDIDATE_LIMIT = 25;
  const split = <T extends { isFeatured: boolean }>(rows: T[], nameOf: (row: T) => string) => {
    const featured = rows.filter((r) => r.isFeatured).map(nameOf);
    const candidates = rows.filter((r) => !r.isFeatured).map(nameOf);
    return {
      featured,
      /** Vitrine ALINABİLECEKLER — aktif ama işaretsiz. */
      candidates: candidates.slice(0, CANDIDATE_LIMIT),
      candidatesTruncated: candidates.length > CANDIDATE_LIMIT,
    };
  };

  return {
    categories: split(categories, (c) => resolveLocalizedText(c.name, 'tr')),
    collections: split(collections, (c) => resolveLocalizedText(c.name, 'tr')),
    bundles: split(bundles, (b) => resolveLocalizedText(b.name, 'tr')),
  };
}

/**
 * Ömrü dolan ve tarihi geçmiş partiler — depo ekseni korunur (DOMAIN §17); satırlar depo koduyla ve yazma araçlarının istediği kimliklerle gelir.
 * Teklif kararı ve önerilen fiyat motordan (`offerDecisionOf`) okunur ki ekranla aynı cevap çıksın.
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

  const inHorizon = batches.filter((b) => b.expiryDate <= horizonDay).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  // Liste fiyatı AYRI tabloda (kanal/tarih boyutlu) — teklif önerisinin tabanı b2c liste fiyatıdır.
  const priceMap = await new PriceService(db).findApplicableMap([...new Set(inHorizon.map((b) => b.variantId))], 'b2c');

  const rows = inHorizon.map((b) => {
    const listPriceCents = priceMap.get(b.variantId)?.channelPrice?.amountCents ?? null;
    const { decision } = offerDecisionOf({
      dateType: b.variant.product.dateType,
      expiryDate: b.expiryDate,
      shelfLifeDays: b.variant.product.shelfLifeDays,
      offerPriceCents: b.offerPriceCents,
    });
    return {
      // Kimlikler ÖNCE: bu satırın tek işi asistanın bir sonraki adımı atabilmesi.
      batchId: b.id,
      variantId: b.variantId,
      product: resolveLocalizedText(b.variant.product.name, 'tr'),
      unit: resolveLocalizedText(b.variant.label, 'tr'),
      warehouse: codeById.get(b.warehouseId) ?? '?',
      expiryDate: b.expiryDate,
      dateType: b.variant.product.dateType,
      physicalQty: b.physicalQty,
      // Tarihi GEÇMİŞ mi yoksa yaklaşıyor mu — ikisi ayrı iş: geçen DLC imha, yaklaşan teklif.
      expired: b.expiryDate < today,
      /**
       * KDV tabanı alan adında durur (`IncVat`/`ExVat`): talimatı okumayan model de her okumada görür ve teklif fiyatından alışı doğrudan düşmez.
       * Son ekler kaldırılmamalı; uzunluk, sessiz yanlış marj hesabından ucuzdur.
       */
      listPriceCentsIncVat: listPriceCents,
      purchasePriceCentsExVat: b.purchasePriceCents,
      vatRate: b.variant.product.vatRate,
      offerPriceCentsIncVat: b.offerPriceCents,
      /** `can_offer` · `offer_open` · `must_discard` · `none` — motorun kararı (`domain-core/stock/offer`). */
      decision,
      suggestedOfferPriceCentsIncVat: suggestedOfferPriceCents(listPriceCents),
    };
  });

  return {
    horizonDays: clamped,
    expiredCount: rows.filter((r) => r.expired).length,
    upcomingCount: rows.filter((r) => !r.expired).length,
    // Parti sayısı katalogla büyür; liste kesilir ve kesildiği söylenir, yoksa "hepsi bu" diye okunur.
    truncated: rows.length > 40,
    batches: rows.slice(0, 40),
  };
}

/**
 * Katalogda arama — okuma araçlarının adla anlattığı ürünü öneri araçlarının istediği kimliğe bağlar.
 * Liste fiyatı KDV dahil, maliyet hariç ve oran satırda; bilinmeyen maliyet `null` döner, sıfır maliyet kârı şişirirdi.
 */
export async function catalogLookup(query: string, limit: number) {
  const term = query.trim();
  if (!term) return { error: 'query zorunlu — ürün adının bir parçası yeter ("kek", "baklava").' };

  const clamped = Math.max(1, Math.min(25, Math.floor(limit)));
  const db = serviceDb();
  // Arama ürün adında ve üç dilde birden — asistan Türkçe sorar, katalogda Fransızca ad durabilir.
  const page = await new ProductService(db).list({ filters: { query: term }, limit: clamped });
  if (page.rows.length === 0) return { query: term, found: 0, products: [] };

  const variants = await new ProductVariantService(db).listByProducts(page.rows.map((p) => p.id));
  const variantIds = variants.map((v) => v.id);
  const [priceMap, batches] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    new StockService(db).listInStockDetailed(variantIds),
  ]);

  // Maliyet elde duran en yeni partinin alış fiyatıdır, ortalama değil: paket fiyatı bugünkü yenileme maliyetine göre kurulur.
  const costByVariant = new Map<string, number>();
  for (const b of [...batches].sort((a, z) => a.createdAt.localeCompare(z.createdAt))) {
    if (b.purchasePriceCents !== null) costByVariant.set(b.variantId, b.purchasePriceCents);
  }

  return {
    query: term,
    found: page.rows.length,
    truncated: page.rows.length >= clamped,
    products: page.rows.map((p) => ({
      productId: p.id,
      name: resolveLocalizedText(p.name, 'tr'),
      slug: p.slug,
      status: p.status,
      vatRate: p.vatRate,
      variants: variants
        .filter((v) => v.productId === p.id)
        .map((v) => {
          const listIncVat = priceMap.get(v.id)?.channelPrice?.amountCents ?? null;
          const costExVat = costByVariant.get(v.id) ?? null;
          return {
            variantId: v.id,
            unit: resolveLocalizedText(v.label, 'tr'),
            isActive: v.isActive,
            listPriceCentsIncVat: listIncVat,
            /**
             * Elde duran en yeni partinin maliyeti — `propose_purchase_order` satırlarındaki tedarikçi fiyatıyla aynı soru değil, farklı çıkması normal.
             * Ad kaynağını taşır; iki alan aynı adı taşısa model onları karşılaştırıp olmayan bir arıza bildirir.
             */
            stockBatchCostCents: costExVat,
            ...(costExVat === null
              ? {}
              : {
                  stockBatchCostNote:
                    'Bu, elde duran EN YENİ PARTİNİN alış maliyeti (KDV hariç) — tedarikçinin bugünkü fiyatı DEĞİL. propose_purchase_order satırlarındaki lastPurchasePriceCents tedarikçi eşlemesinden gelir ve bu sayıdan farklı olması normaldir; ikisini karşılaştırıp arıza çıkarmayın.',
                }),
            // Alış satıştan pahalıysa bu bir kârlılık sonucu değil veri şüphesidir; bayrak karar değil, "önce doğrula" sorusudur.
            // Karşılaştırma KDV tabanı eşitlenerek yapılır, yoksa her ürün %5,5 daha kârsız görünürdü.
            ...(listIncVat !== null && costExVat !== null && costExVat > Math.round(listIncVat / (1 + p.vatRate / 100))
              ? {
                  dataDoubt:
                    'Alış fiyatı satış fiyatından YÜKSEK (KDV hariç karşılaştırıldı). Bunu kârlılık sonucu diye raporlamayın — büyük ihtimalle alış fiyatı eksik ya da yanlış girilmiş. Yöneticiye VERİ ŞÜPHESİ olarak söyleyin.',
                }
              : {}),
          };
        }),
    })),
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

/**
 * Tek ürünün bugünkü hâli, dil dil — `propose_product_draft` üzerine yazar ve sürüm tutmaz; bu okuma kör yazmayı önler.
 * Metnin tamamı değil doluluk ve kısa önizleme döner, çünkü sorulan "buraya yazabilir miyim" sorusudur; beyan eksikleri de aynı yanıtta.
 */
export async function productDetail(productIdOrName: string) {
  const wanted = productIdOrName.trim();
  if (!wanted) return { error: 'productId ya da ürün adının bir parçası zorunlu.' };

  const db = serviceDb();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wanted);
  const rows = isUuid
    ? await new ProductService(db).listByIds([wanted])
    : (await new ProductService(db).list({ filters: { query: wanted }, limit: 5 })).rows;

  if (rows.length === 0) return { error: `Ürün bulunamadı: '${wanted}'. catalog_lookup ile arayın.` };
  // Birden çok eşleşmede seçim modele bırakılmaz, adlar döner; rastgele birini açmak yanlış ürünün açıklamasını ezerdi.
  if (rows.length > 1) {
    return {
      ambiguous: true,
      matches: rows.map((p) => ({ productId: p.id, name: resolveLocalizedText(p.name, 'tr') })),
      note: 'Birden çok ürün eşleşti — productId ile tekrar sorun.',
    };
  }

  const product = rows[0]!;
  const variants = await new ProductVariantService(db).listByProducts([product.id]);

  /** Dil başına doluluk ve kısa önizleme — metnin kendisi değil, kararın girdisi. */
  const fields = (text: Record<string, string | undefined> | null | undefined) =>
    Object.fromEntries(
      LOCALES.map((locale) => {
        const value = text?.[locale]?.trim() ?? '';
        return [locale, value ? { filled: true, preview: value.slice(0, 120) } : { filled: false, preview: null }];
      }),
    );

  return {
    productId: product.id,
    status: product.status,
    name: fields(product.name as Record<string, string | undefined>),
    description: fields(product.description as Record<string, string | undefined> | null),
    ingredients: fields(product.ingredients as Record<string, string | undefined> | null),
    storageInstructions: fields(product.storageInstructions as Record<string, string | undefined> | null),
    // Alerjen kapalı bir küme, metin değil — dil başına doluluk sorusu anlamsız, listenin kendisi döner.
    allergens: product.allergens,
    hasNutrition: product.nutrition !== null && product.nutrition !== undefined,
    variants: variants.map((v) => ({ variantId: v.id, unit: resolveLocalizedText(v.label, 'tr'), isActive: v.isActive })),
    /** Motorun gördüğü eksikler — `catalog_health`e ikinci tur atmadan. */
    declarationGaps: missingDeclarations(product),
    /** Satışa almayı engelleyen alanlar ve eksik dilleri — veritabanının yayın kısıtıyla aynı kural. */
    publishGaps: productPublishGaps(product),
    note: 'Dolu bir alana yazmak ONU SİLER — sürüm geçmişi yok. filled:true olan alanı ancak bilerek değiştirin.',
  };
}
