import { describe, expect, it } from 'vitest';
import { transferDecision, type TransferBatchInput } from './transfer';

/**
 * Transfer önerisi (19.3) — DOMAIN §17 / C9.
 *
 * İki kural sınanıyor: **söz verilmiş mal önerilmez** (ölçü fiili değil kullanılabilir) ve
 * **yolda ömür yanmaz** (hedefe varmadan tarihi geçecek parti önerilmez — ama engellenmez,
 * uyarılır; karar operatörün).
 */

const TODAY = '2026-08-01';

const batch = (over: Partial<TransferBatchInput> = {}): TransferBatchInput => ({
  stockId: 's-1',
  variantId: 'v-1',
  expiryDate: '2026-12-01',
  physicalQty: 10,
  ...over,
});

describe('kullanılabilir tavanı', () => {
  it('önerilen miktar kullanılabiliri AŞAMAZ — rezerve mal yola çıkmaz', () => {
    const sonuc = transferDecision({
      batches: [batch({ physicalQty: 10 })],
      wantedQty: 8,
      availableQty: 3, // 7 adet müşterilere ayrılmış
      transitDays: 2,
      today: TODAY,
    });
    expect(sonuc.suggestedQty).toBe(3);
    expect(sonuc.shortReason).toBe('insufficient_available');
  });

  it('kullanılabilir sıfırsa hiç öneri yoktur', () => {
    const sonuc = transferDecision({ batches: [batch()], wantedQty: 5, availableQty: 0, transitDays: 2, today: TODAY });
    expect(sonuc.lines).toHaveLength(0);
    expect(sonuc.shortReason).toBe('insufficient_available');
  });

  it('partiye ÇIPALI rezervasyon o partiden düşülür (teklife söz verilmiş stok)', () => {
    const sonuc = transferDecision({
      batches: [batch({ physicalQty: 10, pinnedReservedQty: 8 })],
      wantedQty: 5,
      availableQty: 10,
      transitDays: 2,
      today: TODAY,
    });
    // Partide 10 var ama 8'i teklife çıpalı: yalnız 2 sevk edilebilir.
    expect(sonuc.suggestedQty).toBe(2);
  });
});

describe('FEFO — ama yolda bozulmayacak şekilde', () => {
  it('önce süresi dolan parti önerilir', () => {
    const sonuc = transferDecision({
      batches: [
        batch({ stockId: 'gec', expiryDate: '2026-12-01', physicalQty: 5 }),
        batch({ stockId: 'erken', expiryDate: '2026-09-01', physicalQty: 5 }),
      ],
      wantedQty: 5,
      availableQty: 10,
      transitDays: 2,
      today: TODAY,
    });
    expect(sonuc.lines[0]!.stockId).toBe('erken');
  });

  it('ulaşım süresi kadar ömrü kalmayan parti ÖNCE önerilmez — yolda ömür yanar', () => {
    const sonuc = transferDecision({
      batches: [
        batch({ stockId: 'yolda-biter', expiryDate: '2026-08-02', physicalQty: 5 }), // yarın
        batch({ stockId: 'saglam', expiryDate: '2026-11-01', physicalQty: 5 }),
      ],
      wantedQty: 5,
      availableQty: 10,
      transitDays: 3,
      today: TODAY,
    });
    // FEFO körü körüne uygulansaydı 'yolda-biter' ilk sırada olurdu.
    expect(sonuc.lines[0]!.stockId).toBe('saglam');
    expect(sonuc.lines[0]!.arrivesNearExpiry).toBe(false);
  });

  it('başka parti kalmazsa kısa ömürlü UYARIYLA önerilir — engel değil', () => {
    const sonuc = transferDecision({
      batches: [batch({ stockId: 'yolda-biter', expiryDate: '2026-08-02', physicalQty: 5 })],
      wantedQty: 4,
      availableQty: 5,
      transitDays: 3,
      today: TODAY,
    });
    // Hiç öneri vermemek operatörü listeyi elle taramaya bırakırdı; uyarı verip kararı ona bırakıyoruz.
    expect(sonuc.lines).toHaveLength(1);
    expect(sonuc.lines[0]!.arrivesNearExpiry).toBe(true);
    expect(sonuc.suggestedQty).toBe(4);
    expect(sonuc.shortReason).toBe('none');
  });

  it('birden çok partiden toplayarak istenen miktarı tamamlar', () => {
    const sonuc = transferDecision({
      batches: [
        batch({ stockId: 'a', expiryDate: '2026-09-01', physicalQty: 3 }),
        batch({ stockId: 'b', expiryDate: '2026-10-01', physicalQty: 4 }),
      ],
      wantedQty: 6,
      availableQty: 7,
      transitDays: 2,
      today: TODAY,
    });
    expect(sonuc.lines.map((l) => [l.stockId, l.qty])).toEqual([['a', 3], ['b', 3]]);
    expect(sonuc.suggestedQty).toBe(6);
  });
});
