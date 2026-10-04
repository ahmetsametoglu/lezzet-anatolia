import {
  ConversationInboxService,
  ConversationService,
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
import { parisDateOf } from '@lezzet/helper';
import type {
  ManagementHub,
  ManagementQueue,
  ManagementSummary,
  OrderSource,
  SummaryChannel,
} from '@lezzet/types';
import { readExpiryThresholds, toBatchViews } from '../warehouse/batch-view';
import { previewOf } from '../ticket/staff-read';
import { readB2bQueue } from '../b2b/queue';
import { countOrderExceptions } from './exceptions';

/*
  Yönetim hub'ı karar kutusunu ve gün özetini tek okumada verir; burada kural hesaplanmaz, her sayı hedef ekranın okuduğu motordan
  gelir ki kutu ile ekran ayrışmasın. Depo-üstü okuma burada meşrudur ve depo bazlı motorlar tesis tesis sorulup toplanır.
*/

/* Gün teslim günüdür, sipariş anı değil: sipariş anına göre saymak dün verilip yarın teslim edilecek siparişi iki güne yazardı. */

/** Gün özetinde kırılımı verilen kanallar — v2:673'ün üç satırı. `manual` bilerek dışarıda:
 *  elle girilen sipariş bir kanal değil bir giriş yoludur, tasarım da onu çizmiyor. */
const SUMMARY_SOURCES: OrderSource[] = ['web', 'door', 'whatsapp'];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function readQueue(db: Db, facilityIds: string[]): Promise<ManagementQueue> {
  const tickets = new TicketQueueService(db);
  const stocks = new StockService(db);

  const [
    complaintCount,
    ticketCounts,
    complaintPage,
    exceptions,
    batches,
    thresholds,
    supplyGroups,
    intentCount,
    draftCount,
    b2bQueue,
  ] = await Promise.all([
      tickets.countAwaiting(),
      // Talep listesiyle aynı sayım (`countForFilters`): kart "6 açık" derken liste de "tümü · 6" der.
      tickets.countForFilters(),
      tickets.list({ openOnly: true, awaitingReply: true }, undefined, 1),
      // İstisna sayısı istisna ekranının okuduğu motordan, ki kutu ile ekran aynı kümeyi saysın.
      countOrderExceptions(db, { warehouseIds: facilityIds }),
      stocks.listInStockDetailed(undefined, facilityIds),
      readExpiryThresholds(new SettingsService(db)),
      Promise.all(facilityIds.map((warehouseId) => new ReorderService(db).suggestions(warehouseId))),
      // Kanal süzgeci yok, çünkü açtığı gelen kutusu (`/social`) üç kanalı birden listeliyor.
      new ConversationInboxService(db).countAwaitingReply(),
      // Kutucuğun ikinci olgusu: cevabı yazılmış ama gönderilmemiş sohbet sayısı.
      new ConversationService(db).countPendingDrafts(),
      /* Kurumsal başvuru kartı listenin okuyucusundan gelir, ki "tek başvuruda listeyi atla" kestirmesi tek yerde kalsın
         (`B2bQueueView.single`). `limit: 1` yeter, çünkü kart en çok bir künye yazıyor. */
      readB2bQueue(db, { limit: 1 }),
    ]);

  /* Teklif adayı kararı teklif ekranının da okuduğu `toBatchViews`ten gelir, ki kutu ile ekran ayrışmasın. Fiyat haritası
     verilmez, çünkü kartın künyesi adet ve gün ister, öneri fiyatı teklif ekranının işidir. */
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
  /* Tedarik künyesi en kalabalık eşlenmiş gruptur, çünkü kartın vaadi "onay bekliyor"dur ve yalnız eşlenmiş grup onaylanabilir.
     Tedarikçi adı burada okunur, çünkü öneri servisi yalnız kimlik taşır; künye yoksa sorgu atılmaz. */
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

  /* Künye YALNIZ tek bekleyende çizilir ve ölçütü kuyruğun kendi kararıdır (`single`), sayfanın
     uzunluğu değil: `rows.length === 1` yalnız ilk sayfa doluysa doğru cevabı verirdi. */
  const b2bRow = b2bQueue.single === null ? null : (b2bQueue.rows[0] ?? null);

  const head = complaintPage.rows[0] ?? null;
  return {
    complaints: {
      count: complaintCount,
      open: ticketCounts.all,
      byType: ticketCounts.byType,
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
    intents: { count: intentCount, draftCount },
    b2b: {
      pendingCount: b2bQueue.counts.pending,
      head: b2bRow === null ? null : { customerId: b2bRow.customerId, name: b2bRow.name, flag: b2bRow.flag },
    },
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
 * Hub'ın tek zarfı; `date` verilmezse Paris takviminde bugün. Ekran cevaptaki `summary.date`i gösterir, kendi saatinden "bugün" uydurmaz.
 */
export async function readManagementHub(db: Db, input: { date?: string } = {}): Promise<ManagementHub> {
  const date = input.date ?? parisDateOf(new Date());
  const facilities = await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' });
  const [queue, summary] = await Promise.all([
    readQueue(db, facilities.map((warehouse) => warehouse.id)),
    readSummary(db, date),
  ]);
  return { queue, summary };
}
