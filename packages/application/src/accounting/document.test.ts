import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CounterpartyService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementNatureService,
  MovementTagService,
  PurchaseOrderService,
  StockIntakeService,
  SupplierService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { DocumentVatLine } from '@lezzet/types';
import { addCounterparty, setMovementCounterparty, updateCounterparty } from './counterparties';
import { allocateToDocument, attachDocumentFile, createMoneyDocument, listOpenDocuments, removeAllocation } from './document';
import { addMovementNature, setMovementNature, updateMovementNature } from './natures';
import { addMovementTag, setMovementTagActive, tagMovement } from './tags';
import { recordOrderPayment } from '../order/payment';
import { supplierRowOf } from '../warehouse/supplier';

/*
  Tür, cari, etiket ve belge kapılarının kural katmanı gerçek tetikleyici ve görünümle sınanır: tür hareketi izahlı yapar, etiket izah
  değildir, cari varsayılan türünü taşır ve belgenin açık kalanı bağlardan türer. `recordOrderPayment` yalnız izahlı doğan satır örneğidir.
*/

const db = serviceDb();
const stamp = Date.now();
const createdAccounts: string[] = [];
const createdTags: string[] = [];
const createdNatures: string[] = [];
const createdCounterparties: string[] = [];
const createdDocuments: string[] = [];
let bankAccount: string;

beforeAll(async () => {
  const account = await new AccountService(db).insert({ name: `Belge testi ${stamp}`, type: 'bank' });
  bankAccount = account.id;
  createdAccounts.push(account.id);
});

afterAll(async () => {
  // Silme SIRASI tek yerde (`cleanup.ts`): hareket → hesap → belge → cari → etiket → tür. Elle silme yok (CLAUDE §4b).
  await purgeTestData(db, {
    accountIds: createdAccounts,
    documentIds: createdDocuments,
    counterpartyIds: createdCounterparties,
    tagSlugs: createdTags,
    natureSlugs: createdNatures,
  });
});

const movements = () => new MoneyMovementService(db);

/** 20 %'lik tek satırlı kırılım: 10,00 € = 8,33 € + 1,67 € KDV. */
const KDV_10_EUR: DocumentVatLine[] = [{ vatRate: 20, netCents: 833, vatCents: 167 }];

/**
 * Stok alımının bağı, rejim ve vade: kabul ve sipariş kurmayı gerektirmeyen retler burada; kabule bağlanan faturanın borcu ve ikinci
 * faturanın reddi `apps/web/lib/money/supplier-document-debt.test.ts`'te.
 */
describe('belgenin koşulları — okunur retler (12.26)', () => {
  const base = {
    kind: 'invoice' as const,
    business: 'lezzet' as const,
    issuedOn: '2026-09-12',
    direction: 'out' as const,
    amountCents: 1000,
    vatLines: KDV_10_EUR,
  };
  const someId = '00000000-0000-4000-8000-000000000001';

  it('kabul ve sipariş aynı anda bağlanamaz; bağ tedarikçi ister; olmayan kabul bulunamaz', async () => {
    expect(await createMoneyDocument(db, { ...base, supplierId: someId, stockIntakeId: someId, purchaseOrderId: someId })).toMatchObject({
      status: 'invalid',
      reason: 'link_conflict',
    });
    expect(await createMoneyDocument(db, { ...base, stockIntakeId: someId })).toMatchObject({ status: 'invalid', reason: 'link_needs_supplier' });
    expect(await createMoneyDocument(db, { ...base, supplierId: someId, stockIntakeId: someId })).toMatchObject({ status: 'invalid', reason: 'link_not_found' });
  });

  it('ödenecek fatura kırılım ister; muaf belgenin satırı olmaz; vade belgenin gününden önce olamaz', async () => {
    expect(await createMoneyDocument(db, { ...base, vatLines: [] })).toMatchObject({ status: 'invalid', reason: 'vat_lines_required' });
    expect(await createMoneyDocument(db, { ...base, vatRegime: 'exempt' })).toMatchObject({ status: 'invalid', reason: 'vat_with_regime' });
    expect(await createMoneyDocument(db, { ...base, dueOn: '2026-09-01' })).toMatchObject({ status: 'invalid', reason: 'due_before_issue' });
  });

  it('kırılım veride de tutar: KDV toplamı satırlardan türer, kapıyı atlayan tutarsız yazım reddedilir', async () => {
    const documents = new MoneyDocumentService(db);
    const vatLines: DocumentVatLine[] = [
      { vatRate: 20, netCents: 30_000, vatCents: 6000 },
      { vatRate: 5.5, netCents: 1800, vatCents: 99 },
    ];
    const belge = await documents.insert({ ...base, number: `KIRILIM-${stamp}`, amountCents: 37_899, vatLines });
    createdDocuments.push(belge.id);
    expect(belge).toMatchObject({ amountCents: 37_899, vatAmountCents: 6099, vatLines });

    await expect(documents.insert({ ...base, amountCents: 37_900, vatLines })).rejects.toThrow(/money_document_vat_gross/);
    await expect(documents.insert({ ...base, vatLines: [...KDV_10_EUR, ...KDV_10_EUR] })).rejects.toThrow(/money_document_vat_lines/);
    await expect(documents.insert({ ...base, vatRegime: 'reverse_charge' })).rejects.toThrow(/money_document_vat_regime/);
  });
});

describe('etiket — serbest işaret (13.09)', () => {
  it('okunur addan slug üretir, aynı ad ikinci kez girmez', async () => {
    const eklenen = await addMovementTag(db, { label: `Ortak A aracı ${stamp}` });
    expect(eklenen.status).toBe('ok');
    if (eklenen.status !== 'ok') return;
    createdTags.push(eklenen.tag.slug);
    expect(eklenen.tag.slug).toBe(`ortak-a-araci-${stamp}`);

    expect(await addMovementTag(db, { label: `ortak a aracı ${stamp}` })).toEqual({ status: 'invalid', reason: 'exists' });
    expect(await addMovementTag(db, { label: '   ' })).toEqual({ status: 'invalid', reason: 'bad_label' });
  });

  it('etiket izah DEĞİLDİR; pasif etiket yeni harekete verilmez, eski harekette kalır', async () => {
    const slug = `gecici-${stamp}`;
    expect((await addMovementTag(db, { label: `Gecici ${stamp}` })).status).toBe('ok');
    createdTags.push(slug);

    const hareket = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 500, type: 'misc' });
    const etiketli = await tagMovement(db, { movementId: hareket.id, tags: [slug] });
    expect(etiketli).toMatchObject({ status: 'ok', movement: { tags: [slug], explained: false } });

    expect(await setMovementTagActive(db, slug, false)).toMatchObject({ status: 'ok', tag: { isActive: false } });
    expect(await tagMovement(db, { movementId: hareket.id, tags: [slug] })).toEqual({ status: 'invalid', reason: 'unknown_tag' });
    expect((await movements().getById(hareket.id))?.tags).toEqual([slug]);
    expect((await new MovementTagService(db).list()).find((tag) => tag.slug === slug)?.isActive).toBe(false);
  });
});

describe('tür (13.09)', () => {
  it('sözlüğe tür eklenir; hesap kodu yalnız rakam, 2–8 hane; slug değişmeden düzenlenir', async () => {
    const eklenen = await addMovementNature(db, { label: `Test türü ${stamp}`, direction: 'out', accountCode: '6068' });
    expect(eklenen.status).toBe('ok');
    if (eklenen.status !== 'ok') return;
    createdNatures.push(eklenen.nature.slug);
    expect(eklenen.nature).toMatchObject({ slug: `test-turu-${stamp}`, direction: 'out', accountCode: '6068', isActive: true });

    expect(await addMovementNature(db, { label: `test türü ${stamp}`, direction: 'out' })).toEqual({ status: 'invalid', reason: 'exists' });
    expect(await addMovementNature(db, { label: `Kodsuz ${stamp}`, direction: null, accountCode: 'ABC' })).toEqual({ status: 'invalid', reason: 'bad_code' });

    const duzenlenen = await updateMovementNature(db, eklenen.nature.slug, { label: `Test türü yeni ${stamp}`, accountCode: '', isActive: false });
    expect(duzenlenen).toMatchObject({ status: 'ok', nature: { slug: eklenen.nature.slug, label: `Test türü yeni ${stamp}`, accountCode: null, isActive: false } });
    expect((await new MovementNatureService(db).list({ activeOnly: true })).some((n) => n.slug === eklenen.nature.slug)).toBe(false);
  });

  it('tür hareketi izahlı yapar ve tipini belirler; ters yönlü tür ve transfer reddedilir', async () => {
    const cikis = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 900, type: 'misc' });
    expect(cikis.explained).toBe(false);
    const konan = await setMovementNature(db, { movementId: cikis.id, nature: 'kira' });
    expect(konan).toMatchObject({ status: 'ok', movement: { nature: 'kira', type: 'expense', explained: true } });

    const giris = await movements().insert({ accountId: bankAccount, direction: 'in', amountCents: 900, type: 'misc' });
    expect(await setMovementNature(db, { movementId: giris.id, nature: 'kira' })).toEqual({ status: 'invalid', reason: 'nature_direction' });
    expect(await setMovementNature(db, { movementId: giris.id, nature: 'sermaye' })).toMatchObject({ status: 'ok', movement: { type: 'capital' } });

    const other = (await new AccountService(db).insert({ name: `Belge testi karşı ${stamp}`, type: 'cash' })).id;
    createdAccounts.push(other);
    const aktarim = await movements().insert({ accountId: bankAccount, counterAccountId: other, direction: 'out', amountCents: 100, type: 'transfer' });
    expect(await setMovementNature(db, { movementId: aktarim.id, nature: 'kira' })).toEqual({ status: 'invalid', reason: 'nature_not_applicable' });

    // Tür kaldırılınca elle yazılmış satır yeniden izah bekler (tipi kalır).
    expect(await setMovementNature(db, { movementId: cikis.id, nature: null })).toMatchObject({ status: 'ok', movement: { nature: null, explained: false } });
  });
});

describe('cari (13.09)', () => {
  it('cari eklenir; seçilen carinin varsayılan türü boş türe geçer; tedarikçili harekete cari konmaz', async () => {
    const eklenen = await addCounterparty(db, { name: `URSSAF test ${stamp}`, kind: 'institution', keywords: ['URSSAF', ' urssaf ', ''], defaultNature: 'sosyal-guvenlik' });
    expect(eklenen.status).toBe('ok');
    if (eklenen.status !== 'ok') return;
    createdCounterparties.push(eklenen.counterparty.id);
    // Kelimeler kırpılır, boşu ve büyük/küçük harf tekrarı atılır.
    expect(eklenen.counterparty.keywords).toEqual(['URSSAF']);
    expect(await addCounterparty(db, { name: `urssaf TEST ${stamp}`, kind: 'institution' })).toEqual({ status: 'invalid', reason: 'exists' });

    const hareket = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 118_000, type: 'misc' });
    const konan = await setMovementCounterparty(db, { movementId: hareket.id, counterpartyId: eklenen.counterparty.id });
    expect(konan).toMatchObject({ status: 'ok', movement: { counterpartyId: eklenen.counterparty.id, nature: 'sosyal-guvenlik', type: 'expense', explained: true } });

    const { data } = await db.from('supplier').select('id').limit(1).maybeSingle();
    if (!data) return;
    const tedarikcili = await movements().insert({
      accountId: bankAccount, direction: 'out', amountCents: 1000, type: 'purchase', supplierId: (data as { id: string }).id,
    });
    expect(await setMovementCounterparty(db, { movementId: tedarikcili.id, counterpartyId: eklenen.counterparty.id })).toEqual({ status: 'invalid', reason: 'party_taken' });
  });
});

describe('belge ve bağ — tutarıyla (13.09)', () => {
  it('bir havale İKİ faturayı kapatır; kalanı olmayan hareket üçüncüye, yeni hareket ödenmiş faturaya bağlanmaz', async () => {
    const a = await createMoneyDocument(db, {
      kind: 'invoice',
      business: 'lezzet',
      number: `A-${stamp}`,
      issuedOn: '2026-09-01',
      direction: 'out',
      amountCents: 70_000,
      nature: 'kira',
      vatRegime: 'exempt',
    });
    const b = await createMoneyDocument(db, {
      kind: 'invoice',
      business: 'lezzet',
      number: `B-${stamp}`,
      issuedOn: '2026-09-02',
      direction: 'out',
      amountCents: 50_000,
      vatLines: [{ vatRate: 20, netCents: 41_667, vatCents: 8333 }],
    });
    const c = await createMoneyDocument(db, {
      kind: 'invoice',
      business: 'lezzet',
      number: `C-${stamp}`,
      issuedOn: '2026-09-03',
      direction: 'out',
      amountCents: 10_000,
      vatLines: [{ vatRate: 20, netCents: 8333, vatCents: 1667 }],
    });
    if (a.status !== 'ok' || b.status !== 'ok' || c.status !== 'ok') throw new Error('belge yazılamadı');
    createdDocuments.push(a.document.id, b.document.id, c.document.id);

    const havale = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 120_000, type: 'expense' });
    expect(await allocateToDocument(db, { movementId: havale.id, documentId: a.document.id })).toMatchObject({ status: 'ok', allocation: { amountCents: 70_000 } });
    expect(await allocateToDocument(db, { movementId: havale.id, documentId: b.document.id })).toMatchObject({ status: 'ok', allocation: { amountCents: 50_000 } });
    const acik = await listOpenDocuments(db);
    expect(acik.some((doc) => doc.id === a.document.id || doc.id === b.document.id)).toBe(false);
    // Bağı olan hareket izahlıdır — türü olmasa da.
    expect((await movements().getById(havale.id))?.explained).toBe(true);

    expect(await allocateToDocument(db, { movementId: havale.id, documentId: c.document.id })).toEqual({ status: 'invalid', reason: 'nothing_to_allocate' });
    expect(await allocateToDocument(db, { movementId: havale.id, documentId: a.document.id })).toEqual({ status: 'invalid', reason: 'already_allocated' });

    // Bağın tutarı elle verilmez: fazla para hareketin bağlanmamış kalanında durur, ödenmiş faturaya geçmez.
    const ikinci = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 90_000, type: 'expense' });
    expect(await allocateToDocument(db, { movementId: ikinci.id, documentId: a.document.id })).toEqual({
      status: 'invalid',
      reason: 'document_settled',
    });
    expect(await allocateToDocument(db, { movementId: ikinci.id, documentId: c.document.id })).toMatchObject({
      status: 'ok',
      allocation: { amountCents: 10_000 },
    });
  });

  it('kısmi ödeme açık kalanı düşürür; bağ kaldırılınca geri gelir; ters yönlü para bağlanmaz', async () => {
    const belge = await createMoneyDocument(db, {
      kind: 'invoice',
      business: 'lezzet',
      number: `FA-${stamp}`,
      issuedOn: '2026-09-01',
      direction: 'out',
      amountCents: 120_000,
      vatLines: [{ vatRate: 20, netCents: 100_000, vatCents: 20_000 }],
    });
    if (belge.status !== 'ok') throw new Error('belge yazılamadı');
    createdDocuments.push(belge.document.id);

    const odeme = await movements().insert({ accountId: bankAccount, direction: 'out', amountCents: 70_000, type: 'expense', nature: 'kira' });
    await allocateToDocument(db, { movementId: odeme.id, documentId: belge.document.id });
    expect((await listOpenDocuments(db)).find((doc) => doc.id === belge.document.id)?.balance).toMatchObject({ settledCents: 70_000, openAmountCents: 50_000 });

    expect(await removeAllocation(db, { movementId: odeme.id, documentId: belge.document.id })).toEqual({ status: 'ok' });
    expect((await listOpenDocuments(db)).find((doc) => doc.id === belge.document.id)?.balance.openAmountCents).toBe(120_000);
    expect(await removeAllocation(db, { movementId: odeme.id, documentId: belge.document.id })).toEqual({ status: 'invalid', reason: 'not_found' });

    const giris = await movements().insert({ accountId: bankAccount, direction: 'in', amountCents: 1000, type: 'misc' });
    expect(await allocateToDocument(db, { movementId: giris.id, documentId: belge.document.id })).toEqual({ status: 'invalid', reason: 'direction_mismatch' });
  });

  it('kırılımın toplamı belgenin tutarıdır; tür yönüne uymalı; cari ve tedarikçi birlikte olmaz; etiket sözlükten', async () => {
    expect(await createMoneyDocument(db, { kind: 'receipt', issuedOn: '2026-09-02', direction: 'out', amountCents: 1200, vatLines: KDV_10_EUR })).toEqual({
      status: 'invalid',
      reason: 'vat_total_mismatch',
    });
    expect(await createMoneyDocument(db, { kind: 'receipt', issuedOn: '2026-09-02', direction: 'in', amountCents: 1000, nature: 'kira' })).toEqual({
      status: 'invalid',
      reason: 'nature_direction',
    });
    expect(
      await createMoneyDocument(db, {
        kind: 'receipt', issuedOn: '2026-09-02', direction: 'out', amountCents: 1000, vatLines: KDV_10_EUR,
        counterpartyId: '00000000-0000-0000-0000-000000000001', supplierId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toEqual({ status: 'invalid', reason: 'party_conflict' });
    expect(
      await createMoneyDocument(db, { kind: 'receipt', issuedOn: '2026-09-02', direction: 'out', amountCents: 1000, vatLines: KDV_10_EUR, tags: ['yok-boyle-etiket'] }),
    ).toEqual({
      status: 'invalid',
      reason: 'unknown_tag',
    });
  });

  it('dosya anahtarı yalnız o belgenin klasöründen bağlanır', async () => {
    const belge = await createMoneyDocument(db, {
      kind: 'payslip',
      business: 'lezzet',
      issuedOn: '2026-09-03',
      direction: 'out',
      amountCents: 200_000,
    });
    expect(belge.status).toBe('ok');
    if (belge.status !== 'ok') return;
    createdDocuments.push(belge.document.id);

    // Başka belgenin (ya da kovanın başka köşesinin) anahtarı bu belgeye yazılamaz.
    expect(await attachDocumentFile(db, { documentId: belge.document.id, key: `finance/documents/${stamp}/belge.pdf` })).toEqual({
      status: 'invalid',
      reason: 'wrong_key',
    });
    expect(await attachDocumentFile(db, { documentId: belge.document.id, key: 'support/tickets/x/y.jpg' })).toMatchObject({ status: 'invalid' });

    const bagli = await attachDocumentFile(db, { documentId: belge.document.id, key: `finance/documents/${belge.document.id}/belge.pdf` });
    expect(bagli.status).toBe('ok');
    if (bagli.status !== 'ok') return;
    expect(bagli.document.fileKey).toBe(`finance/documents/${belge.document.id}/belge.pdf`);
  });

  it('sipariş bağıyla doğan tahsilat izahlıdır — tür beklemez', async () => {
    // Var olan bir siparişe bağlı yazım: seed'in siparişlerinden biri. Sipariş yoksa test anlamsız, atla.
    const { data } = await db.from('order').select('id').neq('status', 'draft').limit(1).maybeSingle();
    if (!data) return;
    const sonuc = await recordOrderPayment(db, {
      orderId: (data as { id: string }).id,
      accountId: bankAccount,
      amountCents: 1,
      method: 'bank_transfer',
      description: 'izah testi',
      source: 'system',
      idempotencyKey: `izah-${stamp}`,
    });
    expect(sonuc.status).toBe('ok');
    const satir = (await movements().listByOrder((data as { id: string }).id)).find((m) => m.idempotencyKey === `izah-${stamp}`);
    expect(satir).toMatchObject({ explained: true, source: 'system', nature: null, tags: [] });
  });
});

describe('belgenin işi', () => {
  const entry = { kind: 'invoice' as const, issuedOn: '2026-09-12', direction: 'out' as const, amountCents: 1000, vatLines: KDV_10_EUR };
  const parties = { supplierIds: [] as string[], warehouseIds: [] as string[] };

  afterAll(async () => {
    await purgeTestData(db, parties);
  });

  const created = (outcome: Awaited<ReturnType<typeof createMoneyDocument>>) => {
    if (outcome.status === 'ok') createdDocuments.push(outcome.document.id);
    return outcome;
  };

  it('seçim yoksa tedarikçinin ya da carinin varsayılanı; açık seçim varsayılanı ezer; hiçbiri iş söylemiyorsa belge yazılmaz', async () => {
    const supplier = await new SupplierService(db).insert({ name: `İş tedarikçisi ${stamp}`, defaultBusiness: 'qualite' });
    parties.supplierIds.push(supplier.id);
    expect(created(await createMoneyDocument(db, { ...entry, supplierId: supplier.id }))).toMatchObject({
      status: 'ok',
      document: { business: 'qualite' },
    });
    expect(created(await createMoneyDocument(db, { ...entry, supplierId: supplier.id, business: 'lezzet' }))).toMatchObject({
      status: 'ok',
      document: { business: 'lezzet' },
    });

    const counterparty = await new CounterpartyService(db).insert({ name: `İşsiz cari ${stamp}` });
    createdCounterparties.push(counterparty.id);
    expect(await createMoneyDocument(db, { ...entry, counterpartyId: counterparty.id })).toEqual({
      status: 'invalid',
      reason: 'business_required',
    });
  });

  it('cari ve tedarikçi kapısının yazdığı varsayılan iş belge girişinde kullanılır; kaldırılınca belge iş ister', async () => {
    const counterparty = await addCounterparty(db, { name: `İşli cari ${stamp}`, kind: 'service', defaultBusiness: 'qualite' });
    if (counterparty.status !== 'ok') throw new Error('cari açılamadı');
    createdCounterparties.push(counterparty.counterparty.id);
    expect(created(await createMoneyDocument(db, { ...entry, counterpartyId: counterparty.counterparty.id }))).toMatchObject({
      status: 'ok',
      document: { business: 'qualite' },
    });
    await updateCounterparty(db, counterparty.counterparty.id, { defaultBusiness: null });
    expect(await createMoneyDocument(db, { ...entry, counterpartyId: counterparty.counterparty.id })).toEqual({
      status: 'invalid',
      reason: 'business_required',
    });

    const supplier = await new SupplierService(db).insert(
      supplierRowOf({ name: `Kapı tedarikçisi ${stamp}`, defaultBusiness: 'qualite', isActive: true }),
    );
    parties.supplierIds.push(supplier.id);
    expect(created(await createMoneyDocument(db, { ...entry, supplierId: supplier.id }))).toMatchObject({
      status: 'ok',
      document: { business: 'qualite' },
    });
  });

  it('mal kabule bağlı belge deponun işini alır; depoyla çelişen seçim reddedilir', async () => {
    const warehouse = await createTestWarehouse(db);
    parties.warehouseIds.push(warehouse.id);
    await new WarehouseService(db).update({ id: warehouse.id, business: 'qualite' });
    const supplier = await new SupplierService(db).insert({ name: `Kabul tedarikçisi ${stamp}`, defaultBusiness: 'lezzet' });
    parties.supplierIds.push(supplier.id);
    const intakes = new StockIntakeService(db);
    const intake = await intakes.insert({ supplierId: supplier.id, warehouseId: warehouse.id });
    expect(created(await createMoneyDocument(db, { ...entry, supplierId: supplier.id, stockIntakeId: intake.id }))).toMatchObject({
      status: 'ok',
      document: { business: 'qualite' },
    });

    const other = await intakes.insert({ supplierId: supplier.id, warehouseId: warehouse.id });
    expect(await createMoneyDocument(db, { ...entry, supplierId: supplier.id, stockIntakeId: other.id, business: 'lezzet' })).toEqual({
      status: 'invalid',
      reason: 'business_stock_mismatch',
    });
  });

  it('tedarik siparişine bağlı belge siparişin işini alır; siparişle çelişen seçim reddedilir', async () => {
    const supplier = await new SupplierService(db).insert({ name: `Sipariş belgesi tedarikçisi ${stamp}`, defaultBusiness: 'lezzet' });
    parties.supplierIds.push(supplier.id);
    const orders = new PurchaseOrderService(db);
    const order = await orders.insert({ supplierId: supplier.id, business: 'qualite' });
    expect(created(await createMoneyDocument(db, { ...entry, supplierId: supplier.id, purchaseOrderId: order.id }))).toMatchObject({
      status: 'ok',
      document: { business: 'qualite' },
    });

    const other = await orders.insert({ supplierId: supplier.id, business: 'qualite' });
    expect(await createMoneyDocument(db, { ...entry, supplierId: supplier.id, purchaseOrderId: other.id, business: 'lezzet' })).toEqual({
      status: 'invalid',
      reason: 'business_stock_mismatch',
    });
  });

  it('bir ödeme iki işin belgesini kapatamaz; kapı veritabanı hatası yerine okunur ret döner', async () => {
    const payment = await movements().insert({
      accountId: bankAccount,
      direction: 'out',
      amountCents: 2000,
      type: 'expense',
      description: 'iki iş',
    });
    const documents = new MoneyDocumentService(db);
    const lezzet = await documents.insert({ ...entry, business: 'lezzet' });
    const qualite = await documents.insert({ ...entry, business: 'qualite' });
    createdDocuments.push(lezzet.id, qualite.id);

    expect(await allocateToDocument(db, { movementId: payment.id, documentId: lezzet.id })).toMatchObject({ status: 'ok' });
    expect(await allocateToDocument(db, { movementId: payment.id, documentId: qualite.id })).toEqual({
      status: 'invalid',
      reason: 'business_mismatch',
    });
  });
});
