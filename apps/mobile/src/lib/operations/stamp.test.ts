import { dateLabelOf, stampOf, timeOf } from './stamp';

/*
  DAMGA YARDIMCILARI — üç biçim, tek kaynak.

  Testin taşıdığı asıl iddia BİÇİM DEĞİL TUTARLILIK: `timeOf` 30.08'de gün sonu ekranı için
  eklendi ve `stampOf` zaten aynı saati yazıyordu. İkisi ayrı hesaplarsa bir gün biri 24 saatlik,
  öteki 12 saatlik olur ve aynı olay iki ekranda iki saatle görünür — bunu typecheck göremez.

  SAAT DİLİMİ SABİTLENMEDİ: yardımcılar bilerek CİHAZIN yerel saatini yazıyor (personelin "17:42"
  dediği saat kendi saatidir), dolayısıyla testler de mutlak bir değer değil, İLİŞKİ ölçüyor.
*/

const ISO = '2026-08-26T15:42:00.000Z';

describe('timeOf', () => {
  it('yalnız saat:dakika yazar — gün BAŞLIKTA olduğu için tekrarlanmaz', () => {
    expect(timeOf(ISO)).toMatch(/^\d{2}:\d{2}$/u);
  });

  it('tam damganın saat kısmıyla AYNI — iki biçim ayrışmaz', () => {
    expect(stampOf(ISO).endsWith(timeOf(ISO))).toBe(true);
  });

  it('saat ve dakika iki haneye doldurulur (gece yarısı "0:5" diye yazılmaz)', () => {
    const [hours, minutes] = timeOf('2026-08-26T00:05:00.000Z').split(':');
    expect(hours).toHaveLength(2);
    expect(minutes).toHaveLength(2);
  });
});

describe('dateLabelOf', () => {
  it('ISO günü Türkçe ay adıyla yazar', () => {
    expect(dateLabelOf('2026-08-28')).toBe('28 Ağustos');
  });

  /* UYDURMA GÜN ADI YAZILMAZ (CLAUDE §1: ölçülemeyen değer varsayılan değildir) — biçim
     tanınmazsa üstbaşlık kuyruksuz kalır. */
  it('biçim tanınmazsa null döner', () => {
    expect(dateLabelOf('28.08.2026')).toBeNull();
    expect(dateLabelOf('2026-13-01')).toBeNull();
  });
});
