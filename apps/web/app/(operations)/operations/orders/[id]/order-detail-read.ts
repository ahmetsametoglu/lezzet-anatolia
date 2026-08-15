import {
  BundleService,
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
import { publicImageUrl } from '@lezzet/storage';
import {
  allowedDecisions,
  allowedTransitions,
  derivePaymentStatusForOrder,
  dueDateOf,
  isFulfillmentSettled,
  isOverdue,
  isTerminal,
  openAmountCents,
  orderContribution,
  skippedBetween,
} from '@lezzet/domain-core';
import { addVat, toCents, vatPortion } from '@lezzet/helper';
import { titleOf } from '@/lib/catalog/title';
import { readDeliveryProof } from '@/lib/courier/proof';
import { readWarehouseLabels } from '@/lib/warehouse/context';
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

/**
 * Sipariş detayının OKUMASI (09.7) — sayfanın tek veri turu.
 *
 * Tasarımın sözü: "türetilmiş alan yazılmaz". Burada da hiçbir kural YENİDEN yazılmaz — ödeme
 * durumu ve kalan tutar `derivePaymentStatusForOrder`'dan, vade `isOverdue`/`creditPosition`'dan,
 * izinli geçişler `allowedTransitions`'tan, atlanan adımlar `skippedBetween`'den gelir.
 *
 * Okuma satır sayısıyla ÇARPMAZ: sipariş + kalemleri + o kalemlerin boy/ürün adları + paket adları
 * + partileri + geçiş kaydı + para hareketleri + talepler. Hepsi kimlik kümesi üzerinden tek turda.
 */

/** Vade süresi ayarı — checkout ve liste ekranıyla AYNI anahtar. */
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
  // Kalem görseli ÜRÜNDEN gelir (15.08, kullanıcı isteği — fiyatlar emsali): ürünler bu okumada
  // zaten çekili, ek sorgu yok. Görselsiz ürün `null` taşır, ekran yer tutucu ikon çizer.
  const productsById = new Map(products.map((p) => [p.id, p]));
  const variantImages = new Map(
    variants.map((v) => {
      const product = productsById.get(v.productId);
      return [v.id, publicImageUrl(product?.imageKey ?? null, product?.imageUpdatedAt ?? null)];
    }),
  );
  // Kalemden müşteri ürün sayfasına köprü (15.08, kullanıcı isteği) — slug da üründen gelir.
  // YALNIZ SATIŞTAKİ ürün köprülenir (yaşandı 15.08): müşteri sayfası pasif/aday ürün için YOK —
  // eski siparişin pasifleşmiş kalemine köprü koymak operatörü 404'e yollamaktı (ölçüldü:
  // `crispy-chicken-nugget` pasif, sayfası 404). Köprüsüz kalem düz metin kalır.
  const variantSlugs = new Map(
    variants.map((v) => {
      const product = productsById.get(v.productId);
      return [v.id, product?.status === 'active' ? product.slug : null];
    }),
  );
  // Başlık haritası BURADA kuruluyor, ortak `readVariantTitles` ile DEĞİL: bu okuma varyantları ve
  // ürünleri zaten çekti (aşağıdaki `variantSubs`/`variantProducts` haritaları için) — yardımcıyı
  // çağırmak aynı iki sorguyu tekrar sormak olurdu. Ortaklaşan şey `titleOf` formatlayıcısı; yalnız
  // başlık isteyen çağıran (sipariş özeti diyaloğu) yardımcıyı kullanır.
  const variantTitles = new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );
  const variantSubs = new Map(variants.map((v) => [v.id, resolveLocalizedText(v.label)]));
  // Parti izi bağının arama anahtarı: stok ekranı ÜRÜN ADIYLA arar (parti numarasıyla değil).
  const variantProducts = new Map(variants.map((v) => [v.id, productNames.get(v.productId) ?? '']));

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

  const lines = items.map<OrderLineView>((item) => ({
    id: item.id,
    title: variantTitles.get(item.variantId) ?? 'Bilinmeyen boy',
    sub: variantSubs.get(item.variantId) ?? '',
    imageUrl: variantImages.get(item.variantId) ?? null,
    productSlug: variantSlugs.get(item.variantId) ?? null,
    qty: item.qty,
    fulfilledQty: item.fulfilledQty,
    unitPriceCents: item.unitPriceCents,
    lineDiscountCents: item.lineDiscountAmountCents,
    vatRate: item.vatRate,
    lineTotalCents: lineTotalOf(item),
    bundleId: item.bundleId,
    returnDisposition: item.returnDisposition,
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

  // Ödeme durumu ve kalan MOTORDAN: ekranın gösterdiği "kalan" ile checkout'un tahsil edeceği tutar
  // aynı hesaptan çıkmalı.
  const derivation = derivePaymentStatusForOrder(order, items, {
    collectedCents: order.amountCollectedCents,
    refundedCents: order.amountRefundedCents,
  });

  const now = new Date();
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
    totals: totalsOf(order, lines, settled),
    fulfillmentSettled: settled,

    payment: {
      status: derivation.status,
      method: order.paymentMethod,
      onAccount: order.onAccount,
      totalCents: order.totalCents,
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
      openCents: derivation.amountToCollectCents,
      refundDueCents: derivation.refundDueCents,
      dueDate: order.onAccount ? dueDateOf(order.createdAt, termDays).toISOString().slice(0, 10) : null,
      overdue: isOverdue(order, termDays, now),
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
    allowedNext: [...allowedTransitions(order.status)],
    decisions: [...allowedDecisions(order.status)],
    refundRoutes: allowedDecisions(order.status).includes('refund') ? refundRoutesOf(accounts, movements) : [],

    delivery: {
      type: order.deliveryType,
      date: order.deliveryDate,
      address: addressOf(order.addressSnapshot),
      courierName: courier?.name ?? null,
      proof: await proofOf(order.deliveryProof),
      warehouse: warehouseLabels.get(order.warehouseId) ?? null,
    },

    customer: {
      id: order.customerId,
      name: customer?.name?.trim() || 'Bilinmeyen müşteri',
      meta: [customer?.phone, customer?.email].filter(Boolean).join(' · '),
      phone: customer?.phone ?? null,
      isCompany: Boolean(customer?.companyInfo),
      // Vade kartı YALNIZ vadesi açık müşteride çizilir: peşin müşteride "limit 0" yazmak, olmayan
      // bir kısıtı varmış gibi gösterirdi.
      credit: customer?.creditEnabled
        ? {
            openBalanceCents: openAmountCents(order),
            limitCents: customer.creditLimitCents,
            overdueDays: isOverdue(order, termDays, now)
              ? Math.floor((now.getTime() - dueDateOf(order.createdAt, termDays).getTime()) / 86_400_000)
              : null,
            dueDate: order.onAccount ? dueDateOf(order.createdAt, termDays).toISOString().slice(0, 10) : null,
          }
        : null,
    },
    links: linksOf(tickets, lotByItem, lines, new Map(items.map((i) => [i.id, variantProducts.get(i.variantId) ?? '']))),
    finance: financeOf(order, items, cogsOf(batches, stocks)),
  };
}

/**
 * **Gerçek COGS** — fiilen çıkan partilerin alış maliyeti (`order_item_batch` × `stock.purchasePrice`).
 *
 * Teorik maliyet (ürünün güncel alışı) DEĞİL: aynı ürün iki partide iki fiyata girmiş olabilir ve
 * siparişten çıkan hangi partiyse kârı o belirler. Parti seçilmemişse (hazırlık yapılmadı) ya da
 * partinin alış fiyatı girilmemişse maliyet **bilinmez** — `null` döner, sıfır sayılmaz.
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
 * Finansal kart — **merkezî kârlılık motorunun (`orderContribution`, 12.6) ekran dökümü.**
 *
 * Burada ikinci bir kâr formülü YOK ve bu bilinçli: sipariş detayı bir zamanlar kendi hesabını
 * yapıyordu (satış `qty` üzerinden, marj maliyete markup, kapanmamış siparişte de kâr) ve aynı
 * siparişin kârı bu sayfada bir, kârlılık raporunda başka çıkıyordu. Ciro da marj da artık
 * raporun kullandığı sayının aynısıdır — ikisi ayrışırsa hangisinin doğru olduğu tartışılırdı.
 *
 * **Kâr yalnız maliyetler SABİTLENMİŞSE hesaplanır** (DOMAIN §12). Kapanmamış siparişte dağıtım
 * payı, komisyon ve ambalaj henüz yazılmamıştır; onları 0 sayıp "kâr" demek, olmayan giderleri
 * sıfırlayıp sayıyı şişirmek olurdu. Parti alışından çıkan maliyet yine de GÖSTERİLİR — ama
 * tahmin olarak işaretlenir ve kâra girmez: bilgi vermek ile hesap uydurmak farklı şeylerdir.
 */
function financeOf(order: Order, items: readonly OrderItem[], batchCogsCents: number | null): OrderFinanceView {
  const contribution = orderContribution(
    {
      id: order.id,
      // Satış günü: teslim günü varsa o, yoksa siparişin açıldığı gün. Katkı payı hesabına girmez,
      // çıktıyı damgalar — rapor da aynı kaydı aynı günle görsün.
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
 * İade yolları — **gerçek hesap listesinden**. Varsayılan, paranın GİRDİĞİ hesaptır: iade kuralı
 * (`lib/order/refund`) zaten öyle yapıyor; ekran o kararı yeniden vermez, gösterir ve gerekirse
 * operatörün saptırmasına izin verir (Stripe'tan tahsil edilip nakit iade etmek meşru bir karardır).
 *
 * Kapalı hesap listelenmez — paranın çıkamayacağı bir yeri seçenek diye sunmak yanlış olurdu.
 */
function refundRoutesOf(accounts: readonly Account[], movements: readonly MoneyMovement[]): RefundRouteView[] {
  const paidInto = movements.filter((m) => m.type === 'order_payment').at(-1)?.accountId ?? null;

  // **Yol = hesap TÜRÜ, hesabın kendisi değil.** Kasa listesi operasyonun iç kaydıdır (kurye
  // kasası, kapanış kasası, kapı kasası…) ve iade penceresine on satır olarak dökülürse soru
  // "parayı nasıl geri veriyorum"dan "hangi kasayı seçmeliyim"e kayar. Tür başına TEK temsilci
  // seçilir: para hangi hesaptan girdiyse o, yoksa türün en eski hesabı. Kart hangi hesaba
  // yazacağını yine de adıyla söyler — seçim gizlenmez, sadeleşir.
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
      // Sağlayıcı yolunda para KARTA DÖNER (07.11): önce `refunds.create`, sonra hareket. Ekran
      // bunu söyler çünkü iki yolun sonucu operatör için farklıdır — kasadan iade elden verilir,
      // karta iade müşteriye birkaç gün sonra ulaşır.
      caveat: account.type === 'provider' ? 'Para karta döner; bankaya geçmesi birkaç gün sürebilir.' : '',
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

const ROUTE_LABELS: Record<Account['type'], string> = {
  provider: 'Karta geri',
  cash: 'Nakit',
  bank: 'Havaleyle',
};

/**
 * "Bağlar" — bu siparişin değdiği diğer kayıtlar: açılmış talepler ve çıkmış partiler.
 *
 * Parti izi burada durur çünkü sorusu operasyonel: geri çağırma olursa bu siparişin hangi partiden
 * ne kadar aldığı, kaydın kendi sayfasında değil, siparişe bakarken lazım olur.
 */
function linksOf(
  tickets: readonly Ticket[],
  lotByItem: Map<string, string[]>,
  lines: OrderLineView[],
  productNameByLine: Map<string, string>,
): OrderLinkView[] {
  const links: OrderLinkView[] = tickets.map((ticket) => ({
    key: `ticket-${ticket.id}`,
    ref: TICKET_TYPE_LABELS[ticket.type],
    state: TICKET_STATUS_LABELS[ticket.status],
    tone: ticket.status === 'resolved' ? 'olive' : ticket.status === 'open' ? 'amber' : 'slate',
    title: ticket.subject?.trim() || 'Konu yazılmamış',
    // Cümleler operatöre "bu satır ne ve bana ne söylüyor" diye anlatır (15.08, kullanıcı
    // bildirimi: kart anlaşılmıyordu) — kısaltılmış iç jargon değil.
    note: ticket.returnTriggeredAt
      ? 'Bu siparişin iadesi bu müşteri talebinden başlatıldı; iade tutarı yandaki Para kartında.'
      : 'Müşteri bu siparişle ilgili bir talep açtı — yazışma talebin kendi sayfasında sürer.',
    // BEKLEYEN(09.12): talep kuyruğu/detay ekranı — açılınca `href` buradan bağlanır. Bugün rozet
    // durur, olmayan sayfaya davet edilmez.
    href: null,
    cta: '',
  }));

  // Parti başına TEK satır: aynı lot iki kalemden çıkmış olabilir, iz aynı izdir.
  const ofLot = new Map<string, { titles: Set<string>; products: Set<string> }>();
  for (const line of lines) {
    for (const lot of lotByItem.get(line.id) ?? []) {
      const entry = ofLot.get(lot) ?? { titles: new Set<string>(), products: new Set<string>() };
      entry.titles.add(line.title);
      const product = productNameByLine.get(line.id);
      if (product) entry.products.add(product);
      ofLot.set(lot, entry);
    }
  }
  for (const [lot, entry] of ofLot) {
    // Stok ekranı ÜRÜN ADIYLA arar; parti numarasını sorgu olarak yollamak boş sayfa açardı. Tek
    // ürüne düşen partide arama anlamlı, karışık partide (aynı lot birden çok ürün) davet edilmez.
    const only = entry.products.size === 1 ? [...entry.products][0] : null;
    links.push({
      key: `lot-${lot}`,
      ref: lot,
      state: 'Parti izi',
      tone: 'slate',
      title: [...entry.titles].join(' · '),
      note: `Bu kalem ${lot} numaralı stok partisinden hazırlandı. Ürün geri çağrılırsa aynı partinin gittiği bütün siparişler stoktan tek aramayla bulunur.`,
      href: only ? `/operations/stock?q=${encodeURIComponent(only)}` : null,
      cta: only ? 'Partiyi stokta aç →' : '',
    });
  }

  return links;
}

/** Satır tutarı: sipariş edilen adet × birim − kalemin indirim payı. Kalemin TAMAMI için. */
function lineTotalOf(item: OrderItem): number {
  return item.unitPriceCents * item.qty - item.lineDiscountAmountCents;
}

/**
 * Toplam bloğu — düşülenler satır satır. "Karşılanmayan adet" ayrı bir satırdır: sipariş tutarı ile
 * ödenecek tutarın neden farklı olduğu, tek bir "toplam" sayısına bakarak anlaşılmaz.
 */
function totalsOf(order: Order, lines: OrderLineView[], settled: boolean): OrderTotalLine[] {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const shipping = order.shippingFeeCents;
  const discount = order.discountAmountCents;
  // Karşılanmayan adet YALNIZ hazırlık kesinleştiyse bir düşümdür. Hazırlanmamış siparişte bu satır
  // "tamamı düşüldü" diye okunuyordu ve toplam kendi kendisiyle çelişiyordu.
  const short = settled
    ? lines.reduce(
        (sum, l) =>
          sum + Math.max(0, l.qty - l.fulfilledQty) * (l.unitPriceCents - Math.round(l.lineDiscountCents / Math.max(1, l.qty))),
        0,
      )
    : 0;
  const refunded = order.amountRefundedCents;

  const rows: OrderTotalLine[] = [{ label: 'Kalemler', amountCents: subtotal, kind: 'sum' }];
  // İndirimin SEBEBİ de yazılır (15.08, kullanıcı isteği): müşteri sepette "İndirim — Hoş geldin
  // indirimi" görüyor, operatör yalnız tutarı görüyordu. Ad sipariş anındaki kopyadan gelir
  // (`discountLabel`) — kampanya sonradan silinse de satır sebebini söylemeye devam eder.
  if (discount > 0) {
    const label = order.discountLabel ? resolveLocalizedText(order.discountLabel) : '';
    rows.push({ label: label ? `Sepet indirimi — ${label}` : 'Sepet indirimi', amountCents: discount, kind: 'deduction' });
  }
  if (shipping > 0) rows.push({ label: 'Kargo', amountCents: shipping, kind: 'sum' });
  if (short > 0) rows.push({ label: 'Karşılanmayan adet', amountCents: short, kind: 'deduction' });
  // KDV bir DÜŞÜM DEĞİL, bilgi: b2c fiyatı zaten dahil, b2b'de fatura ayrı gösterir. Satırın işi
  // "bu siparişin vergisi ne" sorusunu tutarı bozmadan yanıtlamak.
  rows.push({ label: 'İçindeki KDV', amountCents: vatInsideOf(order.channel, lines), kind: 'note' });
  rows.push({ label: 'Sipariş toplamı', amountCents: order.totalCents, kind: 'grand' });
  if (refunded > 0) rows.push({ label: 'İade edildi', amountCents: refunded, kind: 'refund' });
  return rows;
}

/** Kalemlerin içinde duran KDV payı — b2b'de tutar zaten hariçtir, oran üstüne eklenir. */
function vatInsideOf(channel: Order['channel'], lines: OrderLineView[]): number {
  return lines.reduce(
    (sum, l) =>
      sum +
      (channel === 'b2c'
        ? vatPortion(l.lineTotalCents, l.vatRate)
        : addVat(l.lineTotalCents, l.vatRate) - l.lineTotalCents),
    0,
  );
}

/**
 * Zaman çizelgesi — geçiş kaydı **artık talep olaylarıyla birlikte**. Atlanan ana hat adımı
 * SİLİNMEZ, `skipped` işaretiyle görünür kalır: "burada bir şey olmadı" ile "burası hiç yoktu"
 * farklı şeylerdir.
 *
 * Talepler araya ZAMANINA göre girer, sona eklenmez: teslimden bir gün sonra açılan şikâyet, tam
 * oraya düştüğünde okunur bir hikâye olur.
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

  // Kararlı sıra: atlanan adım, kendisini doğuran geçişin ÖNÜNDE kalmalı — `sort` kararlı olduğu
  // için aynı damgalı olaylar eklenme sırasını korur.
  events.sort((a, b) => a.at.localeCompare(b.at));

  const steps = events.map(({ at: _at, ...step }) => step);

  // "Şu an buradayız" yalnız açık kayıtta: kapanmış siparişin güncel adımı olmaz. İşaret son DURUM
  // adımına düşer, araya giren bir talebe değil.
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

/** Adresin sipariş anındaki kopyası — alan eksikse boş döner, uydurulmaz. */
function addressOf(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return '';
  const part = (key: string): string => (typeof snapshot[key] === 'string' ? (snapshot[key] as string).trim() : '');
  return [part('line1'), part('line2'), [part('postalCode'), part('city')].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

/**
 * Teslim kanıtı — **ham `jsonb` BURADA ayrıştırılmıyor** (07.08).
 *
 * Eskiden ayrıştırılıyordu ve tam da bu yüzden sözleşme ayrıştı: ekran `signature`/`photos[]`
 * arıyordu, yazan taraf `kind`/`imageKey` yazıyordu. İki uç da kendi içinde tutarlı olduğu için
 * hiçbir yerde hata vermedi; kanıt "var" göründü, hiç açılamadı. Şekil artık tek şemada ve okuma
 * tek kapıda (`readDeliveryProof`) — burada yapılan iş yalnız ekranın alan adlarına çevirmek.
 *
 * Kapı şema tutmayan bloğa `null` diyor: yarım bir kanıt göstermektense hiç göstermemek doğru,
 * çünkü yarım kanıt yine "kanıt var" der.
 */
async function proofOf(raw: unknown): Promise<OrderDetailView['delivery']['proof']> {
  const proof = await readDeliveryProof(raw);
  if (!proof) return null;
  return { when: proof.at, receivedBy: proof.receivedBy, kind: proof.kind, imageUrl: proof.imageUrl };
}
