import {
  AccountService,
  DeliveryRunCloseService,
  DeliveryRunCollectionService,
  DeliveryRunService,
  MoneyMovementService,
  OrderService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import type { MethodTotal, MoneyDayEnd, MoneyOverview, PaymentMethod, PendingCollection } from '@lezzet/types';

/*
  PARA BÖLÜMÜ OKUMALARI (21.12 · M1 tahsilat izleme · M2 gün sonu mutabakat özeti).

  SALT OKUMA — tasarımın altın kuralı ("'bakiye düzeltme' diye bir kavram yok"): bu dosyada tek
  bir yazım yoktur ve para hesaplanmaz, DEFTERDEN toplanır. Tahsilat kapıda yazıldı (11.3), sefer
  mutabakatı kapanışta yazıldı (11.7); burada yalnız o kayıtlar günün sorusu etrafında birleşir.

  KURYENİN ÜSTÜNDEKİ PARA bir hesap DEĞİLDİR: kapıda toplanan tutar deftere hesaba girer, ama
  fiziken kuryededir — K7 devrine (sefer kapanışına) dek. Bu yüzden float, "bugünün KAPANMAMIŞ
  seferlerinin beklenen tahsilatı"ndan türetilir; ayrı bir "kurye kasası" satırı uydurulmaz.
*/

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Yöntem kırılımı — yalnız hareketi olan yöntemler döner; sıra "en çok tutar önce". */
function totalsByMethod(entries: Array<{ method: PaymentMethod; cents: number }>): MethodTotal[] {
  const sums = new Map<PaymentMethod, number>();
  for (const entry of entries) sums.set(entry.method, (sums.get(entry.method) ?? 0) + entry.cents);
  return [...sums.entries()]
    .map(([method, cents]) => ({ method, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export async function readMoneyOverview(db: Db, input: { date?: string } = {}): Promise<MoneyOverview> {
  const date = input.date ?? isoDate(new Date());
  const orders = new OrderService(db);
  const runs = new DeliveryRunService(db);

  const [unpaid, movements, todayRuns, accounts, balances] = await Promise.all([
    orders.listUnpaidByDeliveryDate(date),
    new MoneyMovementService(db).listOrderMoneyOfDay(date),
    runs.listByDate(date),
    new AccountService(db).list({ activeOnly: true }),
    new AccountService(db).balances(),
  ]);

  // Bekleyen satırın adı sipariş sahibinden — yerinde satış deseniyle aynı kapı (profil listesi).
  const names = await new UserProfileService(db).listByIds([...new Set(unpaid.map((o) => o.customerId))]);
  const nameOf = new Map(names.map((profile) => [profile.id, profile.name]));

  const pending: PendingCollection[] = unpaid.map((order) => ({
    orderId: order.id,
    referenceNo: order.referenceNo,
    customerName: nameOf.get(order.customerId) ?? '—',
    status: order.status,
    kind: order.paymentStatus === 'partial' ? 'partial' : 'door',
    remainingCents: order.totalCents - order.amountCollectedCents,
    method: order.paymentMethod,
  }));

  // Yöntem, HAREKETİN siparişinden okunur: hareket tablosu yöntem taşımaz (hesap taşır) ve
  // hesaptan yönteme dönmek bir eşleme uydurmak olurdu. Siparişsiz sipariş-hareketi olamaz.
  const paymentMovements = movements.filter((m) => m.type === 'order_payment' && m.direction === 'in');
  const movementOrders = await orders.listByIds([
    ...new Set(paymentMovements.map((m) => m.orderId).filter((id): id is string => id !== null)),
  ]);
  const methodOf = new Map(movementOrders.map((order) => [order.id, order.paymentMethod]));
  const todayByMethod = totalsByMethod(
    paymentMovements.flatMap((movement) => {
      const method = movement.orderId ? methodOf.get(movement.orderId) : null;
      return method ? [{ method, cents: movement.amountCents }] : [];
    }),
  );

  // Float: bugünün kapanmamış seferlerinin beklenen tahsilatı. Kapanan seferin parası sayılıp
  // teslim edilmiştir — onu da saymak aynı parayı iki kez "kuryede" göstermek olurdu.
  const closes = await new DeliveryRunCloseService(db).listByRuns(todayRuns.map((run) => run.id));
  const closedRunIds = new Set(closes.map((close) => close.deliveryRunId));
  const openRuns = todayRuns.filter((run) => !closedRunIds.has(run.id));
  const collections = await new DeliveryRunCollectionService(db).listByRuns(openRuns.map((run) => run.id));

  /* PARA KİMDE — sefer başına künye (v3:23). Kurye adı ikinci bir profil turu ister; bekleyen
     satırların adlarıyla AYNI kapıdan okunur ve **tek turda** (iki ayrı `listByIds` çağrısı aynı
     tabloya iki kez gitmek olurdu). Profili okunamayan kurye `null` kalır — uydurulmaz. */
  const courierNames = await new UserProfileService(db).listByIds([
    ...new Set(openRuns.map((run) => run.courierId)),
  ]);
  const courierNameOf = new Map(courierNames.map((profile) => [profile.id, profile.name]));
  const floatOf = new Map(collections.map((row) => [row.deliveryRunId, row]));

  /* SIFIRLI SEFER LİSTEDE YOK: açık ama henüz hiç kapıda para toplamamış bir sefer, "kuryenin
     üstünde" başlığının altında 0,00 € diye durursa muhasebeci olmayan bir emaneti kovalar. */
  const courierFloat = openRuns.flatMap((run) => {
    const row = floatOf.get(run.id);
    if (row === undefined) return [];
    const total = row.expectedCashCents + row.expectedCardCents + row.expectedChequeCents;
    if (total === 0) return [];
    return [
      {
        runId: run.id,
        referenceNo: run.referenceNo,
        courierName: courierNameOf.get(run.courierId) ?? null,
        cashCents: row.expectedCashCents,
        cardCents: row.expectedCardCents,
        chequeCents: row.expectedChequeCents,
      },
    ];
  });

  return {
    pending,
    todayByMethod,
    /* ADET, TUTARDAN AYRI BİR GERÇEK: aynı toplam iki tahsilattan da kırktan da gelebilir.
       Sayılan şey HAREKETTİR (deftere düşen tahsilat kaydı), sipariş değil — bir sipariş iki
       taksitle ödendiyse defterde iki kayıt vardır ve muhasebecinin saydığı da odur. */
    todayCount: paymentMovements.length,
    courierFloat,
    accounts: accounts.map((account) => ({
      name: account.name,
      type: account.type,
      cents: balances.get(account.id)?.balanceCents ?? 0,
    })),
  };
}

export async function readMoneyDayEnd(db: Db, input: { date?: string } = {}): Promise<MoneyDayEnd> {
  const date = input.date ?? isoDate(new Date());

  const [movements, todayRuns, unmatchedMovementCount] = await Promise.all([
    new MoneyMovementService(db).listOrderMoneyOfDay(date),
    new DeliveryRunService(db).listByDate(date),
    new MoneyMovementService(db).unreconciledCount(),
  ]);
  const closes = await new DeliveryRunCloseService(db).listByRuns(todayRuns.map((run) => run.id));

  const collectedCents = movements
    .filter((m) => m.type === 'order_payment' && m.direction === 'in')
    .reduce((sum, m) => sum + m.amountCents, 0);
  // İade NEGATİF taşınır: işaret veridedir (yön `out`), ekran uydurmaz.
  const refundCents = -movements
    .filter((m) => m.type === 'order_refund' && m.direction === 'out')
    .reduce((sum, m) => sum + m.amountCents, 0);

  const counted = closes.reduce((sum, close) => sum + close.countedCashCents, 0);
  const expected = closes.reduce((sum, close) => sum + close.expectedCashCents, 0);

  /* UYUŞMAZLIĞIN KÜNYESİ (v3:24) — hangi sefer, kim, ne zaman. Yalnız FARKI OLAN kapanışlar:
     tutan sefer bir künye değil, sessiz bir onaydır ve listeye girseydi muhasebeci farkı olanı
     aramak zorunda kalırdı. Kurye adı seferden gelir (kapanış yalnız `closedBy` taşır ve o
     kapatan kişidir — çoğu zaman kurye ama kural değil; para KİMİN üstündeydi sorusunun cevabı
     seferi süren kuryedir). */
  const mismatched = closes.filter((close) => close.countedCashCents !== close.expectedCashCents);
  const runOf = new Map(todayRuns.map((run) => [run.id, run]));
  const mismatchNames = await new UserProfileService(db).listByIds([
    ...new Set(mismatched.flatMap((close) => {
      const run = runOf.get(close.deliveryRunId);
      return run ? [run.courierId] : [];
    })),
  ]);
  const mismatchNameOf = new Map(mismatchNames.map((profile) => [profile.id, profile.name]));

  const runs = mismatched.flatMap((close) => {
    const run = runOf.get(close.deliveryRunId);
    if (run === undefined) return [];
    return [
      {
        referenceNo: run.referenceNo,
        courierName: mismatchNameOf.get(run.courierId) ?? null,
        closedAt: close.closedAt,
        differenceCents: close.countedCashCents - close.expectedCashCents,
      },
    ];
  });

  return {
    date,
    collectedCents,
    refundCents,
    courierHandoverCents: counted,
    // Kapanan sefer yoksa mutabakat sorusu HENÜZ SORULMADI — 0 "fark yok" derdi, o bir yalan.
    discrepancy: closes.length > 0 ? { expectedCents: expected, countedCents: counted, runs } : null,
    unmatchedMovementCount,
  };
}
