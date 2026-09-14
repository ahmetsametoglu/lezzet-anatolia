import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, CounterpartyService, MoneyAllocationService, MoneyDocumentService, MoneyMovementService, OrderService,
  ProductService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { setMovementNature } from '@lezzet/application';
import { failingAiModel } from '@lezzet/ai/testing';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { analyzeFile, importBankRows, profileFor, saveProfile } from './import';
import { applyMatch, dismissRow, documentPaymentOptions, linkDocument, matchOptions, matchQueue, unmatchRow } from './reconcile';

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
const allocations = new MoneyAllocationService(db);

const stamp = Date.now();
let bankAccount: string;
/** Transfer hedefleri için ikinci hesap (12.13): kasadan yatırma, nakit çekimi. */
let cashAccount: string;
let customerId: string;
const createdDocuments: string[] = [];
const createdCounterparties: string[] = [];
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
    counterpartyIds: createdCounterparties,
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

  it('TÜRÜ konan satır kuyruktan düşer, hareket KALIR (13.09: tür = sınıflandırma)', async () => {
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '0,00' }], 'kira.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(await setMovementNature(db, { movementId: row.movement.id, nature: 'kira' })).toMatchObject({ status: 'ok' });
    // Tür + `reconciled`: banka satırı hem izahlı hem ekstreyle mutabık; tip türden türedi.
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'expense', nature: 'kira', reconciled: true, explained: true });
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
  it('AÇIK BELGEYE bağlanır — satır gider olur, belgenin türü ve carisi ona geçer, açık kalanı düşer', async () => {
    // Carinin eşleşme kelimesi DAMGALI: cariler şirket geneli okunur, öteki dosyaların satırlarını tanımasın.
    const cari = await new CounterpartyService(db).insert({ name: `Kiraya veren ${stamp}`, kind: 'service', keywords: [`KIRA${stamp}`] });
    createdCounterparties.push(cari.id);
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({
      kind: 'invoice', number: `KIRA-${stamp}`, issuedOn: dayOffset(-2), counterpartyId: cari.id, direction: 'out', nature: 'kira', amountCents: 12_000,
    });
    createdDocuments.push(belge.id);
    await importStatement([{ Date: frDate(-2), 'Libellé': `PRLV KIRA${stamp} FACTURE`, Montant: '-120,00', Solde: '0,00' }], 'belge.csv');

    const { rows, targets } = await matchQueue(bankAccount);
    // Tutar birebir + aynı gün + carinin kelimesi: belge açık ara önde; cari kendisi yedek öneri.
    expect(rows[0]!.suggestions.map((s) => s.kind)).toEqual(['document', 'counterparty']);
    expect(rows[0]!.suggestions[0]).toMatchObject({ id: belge.id });
    expect(rows[0]!.unambiguous).toBe(true);
    expect(targets.documents.some((d) => d.id === belge.id)).toBe(true);

    expect(await applyMatch(rows[0]!.movement.id, { kind: 'document', documentId: belge.id })).toEqual({ status: 'ok', movementId: rows[0]!.movement.id });
    // Belgenin türü ve carisi ödemesine geçti; satır hem izahlı hem mutabık; bağ tutarıyla yazıldı.
    expect(await movements.getById(rows[0]!.movement.id)).toMatchObject({
      type: 'expense', nature: 'kira', counterpartyId: cari.id, reconciled: true, explained: true,
    });
    expect(await allocations.listByMovements([rows[0]!.movement.id])).toMatchObject([{ documentId: belge.id, amountCents: 12_000 }]);
    // Belge kapandı: açık listeden düştü.
    expect((await documents.listOpen()).some((d) => d.id === belge.id)).toBe(false);
  });

  it('giren para belgeye bağlanamaz — belgenin yönü satıra uymuyor', async () => {
    const belge = await new MoneyDocumentService(db).insert({ kind: 'invoice', issuedOn: dayOffset(-1), direction: 'out', amountCents: 5000 });
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
    // önceki testlerin belgeleri AÇIK kalabilir ve aynı tutar + gün ile eş puanlı aday olurdu.
    const elle = await movements.insert({
      accountId: bankAccount, direction: 'out', amountCents: 13_725, type: 'expense', nature: 'kira', valueDate: dayOffset(-2), description: 'Eylül kirası',
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
    expect(satir).toMatchObject({ type: 'expense', nature: 'kira', reconciled: true, explained: true, source: 'bank_import' });
    // İz künyede: hangi satır yutuldu, ne diyordu.
    expect(satir?.meta).toMatchObject({ absorbed: { movementId: elle.id, source: 'manual', description: 'Eylül kirası' } });
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-13_725);
  });

  it('giren paranın türü SERMAYE konur; gider türü giren paraya konmaz', async () => {
    await importStatement([{ Date: frDate(-1), 'Libellé': 'APPORT ASSOCIE', Montant: '1000,00', Solde: '0,00' }], 'sermaye.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(await setMovementNature(db, { movementId: row.movement.id, nature: 'kira' })).toEqual({ status: 'invalid', reason: 'nature_direction' });
    expect(await setMovementNature(db, { movementId: row.movement.id, nature: 'sermaye' })).toMatchObject({ status: 'ok' });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'capital', nature: 'sermaye', reconciled: true, explained: true });
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

/*
  İKİNCİ KARAR (13.09 · muhasebeci karşılaştırması): bağ TUTARIYLA, cari eşleşme kelimesiyle, ve
  verilen her cevap geri alınabilir ("eşleştirmeyle ilgili düzenleme yapamıyorum" bulgusu).
*/
describe('bağ tutarıyla · cari · geri alma (13.09)', () => {
  it('TEK HAVALE, İKİ FATURA: ilk bağdan sonra satır kalanıyla kuyrukta, ikinciyle kapanır', async () => {
    const documents = new MoneyDocumentService(db);
    const a = await documents.insert({ kind: 'invoice', number: `TOPLU-A-${stamp}`, issuedOn: dayOffset(-3), direction: 'out', amountCents: 7000 });
    const b = await documents.insert({ kind: 'invoice', number: `TOPLU-B-${stamp}`, issuedOn: dayOffset(-3), direction: 'out', amountCents: 5300 });
    createdDocuments.push(a.id, b.id);
    await importStatement([{ Date: frDate(-1), 'Libellé': `VIR TOPLU ${stamp}`, Montant: '-123,00', Solde: '0,00' }], 'toplu.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    expect(await applyMatch(row.movement.id, { kind: 'document', documentId: a.id })).toMatchObject({ status: 'ok' });
    // 123 − 70 = 53: satır kuyrukta KALANIYLA durur, mutabık değil ama izahlı (bir bağı var).
    const kalan = (await matchQueue(bankAccount)).rows.find((q) => q.movement.id === row.movement.id);
    expect(kalan?.remainingCents).toBe(5300);
    expect(await movements.getById(row.movement.id)).toMatchObject({ reconciled: false, explained: true });

    expect(await applyMatch(row.movement.id, { kind: 'document', documentId: b.id })).toMatchObject({ status: 'ok' });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'expense', reconciled: true, explained: true });
    expect((await allocations.listByMovements([row.movement.id])).map((x) => x.amountCents).sort((x, y) => x - y)).toEqual([5300, 7000]);
    const acik = await documents.listOpen();
    expect(acik.some((d) => d.id === a.id || d.id === b.id)).toBe(false);
  });

  it('CARİ: eşleşme kelimesi satırı tanır; onaylanınca cari ve varsayılan türü satıra geçer', async () => {
    const cari = await new CounterpartyService(db).insert({
      name: `Banka masrafı ${stamp}`, kind: 'service', keywords: [`MASRAF${stamp}`], defaultNature: 'banka-masrafi',
    });
    createdCounterparties.push(cari.id);
    await importStatement([{ Date: frDate(-1), 'Libellé': `FRAIS MASRAF${stamp}`, Montant: '-4,50', Solde: '0,00' }], 'cari.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;
    expect(row.suggestions[0]).toMatchObject({ kind: 'counterparty', id: cari.id, reasons: ['keyword_in_label'] });

    expect(await applyMatch(row.movement.id, { kind: 'counterparty', counterpartyId: cari.id })).toMatchObject({ status: 'ok' });
    expect(await movements.getById(row.movement.id)).toMatchObject({
      counterpartyId: cari.id, nature: 'banka-masrafi', type: 'expense', reconciled: true, explained: true,
    });
  });

  it('GERİ AL: belgeye bağlanan satır ekstreden geldiği hâle döner, belge yeniden açılır', async () => {
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({ kind: 'invoice', number: `GERI-${stamp}`, issuedOn: dayOffset(-2), direction: 'out', nature: 'kira', amountCents: 8800 });
    createdDocuments.push(belge.id);
    await importStatement([{ Date: frDate(-2), 'Libellé': `PRLV GERI-${stamp}`, Montant: '-88,00', Solde: '0,00' }], 'geri.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;
    await applyMatch(row.movement.id, { kind: 'document', documentId: belge.id });
    expect((await documents.listOpen()).some((d) => d.id === belge.id)).toBe(false);

    expect(await unmatchRow(row.movement.id)).toEqual({ status: 'ok', movementId: row.movement.id });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'misc', nature: null, reconciled: false, explained: false });
    expect(await allocations.listByMovements([row.movement.id])).toEqual([]);
    // Belge yeniden açık, satır yeniden kuyrukta — ve yine aynı belgeyi öneriyor.
    expect((await documents.listOpen()).some((d) => d.id === belge.id)).toBe(true);
    expect((await matchQueue(bankAccount)).rows[0]!.suggestions[0]).toMatchObject({ kind: 'document', id: belge.id });
  });

  it('GERİ AL "zaten yazmıştım": elle yazılan satır izinden yeniden kurulur, para yine iki satırda', async () => {
    const elle = await movements.insert({
      accountId: bankAccount, direction: 'out', amountCents: 21_310, type: 'expense', nature: 'kira', valueDate: dayOffset(-2), description: 'Ekim kirası',
    });
    await importStatement([{ Date: frDate(-2), 'Libellé': `PRLV SEPA EKIM ${stamp}`, Montant: '-213,10', Solde: '0,00' }], 'geri-zaten.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;
    await applyMatch(row.movement.id, { kind: 'provisional', movementId: elle.id });
    expect(await movements.getById(elle.id)).toBeNull();
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-21_310);

    expect(await unmatchRow(row.movement.id)).toMatchObject({ status: 'ok' });
    const ledger = await movements.ledger({ accountId: bankAccount, limit: 20 });
    expect(ledger.rows.find((r) => r.source === 'manual' && r.description === 'Ekim kirası')).toMatchObject({
      amountCents: 21_310, type: 'expense', nature: 'kira', explained: true,
    });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'misc', nature: null, reconciled: false, meta: null });
    // İki satır yine bankada — eşleştirme yeniden beklenir, para geçici olarak iki kez sayılır.
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(-42_620);
  });
});

describe('ayrıntı paneli: seçenekler · bağla · ödeme adayları (12.17)', () => {
  it('SEÇENEKLER: ekstre satırı bütün hedefleri görür, elle yazılan satır yalnız belgeleri', async () => {
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({ kind: 'invoice', number: `PANEL-${stamp}`, issuedOn: dayOffset(-2), direction: 'out', amountCents: 6600 });
    createdDocuments.push(belge.id);
    await importStatement([{ Date: frDate(-1), 'Libellé': `PRLV PANEL-${stamp}`, Montant: '-66,00', Solde: '0,00' }], 'panel.csv');
    const row = (await matchQueue(bankAccount)).rows[0]!;

    const bank = await matchOptions(row.movement.id);
    expect(bank).toMatchObject({ bankRow: true, remainingCents: 6600 });
    expect(bank!.suggestions[0]).toMatchObject({ kind: 'document', id: belge.id });
    // Ekstre satırının cevabı her şey olabilir — kasa, transfer hedefi olarak listede.
    expect(bank!.targets.accounts.some((account) => account.id === cashAccount)).toBe(true);

    // Elle yazılan satırın TEK bağı belgedir: sipariş, kabul, transfer ucu, "zaten yazılmış" ve hesap okunmaz.
    const elle = await movements.insert({
      accountId: cashAccount, direction: 'out', amountCents: 6600, type: 'expense', nature: 'kira', valueDate: dayOffset(-1), description: `Elle PANEL-${stamp}`,
    });
    const manual = await matchOptions(elle.id);
    expect(manual?.bankRow).toBe(false);
    expect(manual!.targets).toMatchObject({ orders: [], intakes: [], transferLegs: [], provisional: [], accounts: [] });
    expect(manual!.targets.documents.some((document) => document.id === belge.id)).toBe(true);
  });

  it('BAĞLA: elle yazılan satır belgeye TUTARIYLA bağlanır; ters yönlü satır reddedilir', async () => {
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({ kind: 'invoice', number: `ELLE-${stamp}`, issuedOn: dayOffset(-2), direction: 'out', amountCents: 9000 });
    createdDocuments.push(belge.id);
    const elle = await movements.insert({
      accountId: cashAccount, direction: 'out', amountCents: 4000, type: 'expense', nature: 'kira', valueDate: dayOffset(-1), description: `Elle ELLE-${stamp}`,
    });

    expect(await linkDocument(elle.id, belge.id)).toEqual({ status: 'ok', movementId: elle.id });
    expect(await allocations.listByMovements([elle.id])).toEqual([expect.objectContaining({ documentId: belge.id, amountCents: 4000 })]);
    expect((await documents.balances([belge.id])).get(belge.id)?.openAmountCents).toBe(5000);

    const ters = await movements.insert({ accountId: cashAccount, direction: 'in', amountCents: 1000, type: 'misc', valueDate: dayOffset(-1), description: `Ters ELLE-${stamp}` });
    expect(await linkDocument(ters.id, belge.id)).toEqual({ status: 'invalid', reason: 'direction_mismatch' });
  });

  it('ÖDEME ADAYLARI: belgenin yönündeki, kalanı olan hareketler puanlı; bağlanan ödemelere geçer', async () => {
    const documents = new MoneyDocumentService(db);
    const belge = await documents.insert({ kind: 'invoice', number: `ODEME-${stamp}`, issuedOn: dayOffset(-3), direction: 'out', amountCents: 4500 });
    createdDocuments.push(belge.id);
    await importStatement([
      { Date: frDate(-1), 'Libellé': `PRLV ODEME-${stamp}`, Montant: '-45,00', Solde: '0,00' },
      { Date: frDate(-1), 'Libellé': `VIR ODEME-${stamp}`, Montant: '45,00', Solde: '45,00' },
    ], 'odeme.csv');
    const rows = (await matchQueue(bankAccount)).rows;
    const cikis = rows.find((r) => r.movement.direction === 'out')!.movement;
    const giris = rows.find((r) => r.movement.direction === 'in')!.movement;

    const before = (await documentPaymentOptions(belge.id))!;
    expect(before.payments).toEqual([]);
    // Referansı açıklamada geçen satır en üstte; ters yönlü satır hiç yok.
    expect(before.candidates[0]).toMatchObject({ movement: { id: cikis.id }, remainingCents: 4500 });
    expect(before.candidates[0]!.score).toBeGreaterThan(0);
    expect(before.candidates.some((c) => c.movement.id === giris.id)).toBe(false);

    // Mutabık olmayan ekstre satırı belge eşleştirmesinden geçer: satır kapanır, kuyruktan düşer.
    expect(await linkDocument(cikis.id, belge.id)).toEqual({ status: 'ok', movementId: cikis.id });
    expect(await movements.getById(cikis.id)).toMatchObject({ reconciled: true, explained: true });
    const after = (await documentPaymentOptions(belge.id))!;
    expect(after.document.balance.openAmountCents).toBe(0);
    expect(after.payments).toEqual([{ movement: expect.objectContaining({ id: cikis.id }), amountCents: 4500 }]);
    expect(after.candidates.some((c) => c.movement.id === cikis.id)).toBe(false);

    // Tutarı tükenen hareket başka bir belgenin adayı da olmaz (kalanı 0).
    const baska = await documents.insert({ kind: 'invoice', number: `ODEME-B-${stamp}`, issuedOn: dayOffset(-3), direction: 'out', amountCents: 1000 });
    createdDocuments.push(baska.id);
    expect((await documentPaymentOptions(baska.id))!.candidates.some((c) => c.movement.id === cikis.id)).toBe(false);
  });
});
