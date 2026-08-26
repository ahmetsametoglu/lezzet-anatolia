import { describe, expect, it } from 'vitest';
import { countsAsLoss, isCountDiff, hasLeftShelf, lossPercent } from './history';

/**
 * **Fire denkleminin iki dışlaması** — ikisi de ölçülmüş birer arızanın karşılığı ve ikisi de
 * sessizce yanlış olurdu.
 *
 * `return_restock` (15.08): iade stoğa dönünce fiili stok artıyor VE aynı adet `order_item_batch`ten
 * düşülüyor, yani `deliveredQty` zaten net. Restoku fireye de katmak aynı iadeyi iki kez saydırdı
 * (kullanıcı ekran görüntüsü: `120 − 3 − (−1) = 118` ama elde 117).
 *
 * `count_diff` (26.08): iki yönlü olduğu için fire oranını EKSİYE düşürüyordu — `%−2,1`. Ölçüm
 * doğruydu (net kayıp gerçekten negatif) ama "FİRE" başlığı altında eksi bir yüzde okunmuyordu.
 */
describe('fire denklemi — hangi sebep fire sayılır', () => {
  it('GERÇEK kayıplar fireye girer: imha · hasar · kayıp', () => {
    expect(countsAsLoss('expired')).toBe(true);
    expect(countsAsLoss('damaged')).toBe(true);
    expect(countsAsLoss('lost')).toBe(true);
  });

  it('İADE RESTOKU fire DEĞİL — karşı kaydı `order_item_batch`te düşülmüş', () => {
    expect(countsAsLoss('return_restock')).toBe(false);
  });

  it('SAYIM FARKI fire DEĞİL — iki yönlü, kendi satırında gösterilir', () => {
    expect(countsAsLoss('count_diff')).toBe(false);
    expect(isCountDiff('count_diff')).toBe(true);
  });

  it('`isCountDiff` yalnız sayım farkını tanır — iade de fire sayılmaz ama kendi satırı zaten var', () => {
    expect(isCountDiff('return_restock')).toBe(false);
    expect(isCountDiff('expired')).toBe(false);
  });
});

describe('fire oranı', () => {
  it('girene oranlanır ve yüzde döner', () => {
    expect(lossPercent(5, 100)).toBe(5);
  });

  /** Ölçülemeyen değer SIFIR DEĞİL (`CLAUDE §1`): hiç giriş yoksa oran hesaplanamaz. */
  it('giriş yoksa oran `null` — sıfır, "fire yok" demek olurdu', () => {
    expect(lossPercent(0, 0)).toBeNull();
    expect(lossPercent(3, 0)).toBeNull();
  });
});

describe('mal raftan ayrıldı mı', () => {
  it('teslim edilmiş ve sonrası ayrılmış sayılır', () => {
    expect(hasLeftShelf('delivered')).toBe(true);
    expect(hasLeftShelf('completed')).toBe(true);
    expect(hasLeftShelf('returned')).toBe(true);
  });

  /** Hazırlanan mal HÂLÂ depoda: stok teslimde düşüyor (`deliver_order`), hazırlıkta değil. */
  it('hazırlanan mal ayrılmamıştır — stok teslimde düşer', () => {
    expect(hasLeftShelf('ready')).toBe(false);
    expect(hasLeftShelf('preparing')).toBe(false);
    expect(hasLeftShelf('out_for_delivery')).toBe(false);
  });
});
