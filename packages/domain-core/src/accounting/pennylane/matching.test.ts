import { describe, expect, it } from 'vitest';
import { pennylaneMatchPlan, pennylaneMatchReading } from './matching';

describe('Pennylane eşleşme yazımının planı', () => {
  const ours = new Set([11, 12, 13]);

  it('eksik faturamız eklenir; küme tutuyorsa yazım yok', () => {
    expect(pennylaneMatchPlan({ current: [], ours, desired: [11, 12] })).toEqual({ kind: 'add', invoiceIds: [11, 12] });
    expect(pennylaneMatchPlan({ current: [12], ours, desired: [11, 12] })).toEqual({ kind: 'add', invoiceIds: [11] });
    expect(pennylaneMatchPlan({ current: [12, 11], ours, desired: [11, 12] })).toEqual({ kind: 'none' });
  });

  it('bizde olmayan faturanın eşleşmesi korunur: yanına eklenir, çözülmez', () => {
    expect(pennylaneMatchPlan({ current: [90], ours, desired: [11] })).toEqual({ kind: 'add', invoiceIds: [11] });
    expect(pennylaneMatchPlan({ current: [90, 11], ours, desired: [11] })).toEqual({ kind: 'none' });
  });

  it('çıkan faturamız varsa eşleşmeler baştan kurulur; harekette bizde olmayan faturanın eşleşmesi de varsa hareket bekler', () => {
    expect(pennylaneMatchPlan({ current: [11, 12], ours, desired: [12] })).toEqual({ kind: 'rewrite', invoiceIds: [12] });
    expect(pennylaneMatchPlan({ current: [11], ours, desired: [] })).toEqual({ kind: 'rewrite', invoiceIds: [] });
    expect(pennylaneMatchPlan({ current: [11, 90], ours, desired: [] })).toEqual({ kind: 'blocked', reason: 'foreign_matches' });
  });
});

describe("Pennylane'deki eşleşmelerin bizdeki karşılığı", () => {
  const ourDocuments = new Map([
    [11, 'belge-a'],
    [12, 'belge-b'],
  ]);
  const allocation = (id: string, documentId: string, invoiceId: number, removed = false) => ({ id, documentId, invoiceId, removed });

  it("bizim faturamıza Pennylane'de kurulan ama bizde olmayan bağ benimsenir", () => {
    expect(pennylaneMatchReading({ current: [11], ourDocuments, allocations: [] })).toMatchObject({ adopt: ['belge-a'], elsewhere: false });
    expect(pennylaneMatchReading({ current: [11], ourDocuments, allocations: [allocation('bag-a', 'belge-a', 11)] }).adopt).toEqual([]);
  });

  it("bizde duran bağ Pennylane'de çözüldüyse işaretlenir; yeniden kurulunca işaret kalkar", () => {
    expect(pennylaneMatchReading({ current: [], ourDocuments, allocations: [allocation('bag-a', 'belge-a', 11)] })).toMatchObject({
      removed: ['bag-a'],
      restored: [],
    });
    expect(pennylaneMatchReading({ current: [], ourDocuments, allocations: [allocation('bag-a', 'belge-a', 11, true)] }).removed).toEqual(
      [],
    );
    expect(
      pennylaneMatchReading({ current: [11], ourDocuments, allocations: [allocation('bag-a', 'belge-a', 11, true)] }).restored,
    ).toEqual(['bag-a']);
  });

  it('bizde olmayan faturaya eşli hareket işaretlenir, müşteri faturası da olsa', () => {
    expect(pennylaneMatchReading({ current: [90], ourDocuments, allocations: [] }).elsewhere).toBe(true);
    expect(pennylaneMatchReading({ current: [90, 11], ourDocuments, allocations: [] })).toMatchObject({
      elsewhere: true,
      adopt: ['belge-a'],
    });
    expect(pennylaneMatchReading({ current: [], ourDocuments, allocations: [] }).elsewhere).toBe(false);
  });
});
