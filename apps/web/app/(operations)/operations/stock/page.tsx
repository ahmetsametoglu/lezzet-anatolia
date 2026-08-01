import {
  CategoryService,
  PriceService,
  ProductService,
  SettingsService,
  StockAdjustmentService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { detectDevice } from '@/lib/device';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { StockClient } from './stock-client';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readActorNames, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';

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

  // Eşikler İŞLETMENİN kararıdır (`Setting`, 0016) — kod varsayılanı yalnız satır hiç yoksa geçerli.
  // `SettingsService` süreç içinde önbelleklidir: ilk istekte üç okuma, sonrakilerde sıfır.
  // İmha geçmişi DÖNEMLİDİR: liste sayfalı ama toplam dönemin TAMAMI üzerinden çıkar — ilk 30 satırın
  // toplamı "bu çeyrek ne kadar çöpe gitti" sorusunu yanıtlamaz.
  const lossSvc = new StockAdjustmentService(db);
  const from = periodStart(urlState.period, new Date());

  // Bağlam ÖNCE: parti kuyruğu personelin kapsamıyla süzülür (19.14). Depocu başka deponun raf
  // ömrü kuyruğunu görmemeli — "Dolap 1" gibi, aynı ürünün iki depoda bambaşka partisi olur.
  const ctx = await readWarehouseContext();
  const warehouse = warehouseFilterOf(ctx, urlState.depo);

  // ── PARTİLER BAĞLAMLA OKUNUR, SÜZGEÇLE DEĞİL (sözleşme kural 5) ──────────────
  // Sekme sayıları ve karar kuyruğu bağlam evreninin gerçeğidir: tabloda KEHL'i süzmek, STR'de
  // bekleyen 20 kararı yok saymaz — o kararlar hâlâ operatörün önünde. Süzgeç yalnız SEVİYE
  // tablosunun satırlarını daraltır ve daraltmayı in-memory yaparız: partiler zaten tamamen
  // yüklü (sayfalanmıyor), ikinci bir sorgu atmanın karşılığı yok.
  const [productPage, batchRows, categories, lossPage, lossTotals, thresholds, warehouseLabels] = await Promise.all([
    productSvc.listStockRows({ filters, limit: DEFAULT_PAGE_SIZE }),
    stockSvc.listInStockDetailed(undefined, ctx.warehouseIds),
    new CategoryService(db).list(),
    lossSvc.listRecent({ from, limit: DEFAULT_PAGE_SIZE }),
    lossSvc.reasonSummary(from),
    readExpiryThresholds(new SettingsService(db)),
    readWarehouseLabels(),
  ]);

  // TEK "şimdi": okumanın tüm satırları aynı ana göre değerlendirilsin. İstek ortasında gün dönerse
  // listenin yarısı "yaklaşan", yarısı "geçmiş" görünürdü.
  const now = new Date();
  const undecided = toBatchViews(batchRows, { now, thresholds, warehouseLabels });

  // Fiyat YALNIZ karar bekleyen boylar için okunur — teklif önerisinin ihtiyacı bu kadar.
  const attentionVariantIds = [
    ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
  ];
  const pageVariantIds = productPage.rows.flatMap((p) => p.variants.map((v) => v.id));

  const [available, priceMap, actorNames] = await Promise.all([
    // Depo TANELİ okuma (19.5): satırın toplamı da kırılımı da bu tek kaynaktan türer. Depo-üstü
    // görünüm (`getNetworkAvailabilityMap`) burada YANLIŞ olurdu — birleştirilmiş stok kimsenin
    // stoğu değildir ve operatör "5 var" görüp iki şehirdeki malı tek siparişe yazamaz.
    stockSvc.listAvailableAcross(warehouse.active ? [warehouse.active.id] : ctx.visibleWarehouseIds, pageVariantIds),
    new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c'),
    readActorNames(new UserProfileService(db), lossPage.rows),
  ]);

  // Liste fiyatı = b2c kanal fiyatı (KDV dahil). Müşteriye özel fiyat burada aranmaz: teklif herkese
  // açılır, tek bir müşterinin anlaşmalı fiyatı üzerinden indirim önermek yanlış tabandır.
  const listPriceCents = new Map(
    [...priceMap].flatMap(([variantId, { channelPrice }]) =>
      channelPrice ? [[variantId, toCents(channelPrice.amount)] as const] : [],
    ),
  );
  const batches = toBatchViews(batchRows, { now, thresholds, listPriceCents, warehouseLabels });

  const categoryNames = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));
  // Seviye satırı süzgeci görür, sayaçlar görmez: satırın partileri ile sayıları aynı evrenden
  // gelmezse satır kendi içinde çelişirdi ("3 adet" yazıp başka şehrin partisini listelemek).
  const rowBatches = warehouse.active ? batches.filter((b) => b.warehouseId === warehouse.active?.id) : batches;
  const levels = toLevelRows({ products: productPage.rows, batches: rowBatches, available, categoryNames, warehouseLabels });
  const attention = batches.filter((b) => needsExpiryAttention(b.decision));

  const device = await detectDevice();

  return (
    <StockClient
      data={{
        levels,
        nextCursor: productPage.nextCursor,
        attention,
        losses: toLossRows(lossPage.rows, actorNames),
        lossCursor: lossPage.nextCursor,
        lossSummary: {
          // Sıra tutara göre: en pahalı sebep başta dursun — dağılıma bakan kişi onu arıyor.
          byReason: [...lossTotals.byReason]
            .map(([reason, v]) => ({ reason, ...v }))
            .sort((a, b) => b.costCents - a.costCents),
          qty: lossTotals.qty,
          costCents: lossTotals.costCents,
        },
        // Sayaçlar TÜM partiler üzerinden: liste sayfalı, uyarı değil. "6 karar bekliyor" yazıp
        // sayfada 2 göstermek, kalan dördünü görünmez kılardı.
        counts: {
          inStock: new Set(batches.map((b) => b.variantId)).size,
          attention: attention.length,
          blocked: batches.filter((b) => b.decision === 'must_discard').length,
        },
        categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
        nearExpiryPercent: thresholds.nearExpiryPercent,
        warehouse: {
          // Başlıktaki evren adı BAĞLAMIN adıdır, süzgecin değil (kural 5): sayaçlar bağlamı
          // izliyorsa onların hangi evrene ait olduğunu da bağlam söylemeli.
          scopeLabel:
            ctx.warehouses.length < 2
              ? ''
              : (ctx.activeWarehouseId && ctx.warehouses.find((w) => w.id === ctx.activeWarehouseId)?.name) || 'Tüm depolar',
          // Kırılım ve parti rozeti yalnız çok depolu bakışta (kural 4); süzgeç aktifken satır
          // zaten tek deponun sayılarını gösterir, kırılım kapanır.
          showSplit: ctx.activeWarehouseId === null && ctx.warehouses.length > 1 && warehouse.active === null,
          available: warehouse.available,
          active: warehouse.active,
          dropped: warehouse.dropped,
          options: warehouse.options,
        },
      }}
      device={device}
      urlState={urlState}
    />
  );
}
