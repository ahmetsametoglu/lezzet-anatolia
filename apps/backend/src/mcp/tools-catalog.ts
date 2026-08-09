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
import { offerDecisionOf, suggestedOfferPriceCents } from '@lezzet/domain-core';
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

/**
 * Vitrin — işaretliler VE adaylar (22.7).
 *
 * ── NEDEN ADAYLAR DA (yapılmayan öneri sorunu) ──────────────────────────────
 * Önceki hâl yalnız İŞARETLİ kayıtları veriyordu ve bu, asistanın ufkunu sessizce kesiyordu:
 * *"şu koleksiyonu vitrine çıkaralım"* cümlesi hiç kurulamıyordu, çünkü o koleksiyonun varlığından
 * haberi yoktu. Görünmeyen boşluk buydu — **hata değil, hiç yapılmayan öneri.** Model bir kaydı
 * ancak `propose_featured_flag`ı kör deneyip hata alarak keşfedebiliyordu.
 *
 * Aday = aktif ama vitrinde olmayan kayıt. Kümeler küçük ve operatörün elle kurduğu cinsten
 * (`CLAUDE §1`), yani sayfalama gerekmiyor; yine de tavan var ve **kesildiğinde söyleniyor**.
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
 * Ömrü dolan partiler + tarihi geçmiş stok. Depo ekseni KORUNUR (DOMAIN §17): parti bir depoda
 * durur, "toplam 12 kutu" diye bir gerçek yoktur — satırlar depo koduyla gelir.
 *
 * ── SATIR KİMLİĞİYLE GELİR (harici denetim turu 3, 09.08) ───────────────────
 * Önceki hâli parti ADINI söylüyordu, kimliğini değil: asistan "şu keklerin ömrü doluyor" diyebiliyor
 * ama o partiyi bir yazma aracına besleyemiyordu — okuma ile yazma arasında köprü yoktu. Artık her
 * satır `batchId` + `variantId` taşıyor; `propose_batch_offer`ın girdisi doğrudan buradan çıkıyor.
 *
 * ── KARAR MOTORDAN OKUNUR (STACK §4) ────────────────────────────────────────
 * "Bu partiye teklif açılabilir mi" sorusunu araç kendi eşiğiyle cevaplamaz — `offerDecisionOf`
 * cevaplar; operasyon ekranı da aynı motoru okuyor. Önerilen fiyat da öyle: `suggestedOfferPriceCents`
 * (%30 varsayılan, parametrik). İki yerde iki farklı doğru olmasın.
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
      listPriceCents,
      // Alış fiyatı KDV HARİÇ, liste fiyatı KDV DAHİL (b2c) — ikisini doğrudan çıkarmak marjı
      // KDV oranı kadar şişirir. Oran da satırda, ki hesabı okuyan taraf doğru yapsın.
      purchasePriceCents: b.purchasePriceCents,
      vatRate: b.variant.product.vatRate,
      offerPriceCents: b.offerPriceCents,
      /** `can_offer` · `offer_open` · `must_discard` · `none` — motorun kararı (`domain-core/stock/offer`). */
      decision,
      suggestedOfferPriceCents: suggestedOfferPriceCents(listPriceCents),
    };
  });

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

/**
 * Katalogda ARAMA — **okuma ile yazma arasındaki kimlik köprüsü** (harici denetim turu 3, 09.08).
 *
 * Boşluk şuydu: okuma araçları ürünü ADIYLA anlatıyordu, öneri araçları ise `variantId` istiyordu.
 * Asistan "şu üç kekten bir paket kur" diyebiliyor ama kalemleri gösteremiyordu — iki ucu bağlayan
 * hiçbir araç yoktu. Bu araç o bağı kurar: isimden varyant kimliğine.
 *
 * **Fiyat da burada** ve iki yüzüyle: liste fiyatı (b2c, KDV DAHİL) satış tarafı, son alış maliyeti
 * (KDV HARİÇ) maliyet tarafı. İkisini doğrudan çıkarmak marjı KDV oranı kadar şişirir, o yüzden
 * oran da satırda. Maliyet bilinmiyorsa `null` döner — SIFIR DEĞİL (`CLAUDE §1`): sıfır maliyet,
 * kârı olduğundan büyük gösterir ve o hatanın sonu yanlış fiyatlanmış bir pakettir.
 */
export async function catalogLookup(query: string, limit: number) {
  const term = query.trim();
  if (!term) return { error: 'query zorunlu — ürün adının bir parçası yeter ("kek", "baklava").' };

  const clamped = Math.max(1, Math.min(25, Math.floor(limit)));
  const db = serviceDb();
  // Arama ÜRÜN ADINDA ve üç dilde birden (`buildProductQuery`) — asistan Türkçe sorar, katalogda
  // Fransızca ad durabilir.
  const page = await new ProductService(db).list({ filters: { query: term }, limit: clamped });
  if (page.rows.length === 0) return { query: term, found: 0, products: [] };

  const variants = await new ProductVariantService(db).listByProducts(page.rows.map((p) => p.id));
  const variantIds = variants.map((v) => v.id);
  const [priceMap, batches] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    new StockService(db).listInStockDetailed(variantIds),
  ]);

  // Son alış maliyeti = elde duran EN YENİ partinin alış fiyatı. "Ortalama" bilerek değil: paket
  // fiyatı bugünkü yenileme maliyetine göre kurulur, geçmişin ortalamasına göre değil.
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
        .map((v) => ({
          variantId: v.id,
          unit: resolveLocalizedText(v.label, 'tr'),
          isActive: v.isActive,
          listPriceCents: priceMap.get(v.id)?.channelPrice?.amountCents ?? null,
          lastPurchasePriceCents: costByVariant.get(v.id) ?? null,
        })),
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
