import { describe, expect, it } from 'vitest';
import { dayLabel, parseDeliveriesUrl, shiftDay, toIsoDate } from './deliveries-url';

// Teslimat sayfasının URL sözleşmesi (09.15). Test DB'siz — bu dosya saf takvim ve ayrıştırma.

const TODAY = '2026-08-07';

describe('parseDeliveriesUrl', () => {
  it('gün yoksa bugüne düşer, sekme varsayılanı GÜN PLANI', () => {
    // Varsayılan `plan` çünkü günlük iş odur; rota kurulumu ara sıra yapılan bir kurulum işidir.
    expect(parseDeliveriesUrl({}, TODAY)).toEqual({ date: TODAY, view: null, tab: 'plan', routeId: null });
  });

  it('sekme yalnız bilinen değeri kabul eder', () => {
    expect(parseDeliveriesUrl({ tab: 'routes' }, TODAY).tab).toBe('routes');
    // Uydurma sekme sessizce boş bir ekran açmaz, günlük işe düşer.
    expect(parseDeliveriesUrl({ tab: 'bolgeler' }, TODAY).tab).toBe('plan');
  });

  it('seçili rota adresten okunur', () => {
    expect(parseDeliveriesUrl({ tab: 'routes', route: 'abc' }, TODAY).routeId).toBe('abc');
    expect(parseDeliveriesUrl({ route: ['a', 'b'] }, TODAY).routeId).toBeNull();
  });

  it('geçerli günü olduğu gibi alır', () => {
    expect(parseDeliveriesUrl({ d: '2026-08-09' }, TODAY).date).toBe('2026-08-09');
  });

  it('biçimi tutmayan gün YOK SAYILIR, ekran boş bir güne düşmez', () => {
    // `new Date('dün')` "Invalid Date" üretir ve sayfayı sessizce boş gösterirdi.
    for (const bad of ['dün', '07-08-2026', '2026/08/07', '']) {
      expect(parseDeliveriesUrl({ d: bad }, TODAY).date).toBe(TODAY);
    }
  });

  it('TAKVİMDE OLMAYAN gün de yok sayılır — biçim tutmak yetmez', () => {
    // 31 Şubat biçimi tutar ama gün yoktur; `new Date` onu 3 Mart'a taşırdı.
    expect(parseDeliveriesUrl({ d: '2026-02-31' }, TODAY).date).toBe(TODAY);
    expect(parseDeliveriesUrl({ d: '2026-13-01' }, TODAY).date).toBe(TODAY);
    // 2028 artık yıl: 29 Şubat GERÇEK bir gündür ve elenmemeli.
    expect(parseDeliveriesUrl({ d: '2028-02-29' }, TODAY).date).toBe('2028-02-29');
  });

  it('görünüm yalnız bilinen iki değeri kabul eder', () => {
    expect(parseDeliveriesUrl({ view: 'mine' }, TODAY).view).toBe('mine');
    expect(parseDeliveriesUrl({ view: 'dispatch' }, TODAY).view).toBe('dispatch');
    // Uydurma değer yetki açmaz: bilinmeyen görünüm null'a düşer, dal role göre seçilir.
    expect(parseDeliveriesUrl({ view: 'admin' }, TODAY).view).toBeNull();
  });

  it('dizi gelen parametreyi yok sayar (aynı anahtar iki kez yazılmış adres)', () => {
    expect(parseDeliveriesUrl({ d: ['2026-08-09', '2026-08-10'] }, TODAY).date).toBe(TODAY);
  });
});

describe('shiftDay', () => {
  it('ay sınırını geçer', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('yıl sınırını geçer', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('artık yılı doğru sayar', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDay('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('toIsoDate', () => {
  it('YEREL günü verir — `toISOString()` UTC kaydırmasıyla gün atlatır', () => {
    // Gece yarısına yakın yerel bir an: UTC'ye çevrilseydi bir önceki güne düşebilirdi.
    expect(toIsoDate(new Date(2026, 7, 7, 0, 30))).toBe('2026-08-07');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('dayLabel', () => {
  it('yakın günleri adıyla anar', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Bugün');
    expect(dayLabel('2026-08-08', TODAY)).toBe('Yarın');
    expect(dayLabel('2026-08-06', TODAY)).toBe('Dün');
  });

  it('uzak günü takvimden okur', () => {
    // Yıl YAZILMAZ: gün seçici hep yakın günlerde dolaşır, yıl gürültüdür.
    expect(dayLabel('2026-08-12', TODAY)).not.toContain('2026');
  });
});
