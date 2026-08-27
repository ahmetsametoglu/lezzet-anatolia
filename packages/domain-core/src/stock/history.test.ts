import { describe, expect, it } from 'vitest';
import { countsAsLoss, isCountDiff, lossPercent } from './history';

/**
 * **Fire artık bir DIŞLAMA değil, bir TANIM** (06.14).
 *
 * Bu testler eskiden iki ölçülmüş arızayı koruyordu ve ikisi de aynı kökten geliyordu: tek bir
 * `stock_adjustment.reason` enumu birbirinden farklı üç olayı taşıyordu, o yüzden "fire nedir"
 * sorusu ancak ELEYEREK cevaplanabiliyordu.
 *   · `return_restock` (15.08) — iade stoğa dönünce aynı adet `order_item_batch`ten de düşüyordu;
 *     fireye de katmak aynı iadeyi iki kez saydırdı (`120 − 3 − (−1) = 118` ama elde 117).
 *   · `count_diff` (26.08) — iki yönlü olduğu için fire oranını EKSİYE düşürüyordu (`%−2,1`).
 *
 * Defterde üçü üç ayrı `kind`. Testler duruyor çünkü koruduğu davranış aynı; değişen, o davranışın
 * artık bir telafi değil verinin kendi ayrımı olması.
 */
describe('fire — hangi hareket tipi fire sayılır', () => {
  it('İMHA fireye girer — sebebi (DLC · hasar · kayıp) tipin İÇİNDE', () => {
    expect(countsAsLoss('write_off')).toBe(true);
  });

  it('İADE RESTOKU fire DEĞİL — karşı kaydı `order_item_batch`te düşülmüş', () => {
    expect(countsAsLoss('return_restock')).toBe(false);
  });

  it('SAYIM FARKI fire DEĞİL — iki yönlü, kendi satırında gösterilir', () => {
    expect(countsAsLoss('count_diff')).toBe(false);
    expect(isCountDiff('count_diff')).toBe(true);
  });

  /**
   * **SATIŞ VE SEVK DE FİRE DEĞİL** — defterle birlikte doğan yeni koruma.
   *
   * Eski enumda bu tipler HİÇ YOKTU (tablo yalnız "satış dışı" azalışları tutuyordu), yani soru
   * sorulamıyordu bile. Artık aynı defterde duruyorlar ve fire toplamına sızmaları mümkün bir hata:
   * sızsalardı satılan malın maliyeti hem COGS'ta hem fire raporunda iki kez düşülürdü.
   */
  it('SATIŞ · KAPI SATIŞI · SEVK fire DEĞİL — maliyetleri kârda zaten var', () => {
    expect(countsAsLoss('sale')).toBe(false);
    expect(countsAsLoss('counter_sale')).toBe(false);
    expect(countsAsLoss('transfer_out')).toBe(false);
  });

  it('GİRİŞLER fire DEĞİL', () => {
    expect(countsAsLoss('intake')).toBe(false);
    expect(countsAsLoss('transfer_in')).toBe(false);
    expect(countsAsLoss('transfer_cancel')).toBe(false);
  });

  it('`isCountDiff` yalnız sayım farkını tanır', () => {
    expect(isCountDiff('return_restock')).toBe(false);
    expect(isCountDiff('write_off')).toBe(false);
    expect(isCountDiff('sale')).toBe(false);
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
