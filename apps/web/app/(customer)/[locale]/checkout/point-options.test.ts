import { describe, expect, it } from 'vitest';
import { openingLines, orderServicePoints, pointOptionsByCarrier, type CheckoutServicePoint } from './checkout-types';

const secenek = (code: string, carrierCode: string, priceCents: number, needsServicePoint: boolean) => ({
  code,
  carrierCode,
  carrierName: carrierCode,
  name: code,
  priceCents,
  leadTimeHours: null,
  lastMile: needsServicePoint ? 'service_point' : 'home_delivery',
  needsServicePoint,
  tracked: true,
});

describe('pointOptionsByCarrier — haritadaki noktanın fiyatı', () => {
  it('taşıyıcı başına noktaya teslim eden EN UCUZ servis; eve teslim servisi noktanın fiyatı olmaz', () => {
    const harita = pointOptionsByCarrier([
      secenek('mr-eve', 'mondial_relay', 290, false),
      secenek('mr-nokta-pahali', 'mondial_relay', 520, true),
      secenek('mr-nokta', 'mondial_relay', 304, true),
      secenek('colissimo-nokta', 'colissimo', 565, true),
    ]);
    expect([...harita.entries()].map(([carrier, o]) => [carrier, o.code])).toEqual([
      ['mondial_relay', 'mr-nokta'],
      ['colissimo', 'colissimo-nokta'],
    ]);
  });

  it('noktaya teslim eden servis yoksa harita boştur', () => {
    expect(pointOptionsByCarrier([secenek('eve', 'colissimo', 690, false)]).size).toBe(0);
  });
});

describe('orderServicePoints — harita listesinin sırası', () => {
  const nokta = (id: string, carrierCode: string, distanceM: number | null): CheckoutServicePoint => ({
    id, carrierCode, name: id, street: '', houseNumber: null, postalCode: '69007', city: 'Lyon', country: 'FR',
    latitude: null, longitude: null, distanceM, active: true, openingTimes: null,
  });
  const fiyatlar = new Map([
    ['mondial_relay', { code: 'mr', priceCents: 477 }],
    ['chronopost', { code: 'ch', priceCents: 438 }],
  ]);

  it('en ucuz taşıyıcı başta — daha yakın ama pahalı nokta onun önüne geçmez; eşit fiyatta yakın önce', () => {
    const sira = orderServicePoints(
      [nokta('mr-yakin', 'mondial_relay', 185), nokta('ch-uzak', 'chronopost', 900), nokta('ch-yakin', 'chronopost', 400)],
      fiyatlar,
    );
    expect(sira.map((p) => [p.id, p.optionCode])).toEqual([
      ['ch-yakin', 'ch'],
      ['ch-uzak', 'ch'],
      ['mr-yakin', 'mr'],
    ]);
  });

  it('servisi olmayan taşıyıcının noktası listeye girmez', () => {
    expect(orderServicePoints([nokta('dpd', 'dpd', 50)], fiyatlar)).toEqual([]);
  });
});

describe('openingLines — teslim noktasının saatleri', () => {
  const sabah = ['08:00 - 12:00', '14:00 - 18:00'];

  it('aynı saatlere sahip ardışık günler tek satırda, farklı gün ayrı satırda', () => {
    const saatler = { '0': sabah, '1': sabah, '2': sabah, '3': sabah, '4': sabah, '5': ['09:00 - 12:00'], '6': [] };
    expect(openingLines(saatler, 'tr', 'kapalı')).toEqual(['Pzt–Cum 08:00 - 12:00, 14:00 - 18:00', 'Cmt 09:00 - 12:00', 'Paz kapalı']);
  });

  it('araya giren farklı gün birleşmeyi böler — uzak günler aynı saatte olsa da birleşmez', () => {
    const saatler = { '0': sabah, '1': [], '2': sabah, '3': sabah, '4': sabah, '5': sabah, '6': sabah };
    expect(openingLines(saatler, 'tr', 'kapalı')).toEqual(['Pzt 08:00 - 12:00, 14:00 - 18:00', 'Sal kapalı', 'Çar–Paz 08:00 - 12:00, 14:00 - 18:00']);
  });

  it('hiç saat bildirilmediyse bilinmiyor döner, "kapalı" değil', () => {
    expect(openingLines({ '0': [], '1': [] }, 'tr', 'kapalı')).toBeNull();
    expect(openingLines(null, 'tr', 'kapalı')).toBeNull();
  });
});
