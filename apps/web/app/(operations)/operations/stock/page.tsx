import {
  CategoryService,
  PriceService,
  ProductService,
  ProductVariantService,
  SettingsService,
  StockMovementService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import {
  DEFAULT_PAGE_SIZE,
  resolveLocalizedText,
  type Page,
  type ProductStockRow,
  type StockMovementDetail,
  type StockMovementKind,
  type StockWriteOffReason,
} from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { StockClient } from './stock-client';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { pendingOrderCount, readIntakeProgress, readIntakeTab } from './intake-read';
import { readTransfersPage, readTransitCount } from './transfer-read';
import { mixedLotCases } from './stock-labels';
import { focusDepotOf, readActorNames, readDepotThresholds, toLevelRows, toLossRows } from './stock-read';
import { readReturnDrops } from './returns-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';

// Stok: ne var, ne karar bekliyor, ne girdi, ne çıktı; okuma sekmeye göre daralır, çekirdek (partiler, kategoriler, eşikler, kabul rozeti)
// her açılışta okunur. Ürün ve hareket kaydı sınırsız büyüdüğü için keyset sayfalı, eldeki parti fiziksel gerçekle sınırlı ve yaklaşan
// tarih uyarısı eksiksiz olmalı diye tek turda okunur.

interface StockPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Kapalı sekmenin boş karşılıkları; "sonuç yok" değil "bakılmadı" demektir ve imleçleri `null`dır, yoksa okunmamış liste "devamı
 * var" derdi.
 */
const EMPTY_PRODUCT_PAGE: Page<ProductStockRow> = { rows: [], nextCursor: null };
const EMPTY_LOSS_PAGE: Page<StockMovementDetail> = { rows: [], nextCursor: null };
const EMPTY_LOSS_TOTALS = {
  byKind: new Map<StockMovementKind, { qty: number; costCents: number }>(),
  byReason: new Map<StockWriteOffReason, { qty: number; costCents: number }>(),
  qty: 0,
  costCents: 0,
};

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const urlState = parseStockUrl(params);
  const filters = toStockFilters(urlState);

  const db = serviceDb();
  const productSvc = new ProductService(db);
  const stockSvc = new StockService(db);
  // Sekme okumanın kapsamını belirler: boş küme okumak yerine hiç okunmaz.
  const onLevels = urlState.tab === 'levels';
  const onOutgoing = urlState.tab === 'outgoing';
  const onAttention = urlState.tab === 'attention';

  // Raf ömrü eşikleri işletmenin ayarıdır, kod varsayılanı yalnız satır yoksa geçer. Çıkış toplamı dönemin tamamından çıkar, ilk sayfanın
  // toplamı "bu dönem ne kadar çöpe gitti" sorusunu yanıtlamaz.
  const lossSvc = new StockMovementService(db);
  const from = periodStart(urlState.period, new Date());

  // Parti kuyruğu personelin kapsamıyla süzülür; aynı ürünün iki depoda bambaşka partisi olur.
  const ctx = await readWarehouseContext();
  const warehouse = warehouseFilterOf(ctx, urlState.depo);

  // Seçili boy (`?v=`) ilk sayfada olmayabilir; ürünü hedefli okunur, yoksa panel adresin söylediği boy yerine ilk satırı gösterirdi.
  const selectedVariant =
    onLevels && urlState.selected ? await new ProductVariantService(db).getById(urlState.selected) : null;

  // Partiler süzgeçle değil bağlamla okunur: KEHL'i süzmek STR'de bekleyen kararları yok saymaz. Süzgeç yalnız seviye satırlarını
  // bellekte daraltır, partiler zaten tamamen yüklüdür.
  const [productPage, pinnedProductPage, batchRows, categories, lossPage, lossTotals, thresholds, warehouseLabels, intakeProgress] =
    await Promise.all([
      onLevels ? productSvc.listStockRows({ filters, limit: DEFAULT_PAGE_SIZE }) : EMPTY_PRODUCT_PAGE,
      selectedVariant ? productSvc.listStockRows({ filters: { ids: [selectedVariant.productId] }, limit: 1 }) : null,
      stockSvc.listInStockDetailed(undefined, ctx.warehouseIds),
      new CategoryService(db).list(),
      // Çıkışlar depo kapsamıyla ve yalnız çıkış yönüyle okunur; defter tek tablo olduğu için girişler süzülmeseydi aynı toplamda erirdi.
      onOutgoing
        ? lossSvc.listRecent({ from, limit: DEFAULT_PAGE_SIZE, warehouseIds: ctx.warehouseIds, direction: 'out' })
        : EMPTY_LOSS_PAGE,
      onOutgoing ? lossSvc.summary({ from, warehouseIds: ctx.warehouseIds, direction: 'out' }) : EMPTY_LOSS_TOTALS,
      readExpiryThresholds(new SettingsService(db)),
      readWarehouseLabels(),
      // Kabul rozeti her sekmede okunur, sekmenin detayı yalnız açıkken (`readIntakeTab`).
      readIntakeProgress(),
    ]);

  // Tek "şimdi": istek ortasında gün dönerse listenin yarısı "yaklaşan", yarısı "geçmiş" görünürdü.
  const now = new Date();
  const undecided = toBatchViews(batchRows, { now, thresholds, warehouseLabels });

  // Fiyat YALNIZ karar bekleyen boylar için okunur — teklif önerisinin ihtiyacı bu kadar.
  const attentionVariantIds = [
    ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
  ];
  // Hedefli okunan ürünün boyları da kullanılabilirlik okumasına girer ki sayıları sayfa satırlarıyla aynı kaynaktan gelsin.
  const pageVariantIds = [...productPage.rows, ...(pinnedProductPage?.rows ?? [])].flatMap((p) =>
    p.variants.map((v) => v.id),
  );

  const [available, depot, priceMap, actorNames, intake, transfers, transitCount, returns] = await Promise.all([
    // Depo taneli okuma: toplam da kırılım da buradan türer. Birleştirilmiş stok kimsenin stoğu değildir, "5 var" görüp iki şehirdeki
    // malı tek siparişe yazdırırdı.
    onLevels
      ? stockSvc.listAvailableAcross(warehouse.active ? [warehouse.active.id] : ctx.visibleWarehouseIds, pageVariantIds)
      : [],
    onLevels
      ? readDepotThresholds(db, focusDepotOf(ctx, warehouse.active), [...productPage.rows, ...(pinnedProductPage?.rows ?? [])])
      : null,
    new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c'),
    readActorNames(new UserProfileService(db), lossPage.rows),
    urlState.tab === 'intake' ? readIntakeTab(intakeProgress) : null,
    // Transfer detayı yalnız sekme açıkken, rozet sayımı her sekmede.
    urlState.tab === 'transfer' ? readTransfersPage() : null,
    readTransitCount(),
    // Dönen koliler yalnız Dikkat sekmesinde okunur; rozeti yoktur, çünkü uyarı değil sekmede görülecek bir karar kuyruğudur.
    onAttention ? readReturnDrops(ctx.warehouseIds) : [],
  ]);

  // Liste fiyatı b2c kanal fiyatıdır; teklif herkese açılır, tek müşterinin anlaşmalı fiyatı indirim için yanlış tabandır.
  const listPriceCents = new Map(
    [...priceMap].flatMap(([variantId, { channelPrice }]) =>
      channelPrice ? [[variantId, channelPrice.amountCents] as const] : [],
    ),
  );
  const batches = toBatchViews(batchRows, { now, thresholds, listPriceCents, warehouseLabels });

  const categoryNames = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));
  // Seviye satırı süzgeci görür, sayaçlar görmez; satırın partileri ile sayıları aynı evrenden gelmezse satır kendi içinde çelişirdi.
  const rowBatches = warehouse.active ? batches.filter((b) => b.warehouseId === warehouse.active?.id) : batches;
  const levels = toLevelRows({ products: productPage.rows, batches: rowBatches, available, categoryNames, warehouseLabels, depot });
  const attention = batches.filter((b) => needsExpiryAttention(b.decision));

  // Hedefli satır listeye karışmaz, sayfalama sırası bozulmasın diye yalnız panelin yedeğidir.
  const pinnedProducts = (pinnedProductPage?.rows ?? []).filter((p) => !productPage.rows.some((r) => r.id === p.id));
  const pinnedRow =
    toLevelRows({ products: pinnedProducts, batches: rowBatches, available, categoryNames, warehouseLabels, depot }).find(
      (r) => r.variantId === urlState.selected,
    ) ?? null;

  return (
    <StockClient
      data={{
        levels,
        pinned: pinnedRow,
        nextCursor: productPage.nextCursor,
        attention,
        returns,
        // Parti karışma sinyali okunmuş partilerden türer, ek sorgu yok.
        mixedLotCount: mixedLotCases(batches),
        transfers,
        transitCount,
        losses: toLossRows(lossPage.rows, actorNames, warehouseLabels),
        lossCursor: lossPage.nextCursor,
        // Düşüm formunun seçenekleri okunmuş partilerden türer; form yalnız Çıkışlar sekmesinde açıldığı için yalnız orada taşınır.
        writeOffBatches: onOutgoing
          ? batches.map((batch) => ({
              stockId: batch.id,
              title: batch.title,
              expiryDate: batch.expiryDate,
              physicalQty: batch.physicalQty,
              // Kararın kendisi motorun (`domain-core/stock`): "geçti" bilgisi satırla birlikte geldi.
              isExpired: batch.daysLeft < 0,
              warehouseName: batch.warehouse?.name ?? null,
            }))
          : [],
        lossSummary: {
          // Sıra tutara göre: en pahalı kalem başta dursun — dağılıma bakan kişi onu arıyor.
          byKind: [...lossTotals.byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.costCents - a.costCents),
          byReason: [...lossTotals.byReason]
            .map(([reason, v]) => ({ reason, ...v }))
            .sort((a, b) => b.costCents - a.costCents),
          qty: lossTotals.qty,
          costCents: lossTotals.costCents,
        },
        // Sayaçlar bütün partiler üzerindendir; "6 karar bekliyor" yazıp sayfada 2 göstermek kalanları görünmez kılardı.
        counts: {
          inStock: new Set(batches.map((b) => b.variantId)).size,
          attention: attention.length,
          blocked: batches.filter((b) => b.decision === 'must_discard').length,
          pendingIntake: pendingOrderCount(intakeProgress),
        },
        intake,
        // Maliyet depo-ÜSTÜ kapsamda görünür (yönetici/muhasebe); depoya bağlı personelde çizilmez
        // ve kapı da yazmaz (`StockData.canSeeCost` künyesi).
        canSeeCost: ctx.scope.kind === 'all',
        categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
        nearExpiryPercent: thresholds.nearExpiryPercent,
        warehouse: {
          // Başlıktaki evren adı süzgecin değil bağlamın adıdır, çünkü sayaçlar bağlamı izler. Stok ekranı aracı da sayar; seçili
          // bağlamın adı tesistendir, araç seçilemez.
          scopeLabel:
            ctx.warehousesWithVehicles.length < 2
              ? ''
              : (ctx.activeWarehouseId && ctx.facilities.find((w) => w.id === ctx.activeWarehouseId)?.name) ||
                'Tüm depolar',
          // Kırılım ve parti rozeti yalnız çok depolu bakışta; süzgeç açıkken satır zaten tek deponun sayılarıdır.
          showSplit: ctx.activeWarehouseId === null && ctx.warehousesWithVehicles.length > 1 && warehouse.active === null,
          available: warehouse.available,
          active: warehouse.active,
          dropped: warehouse.dropped,
          options: warehouse.options,
        },
      }}
      urlState={urlState}
    />
  );
}
