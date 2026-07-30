import { describe, expect, it } from 'vitest';
import { paymentTiming } from './scorecard';

/**
 * ÖDEME KARNESİNİN ölçümü (09.9) — vade/limit kararının dayandığı sayı.
 *
 * Buradaki her hâl bir yanlış kararı önlüyor. En tehlikelisi ilki: ödemesi hiç olmayan siparişi
 * "0 gün" saymak, karneyi olduğundan İYİ gösterir ve limit yükseltilir. Ekranda fark edilmesi
 * imkânsız — sayı makul görünür, yalnız yanlıştır.
 */
const siparis = (id: string, createdAt: string) => ({ id, createdAt });
const tahsilat = (orderId: string, valueDate: string) => ({ direction: 'in' as const, orderId, valueDate });
/** Vade süresi ölçüme ORTALAMA olarak girmez, yalnız "kaç kez geciktirdi" sayımına girer. */
const VADE = 30;

describe('paymentTiming — ortalama ödeme günü', () => {
  it('tahsilat hiç yoksa null döner — SIFIR DEĞİL', () => {
    // Sıfır "anında ödüyor" diye okunur ve vade kararını tam ters yöne çeker.
    const sonuc = paymentTiming([siparis('o1', '2026-01-01T00:00:00Z')], [], VADE);
    expect(sonuc).toEqual({ avgPaymentDays: null, paidOrderCount: 0, latePaymentCount: 0 });
  });

  it('ödenmemiş sipariş ortalamaya GİRMEZ (0 gün sayılmaz)', () => {
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z'), siparis('o2', '2026-01-01T00:00:00Z')],
      [tahsilat('o1', '2026-01-11T00:00:00Z')],
      VADE,
    );
    // Yalnız ödenen sipariş sayılır: 10 gün. İkincisi 0 sayılsaydı ortalama 5 çıkardı.
    expect(sonuc).toEqual({ avgPaymentDays: 10, paidOrderCount: 1, latePaymentCount: 0 });
  });

  it('İLK tahsilat alınır — taksitle ödeyen müşteri geç ödemiş sayılmaz', () => {
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z')],
      [tahsilat('o1', '2026-01-31T00:00:00Z'), tahsilat('o1', '2026-01-06T00:00:00Z')],
      VADE,
    );
    expect(sonuc.avgPaymentDays).toBe(5);
  });

  it('iade (dışarı hareket) ödeme günü değildir', () => {
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z')],
      [{ direction: 'out' as const, orderId: 'o1', valueDate: '2026-01-03T00:00:00Z' }],
      VADE,
    );
    expect(sonuc).toEqual({ avgPaymentDays: null, paidOrderCount: 0, latePaymentCount: 0 });
  });

  it('siparişe bağlı olmayan hareket (gider, transfer) ölçüme karışmaz', () => {
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z')],
      [{ direction: 'in' as const, orderId: null, valueDate: '2026-01-02T00:00:00Z' }],
      VADE,
    );
    expect(sonuc).toEqual({ avgPaymentDays: null, paidOrderCount: 0, latePaymentCount: 0 });
  });

  it('aynı gün ödeme 0 gündür — ve bu ölçülmüş bir sıfırdır', () => {
    // Ölçülmüş sıfır ile ölçülemeyen null arasındaki fark tam olarak burada görünür.
    const sonuc = paymentTiming([siparis('o1', '2026-01-01T08:00:00Z')], [tahsilat('o1', '2026-01-01T09:00:00Z')], VADE);
    expect(sonuc).toEqual({ avgPaymentDays: 0, paidOrderCount: 1, latePaymentCount: 0 });
  });

  it('tahsilat siparişten önce görünürse negatife düşmez', () => {
    // Ön ödemede kayıt sırası tarih yuvarlamasıyla ters görünebiliyor; "-1 gün" okunacak bir şey değil.
    const sonuc = paymentTiming([siparis('o1', '2026-01-02T00:00:00Z')], [tahsilat('o1', '2026-01-01T00:00:00Z')], VADE);
    expect(sonuc.avgPaymentDays).toBe(0);
  });

  it('birden çok siparişin ortalamasını alır', () => {
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z'), siparis('o2', '2026-02-01T00:00:00Z')],
      [tahsilat('o1', '2026-01-05T00:00:00Z'), tahsilat('o2', '2026-02-09T00:00:00Z')],
      VADE,
    );
    // (4 + 8) / 2
    expect(sonuc).toEqual({ avgPaymentDays: 6, paidOrderCount: 2, latePaymentCount: 0 });
  });

  it('vadeyi AŞARAK ödenen sipariş "gecikme" sayılır — ortalamada kaybolmaz', () => {
    // Kronik gecikmeli müşterinin borcu kapanmış olabilir; `overdueCount` onu "yok" gösterir.
    // Alışkanlığı gösteren sayı budur ve limit kararının asıl dayanağı.
    const sonuc = paymentTiming(
      [siparis('o1', '2026-01-01T00:00:00Z'), siparis('o2', '2026-01-01T00:00:00Z')],
      [tahsilat('o1', '2026-02-15T00:00:00Z'), tahsilat('o2', '2026-01-03T00:00:00Z')],
      VADE,
    );
    // 45 gün (vadeyi aştı) + 2 gün → ortalama 24 "makul" görünür, ama bir kez geciktirilmiş.
    expect(sonuc.latePaymentCount).toBe(1);
    expect(sonuc.avgPaymentDays).toBe(24);
  });

  it('tam vade gününde ödeme gecikme DEĞİLDİR', () => {
    const sonuc = paymentTiming([siparis('o1', '2026-01-01T00:00:00Z')], [tahsilat('o1', '2026-01-31T00:00:00Z')], VADE);
    expect(sonuc).toEqual({ avgPaymentDays: 30, paidOrderCount: 1, latePaymentCount: 0 });
  });
});
