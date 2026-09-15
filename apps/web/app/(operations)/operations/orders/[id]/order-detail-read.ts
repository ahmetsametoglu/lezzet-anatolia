import {
  BundleService,
  DeliveryRunService,
  MoneyMovementService,
  AccountService,
  OrderService,
  OrderItemBatchService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  SettingsService,
  StockService,
  TicketService,
  UserProfileService,
  type serviceDb,
} from '@lezzet/database';
import {
  ORDER_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  resolveLocalizedText,
  type Account,
  type MoneyMovement,
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrderStatusLog,
  type Stock,
  type Ticket,
} from '@lezzet/types';
import {
  allowedDecisions,
  creditPosition,
  derivePaymentStatusForOrder,
  dueDateOf,
  defaultsToDiscardOnReturn,
  doorCheckOf,
  fulfilledLineAmountCents,
  isFulfillmentSettled,
  isOverdue,
  isTerminal,
  isZeroRated,
  officeTransitions,
  orderContribution,
  skippedBetween,
  vatSplitOf,
} from '@lezzet/domain-core';
import { listOrderBoxes, readDeliveryProof, readOrderTracking, thumbnailImageUrl } from '@lezzet/application';
import { toCents } from '@lezzet/helper';
import { titleOf } from '@/lib/catalog/title';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import { ticketsLink } from '../../tickets/tickets-url';
import type {
  OrderBundleGroup,
  OrderDetailView,
  OrderFinanceView,
  OrderLineView,
  OrderLinkView,
  OrderMovementView,
  OrderTimelineStep,
  OrderTotalLine,
  RefundRouteView,
} from './order-detail-types';

/*
  Sipariş detayının tek veri turu; hiçbir kural burada yeniden yazılmaz, ödeme, vade, geçiş ve atlanan adım motordan okunur. Okuma
  satır sayısıyla çarpmaz: her şey kimlik kümesi üzerinden tek turda gelir.
*/

/** Ödeme ve liste ekranıyla aynı anahtar. */
const PAYMENT_TERM_KEY = 'payment_term_days';
const PAYMENT_TERM_DEFAULT = 30;

type Db = ReturnType<typeof serviceDb>;

export async function readOrderDetail(db: Db, orderId: string): Promise<OrderDetailView | null> {
  const orderSvc = new OrderService(db);
  const found = await orderSvc.getWithItems(orderId);
  if (!found) return null;

  const { order, items } = found;

  const [logs, movements, accounts, batches, tickets, termDays, warehouseLabels] = await Promise.all([
    new OrderStatusLogService(db).listByOrder(orderId),
    new MoneyMovementService(db).listByOrder(orderId),
    new AccountService(db).list(),
    new OrderItemBatchService(db).listByOrder(orderId),
    new TicketService(db).listByOrder(orderId),
    new SettingsService(db).getNumber(PAYMENT_TERM_KEY, PAYMENT_TERM_DEFAULT),
    // Kapalı depolar dahil: eski bir sipariş tesisi kapandı diye deposunu unutmaz.
    readWarehouseLabels(),
  ]);

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const bundleIds = [...new Set(items.flatMap((i) => (i.bundleId ? [i.bundleId] : [])))];
  const actorIds = [...new Set(logs.flatMap((l) => (l.actorId ? [l.actorId] : [])))];
  const stockIds = [...new Set(batches.map((b) => b.stockId))];

  const profileSvc = new UserProfileService(db);
  const [variants, bundles, actors, people, stocks] = await Promise.all([
    new ProductVariantService(db).listByIds(variantIds),
    bundleIds.length ? new BundleService(db).listByIds(bundleIds) : Promise.resolve([]),
    actorIds.length ? profileSvc.listByIds(actorIds) : Promise.resolve([]),
    profileSvc.listByIds([order.customerId, ...(order.courierId ? [order.courierId] : [])]),
    stockIds.length ? new StockService(db).listByIds(stockIds) : Promise.resolve([]),
  ]);

  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productNames = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));
  // Kalem görseli üründen gelir ve ürünler zaten çekili; görselsiz üründe ekran yer tutucu çizer.
  const productsById = new Map(products.map((p) => [p.id, p]));
  const variantImages = new Map(
    variants.map((v) => {
      const product = productsById.get(v.productId);
      // Küçük resim, CDN kare@200.
      return [v.id, product ? thumbnailImageUrl(product) : null];
    }),
  );
  // Yalnız satıştaki ürün köprülenir: pasif ürünün müşteri sayfası yoktur ve köprü operatörü 404'e yollardı.
  const variantSlugs = new Map(
    variants.map((v) => {
      const product = productsById.get(v.productId);
      return [v.id, product?.status === 'active' ? product.slug : null];
    }),
  );
  // Başlık haritası burada kurulur, çünkü varyant ve ürünler zaten çekili; ortak olan `titleOf` biçimleyicisi.
  const variantTitles = new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );
  const variantSubs = new Map(variants.map((v) => [v.id, resolveLocalizedText(v.label)]));
  // Lot köprüsünün arama anahtarı ürün adıdır: stok ekranı parti numarasıyla değil ürün adıyla arar.
  const variantProducts = new Map(variants.map((v) => [v.id, productNames.get(v.productId) ?? '']));
  // İade varsayılanı ürünün saklama rejiminden, kararı motor verir; ürün bulunamazsa `false`, bilinmeyen imhaya yazılmaz.
  const variantDiscardDefault = new Map(
    variants.map((v) => {
      const product = productsById.get(v.productId);
      return [v.id, product ? defaultsToDiscardOnReturn(product.storageType) : false];
    }),
  );

  // Parti numaraları kalem başına: geri çağırma izi satırın kendi altında okunur.
  const lotByItem = new Map<string, string[]>();
  const lotOfStock = new Map(stocks.map((s) => [s.id, s.lotNumber ?? '']));
  for (const batch of batches) {
    const lot = lotOfStock.get(batch.stockId);
    if (!lot) continue;
    const list = lotByItem.get(batch.orderItemId);
    if (list) list.push(lot);
    else lotByItem.set(batch.orderItemId, [lot]);
  }

  const customer = people.find((p) => p.id === order.customerId);
  const courier = order.courierId ? people.find((p) => p.id === order.courierId) : undefined;
  // Tek "şimdi": vade gecikmesi, açık bakiye ve yaş etiketleri aynı ana bakmalı, yoksa aynı satır hem gecikmiş hem değil görünebilirdi.
  const now = new Date();

  /*
    Kartın açık bakiyesi bu siparişin değil müşterinin toplam borcudur, yoksa limit çubuğu yanlış soruyu cevaplardı. Okuma yalnız
    vadesi açık müşteride yapılır; açık siparişler tavanı olan bir kümedir.
  */
  const creditOrders = customer?.creditEnabled ? (await orderSvc.listByCustomer(order.customerId, { limit: 100 })).rows : [];
  const credit = creditPosition(creditOrders, termDays, now);
  // Sipariş hangi seferle gitti; sefersiz siparişte sorgu yapılmaz.
  const run = order.deliveryRunId ? await new DeliveryRunService(db).getById(order.deliveryRunId) : null;

  const lines = items.map<OrderLineView>((item) => ({
    id: item.id,
    title: variantTitles.get(item.variantId) ?? 'Bilinmeyen boy',
    sub: variantSubs.get(item.variantId) ?? '',
    imageUrl: variantImages.get(item.variantId) ?? null,
    productSlug: variantSlugs.get(item.variantId) ?? null,
    productName: variantProducts.get(item.variantId) ?? '',
    qty: item.qty,
    fulfilledQty: item.fulfilledQty,
    unitPriceCents: item.unitPriceCents,
    lineDiscountCents: item.lineDiscountAmountCents,
    vatRate: item.vatRate,
    lineTotalCents: lineTotalOf(item),
    // Hazırlık kesinleşmediyse sipariş edilen okunur: o aşamada `fulfilled_qty` bir karar değil, henüz yazılmamış bir sayıdır.
    payableCents: fulfilledLineAmountCents(payableLineOf(item), isFulfillmentSettled(order.status, items)),
    bundleId: item.bundleId,
    returnDisposition: item.returnDisposition,
    defaultsToDiscard: variantDiscardDefault.get(item.variantId) ?? false,
    batchNos: lotByItem.get(item.id) ?? [],
  }));

  const bundleNames = new Map(bundles.map((b) => [b.id, resolveLocalizedText(b.name)]));
  const groups = [...new Set(lines.flatMap((l) => (l.bundleId ? [l.bundleId] : [])))].map<OrderBundleGroup>((id) => {
    const own = lines.filter((l) => l.bundleId === id);
    return {
      bundleId: id,
      name: bundleNames.get(id) ?? 'Paket',
      lineIds: own.map((l) => l.id),
      totalCents: own.reduce((sum, l) => sum + l.lineTotalCents, 0),
    };
  });

  // Ekranın "kalan"ı ile ödemenin tahsil edeceği tutar aynı hesaptan çıkmalı.
  const derivation = derivePaymentStatusForOrder(order, items, {
    collectedCents: order.amountCollectedCents,
    refundedCents: order.amountRefundedCents,
  });

  const settled = isFulfillmentSettled(order.status, items);
  return {
    id: order.id,
    referenceNo: order.referenceNo,
    invoiceNo: order.invoiceNo,
    customerName: customer?.name?.trim() || 'Bilinmeyen müşteri',
    channel: order.channel,
    status: order.status,
    source: order.orderSource,
    isGift: order.isGiftOrder,
    placedAt: order.createdAt,

    lines,
    bundles: groups,
    totals: totalsOf(order, lines, settled, derivation.fulfilledAmountCents),
    fulfillmentSettled: settled,

    payment: {
      status: derivation.status,
      method: order.paymentMethod,
      onAccount: order.onAccount,
      totalCents: order.orderedTotalCents,
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
      openCents: derivation.amountToCollectCents,
      refundDueCents: derivation.refundDueCents,
      dueDate: order.onAccount ? dueDateOf(order.createdAt, termDays).toISOString().slice(0, 10) : null,
      overdue: isOverdue(order, termDays, now),
      vatTreatment: order.vatTreatment,
    },
    movements: movements.map<OrderMovementView>((m) => ({
      id: m.id,
      when: m.valueDate,
      kind: m.type === 'order_refund' ? 'İade' : 'Tahsilat',
      accountName: accounts.find((a) => a.id === m.accountId)?.name ?? '—',
      amountCents: m.amountCents,
      isRefund: m.type === 'order_refund',
    })),

    timeline: timelineOf(logs, new Map(actors.map((a) => [a.id, a.name])), tickets, order.status),
    /*
      Şerit yalnız ofisin geçişlerini sunar: iptal ve teslim düz durum yazımıyla stok ve rezervasyonu atlardı, hazırlık ve kapıdaki
      sonuç ise sahanın işidir. Eski sekmeden gelen istek eylem tarafında da reddedilir.
    */
    allowedNext: officeTransitions(order.status),
    decisions: [...allowedDecisions(order.status)],
    refundRoutes: allowedDecisions(order.status).includes('refund') ? refundRoutesOf(accounts, movements) : [],

    delivery: {
      type: order.deliveryType,
      date: order.deliveryDate,
      address: addressOf(order.addressSnapshot),
      /* Kurye listesi ve sevkiyat masasıyla aynı fonksiyon: üç yüzey aynı durağa aynı şeyi söyler. */
      doorCheck: doorCheckOf(order.addressSnapshot as Record<string, unknown> | null),
      recipient: recipientOf(order.addressSnapshot, customer?.name ?? null),
      courierName: courier?.name ?? null,
      runReference: run?.referenceNo ?? null,
      proof: await proofOf(order.deliveryProof),
      warehouse: warehouseLabels.get(order.warehouseId) ?? null,
      // Kutu izi paketin kapısından; ikinci okuma yok.
      boxes: await listOrderBoxes(db, order),
      /* Kargo künyesi müşteri yüzeyiyle aynı kapıdan okunur ki iki taraf aynı numarayı görsün; yalnız kargo siparişinde. */
      shipment:
        order.deliveryType === 'shipping'
          ? await readOrderTracking(db, order.id, { carrier: order.carrier, trackingNumber: order.trackingNumber })
          : null,
    },

    customer: {
      id: order.customerId,
      name: customer?.name?.trim() || 'Bilinmeyen müşteri',
      meta: [customer?.phone, customer?.email].filter(Boolean).join(' · '),
      phone: customer?.phone ?? null,
      isCompany: Boolean(customer?.companyInfo),
      // Vade kartı yalnız vadesi açık müşteride çizilir: peşin müşteride "limit 0" olmayan bir kısıtı varmış gibi gösterirdi.
      credit: customer?.creditEnabled
        ? {
            // Müşterinin borcu, bu siparişinki değil.
            openBalanceCents: credit.openBalanceCents,
            limitCents: customer.creditLimitCents,
            overdueDays: isOverdue(order, termDays, now)
              ? Math.floor((now.getTime() - dueDateOf(order.createdAt, termDays).getTime()) / 86_400_000)
              : null,
            dueDate: order.onAccount ? dueDateOf(order.createdAt, termDays).toISOString().slice(0, 10) : null,
          }
        : null,
    },
    links: linksOf(tickets),
    finance: financeOf(order, items, cogsOf(batches, stocks)),
  };
}

/**
 * Fiilen çıkan partilerin alış maliyeti, çünkü aynı ürün iki partide iki fiyata girmiş olabilir. Parti ya da alış fiyatı eksikse
 * maliyet bilinmez, `null` döner.
 */
function cogsOf(
  batches: ReadonlyArray<{ stockId: string; qty: number }>,
  stocks: readonly Stock[],
): number | null {
  if (batches.length === 0) return null;
  const priceOfStock = new Map(stocks.map((s) => [s.id, s.purchasePriceCents]));
  let total = 0;
  for (const batch of batches) {
    const priceCents = priceOfStock.get(batch.stockId);
    if (priceCents == null) return null; // tek bir eksik alış fiyatı bile toplamı yalancı yapar
    total += priceCents * batch.qty;
  }
  return total;
}

/**
 * Kâr raporuyla aynı sayı için motorun dökümü; burada ikinci formül yok. Kâr yalnız maliyetler sabitlenince hesaplanır, parti
 * maliyeti öncesinde yalnız tahmin olarak gösterilir.
 */
function financeOf(order: Order, items: readonly OrderItem[], batchCogsCents: number | null): OrderFinanceView {
  const contribution = orderContribution(
    {
      id: order.id,
      // Satış günü teslim günü, yoksa açılış günü; hesaba girmez, çıktıyı damgalar ki rapor aynı kaydı aynı günle görsün.
      saleDate: order.deliveryDate ?? order.createdAt.slice(0, 10),
      channel: order.channel,
      vatTreatment: order.vatTreatment,
      shippingFeeCents: order.shippingFeeCents,
      isGiftOrder: order.isGiftOrder,
      cogsAmountCents: order.cogsAmountCents,
      deliveryCostCents: order.deliveryCostCents,
      paymentFeeCents: order.paymentFeeCents,
      packagingCostCents: order.packagingCostCents,
    },
    items,
  );

  const rows: OrderFinanceView['rows'] = [
    { label: 'Satış (KDV hariç)', amountCents: toCents(contribution.revenue), kind: 'sale' },
  ];

  if (contribution.costsFixed) {
    const costs: Array<[string, number]> = [
      ['Mal maliyeti', contribution.costs.cogs],
      ['Dağıtım payı', contribution.costs.delivery],
      ['Ödeme komisyonu', contribution.costs.paymentFee],
      ['Ambalaj', contribution.costs.packaging],
    ];
    for (const [label, value] of costs) {
      if (value > 0) rows.push({ label, amountCents: toCents(value), kind: 'expense' });
    }
  } else if (batchCogsCents !== null) {
    rows.push({ label: 'Mal maliyeti (tahmini)', amountCents: batchCogsCents, kind: 'estimate' });
  }

  return {
    rows,
    profitCents: contribution.costsFixed ? toCents(contribution.contribution ?? 0) : null,
    marginPercent: contribution.marginPct,
    costNote: contribution.costsFixed
      ? null
      : batchCogsCents === null
        ? 'Mal maliyeti parti seçiminden sonra bilinir; kâr sipariş kapandığında hesaplanır.'
        : 'Kâr sipariş kapandığında hesaplanır — dağıtım payı, komisyon ve ambalaj o an sabitlenir.',
  };
}

/**
 * Varsayılan paranın girdiği hesaptır; operatör saptırabilir, çünkü karttan tahsil edip nakit iade etmek meşrudur. Kapalı hesap
 * listelenmez.
 */
function refundRoutesOf(accounts: readonly Account[], movements: readonly MoneyMovement[]): RefundRouteView[] {
  const paidInto = movements.filter((m) => m.type === 'order_payment').at(-1)?.accountId ?? null;

  // Yol hesap türüdür: on kasa satırı soruyu "nasıl geri veriyorum"dan "hangi kasa"ya kaydırırdı. Tür başına paranın girdiği hesap,
  // yoksa türün en eskisi seçilir.
  const byType = new Map<Account['type'], Account>();
  for (const account of [...accounts].filter((a) => a.isActive).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (account.id === paidInto) byType.set(account.type, account);
    else if (!byType.has(account.type)) byType.set(account.type, account);
  }

  return [...byType.values()]
    .map((account) => ({
      accountId: account.id,
      label: ROUTE_LABELS[account.type],
      sub: account.name,
      isDefault: account.id === paidInto,
      // Karta iade müşteriye birkaç gün sonra ulaşır; ekran bunu söyler.
      caveat: account.type === 'provider' ? 'Para karta döner; bankaya geçmesi birkaç gün sürebilir.' : '',
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

const ROUTE_LABELS: Record<Account['type'], string> = {
  provider: 'Karta geri',
  cash: 'Nakit',
  bank: 'Havaleyle',
  // Nadir ama hesap türü kapalı küme ve harita tam olmak zorunda.
  partner: 'Ortak carisinden',
};

function linksOf(tickets: readonly Ticket[]): OrderLinkView[] {
  return tickets.map((ticket) => ({
    key: `ticket-${ticket.id}`,
    ref: TICKET_TYPE_LABELS[ticket.type],
    state: TICKET_STATUS_LABELS[ticket.status],
    tone: ticket.status === 'resolved' ? 'olive' : ticket.status === 'open' ? 'amber' : 'slate',
    title: ticket.subject?.trim() || 'Konu yazılmamış',
    // Cümle operatöre satırın ne olduğunu anlatır, kısaltılmış iç jargon değil.
    note: ticket.returnTriggeredAt
      ? 'Bu siparişin iadesi bu müşteri talebinden başlatıldı; iade tutarı yandaki Para kartında.'
      : 'Müşteri bu siparişle ilgili bir talep açtı — yazışma talebin kendi sayfasında sürer.',
    // Köprü talebin kendisine gider: kuyruk açılır, satır seçili.
    href: ticketsLink(ticket.id),
    cta: 'Talebi aç',
  }));
}

/** Karşılanan değil sipariş edilen adet üzerinden, kalemin tamamı için. */
function lineTotalOf(item: OrderItem): number {
  return item.unitPriceCents * item.qty - item.lineDiscountAmountCents;
}

function payableLineOf(item: OrderItem) {
  return {
    fulfilledQty: item.fulfilledQty,
    orderedQty: item.qty,
    unitPriceCents: item.unitPriceCents,
    lineDiscountCents: item.lineDiscountAmountCents,
  };
}

/**
 * Her satır bir öncekinden çıkar ve sonda gerçek rakam durur. İndirim `total − karşılanan` farkından gelir, çünkü motorun cevabı
 * esastır ve yeniden hesaplamak kuruş ayrıştırırdı.
 */
export function totalsOf(
  order: Order,
  lines: OrderLineView[],
  settled: boolean,
  fulfilledAmountCents: number,
): OrderTotalLine[] {
  /*
    Blok giden malı anlatır, sipariş edileni değil: indirim de karşılanan orana göre sayılır, muhasebe ve kâr paneli de öyle bilir.
    Sipariş edilen, kalem tablosunun sütunlarında durur.
  */
  const gross = lines.reduce((sum, l) => sum + (settled ? l.unitPriceCents * l.fulfilledQty : l.unitPriceCents * l.qty), 0);
  const shipping = order.shippingFeeCents;
  // Brüt − indirim + kargo = ödenecek; ikisi de motorun kalem formülünden türediği için kimlik korunur.
  const discount = Math.max(0, gross + shipping - fulfilledAmountCents);
  const refunded = order.amountRefundedCents;

  const rows: OrderTotalLine[] = [{ label: 'Kalemler', amountCents: gross, kind: 'sum' }];
  // İndirimin sebebi sipariş anındaki kopyadan yazılır; kampanya sonradan silinse de satır sebebini söyler.
  if (discount > 0) {
    const label = order.discountLabel ? resolveLocalizedText(order.discountLabel) : '';
    rows.push({ label: label ? `Sepet indirimi — ${label}` : 'Sepet indirimi', amountCents: discount, kind: 'deduction' });
  }
  /* Ara toplam yalnız ardında kargo varken yazılır; kargosuz siparişte ödenecekle aynı sayıdır. */
  if (shipping > 0) {
    rows.push({ label: 'Ara toplam', amountCents: gross - discount, kind: 'sum' });
    rows.push({ label: 'Kargo', amountCents: shipping, kind: 'sum' });
  }

  rows.push({ label: 'Ödenecek', amountCents: fulfilledAmountCents, kind: 'grand' });
  // KDV bir düşüm değil bilgidir: "bu siparişin vergisi ne" sorusunu tutarı bozmadan yanıtlar.
  rows.push({ label: 'İçindeki KDV', amountCents: vatInsideOf(order, lines, settled), kind: 'note' });
  if (refunded > 0) rows.push({ label: 'İade edildi', amountCents: refunded, kind: 'refund' });
  return rows;
}

/**
 * Kararı motor verir, ters vergilendirmenin sıfır dalı dahil. Taban karşılanan tutardır, hiç gitmeyen malın vergisi sayılmaz;
 * hazırlık kesinleşmeden sipariş edilen adet esastır.
 */
function vatInsideOf(order: Pick<Order, 'channel' | 'vatTreatment'>, lines: OrderLineView[], settled: boolean): number {
  const zeroRated = isZeroRated(order.vatTreatment);
  return lines.reduce((sum, l) => {
    const base = fulfilledLineAmountCents(
      { fulfilledQty: l.fulfilledQty, orderedQty: l.qty, unitPriceCents: l.unitPriceCents, lineDiscountCents: l.lineDiscountCents },
      settled,
    );
    return sum + vatSplitOf(base, order.channel, l.vatRate, zeroRated).vatCents;
  }, 0);
}

/**
 * Atlanan adım silinmez, işaretle görünür: "burada bir şey olmadı" ile "burası hiç yoktu" farklıdır. Talepler sona değil zamanına
 * göre araya girer.
 */
function timelineOf(
  logs: readonly OrderStatusLog[],
  actorNames: Map<string, string>,
  tickets: readonly Ticket[],
  status: OrderStatus,
): OrderTimelineStep[] {
  const events: Array<OrderTimelineStep & { at: string }> = [];

  for (const log of logs) {
    for (const skipped of skippedBetween(log.fromStatus, log.toStatus)) {
      events.push({
        key: `skip-${skipped}-${log.id}`,
        at: log.createdAt,
        label: ORDER_STATUS_LABELS[skipped],
        who: '',
        when: null,
        skipped: true,
        offPath: false,
        warn: false,
        current: false,
      });
    }
    events.push({
      key: `log-${log.id}`,
      at: log.createdAt,
      label: ORDER_STATUS_LABELS[log.toStatus],
      who: log.actorId ? (actorNames.get(log.actorId) ?? 'Personel') : 'Sistem',
      when: log.createdAt,
      skipped: false,
      offPath: log.toStatus === 'cancelled' || log.toStatus === 'returned',
      warn: false,
      current: false,
    });
  }

  for (const ticket of tickets) {
    events.push({
      key: `ticket-${ticket.id}`,
      at: ticket.createdAt,
      label: 'Talep açıldı',
      who: `${TICKET_TYPE_LABELS[ticket.type]} · ${TICKET_STATUS_LABELS[ticket.status]}`,
      when: ticket.createdAt,
      skipped: false,
      offPath: false,
      warn: true,
      current: false,
    });
  }

  // Atlanan adım kendisini doğuran geçişin önünde kalmalı; `sort` kararlı olduğu için aynı damgalı olaylar eklenme sırasını korur.
  events.sort((a, b) => a.at.localeCompare(b.at));

  const steps = events.map(({ at: _at, ...step }) => step);

  // "Şu an buradayız" yalnız açık kayıtta; işaret son durum adımına düşer, araya giren talebe değil.
  if (!isTerminal(status)) {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const step = steps[i];
      if (step && !step.skipped && !step.warn) {
        step.current = true;
        break;
      }
    }
  }
  return steps;
}

/** Sipariş anındaki kopyadan; alan eksikse boş döner, uydurulmaz. */
function addressOf(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return '';
  const part = (key: string): string => (typeof snapshot[key] === 'string' ? (snapshot[key] as string).trim() : '');
  return [part('line1'), part('line2'), [part('postalCode'), part('city')].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

/**
 * Adresin kendi alıcısı, hesap sahibi değil: hediye adresine hesap sahibinin adıyla gönderilen paket teslim alınamaz. Hesaba geri
 * düşüş işaretlenir; telefon ise hesabınkine düşmez, çünkü hediye adresinde o numara başkasınındır.
 */
function recipientOf(
  snapshot: Record<string, unknown> | null,
  accountName: string | null,
): OrderDetailView['delivery']['recipient'] {
  const part = (key: string): string | null => {
    const raw = snapshot?.[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  };
  const phone = part('phone');
  const recipient = part('recipient');
  if (recipient) return { name: recipient, phone, fromAccount: false };

  const fallback = accountName?.trim();
  return fallback ? { name: fallback, phone, fromAccount: true } : null;
}

/**
 * Ham blok burada ayrıştırılmaz; okuma tek kapıda (`readDeliveryProof`) ki yazan ve okuyan aynı şemayı kullansın. Şemaya uymayan
 * kanıt gösterilmez: yarım kanıt yine "kanıt var" der.
 */
async function proofOf(raw: unknown): Promise<OrderDetailView['delivery']['proof']> {
  const proof = await readDeliveryProof(raw);
  if (!proof) return null;
  return { when: proof.at, receivedBy: proof.receivedBy, kind: proof.kind, imageUrl: proof.imageUrl };
}
