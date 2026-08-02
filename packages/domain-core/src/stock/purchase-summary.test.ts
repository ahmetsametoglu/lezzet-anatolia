import { describe, expect, it } from 'vitest';
import { summarizePurchaseOrder, type PurchaseOrderRowInput } from './purchase-summary';

/** Kısa kurucu — testin gövdesi kuruluma değil iddiaya ayrılsın. */
const kalem = (
  qty: number,
  unitPrice: number | null,
  batches: Array<[qty: number, code: string | null]> = [],
): PurchaseOrderRowInput['items'][number] => ({
  qty,
  unitPrice,
  batches: batches.map(([q, code]) => ({
    initialQty: q,
    warehouse: code ? { id: `w-${code}`, code } : null,
  })),
});

describe('tedarik siparişi özeti', () => {
  it('tutar CENT döner — kuruş kayan noktada kaçar', () => {
    // 3 × 6,45 € = 19,35 €. Euro'da toplansaydı 19.349999999999998 çıkabilirdi.
    const özet = summarizePurchaseOrder({ items: [kalem(3, 6.45)] });
    expect(özet.totalCents).toBe(1935);
  });

  it('fiyatsız kalem SAYILIR — tutarın eksik olduğu söylenebilsin', () => {
    const özet = summarizePurchaseOrder({ items: [kalem(2, 5), kalem(4, null)] });
    expect(özet).toMatchObject({ totalCents: 1000, missingPriceCount: 1, itemCount: 2 });
    // Eksik ölçümü tam gibi göstermek bozuk sayıyı sağlıklı gibi okutur; ekran "≈" diyebilmeli.
  });

  it('tamamlanan kalem ISMARLANAN adede göre sayılır', () => {
    const özet = summarizePurchaseOrder({
      items: [kalem(10, 1, [[10, 'STR']]), kalem(10, 1, [[4, 'STR']])],
    });
    expect(özet).toMatchObject({ itemCount: 2, receivedItemCount: 1 });
  });

  it('FAZLA gelen kalem eksik sayılmaz — ölçüt >=', () => {
    // Tedarikçi ikram/ikame göndermiş olabilir; fark ayrıca raporlanıyor, burada soru
    // "beklemeye devam ediyor muyuz".
    const özet = summarizePurchaseOrder({ items: [kalem(10, 1, [[12, 'STR']])] });
    expect(özet.receivedItemCount).toBe(1);
  });

  it('parça parça kabul TOPLANIR — tek kalem birden çok partiyle gelebilir', () => {
    const özet = summarizePurchaseOrder({ items: [kalem(10, 1, [[6, 'STR'], [4, 'STR']])] });
    expect(özet.receivedItemCount).toBe(1);
    expect(özet.byWarehouse).toEqual([{ warehouseId: 'w-STR', code: 'STR', qty: 10 }]);
  });

  it('depo kırılımı ÇOKTAN AZA sıralanır — sıra kararlı olmalı', () => {
    // Aynı sipariş her yenilemede aynı sırayla görünmeli; aksi hâlde ekran "değişti" gibi okunur.
    const özet = summarizePurchaseOrder({
      items: [kalem(12, 2, [[2, 'COL'], [6, 'STR']]), kalem(8, 2, [[4, 'KEHL']])],
    });
    expect(özet.byWarehouse).toEqual([
      { warehouseId: 'w-STR', code: 'STR', qty: 6 },
      { warehouseId: 'w-KEHL', code: 'KEHL', qty: 4 },
      { warehouseId: 'w-COL', code: 'COL', qty: 2 },
    ]);
  });

  it('hiç kabul edilmemiş sipariş boş kırılım verir — sıfır değil YOK', () => {
    const özet = summarizePurchaseOrder({ items: [kalem(5, 3)] });
    expect(özet).toMatchObject({ receivedItemCount: 0, byWarehouse: [] });
  });

  it('kalemsiz sipariş çökmez', () => {
    expect(summarizePurchaseOrder({ items: [] })).toEqual({
      itemCount: 0,
      receivedItemCount: 0,
      totalCents: 0,
      missingPriceCount: 0,
      byWarehouse: [],
    });
  });
});
