import { describe, expect, it } from 'vitest';
import { findZoneForPostalCode, isInRoute, upcomingDeliveryDates } from './delivery-days';

const ZONES = [
  { id: 'z1', postalCodes: ['67000', '67100'], weekdays: [2, 5], isActive: true },
  { id: 'z2', postalCodes: ['77694'], weekdays: [3], isActive: true }, // Kehl (DE) — sınır ötesi
  { id: 'z3', postalCodes: ['68000'], weekdays: [1], isActive: false }, // kapatılmış bölge
];

describe('rota içi mi (07.2)', () => {
  it('posta kodu aktif bölgeye düşerse rota içidir', () => {
    expect(findZoneForPostalCode('67000', ZONES)?.id).toBe('z1');
    expect(isInRoute('67100', ZONES)).toBe(true);
  });

  it('Alman posta kodu da bir bölgeye dahil edilebilir (ADR-002)', () => {
    expect(findZoneForPostalCode('77694', ZONES)?.id).toBe('z2');
  });

  it('kapatılmış bölge rota SAYILMAZ — kargoya düşer', () => {
    expect(findZoneForPostalCode('68000', ZONES)).toBeNull();
    expect(isInRoute('68000', ZONES)).toBe(false);
  });

  it('hiçbir bölgeye düşmeyen adres kargodur', () => {
    expect(isInRoute('75001', ZONES)).toBe(false);
  });

  it('biçim farkı kimlik ayırmaz: "67 000" ile "67000" aynı yer', () => {
    expect(findZoneForPostalCode('67 000', ZONES)?.id).toBe('z1');
  });
});

describe('teslimat günleri ve kesim saati', () => {
  // 2026-07-27 Pazartesi. Bölge günleri: Salı(2) ve Cuma(5).
  const pazartesiSabah = new Date(2026, 6, 27, 9, 0);

  it('yaklaşan somut tarihler en yakından sıralanır', () => {
    const days = upcomingDeliveryDates({ weekdays: [2, 5], now: pazartesiSabah, cutoffTime: '16:00' });
    expect(days).toEqual(['2026-07-28', '2026-07-31', '2026-08-04']); // Salı, Cuma, Salı
  });

  it('BUGÜN teslimat günüyse ve kesim saati geçmediyse aday olur', () => {
    const saliSabah = new Date(2026, 6, 28, 9, 0); // Salı 09:00
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliSabah, cutoffTime: '16:00' })[0]).toBe('2026-07-28');
  });

  it('kesim saatinden SONRA gelen sipariş bugüne yazılmaz — sonraki güne kayar', () => {
    const saliAksam = new Date(2026, 6, 28, 17, 0); // Salı 17:00, kesim 16:00
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliAksam, cutoffTime: '16:00' })[0]).toBe('2026-08-04');
  });

  it('tam kesim saatinde gelen sipariş de kaçırmış sayılır (sınır dâhil)', () => {
    const tamKesim = new Date(2026, 6, 28, 16, 0);
    expect(upcomingDeliveryDates({ weekdays: [2], now: tamKesim, cutoffTime: '16:00' })[0]).toBe('2026-08-04');
  });

  it('kaç tarih önerileceği parametrik; tek günlü bölgede seçim çıkmaz', () => {
    const tek = upcomingDeliveryDates({ weekdays: [5], now: pazartesiSabah, count: 1 });
    expect(tek).toHaveLength(1); // çağıran: tek tarih varsa gösterilir, seçim sunulmaz
  });

  it('bölgenin teslimat günü yoksa tarih üretilmez', () => {
    expect(upcomingDeliveryDates({ weekdays: [], now: pazartesiSabah })).toEqual([]);
  });

  it('bozuk kesim saati akışı kilitlemez — kesim uygulanmaz', () => {
    const saliAksam = new Date(2026, 6, 28, 17, 0);
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliAksam, cutoffTime: 'bozuk' })[0]).toBe('2026-07-28');
  });

  it('Pazar (ISO 7) doğru eşleşir — 0/7 karışıklığı yok', () => {
    const cumartesi = new Date(2026, 7, 1, 9, 0); // 2026-08-01 Cumartesi
    expect(upcomingDeliveryDates({ weekdays: [7], now: cumartesi, count: 1 })[0]).toBe('2026-08-02'); // Pazar
  });
});
