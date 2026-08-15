import {
  CategoryService,
  CollectionService,
  DiscountCodeService,
  DiscountService,
  PriceService,
  ProductService,
  ProductVariantService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { costOf, needsExpiryAttention } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type Price } from '@lezzet/types';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import { guarded, requireAdmin } from '@/lib/guard';
import { PricesClient } from './prices-client';
import { toCustomerPriceRows, toDiscountCustomerRows, toDiscountRows, toPriceRows, type ChannelPriceMaps } from './prices-read';
import { parsePricesUrl, toPriceFilters } from './prices-url';
import { titleOf } from '@/lib/catalog/title';
import { type CustomerPriceRow, type DiscountCustomerRow, type DiscountRow, type PriceRow } from './prices-types';
import type { BatchView } from '@/lib/stock/batch-types';
import type { KeysetCursor } from '@lezzet/types';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Fiyat ekranı (09.5) — yalnız ADMİN. Depo ve kurye maliyet/marj görmez (brief §6); guard bu yüzden
// `requireAdmin`, sayfa içi bir gizleme değil.
//
// OKUMA SEKMEYE BAĞLI: iki sekmenin veri ihtiyacı ortak DEĞİL (kanal fiyatları katalog sayfasını,
// müşteriye özel ise özel fiyat kümesini okur). Tek okumada birleştirmek, kanal sekmesini açan
// admin'e hiç bakmadığı müşteri fiyatlarını da ödetirdi — ürünler ekranında ölçülüp düzeltilen
// hatanın aynısı (09.4 üçüncü durum notu). Sekme değişimi bu yüzden GERÇEK gezinmedir.

interface PricesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PricesPage({ searchParams }: PricesPageProps) {
  // Rol kapısı SAYFADA: layout personeli içeri aldı, bu ekran personelin bir ALT KÜMESİNE açık.
  // Depocu/kurye buraya gelirse kabuk korunur ve sebep yazılır — sessiz yönlendirme, gezinmede
  // gördüğü bir bağlantının neden çalışmadığını söylemezdi.
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane title="Fiyatlar" reason="Fiyat, maliyet ve marj bilgisi operasyonun geri kalanına kapalıdır. Bir düzeltme gerekiyorsa yöneticinize iletin." />;

  const urlState = parsePricesUrl(await searchParams);
  const db = serviceDb();

  const categories = await new CategoryService(db).list();
  const categoryNames = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));

  const channels = urlState.tab === 'channels' ? await readChannelTab(db, urlState, categoryNames) : null;
  const customers = urlState.tab === 'customers' ? await readCustomerTab(db) : null;
  const offers = urlState.tab === 'offers' ? await readOffersTab(db) : null;
  const coupons = urlState.tab === 'coupons' ? await readCouponsTab(db, categoryNames) : null;

  return (
    <PricesClient
      data={{
        rows: channels?.rows ?? [],
        nextCursor: channels?.nextCursor ?? null,
        customerPrices: customers?.prices ?? [],
        discountCustomers: customers?.discounts ?? [],
        offers: offers ?? [],
        discounts: coupons?.rows ?? [],
        categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
        collections: coupons?.collections ?? [],
      }}
      urlState={urlState}
    />
  );
}


type Db = ReturnType<typeof serviceDb>;

/**
 * Kanal fiyatları sekmesi — üç okuma, hiçbiri satır sayısıyla ÇARPMAZ (N+1 yok):
 * dar ürün sayfası (keyset) · sayfadaki boyların iki kanal fiyatı · aynı boyların birim maliyeti.
 *
 * Fiyat ve maliyet okumaları SAYFAYA bağlıdır: katalogun tamamının fiyatını taşımanın gerekçesi yok,
 * ekran otuz satır gösteriyor.
 */
async function readChannelTab(
  db: Db,
  urlState: ReturnType<typeof parsePricesUrl>,
  categoryNames: Map<string, string>,
): Promise<{ rows: PriceRow[]; nextCursor: KeysetCursor | null }> {
  const page = await new ProductService(db).listPriceRows({
    filters: toPriceFilters(urlState),
    limit: DEFAULT_PAGE_SIZE,
  });
  const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));

  const priceSvc = new PriceService(db);
  const [b2cMap, b2bMap, costs] = await Promise.all([
    priceSvc.findApplicableMap(variantIds, 'b2c'),
    priceSvc.findApplicableMap(variantIds, 'b2b'),
    readCostBasis(db, variantIds),
  ]);

  return {
    rows: toPriceRows({ products: page.rows, prices: toChannelMaps(b2cMap, b2bMap), costs, categoryNames }),
    nextCursor: page.nextCursor,
  };
}

/** İki kanalın çözüm haritasını satır haritasına indirger — özel fiyat burada aranmaz (kanal listesi). */
function toChannelMaps(
  b2c: Map<string, { channelPrice: Price | null }>,
  b2b: Map<string, { channelPrice: Price | null }>,
): ChannelPriceMaps {
  const pick = (map: Map<string, { channelPrice: Price | null }>): Map<string, Price> =>
    new Map([...map].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice] as const] : [])));
  return { b2c: pick(b2c), b2b: pick(b2b) };
}

/**
 * Kupon & kampanya sekmesi. Kurallar sayfalanmaz (operatörün eliyle büyüyen küme); yanlarında
 * kullanım sayıları, kapsam hedeflerinin adları ve kişisel kuponların sahipleri gelir — satır
 * kendi başına okunabilsin diye.
 *
 * Koleksiyonlar YALNIZ bu sekmede okunur: kapsam seçicisinin ikinci seçeneği, başka sekmenin işi değil.
 */
async function readCouponsTab(
  db: Db,
  categoryNames: Map<string, string>,
): Promise<{ rows: DiscountRow[]; collections: Array<{ id: string; name: string }> }> {
  const discountSvc = new DiscountService(db);
  const [rules, collections] = await Promise.all([discountSvc.list(), new CollectionService(db).list()]);

  const customerIds = [...new Set(rules.flatMap((r) => (r.customerId ? [r.customerId] : [])))];
  const [usage, codes, customers] = await Promise.all([
    discountSvc.usageCounts(rules.map((r) => r.id)),
    // Kodlar tek turda: bir kuponun birden çok kapısı var ve satır hepsini gösteriyor.
    new DiscountCodeService(db).listByDiscounts(rules.map((r) => r.id)),
    new UserProfileService(db).listByIds(customerIds),
  ]);

  return {
    rows: toDiscountRows({
      rules,
      usage,
      codes,
      categoryNames,
      collectionNames: new Map(collections.map((c) => [c.id, resolveLocalizedText(c.name)])),
      customerNames: new Map(customers.map((c) => [c.id, c.name])),
      now: new Date(),
    }),
    collections: collections.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
  };
}

/**
 * "Yaklaşan tarihli" sekmesi — karar bekleyen partiler. Türetme STOK EKRANIYLA ORTAK (`toBatchViews`):
 * aynı eşik, aynı karar, tek kaynak. Kopyalansaydı eşik değişince iki ekran farklı şey söylerdi.
 *
 * Partiler SAYFALANMAZ: elde ne varsa o kadar (fiziksel sınır) ve uyarının TAM olması gerekiyor.
 * Fiyat okuması dar — yalnız karar bekleyen boyların liste fiyatı, teklif önerisinin ihtiyacı bu.
 */
async function readOffersTab(db: Db): Promise<BatchView[]> {
  const stockSvc = new StockService(db);
  const [batchRows, thresholds] = await Promise.all([
    stockSvc.listInStockDetailed(),
    readExpiryThresholds(new SettingsService(db)),
  ]);

  // TEK "şimdi": okumanın tüm satırları aynı ana göre değerlendirilsin (istek ortasında gün dönerse
  // listenin yarısı "yaklaşan", yarısı "geçmiş" görünürdü).
  const now = new Date();
  const undecided = toBatchViews(batchRows, { now, thresholds });
  const attentionVariantIds = [
    ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
  ];

  const priceMap = await new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c');
  const listPriceCents = new Map(
    [...priceMap].flatMap(([variantId, { channelPrice }]) =>
      channelPrice ? [[variantId, channelPrice.amountCents] as const] : [],
    ),
  );

  return toBatchViews(batchRows, { now, thresholds, listPriceCents }).filter((b) => needsExpiryAttention(b.decision));
}

/**
 * Müşteriye özel sekmesi. Özel fiyat, sayfadaki ürünlerin DIŞINDA bir boya da bağlı olabilir —
 * bu yüzden boy adları ve liste fiyatları, özel fiyat satırlarının işaret ettiği kimliklerden
 * türetilir (katalog sayfasından değil).
 */
async function readCustomerTab(db: Db): Promise<{ prices: CustomerPriceRow[]; discounts: DiscountCustomerRow[] }> {
  const priceSvc = new PriceService(db);
  const profileSvc = new UserProfileService(db);

  const [rows, discountProfiles] = await Promise.all([priceSvc.listCustomerPricesNow(), profileSvc.listWithDiscount()]);

  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  const customerIds = [...new Set(rows.flatMap((r) => (r.customerId ? [r.customerId] : [])))];

  const [variants, profiles, b2cMap, b2bMap, costBasis] = await Promise.all([
    new ProductVariantService(db).listByIds(variantIds),
    profileSvc.listByIds(customerIds),
    priceSvc.findApplicableMap(variantIds, 'b2c'),
    priceSvc.findApplicableMap(variantIds, 'b2b'),
    // Maliyet ve hedef marj DÜZENLEMEDE de gerekiyor: "bu fiyatla kâr mı ediyorum" sorusu, fiyatı
    // ilk verirken ne kadar geçerliyse sonradan bakarken de o kadar geçerli.
    readCostBasis(db, variantIds),
  ]);

  // Boy adı ÜRÜNDEN gelir; boy listesi yalnız etiketi taşır. Ürün kimlikleri tek turda çözülür.
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productNames = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));
  const productOf = new Map(products.map((p) => [p.id, p]));
  const variantContext = new Map(
    variants.flatMap((v) => {
      const product = productOf.get(v.productId);
      return product
        ? [[v.id, { vatRate: product.vatRate, targetMarginPercent: product.targetMarginPercent, targetMarginB2bPercent: product.targetMarginB2bPercent }] as const]
        : [];
    }),
  );
  const variantTitles = new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );

  const listCents = new Map<string, number>();
  for (const [variantId, { channelPrice }] of b2cMap) if (channelPrice) listCents.set(`${variantId}·b2c`, channelPrice.amountCents);
  for (const [variantId, { channelPrice }] of b2bMap) if (channelPrice) listCents.set(`${variantId}·b2b`, channelPrice.amountCents);

  return {
    prices: toCustomerPriceRows({
      rows,
      profiles: new Map(profiles.map((p) => [p.id, p])),
      variantTitles,
      listCents,
      costs: new Map([...costBasis].flatMap(([id, basis]) => (costOf(basis) === null ? [] : [[id, costOf(basis)!] as const]))),
      products: variantContext,
    }),
    discounts: toDiscountCustomerRows(discountProfiles),
  };
}
