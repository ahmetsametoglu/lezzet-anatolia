import { describe, expect, it } from 'vitest';
import {
  activeCountries,
  resolvePlaceByPostalCode,
  resolveWarehouseForPostalCode,
  type PostalCodeMatch,
  type WarehouseCandidate,
  type ZoneWithWarehouse,
} from './warehouse-resolve';

/**
 * Yer çözümü (19.3) — DOMAIN §17.
 *
 * En kritik davranış burada sınanıyor: **belirsizlik bir cevap değil, bir hatadır.** Eski motor
 * aynı posta kodunu içeren iki bölgede "ilki kazanır" diyordu; tek depoda bunun bedeli yanlış bir
 * rota günüydü, çok depoda siparişin yanlış şehre düşmesi demek.
 */

const STR: WarehouseCandidate = { id: 'w-str', code: 'STR', countryCode: 'FR', shipsOnline: true, isActive: true };
const KEHL: WarehouseCandidate = { id: 'w-kehl', code: 'KEHL', countryCode: 'DE', shipsOnline: false, isActive: true };

const zone = (over: Partial<ZoneWithWarehouse> = {}): ZoneWithWarehouse => ({
  id: 'z-1',
  warehouseId: STR.id,
  weekdays: [2, 5],
  isActive: true,
  postalCodes: [{ country: 'FR', postalCode: '67000' }],
  ...over,
});

describe('posta kodu → bölge → depo', () => {
  it('bölgeye düşen adres rota siparişidir ve bölgenin deposunu verir', () => {
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '67000' }, [zone()], [STR, KEHL]);
    expect(sonuc).toEqual({ kind: 'route', warehouseId: 'w-str', zoneId: 'z-1', weekdays: [2, 5] });
  });

  it('biçim farkı yer değiştirmez — "67 000" ile "67000" aynı adrestir', () => {
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '67 000' }, [zone()], [STR, KEHL]);
    expect(sonuc).toMatchObject({ kind: 'route' });
  });

  it('bölge dışı adres kargo deposuna düşer', () => {
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '75001' }, [zone()], [STR, KEHL]);
    expect(sonuc).toEqual({ kind: 'shipping', warehouseId: 'w-str' });
  });

  it('ÜLKE zincirin parçasıdır — aynı kod başka ülkede aynı yer değildir', () => {
    // 67000 hem FR hem DE'de geçerli. FR bölgesine kayıtlı kod, DE adresini rotaya sokmamalı.
    const sonuc = resolveWarehouseForPostalCode({ country: 'DE', postalCode: '67000' }, [zone()], [STR, KEHL]);
    expect(sonuc.kind).not.toBe('route');
  });

  it('pasif bölge rotayı kapatır ama müşteriyi hizmetsiz bırakmaz — kargoya düşer', () => {
    const sonuc = resolveWarehouseForPostalCode(
      { country: 'FR', postalCode: '67000' },
      [zone({ isActive: false })],
      [STR, KEHL],
    );
    expect(sonuc).toEqual({ kind: 'shipping', warehouseId: 'w-str' });
  });

  it('bölgenin deposu kapatılmışsa rota fiilen yoktur — kargo devreye girer', () => {
    const kapali = { ...STR, isActive: false };
    const kargo: WarehouseCandidate = { id: 'w-alt', code: 'ALT', countryCode: 'FR', shipsOnline: true, isActive: true };
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '67000' }, [zone()], [kapali, kargo]);
    expect(sonuc).toEqual({ kind: 'shipping', warehouseId: 'w-alt' });
  });
});

describe('belirsizlik sessizce çözülmez', () => {
  it('aynı kod iki AKTİF bölgede ise hata döner — "ilki kazanır" yok', () => {
    const ikinci = zone({ id: 'z-2', warehouseId: KEHL.id });
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '67000' }, [zone(), ikinci], [STR, KEHL]);
    expect(sonuc).toEqual({ kind: 'unresolved', reason: 'ambiguous_zone' });
  });

  it('pasif bölgedeki çakışma belirsizlik SAYILMAZ — rota kapalıdır, çelişki yok', () => {
    const pasifIkiz = zone({ id: 'z-2', warehouseId: KEHL.id, isActive: false });
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '67000' }, [zone(), pasifIkiz], [STR, KEHL]);
    expect(sonuc).toMatchObject({ kind: 'route', warehouseId: 'w-str' });
  });

  it('kargo deposu tanımlı değilse bu BİZİM eksiğimizdir, "bölge dışısınız" değil', () => {
    const kargosuz = { ...STR, shipsOnline: false };
    const sonuc = resolveWarehouseForPostalCode({ country: 'FR', postalCode: '75001' }, [zone()], [kargosuz]);
    expect(sonuc).toEqual({ kind: 'unresolved', reason: 'no_shipping_warehouse' });
  });
});

describe('hizmet ülkeleri VERİDEN türer, ayardan değil', () => {
  it('tek ülke', () => {
    expect(activeCountries([zone()], [STR])).toEqual(['FR']);
  });

  it('ikinci ülkede depo açıldığı an küme kendiliğinden büyür', () => {
    expect(activeCountries([zone()], [STR, KEHL])).toEqual(['DE', 'FR']);
  });

  it('pasif depo ülke kümesine girmez — kapalı tesis bir vaat değildir', () => {
    expect(activeCountries([zone()], [STR, { ...KEHL, isActive: false }])).toEqual(['FR']);
  });

  it('sınır ötesi bölge de ülke kümesine katkı verir (ADR-002)', () => {
    const sinirOtesi = zone({ postalCodes: [{ country: 'FR', postalCode: '67000' }, { country: 'DE', postalCode: '77694' }] });
    expect(activeCountries([sinirOtesi], [STR])).toEqual(['DE', 'FR']);
  });
});

/**
 * Ülkesiz çözüm (19.8) — müşteriye ülke SORULMUYOR.
 *
 * Gerekçe iki katlı: sürtünme (cevabı zaten elimizde olan bir soru) ve vergi (serbest seçilen ülke
 * KDV'yi etkiler — beyan olamaz, `DOMAIN §5`). Ölçüm: FR 6.065 + DE 10.813 kodun 610'u ikisinde de
 * geçerli, yani her on Fransız kodundan biri.
 */
describe('posta kodundan ülke TÜRETİLİR, sorulmaz', () => {
  const FR_67000: PostalCodeMatch = { country: 'FR', placeName: 'Strasbourg' };
  const DE_67000: PostalCodeMatch = { country: 'DE', placeName: 'Ludwigshafen' };

  it('tek ülkede geçerli kod tek turda rotaya çözülür — soru yok', () => {
    const sonuc = resolvePlaceByPostalCode('67000', [FR_67000], [zone()], [STR]);
    expect(sonuc).toEqual({ kind: 'route', country: 'FR', placeName: 'Strasbourg', warehouseId: 'w-str', zoneId: 'z-1', weekdays: [2, 5] });
  });

  it('ÇAKIŞAN kod bile hizmet vermediğimiz ülkede soru doğurmaz', () => {
    // 610 çakışmanın bugünkü karşılığı: yalnız FR aktifken DE adayı elenir, müşteri hiçbir şey seçmez.
    const sonuc = resolvePlaceByPostalCode('67000', [FR_67000, DE_67000], [zone()], [STR]);
    expect(sonuc).toMatchObject({ kind: 'route', country: 'FR' });
  });

  it('iki hizmet ülkesinde de geçerliyse SORULUR — yanlış ülke yanlış KDV demektir', () => {
    const sonuc = resolvePlaceByPostalCode('67000', [FR_67000, DE_67000], [zone()], [STR, KEHL]);
    expect(sonuc.kind).toBe('ambiguous');
    if (sonuc.kind !== 'ambiguous') throw new Error('beklenen ambiguous');
    // Rota adayı ÖNCE: daha olası cevap üstte görünür, ama seçim yine müşterinin.
    expect(sonuc.candidates.map((c) => c.country)).toEqual(['FR', 'DE']);
    expect(sonuc.candidates[0]).toMatchObject({ inRoute: true, placeName: 'Strasbourg' });
    expect(sonuc.candidates[1]).toMatchObject({ inRoute: false });
  });

  it('aday sırası KARARLIDIR — aynı kod her seferinde aynı ekranı üretir', () => {
    const ilk = resolvePlaceByPostalCode('99999', [DE_67000, FR_67000], [zone()], [STR, KEHL]);
    const ikinci = resolvePlaceByPostalCode('99999', [FR_67000, DE_67000], [zone()], [STR, KEHL]);
    expect(ilk).toEqual(ikinci);
  });

  it('hiçbir ülkede geçerli olmayan kod TANINMAZ — sessizce kargoya düşmez', () => {
    // Bu hâl 19.8 öncesi hiç yoktu: yazım hatası geçerli bir yer gibi işleniyordu.
    expect(resolvePlaceByPostalCode('67x99', [], [zone()], [STR])).toEqual({ kind: 'unknown' });
  });

  it('geçerli ama hizmet dışı ülke "tanımadık" DEĞİLDİR — kodu tanıyoruz, oraya gidemiyoruz', () => {
    const sonuc = resolvePlaceByPostalCode('10115', [{ country: 'DE', placeName: 'Berlin' }], [zone()], [STR]);
    expect(sonuc).toEqual({ kind: 'unresolved', reason: 'no_shipping_warehouse', country: 'DE' });
  });

  it('bölge dışı ama hizmet içi kod kargoya düşer ve YER ADINI taşır', () => {
    const sonuc = resolvePlaceByPostalCode('75011', [{ country: 'FR', placeName: 'Paris' }], [zone()], [STR]);
    expect(sonuc).toEqual({ kind: 'shipping', country: 'FR', placeName: 'Paris', warehouseId: 'w-str' });
  });
});
