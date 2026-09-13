import { describe, expect, it } from 'vitest';
import type { MoneyMovement } from '@lezzet/types';
import { buildMovementExport, buildMovementRow, type MovementExportDocument, type MovementExportInput } from './movement-export';

// Hareket dökümü (12.15 · 13.09) — saf: satır kurma ve özet. Okuma katmanı web'in entegrasyon testinde.

const movement = (over: Partial<MoneyMovement> = {}): MoneyMovement => ({
  id: 'm1',
  accountId: 'a1',
  direction: 'out',
  amountCents: 118_000,
  type: 'expense',
  nature: 'sosyal-guvenlik',
  counterpartyId: null,
  tags: [],
  meta: null,
  counterAccountId: null,
  orderId: null,
  stockIntakeId: null,
  supplierId: null,
  valueDate: '2026-09-05',
  description: 'URSSAF',
  source: 'manual',
  reconciled: false,
  explained: true,
  importFingerprint: null,
  idempotencyKey: null,
  bankImportId: null,
  counterpartMovementId: null,
  createdAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

const input = (over: Partial<MovementExportInput> = {}): MovementExportInput => ({
  movement: movement(),
  accountName: 'Crédit Mutuel',
  counterAccountName: null,
  natureLabel: 'Sosyal güvenlik',
  accountCode: '645',
  tagLabels: [],
  documents: [],
  orderReference: null,
  supplierName: null,
  counterpartyName: null,
  ...over,
});

const document = (over: Partial<MovementExportDocument> = {}): MovementExportDocument => ({
  kind: 'invoice',
  number: 'LOYER-2026-09',
  issuedOn: '2026-09-01',
  counterpartyName: 'SCI Rhin Immobilier',
  amountCents: 145_000,
  vatAmountCents: 0,
  ...over,
});

describe('döküm satırı', () => {
  it('çıkış eksi, giriş artı yazılır; tür okunur adıyla ve hesap koduyla, etiketler ayrı sütunda', () => {
    expect(buildMovementRow(input({ tagLabels: ['Ortak A aracı'] }))).toMatchObject({
      amount: -1180, nature: 'Sosyal güvenlik', accountCode: '645', tags: 'Ortak A aracı', account: 'Crédit Mutuel', counterparty: null,
    });
    expect(buildMovementRow(input({ movement: movement({ direction: 'in', type: 'capital', amountCents: 500_000 }) })).amount).toBe(5000);
    // Türü konmamış satırda kod UYDURULMAZ: iki sütun da boş.
    expect(buildMovementRow(input({ natureLabel: null, accountCode: null }))).toMatchObject({ nature: null, accountCode: null });
  });

  it('belge varsa türü, numarası, tarihi, toplamı ve KDV\'si satıra gelir; karşı taraf belgeninki', () => {
    const row = buildMovementRow(input({ movement: movement({ amountCents: 70_000 }), supplierName: 'Yanlış tedarikçi', documents: [document()] }));
    expect(row).toMatchObject({
      amount: -700, documentKind: 'invoice', documentNo: 'LOYER-2026-09', documentDate: '2026-09-01', documentTotal: 1450, documentVat: 0,
      counterparty: 'SCI Rhin Immobilier',
    });
  });

  it('TEK HAVALE, İKİ FATURA (13.09): numaralar yan yana, toplamlar toplanır, tarih ilk belgenin', () => {
    const row = buildMovementRow(
      input({
        documents: [
          document({ number: 'FA-2', issuedOn: '2026-09-04', amountCents: 20_000, vatAmountCents: null }),
          document({ number: 'FA-1', issuedOn: '2026-09-02', amountCents: 30_000, vatAmountCents: 5000 }),
        ],
      }),
    );
    expect(row).toMatchObject({ documentNo: 'FA-1; FA-2', documentDate: '2026-09-02', documentTotal: 500, documentVat: 50 });
    // Hiçbir belgede KDV yazmıyorsa `null` kalır — sıfır "KDV yok" demek olurdu, o başka bir cümle.
    expect(buildMovementRow(input({ documents: [document({ number: null, kind: 'receipt', vatAmountCents: null })] })).documentVat).toBeNull();
  });

  it('karşı taraf sırası: cari → belge → tedarikçi → sipariş → karşı hesap', () => {
    expect(buildMovementRow(input({ counterpartyName: 'URSSAF', documents: [document()], supplierName: 'Anadolu Gıda' })).counterparty).toBe('URSSAF');
    expect(buildMovementRow(input({ supplierName: 'Anadolu Gıda', orderReference: 'LA-1' })).counterparty).toBe('Anadolu Gıda');
    expect(buildMovementRow(input({ orderReference: 'LA-26-7K4M2P', counterAccountName: 'Kasa' })).counterparty).toBe('Sipariş LA-26-7K4M2P');
    expect(buildMovementRow(input({ movement: movement({ type: 'transfer', counterAccountId: 'a2' }), counterAccountName: 'Kasa' })).counterparty).toBe('Kasa');
  });
});

describe('döküm özeti', () => {
  it('tarih sırası, tipe göre toplam, izahsız sayısı — özet satırlardan türer', () => {
    const data = buildMovementExport({ from: '2026-09-01', to: '2026-09-30' }, [
      // Aynı günde KAYIT sırası belirler: `c` sabah, `b` öğlen yazıldı.
      input({
        movement: movement({ id: 'b', valueDate: '2026-09-10', direction: 'in', type: 'order_payment', nature: null, amountCents: 4590, explained: true, createdAt: '2026-09-10T12:00:00.000Z' }),
        natureLabel: null,
        accountCode: null,
      }),
      input({ movement: movement({ id: 'a', valueDate: '2026-09-05' }) }),
      input({
        movement: movement({ id: 'c', valueDate: '2026-09-10', type: 'misc', nature: null, amountCents: 450, explained: false, createdAt: '2026-09-10T09:00:00.000Z' }),
        natureLabel: null,
        accountCode: null,
      }),
    ]);

    expect(data.rows.map((row) => row.movementId)).toEqual(['a', 'c', 'b']);
    expect(data.summary).toMatchObject({ movementCount: 3, in: 45.9, out: 1184.5, unexplainedCount: 1 });
    expect(data.summary.byType).toEqual(
      expect.arrayContaining([
        { type: 'expense', count: 1, in: 0, out: 1180 },
        { type: 'order_payment', count: 1, in: 45.9, out: 0 },
        { type: 'misc', count: 1, in: 0, out: 4.5 },
      ]),
    );
  });
});
