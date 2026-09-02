import {
  ConversationInboxService,
  OrderService,
  ReorderService,
  SettingsService,
  StockService,
  SupplierService,
  TicketQueueService,
  TicketService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import { resolveUserText } from '@lezzet/domain-core';
import type {
  ManagementHub,
  ManagementQueue,
  ManagementSummary,
  OrderSource,
  SummaryChannel,
} from '@lezzet/types';
import { readExpiryThresholds, toBatchViews } from '../warehouse/batch-view';
import { previewOf } from '../ticket/staff-read';
import { countOrderExceptions } from './exceptions';

/*
  YÖNETİM HUB'I — karar kutusu + gün özeti TEK okumada (21.12 · doc 04 "Y5 birleştirme ucu:
  parçalar hazır, birleştiren kapı yok" — bu o kapı).

  ── HİÇBİR KURAL BURADA HESAPLANMAZ ─────────────────────────────────────────
  Eksik toplama önerisi hazırlık motorundan (`listPreparationQueue`), teklif adayı raf ömrü
  motorundan (`offerDecisionOf`), tedarik önerisi eşik servisinden (`ReorderService`) gelir; bu
  dosya yalnız SAYAR ve BİRLEŞTİRİR. Karar kutusundaki sayı ile hedef ekranın listesi aynı motoru
  okuduğu için ayrışamaz — iki ayrı hesap olsaydı "kutu 3 diyor, ekran 2 gösteriyor" kaçınılmazdı.

  ── DEPO-ÜSTÜ OKUMA BURADA MEŞRU ────────────────────────────────────────────
  Yönetim işletmenin TAMAMINA bakar (OrderListFilters künyesi: depo-üstü yalnız admin/muhasebe
  için meşru). Depo bazlı motorlar (hazırlık, tedarik, stok) tesis tesis sorulup toplanır — süzgeç
  atlanmaz, kapsamı "bütün tesisler" olarak açıkça kurulur.

  ── "GÜN" TESLİM GÜNÜDÜR ────────────────────────────────────────────────────
  Sipariş sayacı ve listelerle aynı eksen (`order_counts` `deliveryFrom/To`): operasyonun günü
  teslim edilecek işle tanımlanır. Sipariş anına göre saymak, dünkü verilmiş yarın teslim edilecek
  siparişi iki güne birden yazardı.
*/

/** Gün özetinde kırılımı verilen kanallar — v2:673'ün üç satırı. `manual` bilerek dışarıda:
 *  elle girilen sipariş bir kanal değil bir giriş yoludur, tasarım da onu çizmiyor. */
const SUMMARY_SOURCES: OrderSource[] = ['web', 'door', 'whatsapp'];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function readQueue(db: Db, facilityIds: string[]): Promise<ManagementQueue> {
  const tickets = new TicketQueueService(db);
  const stocks = new StockService(db);

  const [complaintCount, complaintPage, exceptions, batches, thresholds, supplyGroups, intentCount] =
    await Promise.all([
      tickets.countAwaiting(),
      tickets.list({ openOnly: true, awaitingReply: true }, undefined, 1),
      // İstisna sayısı Y2 ekranının OKUDUĞU motordan (`listOrderExceptions`) — kutu ile ekran
      // aynı kümeyi sayar, ayrışamaz ("kutu 3 diyor, ekran 2" çelişkisi motor düzeyinde imkânsız).
      countOrderExceptions(db, { warehouseIds: facilityIds }),
      stocks.listInStockDetailed(undefined, facilityIds),
      readExpiryThresholds(new SettingsService(db)),
      Promise.all(facilityIds.map((warehouseId) => new ReorderService(db).suggestions(warehouseId))),
      new ConversationInboxService(db).countAwaitingReply('whatsapp'),
    ]);

  /*
    Teklif adayı: raf ömrü motoru "teklife açılabilir" diyor ve parti HENÜZ teklifte değil.

    Karar `toBatchViews`ten okunuyor — teklif EKRANININ da (`listOfferCandidates`) okuduğu görünüm.
    Kutu kararı kendi başına hesaplasaydı iki yerde iki kural olurdu ve bir gün ayrışırlardı; kutu
    "3 aday" derken ekran 2 gösterirdi. Fiyat haritası verilmiyor: kartın künyesi adet ve gün
    ister, öneri fiyatı değil — o teklif ekranının işi.
  */
  const now = new Date();
  const candidates = toBatchViews(batches, { now, thresholds }).filter((view) => view.decision === 'can_offer');
  /* Künye EN ACİL aday: kalan ömrü en az olan. "İlk satır" demek, sıralaması stok okumasından
     gelen rastgele bir partiyi kartın yüzü yapmak olurdu. */
  const offerHead = candidates.reduce<(typeof candidates)[number] | null>(
    (most, view) => (most === null || view.daysLeft < most.daysLeft ? view : most),
    null,
  );

  const groups = supplyGroups.flat();
  const unmappedVariantCount = groups
    .filter((group) => group.supplierId === null)
    .reduce((sum, group) => sum + group.lines.length, 0);
  /* Tedarik künyesi EN KALABALIK eşlenmiş grup — kartın vaadi "onay bekliyor"dur ve yalnız
     eşlenmiş grup onaylanabilir. Adı olmayan grup künye olmaz: kart adsız bir tedarikçiyi
     gösteremez, gösterirse yönetici hangi siparişten söz edildiğini bilmez.

     Tedarikçi ADI burada okunuyor çünkü öneri servisi yalnız kimlik taşıyor; küme operatör
     kurulumudur (doğal tavan) ve tek turda çekilir — tedarik EKRANI da aynı yolu izliyor
     (`listSupplyGroups`). Künye yoksa sorgu da atılmaz. */
  const headGroup = groups
    .filter((group) => group.supplierId !== null)
    .reduce<(typeof groups)[number] | null>(
      (most, group) => (most === null || group.lines.length > most.lines.length ? group : most),
      null,
    );
  const supplierName =
    headGroup === null
      ? null
      : ((await new SupplierService(db).list()).find((supplier) => supplier.id === headGroup.supplierId)?.name ?? null);
  const supplyHead =
    headGroup === null || supplierName === null ? null : { supplierName, lineCount: headGroup.lines.length };

  const head = complaintPage.rows[0] ?? null;
  return {
    complaints: {
      count: complaintCount,
      head: head
        ? {
            ticketId: head.id,
            type: head.type,
            customerName: head.customerName,
            orderReferenceNo: head.orderReferenceNo,
            hasAttachment: head.hasAttachment,
            awaitingReply: head.awaitingReply,
            lastMessageAt: head.lastMessageAt,
            /* Şikâyetin kendi cümlesi, kuyruk ekranıyla AYNI iki kuraldan geçerek: metin okuyanın
               diline çözülür (`resolveUserText`), sonra ilk satıra kırpılır (`previewOf`).
               Operasyon yüzeyi tek dilli Türkçedir — dil buradan gelir, cihazdan değil. */
            preview: previewOf(
              resolveUserText(
                {
                  text: head.lastMessageBody,
                  language: head.lastMessageLanguage,
                  translations: head.lastMessageTranslations,
                },
                'tr',
              ).text ?? '',
            ) || null,
          }
        : null,
    },
    exceptions,
    offers: {
      candidateCount: candidates.length,
      head:
        offerHead === null
          ? null
          : {
              title: offerHead.title,
              qty: offerHead.physicalQty,
              daysLeft: offerHead.daysLeft,
              discountPercent: offerHead.offerDiscountPercent,
            },
    },
    supply: {
      groupCount: groups.filter((group) => group.supplierId !== null).length,
      unmappedVariantCount,
      head: supplyHead,
    },
    intents: { count: intentCount },
  };
}

async function readSummary(db: Db, date: string): Promise<ManagementSummary> {
  const orders = new OrderService(db);
  const day = { deliveryFrom: date, deliveryTo: date };
  const tomorrowDate = new Date(`${date}T00:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = isoDate(tomorrowDate);

  const [todayCounts, sourceCounts, pendingCounts, partialCounts, tomorrowCounts, ticketCounts] =
    await Promise.all([
      orders.counts(day),
      Promise.all(SUMMARY_SOURCES.map((source) => orders.counts({ ...day, source }))),
      orders.counts({ ...day, paymentStatus: 'pending' }),
      orders.counts({ ...day, paymentStatus: 'partial' }),
      orders.counts({ deliveryFrom: tomorrow, deliveryTo: tomorrow }),
      new TicketService(db).countByStatus(),
    ]);

  const channels: SummaryChannel[] = SUMMARY_SOURCES.map((source, index) => ({
    source,
    // Sıfır burada GERÇEK bir ölçümdür ("o kanaldan sipariş yok"), bilinmeyen değil — kanal
    // kırılımı da günün toplamıyla aynı RPC'den geliyor.
    cents: sourceCounts[index]?.sum.totalCents ?? null,
  }));

  const pendingCents =
    pendingCounts.sum.totalCents -
    pendingCounts.sum.collectedCents +
    (partialCounts.sum.totalCents - partialCounts.sum.collectedCents);

  return {
    date,
    orderCount: todayCounts.total,
    preparingCount: todayCounts.byStatus.get('preparing') ?? 0,
    revenueCents: todayCounts.sum.totalCents,
    openComplaintCount: (ticketCounts.open ?? 0) + (ticketCounts.in_progress ?? 0),
    channels,
    pendingPayment: { count: pendingCounts.total + partialCounts.total, cents: pendingCents },
    tomorrow: {
      orderCount: tomorrowCounts.total,
      readyCount: tomorrowCounts.byStatus.get('ready') ?? 0,
      doorPaymentCents: tomorrowCounts.cod.totalCents,
    },
    // YZ içgörü motoru modül 20/22'nin işi — bugün boş döner, ekran dürüst boş hâl çizer.
    // Uydurma metin ÜRETİLMEZ (CLAUDE §0: yerel veriden iş çıkarımı yasak; içgörü tam da odur).
    insights: [],
  };
}

/**
 * Hub'ın tek zarfı. `date` verilmezse bugün (sunucu saati) — ekran cevaptaki `summary.date`i
 * gösterir, kendi saatinden "bugün" uydurmaz.
 */
export async function readManagementHub(db: Db, input: { date?: string } = {}): Promise<ManagementHub> {
  const date = input.date ?? isoDate(new Date());
  // Süzgeç servise geçti (02.09): aynı cümle beş ekranda ayrı ayrı yazılıyordu ve çoğu yerde hiç
  // yazılmamıştı. `list({ kind })` tek kapı.
  const facilities = await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' });
  const [queue, summary] = await Promise.all([
    readQueue(db, facilities.map((warehouse) => warehouse.id)),
    readSummary(db, date),
  ]);
  return { queue, summary };
}
