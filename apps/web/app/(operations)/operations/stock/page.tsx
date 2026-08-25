import {
  CategoryService,
  PriceService,
  ProductService,
  ProductVariantService,
  SettingsService,
  StockAdjustmentService,
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
  type StockAdjustmentDetail,
  type StockAdjustmentReason,
} from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { StockClient } from './stock-client';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readOfferHandoff } from './stock-handoff';
import { pendingOrderCount, readIntakeProgress, readIntakeTab } from './intake-read';
import { readTransfersPage, readTransitCount } from './transfer-read';
import { mixedLotCases } from './stock-labels';
import { readActorNames, toLevelRows, toLossRows } from './stock-read';
import { readReturnDrops } from './returns-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';

// Stok (09.13 · 22.26) — DEPO YÜZEYİNİN TAMAMI: ne var · ne karar bekliyor · ne girdi · ne çıktı.
// Okuma burada (RSC).
//
// OKUMA PLANI — sekmeye göre daralır. HER açılışta okunan çekirdek:
//   · eldeki TÜM partiler (sayaçların ve iki sekmenin ortak kaynağı) · kategoriler · eşikler
//   · açık siparişlerin bekleyen kalemleri (yalnız Mal kabul ROZETİ için — tek sorgu)
// Sekmeye özel:
//   · Seviyeler → ürün sayfası (keyset) + sayfadaki boyların kullanılabilirliği
//   · Yaklaşan tarihli → karar bekleyen boyların liste fiyatı (teklif önerisi için)
//   · Mal kabul → sipariş künyeleri + tedarikçiler + depo seçenekleri
//   · Çıkışlar → düşüm sayfası + dönem toplamı + kaydı girenlerin adları
//
// SEKME ARTIK SUNUCUYA GİDİYOR (22.26): eskiden üçü aynı okumadan besleniyordu ve sekme değişimi
// sığdı (`replaceState`). Dört sekmenin verisi ayrıştığı için sığ geçiş, açılan sekmeyi boş
// bırakırdı. Karşılığında her sekme kendi turunda ÖNCEKİNDEN AZ sorgu atıyor.
//
// İki farklı sayfalama ölçütü bilinçli (CLAUDE.md §1): ürün ve hareket kaydı veriyle SINIRSIZ büyür →
// keyset. Eldeki parti ise fiziksel gerçekle sınırlıdır (depoda ne varsa o kadar) ve mal tükendikçe
// erir → tek turda. Üstelik sayfalanamaz: "yaklaşan tarihli" uyarısının TAM olması gerekir, kuyrukta
// kalan bir partiyi kaçırmak imha edilecek malı satmak demektir.

interface StockPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Kapalı sekmenin BOŞ karşılıkları — okuma hiç yapılmadığında `Promise.all`ın yerine geçerler.
 *
 * Boş sayfa "sonuç yok" DEMEZ, "bakılmadı" der: kapalı sekmenin listesi zaten çizilmiyor ve sayaçlar
 * onlardan türemiyor (`counts` partilerden çıkar). Tek şart imlecin `null` olması — dolu bir imleç,
 * hiç okunmamış bir listeye "devamı var" dedirtirdi.
 */
const EMPTY_PRODUCT_PAGE: Page<ProductStockRow> = { rows: [], nextCursor: null };
const EMPTY_LOSS_PAGE: Page<StockAdjustmentDetail> = { rows: [], nextCursor: null };
const EMPTY_LOSS_TOTALS = { byReason: new Map<StockAdjustmentReason, { qty: number; costCents: number }>(), qty: 0, costCents: 0 };

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const urlState = parseStockUrl(params);
  const filters = toStockFilters(urlState);

  const db = serviceDb();
  const productSvc = new ProductService(db);
  const stockSvc = new StockService(db);
  // Sekme okumanın kapsamını belirliyor; boş küme okumak yerine hiç okumamak (22.26 künyesi).
  const onLevels = urlState.tab === 'levels';
  const onOutgoing = urlState.tab === 'outgoing';
  const onAttention = urlState.tab === 'attention';

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

  // SEÇİLİ boy (`?v=`) İLK sayfada olmayabilir (liste keyset sayfalı): kimlik önce ürüne çözülür,
  // ürünün stok satırı HEDEFLİ okunur — yoksa sağ panel, adres bir boyu söylerken sessizce ilk
  // satırı gösterirdi. Parametre yokken bu okuma hiç yapılmaz.
  const selectedVariant =
    onLevels && urlState.selected ? await new ProductVariantService(db).getById(urlState.selected) : null;

  // ── PARTİLER BAĞLAMLA OKUNUR, SÜZGEÇLE DEĞİL (sözleşme kural 5) ──────────────
  // Sekme sayıları ve karar kuyruğu bağlam evreninin gerçeğidir: tabloda KEHL'i süzmek, STR'de
  // bekleyen 20 kararı yok saymaz — o kararlar hâlâ operatörün önünde. Süzgeç yalnız SEVİYE
  // tablosunun satırlarını daraltır ve daraltmayı in-memory yaparız: partiler zaten tamamen
  // yüklü (sayfalanmıyor), ikinci bir sorgu atmanın karşılığı yok.
  const [productPage, pinnedProductPage, batchRows, categories, lossPage, lossTotals, thresholds, warehouseLabels, intakeProgress] =
    await Promise.all([
      onLevels ? productSvc.listStockRows({ filters, limit: DEFAULT_PAGE_SIZE }) : EMPTY_PRODUCT_PAGE,
      selectedVariant ? productSvc.listStockRows({ filters: { ids: [selectedVariant.productId] }, limit: 1 }) : null,
      stockSvc.listInStockDetailed(undefined, ctx.warehouseIds),
      new CategoryService(db).list(),
      // ⚠ DEPO SÜZGECİ (22.28 turunda ölçülerek bulundu): `listPage` süzgeci 08.08'de sunucuya
      // alınmıştı ama bu çağrı onu geçirmiyordu — sekme BÜTÜN depoların çıkışlarını listeliyordu
      // (10.7'de bir kez kapatılan açığın aynısı, bu kez sayfa tarafında). Tek depolu yerelde
      // görünmez, çok depoluda depo değişmezini deler (`CLAUDE §1`).
      onOutgoing ? lossSvc.listRecent({ from, limit: DEFAULT_PAGE_SIZE, warehouseIds: ctx.warehouseIds }) : EMPTY_LOSS_PAGE,
      onOutgoing ? lossSvc.reasonSummary(from, undefined, ctx.warehouseIds) : EMPTY_LOSS_TOTALS,
      readExpiryThresholds(new SettingsService(db)),
      readWarehouseLabels(),
      // Rozet HER sekmede okunuyor: "bugün ne bekliyorum" bir bakışta görünmeli (tasarım §7);
      // sekmenin detayı ise yalnız açıkken (`readIntakeTab`).
      readIntakeProgress(),
    ]);

  // TEK "şimdi": okumanın tüm satırları aynı ana göre değerlendirilsin. İstek ortasında gün dönerse
  // listenin yarısı "yaklaşan", yarısı "geçmiş" görünürdü.
  const now = new Date();
  const undecided = toBatchViews(batchRows, { now, thresholds, warehouseLabels });

  // Fiyat YALNIZ karar bekleyen boylar için okunur — teklif önerisinin ihtiyacı bu kadar.
  const attentionVariantIds = [
    ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
  ];
  // Hedefli okunan ürünün boyları da kullanılabilirlik okumasına girer — pinned satır kurulacaksa
  // sayıları sayfa satırlarıyla aynı kaynaktan gelmeli.
  const pageVariantIds = [...productPage.rows, ...(pinnedProductPage?.rows ?? [])].flatMap((p) =>
    p.variants.map((v) => v.id),
  );

  const [available, priceMap, actorNames, intake, transfers, transitCount, returns] = await Promise.all([
    // Depo TANELİ okuma (19.5): satırın toplamı da kırılımı da bu tek kaynaktan türer. Depo-üstü
    // görünüm (`getNetworkAvailabilityMap`) burada YANLIŞ olurdu — birleştirilmiş stok kimsenin
    // stoğu değildir ve operatör "5 var" görüp iki şehirdeki malı tek siparişe yazamaz.
    onLevels
      ? stockSvc.listAvailableAcross(warehouse.active ? [warehouse.active.id] : ctx.visibleWarehouseIds, pageVariantIds)
      : [],
    new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c'),
    readActorNames(new UserProfileService(db), lossPage.rows),
    urlState.tab === 'intake' ? readIntakeTab(intakeProgress) : null,
    // Transfer sekmesi (19.6 → buraya taşındı, 19.08): detay yalnız sekme açıkken; rozet için
    // sayım her sekmede (intake rozetinin künyesi).
    urlState.tab === 'transfer' ? readTransfersPage() : null,
    readTransitCount(),
    // Dönen koliler YALNIZ Dikkat sekmesinde okunur — rozeti yok ve olmamalı: sayı sekme başlığına
    // yazılsaydı her açılışta okunması gerekirdi, oysa "kaç koli döndü" bir uyarı değil, sekmeye
    // girince görülecek bir karar kuyruğu. Kapının kendi tavanı geçerli (`returns.ts`).
    onAttention ? readReturnDrops(ctx.warehouseIds) : [],
  ]);

  // Liste fiyatı = b2c kanal fiyatı (KDV dahil). Müşteriye özel fiyat burada aranmaz: teklif herkese
  // açılır, tek bir müşterinin anlaşmalı fiyatı üzerinden indirim önermek yanlış tabandır.
  const listPriceCents = new Map(
    [...priceMap].flatMap(([variantId, { channelPrice }]) =>
      channelPrice ? [[variantId, channelPrice.amountCents] as const] : [],
    ),
  );
  const batches = toBatchViews(batchRows, { now, thresholds, listPriceCents, warehouseLabels });

  const categoryNames = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));
  // Seviye satırı süzgeci görür, sayaçlar görmez: satırın partileri ile sayıları aynı evrenden
  // gelmezse satır kendi içinde çelişirdi ("3 adet" yazıp başka şehrin partisini listelemek).
  const rowBatches = warehouse.active ? batches.filter((b) => b.warehouseId === warehouse.active?.id) : batches;
  const levels = toLevelRows({ products: productPage.rows, batches: rowBatches, available, categoryNames, warehouseLabels });
  const attention = batches.filter((b) => needsExpiryAttention(b.decision));

  // Hedefli satır LİSTEYE KARIŞMAZ (sayfalama sırası bozulmasın); yalnız panelin yedeğidir.
  // Ürün zaten ilk sayfadaysa `levels` satırı taşıyor, pinned boş kalır.
  const pinnedProducts = (pinnedProductPage?.rows ?? []).filter((p) => !productPage.rows.some((r) => r.id === p.id));
  const pinnedRow =
    toLevelRows({ products: pinnedProducts, batches: rowBatches, available, categoryNames, warehouseLabels }).find(
      (r) => r.variantId === urlState.selected,
    ) ?? null;

  /**
   * **Asistan önerisinden gelindiyse** (`?proposal=<id>`) teklif diyaloğu ÖN DOLU açılır (22.5).
   * Öneriden gelen fiyat bir başlangıç değeridir, karar değil — üç yüzü de diyalogda görünür.
   */
  const handoff = await readOfferHandoff(typeof params.proposal === 'string' ? params.proposal : null);

  return (
    <StockClient
      handoff={handoff}
      data={{
        levels,
        pinned: pinnedRow,
        nextCursor: productPage.nextCursor,
        attention,
        returns,
        // Parti karışma sinyali (23.9) — zaten okunmuş partilerden türer, ek sorgu yok.
        mixedLotCount: mixedLotCases(batches),
        transfers,
        transitCount,
        losses: toLossRows(lossPage.rows, actorNames),
        lossCursor: lossPage.nextCursor,
        // Düşüm formunun seçenekleri — zaten okunmuş partilerden türer, ek sorgu yok. Yalnız Çıkışlar
        // sekmesinde taşınıyor: form orada açılıyor ve öteki sekmelere yüz kayıtlık bir liste
        // göndermenin karşılığı yok.
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
          pendingIntake: pendingOrderCount(intakeProgress),
        },
        intake,
        // Maliyet depo-ÜSTÜ kapsamda görünür (yönetici/muhasebe); depoya bağlı personelde çizilmez
        // ve kapı da yazmaz (`StockData.canSeeCost` künyesi).
        canSeeCost: ctx.scope.kind === 'all',
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
      urlState={urlState}
    />
  );
}
