import {
  AccountService,
  AnalyticsProductDailyService,
  AnalyticsSearchDailyService,
  ConversationInboxService,
  DeliveryZoneService,
  MoneyDocumentService,
  MoneyMovementService,
  PostalCodeDemandService,
  StockIntakeBalanceService,
  ProductFeedbackService,
  ProductService,
  TicketService,
  serviceDb,
} from '@lezzet/database';
import { addDays, parisDateOf } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * Talep sinyalleri ve müşteri nabzı rota ve paket önerisinin ham verisidir: sinyal veridir, karar değil; öneriyi model kurar, kararı
 * patron verir. Kimlik yoktur, yazışma ve talep tarafında yalnız sayım okunur (`AI_ADMIN_ASSISTANT §6`).
 */

/**
 * Talep sinyalleri karşılanmamış talebe üç yerden bakar: coğrafya, arama kutusu, ürün sayfası. Tek araçta toplanır, çünkü asistan "bu
 * hafta ne yapmalıyım" diye sorduğunda üçünü birden görmeli.
 */
export async function demandSignals(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const to = parisDateOf(new Date());
  const from = addDays(to, -(clamped - 1));

  const [zones, coveredZones, searches, zeroSearches, productSignals] = await Promise.all([
    new PostalCodeDemandService(db).listTop(15),
    // Kapsama da okunur, çünkü sayaç ham talebi sayar ve kapsanan bir kodu bölge genişletme adayı gibi sunardı.
    new DeliveryZoneService(db).listWithCodes({}),
    new AnalyticsSearchDailyService(db).signals(from, to, 15),
    // Sonuçsuz aramalar AYRI sorulur: "aradı ve bulamadı" bir katalog boşluğudur — paket ve yeni
    // ürün önerisinin en dolaysız kanıtı.
    new AnalyticsSearchDailyService(db).signals(from, to, 15, true),
    new AnalyticsProductDailyService(db).signals(from, to, 15),
  ]);

  // Ürün kimlikleri ADA çevrilir: model uuid'yle konuşamaz, patron da öyle.
  const products = productSignals.length > 0 ? await new ProductService(db).listByIds(productSignals.map((s) => s.productId)) : [];
  const nameById = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name, 'tr')]));

  return {
    window: { from, to, days: clamped },
    /**
     * Rota önerisinin ham sinyali; kapsanan kod gizlenmez, bölgesinin adıyla işaretlenir, çünkü oradaki yüksek talep de bir bilgidir
     * (daha sık gitmek, kapasite).
     */
    postalCodeDemand: zones.map((z) => ({
      postalCode: z.postalCode,
      requestCount: z.requestCount,
      lastSeenAt: z.lastSeenAt,
      coveredBy: coveredZones.find((zone) => zone.postalCodes.some((c) => c.postalCode === z.postalCode))?.name ?? null,
    })),
    searches: searches.map((s) => ({ query: s.query, searchCount: s.searchCount, sessionCount: s.sessionCount })),
    searchesWithoutResult: zeroSearches.map((s) => ({ query: s.query, kind: s.zeroResultKind, searchCount: s.searchCount })),
    // `cartRate` null "hiç satılabilir hâlde görünmedi" demektir, sıfır değil. Adı çözülemeyen satır (silinmiş ürün) listede değil
    // sayaçtadır, ki "ölçüm var ama adı yok" ile "ölçüm yok" karışmasın.
    productInterest: productSignals
      .filter((s) => nameById.has(s.productId))
      .map((s) => ({
        product: nameById.get(s.productId),
        viewCount: s.viewCount,
        cartCount: s.cartCount,
        cartRate: s.cartRate,
      })),
    unresolvedProductSignals: productSignals.filter((s) => !nameById.has(s.productId)).length,
  };
}

/**
 * Müşteri nabzı: talepler, moderasyon kuyruğu ve yazışma gözlemi. Yazışma tarafı sayımdır, çünkü MCP asistanı mesajlaşmayı yönetmez,
 * gözlemler (`AI_CUSTOMER_AGENT §7`).
 */
export async function customerPulse() {
  const db = serviceDb();
  const [tickets, pendingReviews, awaitingReply] = await Promise.all([
    new TicketService(db).countByStatus(),
    new ProductFeedbackService(db).countPending(),
    new ConversationInboxService(db).countAwaitingReply(),
  ]);

  return {
    tickets,
    pendingReviews,
    conversations: { awaitingReply },
  };
}

/**
 * Kasa ve banka durumu: bakiyeler, son hareketler ve dönem toplamları; asistan para hareketini veriye dayanarak önerebilsin diye.
 * Okur, yorumlamaz: kâr, marj ya da nakit tahmini yoktur (`AI_ADMIN_ASSISTANT §6` finans sınırı).
 */
export async function moneyOverview(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const to = parisDateOf(new Date());
  const from = addDays(to, -(clamped - 1));

  const accountService = new AccountService(db);
  const movements = new MoneyMovementService(db);
  const [accounts, balances, totals, recent, unexplainedMovements, openDocuments, uninvoicedIntakes] = await Promise.all([
    accountService.list({ activeOnly: true }),
    accountService.balances(),
    movements.periodTotals(from, to),
    // Son hareketler: en yeni 15 — "kasada ne oldu" sorusunun dolaysız cevabı. Sayfalama yok,
    // pencere zaten dar (`CLAUDE §1`: doğal tavanı olan küme).
    movements.ledger({ limit: 15 }),
    // İzah ve borç: üçü de doğal tavanlı kümeler (izah edilen, kapanan, faturası girilen düşer).
    movements.unexplainedCount(),
    new MoneyDocumentService(db).listOpen(),
    new StockIntakeBalanceService(db).listOpen(),
  ]);

  // Bekleyen işin sayıları brifingin para satırını besler. Karşı tarafların adı yoktur: kritik kayıt listelenmez, kimliği ekran söyler
  // (`AI_ADMIN_ASSISTANT §6`).
  const payable = openDocuments.filter((doc) => doc.direction === 'out' && doc.balance.openAmountCents > 0);
  const receivable = openDocuments.filter((doc) => doc.direction === 'in' && doc.balance.openAmountCents > 0);
  const sumOpen = (docs: typeof openDocuments) => docs.reduce((sum, doc) => sum + doc.balance.openAmountCents, 0);
  const attention = {
    unexplainedMovements,
    openPayableDocuments: { count: payable.length, openCents: sumOpen(payable), overdueCount: payable.filter((doc) => doc.dueOn !== null && doc.dueOn < to).length },
    openReceivableDocuments: { count: receivable.length, openCents: sumOpen(receivable) },
    intakesWithoutInvoice: { count: uninvoicedIntakes.length, openCents: uninvoicedIntakes.reduce((sum, intake) => sum + intake.openAmountCents, 0) },
  };

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return {
    window: { from, to, days: clamped },
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      // `null` = bakiye görünümünde satır yok (hiç hareket görmemiş hesap) — SIFIR DEĞİL
      // (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
      balanceCents: balances.get(a.id)?.balanceCents ?? null,
    })),
    /** Tür × yön kırılımı (tahsilat/gider/transfer × giren/çıkan) — ham toplam, yorum yok. */
    periodTotals: totals,
    /** Bekleyen işin sayıları: izah bekleyen hareket, açık belge (yönüyle, vadesi geçen), faturasız kabul. */
    attention,
    recentMovements: recent.rows.map((row) => ({
      valueDate: row.valueDate,
      type: row.type,
      // İşaretli tutar: girişte +, çıkışta − ve transferin karşı ucunda ters (`signedAmountCents`
      // künyesi). Ham `amountCents` + `direction` ikilisini modele yorumlatmak, işaret kuralını
      // ikinci kez yazdırmak olurdu.
      signedAmountCents: row.signedAmountCents,
      // Satırın AİT OLDUĞU hesap — transferde `accountId`den farklı olabilir (defter satırı iki
      // hesapta birden doğar).
      account: accountName.get(row.ledgerAccountId) ?? null,
      description: row.description,
    })),
  };
}
