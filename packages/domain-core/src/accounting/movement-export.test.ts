import { describe, expect, it } from 'vitest';
import type { MoneyMovement } from '@lezzet/types';
import { buildMovementExport, buildMovementRow, type MovementExportInput } from './movement-export';

// Hareket dökümü (12.15) — saf: satır kurma ve özet. Okuma katmanı web'in entegrasyon testinde.

const movement = (over: Partial<MoneyMovement> = {}): MoneyMovement => ({
  id: 'm1',
  accountId: 'a1',
  direction: 'out',
  amountCents: 118_000,
  type: 'expense',
  tags: ['bordro-kesinti'],
  documentId: null,
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
  tagLabels: ['Bordro kesintisi'],
  document: null,
  orderReference: null,
  supplierName: null,
  ...over,
});

describe('döküm satırı', () => {
  it('çıkış eksi, giriş artı yazılır; etiketler okunur adla', () => {
    expect(buildMovementRow(input())).toMatchObject({ amount: -1180, tags: 'Bordro kesintisi', account: 'Crédit Mutuel', counterparty: null });
    expect(buildMovementRow(input({ movement: movement({ direction: 'in', type: 'capital', amountCents: 500_000 }) })).amount).toBe(5000);
  });

  it('belge varsa türü, numarası, tarihi, toplamı ve KDV\'si satıra gelir; karşı taraf belgeninki', () => {
    const row = buildMovementRow(
      input({
        movement: movement({ amountCents: 70_000, tags: ['kira'] }),
        tagLabels: ['Kira'],
        supplierName: 'Yanlış tedarikçi',
        document: { kind: 'invoice', number: 'LOYER-2026-09', issuedOn: '2026-09-01', counterparty: 'SCI Rhin Immobilier', amountCents: 145_000, vatAmountCents: 0 },
      }),
    );
    expect(row).toMatchObject({
      amount: -700, documentKind: 'invoice', documentNo: 'LOYER-2026-09', documentDate: '2026-09-01', documentTotal: 1450, documentVat: 0,
      counterparty: 'SCI Rhin Immobilier',
    });
  });

  it('karşı taraf sırası: belge → tedarikçi → sipariş → karşı hesap', () => {
    expect(buildMovementRow(input({ supplierName: 'Anadolu Gıda', orderReference: 'LA-1' })).counterparty).toBe('Anadolu Gıda');
    expect(buildMovementRow(input({ orderReference: 'LA-26-7K4M2P', counterAccountName: 'Kasa' })).counterparty).toBe('Sipariş LA-26-7K4M2P');
    expect(buildMovementRow(input({ movement: movement({ type: 'transfer', counterAccountId: 'a2' }), counterAccountName: 'Kasa' })).counterparty).toBe('Kasa');
    // Belgede KDV yazmıyorsa `null` kalır — sıfır "KDV yok" demek olurdu, o başka bir cümle.
    expect(buildMovementRow(input({ document: { kind: 'receipt', number: null, issuedOn: '2026-09-02', counterparty: null, amountCents: 1000, vatAmountCents: null } })).documentVat).toBeNull();
  });
});

describe('döküm özeti', () => {
  it('tarih sırası, tipe göre toplam, izahsız sayısı — özet satırlardan türer', () => {
    const data = buildMovementExport({ from: '2026-09-01', to: '2026-09-30' }, [
      // Aynı günde KAYIT sırası belirler: `c` sabah, `b` öğlen yazıldı.
      input({
        movement: movement({ id: 'b', valueDate: '2026-09-10', direction: 'in', type: 'order_payment', amountCents: 4590, tags: [], explained: true, createdAt: '2026-09-10T12:00:00.000Z' }),
        tagLabels: [],
      }),
      input({ movement: movement({ id: 'a', valueDate: '2026-09-05' }) }),
      input({ movement: movement({ id: 'c', valueDate: '2026-09-10', type: 'misc', amountCents: 450, tags: [], explained: false, createdAt: '2026-09-10T09:00:00.000Z' }), tagLabels: [] }),
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
