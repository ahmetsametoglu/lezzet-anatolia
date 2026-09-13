import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService, MovementTagService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { attachDocumentFile, createMoneyDocument, listOpenDocuments } from './document';
import { addMovementTag, setMovementTagActive, tagMovement } from './tags';
import { recordOrderPayment } from '../order/payment';

/*
  BELGE + ETİKET KAPILARI (12.12) — entegrasyon: gerçek tetikleyici, gerçek görünüm.

  Sınananlar kural katmanıdır, ekran değil: belge açık kalanı bağlı hareketlerden türer; sözlükte
  olmayan etiket iki kapıdan da (uygulama + veritabanı) geçemez; etiket gelince hareket izahlı olur.
  `recordOrderPayment` burada yalnız "izahlı doğan satır" örneği için (sipariş bağı).
*/

const db = serviceDb();
const stamp = Date.now();
const createdAccounts: string[] = [];
const createdTags: string[] = [];
const createdDocuments: string[] = [];
let bankAccount: string;

beforeAll(async () => {
  const account = await new AccountService(db).insert({ name: `Belge testi ${stamp}`, type: 'bank' });
  bankAccount = account.id;
  createdAccounts.push(account.id);
});

afterAll(async () => {
  // Silme SIRASI tek yerde (`cleanup.ts`): hareket → hesap → belge → etiket. Elle silme yok (CLAUDE §4b).
  await purgeTestData(db, { accountIds: createdAccounts, documentIds: createdDocuments, tagSlugs: createdTags });
});

describe('etiket sözlüğü', () => {
  it('okunur addan slug üretir, ortak etiketi ön ek alır, aynı ad ikinci kez girmez', async () => {
    const eklenen = await addMovementTag(db, { label: `Sigorta ${stamp}` });
    expect(eklenen.status).toBe('ok');
    if (eklenen.status !== 'ok') return;
    createdTags.push(eklenen.tag.slug);
    expect(eklenen.tag.slug).toBe(`sigorta-${stamp}`);

    const ortak = await addMovementTag(db, { label: `Test${stamp}`, partner: true });
    expect(ortak.status).toBe('ok');
    if (ortak.status !== 'ok') return;
    createdTags.push(ortak.tag.slug);
    expect(ortak.tag).toMatchObject({ slug: `ortak:test${stamp}`, label: `Ortak Test${stamp}` });

    expect(await addMovementTag(db, { label: `sigorta ${stamp}` })).toEqual({ status: 'invalid', reason: 'exists' });
    expect(await addMovementTag(db, { label: '   ' })).toEqual({ status: 'invalid', reason: 'bad_label' });
  });

  it('pasif etiket yeni harekete verilmez, eski harekette kalır', async () => {
    const slug = `gecici-${stamp}`;
    const eklenen = await addMovementTag(db, { label: `Gecici ${stamp}` });
    expect(eklenen.status).toBe('ok');
    createdTags.push(slug);

    const hareket = await new MoneyMovementService(db).insert({ accountId: bankAccount, direction: 'out', amountCents: 500, type: 'expense', tags: [slug] });
    expect(hareket.explained).toBe(true);

    expect(await setMovementTagActive(db, slug, false)).toMatchObject({ status: 'ok', tag: { isActive: false } });
    // Yeni kayıt pasif etiketi alamaz (uygulama kapısı okunur retle keser).
    expect(await tagMovement(db, { movementId: hareket.id, tags: [slug] })).toEqual({ status: 'invalid', reason: 'unknown_tag' });
    // Eski hareket etiketi taşımaya devam eder.
    expect((await new MoneyMovementService(db).getById(hareket.id))?.tags).toEqual([slug]);
    expect((await new MovementTagService(db).list()).find((tag) => tag.slug === slug)?.isActive).toBe(false);
  });

  it('bağsız hareket etiket alınca izahlı olur; sözlükte olmayan etiket reddedilir', async () => {
    const hareket = await new MoneyMovementService(db).insert({ accountId: bankAccount, direction: 'out', amountCents: 999, type: 'misc' });
    expect(hareket.explained).toBe(false);

    expect(await tagMovement(db, { movementId: hareket.id, tags: ['uydurma-etiket'] })).toEqual({ status: 'invalid', reason: 'unknown_tag' });

    const sonuc = await tagMovement(db, { movementId: hareket.id, tags: ['banka-masrafi'] });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.movement.explained).toBe(true);
    expect(sonuc.movement.tags).toEqual(['banka-masrafi']);
  });
});

describe('belge', () => {
  it('fatura gelince borç doğar; ödeme belgeye bağlanınca açık kalan düşer ve belge listeden çıkar', async () => {
    const belge = await createMoneyDocument(db, {
      kind: 'invoice',
      number: `FA-${stamp}`,
      issuedOn: '2026-09-01',
      counterparty: 'Test Kiracı',
      direction: 'out',
      amountCents: 120_000,
      vatAmountCents: 20_000,
      tags: ['kira'],
    });
    expect(belge.status).toBe('ok');
    if (belge.status !== 'ok') return;
    createdDocuments.push(belge.document.id);

    const acik = (await listOpenDocuments(db)).find((doc) => doc.id === belge.document.id);
    expect(acik?.balance).toMatchObject({ amountCents: 120_000, settledCents: 0, openAmountCents: 120_000 });

    // Kısmi ödeme: açık kalan düşer ama belge listede kalır.
    const movements = new MoneyMovementService(db);
    await movements.insert({ accountId: bankAccount, direction: 'out', amountCents: 70_000, type: 'expense', tags: ['kira'], documentId: belge.document.id });
    const kismi = (await listOpenDocuments(db)).find((doc) => doc.id === belge.document.id);
    expect(kismi?.balance.openAmountCents).toBe(50_000);

    // Kalan ödenince belge listeden düşer; ters yönlü bağlı hareket (tedarikçi iadesi) yeniden açardı.
    await movements.insert({ accountId: bankAccount, direction: 'out', amountCents: 50_000, type: 'expense', tags: ['kira'], documentId: belge.document.id });
    expect((await listOpenDocuments(db)).some((doc) => doc.id === belge.document.id)).toBe(false);
  });

  it('KDV toplamı aşamaz, etiket sözlükten olmalı', async () => {
    expect(
      await createMoneyDocument(db, { kind: 'receipt', issuedOn: '2026-09-02', direction: 'out', amountCents: 1000, vatAmountCents: 1500 }),
    ).toEqual({ status: 'invalid', reason: 'vat_over_amount' });
    expect(
      await createMoneyDocument(db, { kind: 'receipt', issuedOn: '2026-09-02', direction: 'out', amountCents: 1000, tags: ['yok-boyle-etiket'] }),
    ).toEqual({ status: 'invalid', reason: 'unknown_tag' });
  });

  it('dosya anahtarı yalnız o belgenin klasöründen bağlanır', async () => {
    const belge = await createMoneyDocument(db, { kind: 'payslip', issuedOn: '2026-09-03', counterparty: 'Çalışan', direction: 'out', amountCents: 200_000 });
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

  it('sipariş bağıyla doğan tahsilat izahlıdır — etiket beklemez', async () => {
    // Var olan bir siparişe bağlı yazım: seed'in siparişlerinden biri. Sipariş yoksa test anlamsız, atla.
    const { data } = await db.from('order').select('id').neq('status', 'draft').limit(1).maybeSingle();
    if (!data) return;
    const sonuc = await recordOrderPayment(db, {
      orderId: (data as { id: string }).id,
      accountId: bankAccount,
      amountCents: 1,
      description: 'izah testi',
      source: 'system',
      idempotencyKey: `izah-${stamp}`,
    });
    expect(sonuc.status).toBe('ok');
    const satir = (await new MoneyMovementService(db).listByOrder((data as { id: string }).id)).find((m) => m.idempotencyKey === `izah-${stamp}`);
    expect(satir).toMatchObject({ explained: true, source: 'system', tags: [] });
  });
});
