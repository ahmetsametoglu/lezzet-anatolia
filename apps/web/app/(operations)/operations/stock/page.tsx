import {
  CategoryService,
  PriceService,
  ProductService,
  StockAdjustmentService,
  StockService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { detectDevice } from '@/lib/device';
import { StockClient } from './stock-client';
import { toBatchViews, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, toStockFilters } from './stock-url';

// Stok görünümü (09.13) — parti gözü ve tarihe bağlı kararların ekranı. Okuma burada (RSC).
//
// OKUMA PLANI — iki dalga, altı sorgu; hiçbiri satır sayısıyla ÇARPMAZ (N+1 yok):
//   1. dalga · ürün sayfası (dar, keyset) · eldeki TÜM partiler · kategoriler · imha geçmişi sayfası
//   2. dalga · sayfadaki boyların kullanılabilirliği · YALNIZ karar bekleyen boyların liste fiyatı
//
// İki farklı sayfalama ölçütü bilinçli (CLAUDE.md §1): ürün ve hareket kaydı veriyle SINIRSIZ büyür →
// keyset. Eldeki parti ise fiziksel gerçekle sınırlıdır (depoda ne varsa o kadar) ve mal tükendikçe
// erir → tek turda. Üstelik sayfalanamaz: "yaklaşan tarihli" uyarısının TAM olması gerekir, kuyrukta
// kalan bir partiyi kaçırmak imha edilecek malı satmak demektir.
//
// Fiyat okuması ikinci dalgada ve DAR: teklif önerisi yalnız karar bekleyen partiler için anlamlı,
// katalogun tamamının fiyatını taşımanın gerekçesi yok.

interface StockPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const urlState = parseStockUrl(await searchParams);
  const filters = toStockFilters(urlState);

  const db = serviceDb();
  const productSvc = new ProductService(db);
  const stockSvc = new StockService(db);

  const [productPage, batchRows, categories, lossPage] = await Promise.all([
    productSvc.listStockRows({ filters, limit: DEFAULT_PAGE_SIZE }),
    stockSvc.listInStockDetailed(),
    new CategoryService(db).list(),
    new StockAdjustmentService(db).listRecent({ limit: DEFAULT_PAGE_SIZE }),
  ]);

  // TEK "şimdi": okumanın tüm satırları aynı ana göre değerlendirilsin. İstek ortasında gün dönerse
  // listenin yarısı "yaklaşan", yarısı "geçmiş" görünürdü.
  const now = new Date();
  const undecided = toBatchViews(batchRows, { now });

  // Fiyat YALNIZ karar bekleyen boylar için okunur — teklif önerisinin ihtiyacı bu kadar.
  const attentionVariantIds = [
    ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
  ];
  const pageVariantIds = productPage.rows.flatMap((p) => p.variants.map((v) => v.id));

  const [available, priceMap] = await Promise.all([
    stockSvc.getAvailableMap(pageVariantIds),
    new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c'),
  ]);

  // Liste fiyatı = b2c kanal fiyatı (KDV dahil). Müşteriye özel fiyat burada aranmaz: teklif herkese
  // açılır, tek bir müşterinin anlaşmalı fiyatı üzerinden indirim önermek yanlış tabandır.
  const listPriceCents = new Map(
    [...priceMap].flatMap(([variantId, { channelPrice }]) =>
      channelPrice ? [[variantId, toCents(channelPrice.amount)] as const] : [],
    ),
  );
  const batches = toBatchViews(batchRows, { now, listPriceCents });

  const categoryNames = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));
  const levels = toLevelRows(productPage.rows, batches, available, categoryNames);
  const attention = batches.filter((b) => needsExpiryAttention(b.decision));

  const device = await detectDevice();

  return (
    <StockClient
      data={{
        levels,
        nextCursor: productPage.nextCursor,
        attention,
        losses: toLossRows(lossPage.rows),
        lossCursor: lossPage.nextCursor,
        // Sayaçlar TÜM partiler üzerinden: liste sayfalı, uyarı değil. "6 karar bekliyor" yazıp
        // sayfada 2 göstermek, kalan dördünü görünmez kılardı.
        counts: {
          inStock: new Set(batches.map((b) => b.variantId)).size,
          attention: attention.length,
          blocked: batches.filter((b) => b.decision === 'must_discard').length,
        },
        categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
      }}
      device={device}
      urlState={urlState}
    />
  );
}
