import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyDocumentService, MoneyMovementService, OrderService, ProductService,
  UserProfileService, serviceDb,
} from '@lezzet/database';
import { failingAiModel } from '@lezzet/ai/testing';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { analyzeFile, importBankRows, profileFor, saveProfile } from './import';
import { applyMatch, classifyRow, dismissRow, matchQueue } from './reconcile';

/**
 * Banka import'u ve eşleştirme (12.4) — DB üstünde. Doğrulanan iki zor şey:
 * 1. **Mükerrer koruması**: aynı dosya iki kez yüklenirse para iki kez yazılmaz — ama aynı gün
 *    çekilen iki ayrı 20 € de yutulmaz.
 * 2. **Eşleştirme onaya düşer**: öneri çıkar, uygulamayı insan yapar; uygulandığında para
 *    12.2'nin kapısından geçer ve iki kez sayılmaz.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);
const orders = new OrderService(db);

const stamp = Date.now();
let bankAccount: string;
/** Transfer hedefleri için ikinci hesap (12.13): kasadan yatırma, nakit çekimi. */
let cashAccount: string;
let customerId: string;
const createdDocuments: string[] = [];
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Dosyadaki tarih biçimi gün/ay/yıl — okuyucu profilden öğrenir. */
const frDate = (n: number) => dayOffset(n).split('-').reverse().join('/');

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  bankAccount = (await accounts.insert({ name: `Import bankası ${stamp}`, type: 'bank' })).id;
  cashAccount = (await accounts.insert({ name: `Import kasası ${stamp}`, type: 'cash' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Import testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Lokum ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Import müşterisi ${stamp}` })).id;
  createdProfiles.push(customerId);
});

beforeEach(async () => {
  await db.from('money_movement').delete().in('account_id', [bankAccount, cashAccount]);
  await db.from('bank_import').delete().eq('account_id', bankAccount);
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  // Hareket + import zinciri (`bank_import`, `bank_import_profile`) hesapla birlikte gider — sıra
  // `cleanup.ts`'te; burada tekrarlansaydı biri bir gün ötekinden ayrışırdı.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [bankAccount, cashAccount],
    documentIds: createdDocuments,
    warehouseIds: [warehouseId],
  });
});

/** Fransız bankası ekstresi görünümlü ham satırlar. */
const STATEMENT = [
  { Date: frDate(-3), 'Libellé': 'VIR SEPA DUPONT', Montant: '45,90', Solde: '1 234,56' },
  { Date: frDate(-2), 'Libellé': 'PRLV EDF FACTURE', Montant: '-120,00', Solde: '1 114,56' },
  { Date: frDate(-1), 'Libellé': 'RETRAIT DAB', Montant: '-20,00', Solde: '1 094,56' },
  { Date: frDate(-1), 'Libellé': 'RETRAIT DAB', Montant: '-20,00', Solde: '1 074,56' },
];

async function importStatement(rows = STATEMENT, fileName = 'releve.csv') {
  // AI atlanır (`failingAiModel`): anahtarlı ortamda koşan test ağa çıkmamalı; sezgisel yol
  // deterministiktir ve testin ölçtüğü şey zaten o.
  const suggestion = await analyzeFile(rows, { model: failingAiModel('test: AI atlandı') });
  const profile =
    (await profileFor(bankAccount)) ??
    (await saveProfile({ accountId: bankAccount, name: `Crédit Mutuel ${stamp}`, suggestion }));
  return importBankRows({ accountId: bankAccount, profile, fileName, rows });
}

describe('dosya çözümlenir ve şablon kaydedilir', () => {
  it('sütun eşlemesi çıkarılır; ikinci dosyada şablon otomatik uygulanır', async () => {
    const suggestion = await analyzeFile(STATEMENT, { model: failingAiModel('test: AI atlandı') });
    expect(suggestion.mapping).toMatchObject({ date: 'Date', label: 'Libellé', amount: 'Montant' });
    expect(suggestion.missing).toEqual([]);

    const profile = await saveProfile({ accountId: bankAccount, name: `Crédit Mutuel ${stamp}`, suggestion });
    expect(await profileFor(bankAccount)).toMatchObject({ id: profile.id, decimalSeparator: ',', dateFormat: 'dmy' });
  });
});

describe('mükerrer koruması', () => {
  it('satırlar hareket olur; hesabın bakiyesi ANINDA doğrudur', async () => {
    const result = await importStatement();

    expect(result.inserted).toBe(4);
    expect(result.duplicates).toBe(0);
    expect(result.failures).toEqual([]);
    // 45.90 − 120 − 20 − 20 = −114.10
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-11_410);
  });

  it('AYNI DOSYA ikinci kez yüklenirse tek satır bile yazılmaz — para iki kez sayılmaz', async () => {
    await importStatement();
    const balanceAfterFirst = (await accounts.balance(bankAccount)).balanceCents;

    const second = await importStatement(STATEMENT, 'releve-tekrar.csv');
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(4);
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(balanceAfterFirst);
  });

  it('ÇAKIŞAN DÖNEM: eski satırlar atlanır, yalnız yeniler girer', async () => {
    await importStatement();

    const overlapping = [...STATEMENT, { Date: frDate(0), 'Libellé': 'VIR SEPA MARTIN', Montant: '80,00', Solde: '1 154,56' }];
    const second = await importStatement(overlapping, 'releve-2.csv');

    expect(second.inserted).toBe(1);
    expect(second.duplicates).toBe(4);
  });

  it('aynı gün aynı tutarlı İKİ GERÇEK çekim ikisi de yazılır — biri yutulmaz', async () => {
    await importStatement();
    const ledger = await movements.ledger({ accountId: bankAccount, limit: 50 });
    expect(ledger.rows.filter((r) => r.description === 'RETRAIT DAB')).toHaveLength(2);
  });

  it('yükleme kaydı denetlenebilir: kaç satır, kaçı yazıldı, kaçı atlandı', async () => {
    await importStatement();
    const second = await importStatement(STATEMENT, 'releve-tekrar.csv');

    expect(second.batch).toMatchObject({ fileName: 'releve-tekrar.csv', rowCount: 4, insertedCount: 0, duplicateCount: 4 });
  });

  it('okunamayan satır dosyayı düşürmez, sebebiyle raporlanır', async () => {
    const result = await importStatement(
      [...STATEMENT, { Date: 'gecersiz', 'Libellé': 'BOZUK', Montant: '10,00', Solde: '' }],
      'releve-bozuk.csv',
    );

    expect(result.inserted).toBe(4);
    expect(result.failures).toEqual([{ rowIndex: 4, reason: 'bad_date' }]);
  });
});

describe('eşleştirme kuyruğu', () => {
  /** Referansı ekstredeki açıklamayla eşleşen, tahsil edilmemiş bir satış kurar. */
  async function unpaidSale(referenceNo: string, orderedTotalCents: number, daysAgo: number) {
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', orderedTotalCents }, [
      { variantId, qty: 1, fulfilledQty: 1, unitPriceCents: orderedTotalCents, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'completed', referenceNo });
    await db.from('order_status_log').insert({
      order_id: order.id, from_status: 'draft', to_status: 'completed', created_at: `${dayOffset(-daysAgo)}T10:00:00.000Z`,
    });
    return order;
  }

  it('import edilen satır kuyruğa düşer; sınıflandırılmamış olarak durur', async () => {
    await importStatement();
    const { rows } = await matchQueue(bankAccount);

    expect(rows).toHaveLength(4);
    expect(rows.every((q) => q.movement.type === 'misc' && !q.movement.reconciled)).toBe(true);
  });

  it('referans açıklamada geçiyorsa güçlü ve TEK öneri çıkar', async () => {
    const reference = `LA-26-${stamp % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'tek.csv');

    const row = (await matchQueue(bankAccount)).rows[0]!;
    expect(row.suggestions[0]).toMatchObject({ kind: 'order', id: order.id });
    expect(row.unambiguous).toBe(true);
  });

  it('PARA ÇIKIŞI için sipariş önerisi çıkmaz', async () => {
    await unpaidSale(`LA-26-X${stamp % 10000}`, 12_000, 2);
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '0,00' }], 'gider.csv');

    expect((await matchQueue(bankAccount)).rows[0]!.suggestions).toEqual([]);
  });

  it('onay uygulanınca para 12.2 kapısından geçer — İKİ KEZ sayılmaz', async () => {
    const reference = `LA-26-${(stamp + 1) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'onay.csv');
    const balanceBefore = (await accounts.balance(bankAccount)).balanceCents;

    const row = (await matchQueue(bankAccount)).rows[0]!;
    expect(await applyMatch(row.movement.id, { kind: 'order', orderId: order.id })).toEqual({ status: 'ok', movementId: row.movement.id });

    // Sipariş tahsilatı yazıldı ve durumu türedi…
    expect(await orders.getById(order.id)).toMatchObject({ amountCollectedCents: 4590, paymentStatus: 'paid' });
    // …ama hesabın bakiyesi DEĞİŞMEDİ: import satırı yerini tahsilata bıraktı, para iki kez sayılmadı.
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(balanceBefore);
    expect((await matchQueue(bankAccount)).rows).toEqual([]);
  });

  it('eşleşen satır YERİNDE güncellenir — ekstre yeniden yüklenirse para İKİ KEZ girmez', async () => {
    const reference = `LA-26-${(stamp + 3) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    const rows = [{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }];
    await importStatement(rows, 'yeniden.csv');

    const row = (await matchQueue(bankAccount)).rows[0]!;
    await applyMatch(row.movement.id, { kind: 'order', orderId: order.id });
    const balanceAfterMatch = (await accounts.balance(bankAccount)).balanceCents;

    // Aynı dosya bir daha yüklenir: satırın parmak izi hâlâ yerinde olduğu için hiçbir şey girmez.
    const again = await importStatement(rows, 'yeniden-2.csv');
    expect(again.inserted).toBe(0);
    expect(again.duplicates).toBe(1);
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(balanceAfterMatch);
    expect(await orders.getById(order.id)).toMatchObject({ amountCollectedCents: 4590 });
  });

  it('aynı satır iki kez uygulanamaz', async () => {
    const reference = `LA-26-${(stamp + 2) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'iki-kez.csv');

    const row = (await matchQueue(bankAccount)).rows[0]!;
    await applyMatch(row.movement.id, { kind: 'order', orderId: order.id });
    expect(await applyMatch(row.movement.id, { kind: 'order', orderId: order.id })).toEqual({ status: 'invalid', reason: 'already_reconciled' });
  });

  it('gider olarak sınıflanan satır kuyruktan düşer, hareket KALIR', async () => {
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '0,00' }], 'kira.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(await classifyRow(row.movement.id, { type: 'expense', tags: ['kira'] })).toMatchObject({ status: 'ok' });
    // Etiket + `reconciled`: banka satırı hem izahlı hem ekstreyle mutabık.
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'expense', tags: ['kira'], reconciled: true, explained: true });
    expect((await matchQueue(bankAccount)).rows).toEqual([]);
  });

  it('"bağlanmıyor" denen satır da kuyruktan düşer ama parası kasada kalır', async () => {
    await importStatement([{ Date: frDate(-1), 'Libellé': 'FRAIS BANCAIRES', Montant: '-3,50', Solde: '0,00' }], 'masraf.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;
    const balance = (await accounts.balance(bankAccount)).balanceCents;

    expect(await dismissRow(row.movement.id)).toMatchObject({ status: 'ok' });
    expect((await matchQueue(bankAccount)).rows).toEqual([]);
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(balance);
  });
});

/*
  HEDEF KÜMESİ (12.13 · kullanıcı kararı 13.09: "her banka hareketinin bir karşılığı olmalı").
  Sınananlar kural katmanı: hangi hedef hangi yöne uyar, para hiçbir hedefte iki kez sayılmaz, elle
  yazılan satır ekstre gelince tek satıra iner.
*/
describe('eşleştirme hedefleri (12.13)', () => {
  it('AÇIK BELGEYE bağlanır — satır gider olur, belgenin açık kalanı düşer', async () => {
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({
      kind: 'invoice', number: `EDF-${stamp}`, issuedOn: dayOffset(-2), counterparty: 'EDF', direction: 'out', amountCents: 12_000, tags: ['kira'],
    });
    createdDocuments.push(belge.id);
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF FACTURE', Montant: '-120,00', Solde: '0,00' }], 'belge.csv');

    const { rows, targets } = await matchQueue(bankAccount);
    // Tutar birebir + aynı gün + karşı taraf açıklamada: tek güçlü aday, belge.
    expect(rows[0]!.suggestions[0]).toMatchObject({ kind: 'document', id: belge.id });
    expect(rows[0]!.unambiguous).toBe(true);
    expect(targets.documents.some((d) => d.id === belge.id)).toBe(true);

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'document', documentId: belge.id })).toEqual({ status: 'ok', movementId: rows[0]!.movement.id });
    // Belgenin etiketi ödemesine geçti; satır hem izahlı hem mutabık.
    expect(await movements.getById(rows[0]!.movement.id)).toMatchObject({ type: 'expense', documentId: belge.id, tags: ['kira'], reconciled: true, explained: true });
    // Belge kapandı: açık listeden düştü.
    expect((await documents.listOpen()).some((d) => d.id === belge.id)).toBe(false);
  });

  it('giren para belgeye bağlanamaz — belgenin yönü satıra uymuyor', async () => {
    const belge = await new MoneyDocumentService(db).insert({
      kind: 'invoice', issuedOn: dayOffset(-1), counterparty: 'Yön testi', direction: 'out', amountCents: 5000,
    });
    createdDocuments.push(belge.id);
    await importStatement([{ Date: frDate(-1), 'Libellé': 'VIR RECU', Montant: '50,00', Solde: '0,00' }], 'yon.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(row.suggestions).toEqual([]);
    expect(await applyMatch(row.movement.id, { kind: 'document', documentId: belge.id })).toEqual({ status: 'invalid', reason: 'direction_mismatch' });
  });

  it('TRANSFERİN ÖTEKİ YAKASI — ayna susar, para iki kez sayılmaz', async () => {
    // Kasadan bankaya 50 € yatırıldı, kasa tarafından elle yazıldı: banka görünümde +50 (ayna).
    const leg = await movements.insert({
      accountId: cashAccount, counterAccountId: bankAccount, direction: 'out', amountCents: 5000, type: 'transfer', valueDate: dayOffset(-1), description: 'Kasa fazlası',
    });
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(5000);
    // Ekstre aynı yatırmayı getirdi: ayna + ekstre satırı = aynı para iki kez.
    await importStatement([{ Date: frDate(-1), 'Libellé': 'VERSEMENT ESPECES', Montant: '50,00', Solde: '0,00' }], 'yatirma.csv');
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(10_000);

    const { rows, targets } = await matchQueue(bankAccount);
    expect(targets.transferLegs.map((l) => l.id)).toContain(leg.id);
    expect(rows[0]!.suggestions[0]).toMatchObject({ kind: 'transfer', id: leg.id });

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'transfer', legId: leg.id })).toMatchObject({ status: 'ok' });
    // Banka +50, kasa −50: iki gerçek satır kendi hesabında, ayna yok.
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(5000);
    expect((await accounts.balance(cashAccount)).balanceCents).toBe(-5000);
    expect(await movements.getById(rows[0]!.movement.id)).toMatchObject({
      type: 'transfer', counterAccountId: cashAccount, counterpartMovementId: leg.id, reconciled: true, explained: true,
    });
    // Uç artık bekleyen değil; ikinci bir ekstre satırı onu sahiplenemez.
    expect(await movements.listTransferLegsAwaiting(bankAccount)).toEqual([]);
  });

  it('"ZATEN YAZMIŞTIM" — elle yazılan silinir, ekstre satırı bağlarını devralır (kullanıcı kararı 13.09)', async () => {
    // Tutar bu dosyanın öteki fikstürlerinden AYRI (137,25): `beforeEach` yalnız hareketleri siler,
    // önceki testin 120 €'luk belgesi yeniden AÇIK kalır ve aynı tutar + gün ile eş puanlı aday olurdu.
    const elle = await movements.insert({
      accountId: bankAccount, direction: 'out', amountCents: 13_725, type: 'expense', tags: ['kira'], valueDate: dayOffset(-2), description: 'Eylül kirası',
    });
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV SEPA LOYER', Montant: '-137,25', Solde: '0,00' }], 'zaten.csv');
    // İkisi de bankada: aynı para iki kez.
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-27_450);

    const { rows, targets } = await matchQueue(bankAccount);
    expect(targets.provisional.map((m) => m.id)).toContain(elle.id);
    expect(rows[0]!.suggestions[0]).toMatchObject({ kind: 'provisional', id: elle.id });

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'provisional', movementId: elle.id })).toMatchObject({ status: 'ok' });
    expect(await movements.getById(elle.id)).toBeNull();
    const satir = await movements.getById(rows[0]!.movement.id);
    expect(satir).toMatchObject({ type: 'expense', tags: ['kira'], reconciled: true, explained: true, source: 'bank_import' });
    // İz künyede: hangi satır yutuldu, ne diyordu.
    expect(satir?.meta).toMatchObject({ absorbed: { movementId: elle.id, source: 'manual', description: 'Eylül kirası' } });
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-13_725);
  });

  it('giren paranın adı SERMAYE konur; aynı satıra gider denemez', async () => {
    await importStatement([{ Date: frDate(-1), 'Libellé': 'APPORT ASSOCIE', Montant: '1000,00', Solde: '0,00' }], 'sermaye.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(await classifyRow(row.movement.id, { type: 'expense', tags: ['kira'] })).toEqual({ status: 'invalid', reason: 'direction_mismatch' });
    expect(await classifyRow(row.movement.id, { type: 'capital', tags: ['sermaye'] })).toMatchObject({ status: 'ok' });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'capital', tags: ['sermaye'], reconciled: true, explained: true });
  });

  it('UCU OLMAYAN transfer: satır karşı hesaba aynalanır (nakit çekimi)', async () => {
    await importStatement([{ Date: frDate(-1), 'Libellé': 'RETRAIT DAB', Montant: '-20,00', Solde: '0,00' }], 'dab.csv');
    const { rows, targets } = await matchQueue(bankAccount);
    expect(targets.accounts.some((a) => a.id === cashAccount)).toBe(true);

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'transfer_to', accountId: bankAccount })).toEqual({ status: 'invalid', reason: 'same_account' });
    expect(await applyMatch(rows[0]!.movement.id, { kind: 'transfer_to', accountId: cashAccount })).toMatchObject({ status: 'ok' });
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-2000);
    expect((await accounts.balance(cashAccount)).balanceCents).toBe(2000);
  });

  it('İADE: çıkış satırı ödenmiş siparişe iade olarak bağlanır — liste puanlanmaz, seçilir', async () => {
    const reference = `LA-26-${(stamp + 4) % 100000}`;
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', orderedTotalCents: 4590 }, [
      { variantId, qty: 1, fulfilledQty: 1, unitPriceCents: 4590, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'completed', referenceNo: reference });
    await db.from('order_status_log').insert({
      order_id: order.id, from_status: 'draft', to_status: 'completed', created_at: `${dayOffset(-3)}T10:00:00.000Z`,
    });
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'iade-1.csv');
    const tahsilat = (await matchQueue(bankAccount)).rows[0]!;
    await applyMatch(tahsilat.movement.id, { kind: 'order', orderId: order.id });

    await importStatement([{ Date: frDate(-1), 'Libellé': 'VIR REMBOURSEMENT CLIENT', Montant: '-45,90', Solde: '54,10' }], 'iade-2.csv');
    const { rows, targets } = await matchQueue(bankAccount);
    expect(rows).toHaveLength(1);
    // İade puanlanmaz (kalem ister, gider satırını yanıltır) — listede durur, bilerek seçilir.
    expect(rows[0]!.suggestions.some((s) => s.kind === 'refund')).toBe(false);
    expect(targets.refunds.some((r) => r.id === order.id)).toBe(true);

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'refund', orderId: order.id })).toMatchObject({ status: 'ok' });
    expect(await orders.getById(order.id)).toMatchObject({ amountRefundedCents: 4590, paymentStatus: 'refunded' });
  });
});
