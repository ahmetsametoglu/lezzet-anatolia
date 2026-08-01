import { describe, expect, it } from 'vitest';
import {
  activeCountries,
  needsCountryChoice,
  resolveWarehouseForPostalCode,
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

describe('ülke seçici VERİDEN türer, ayardan değil', () => {
  it('tek ülke varsa seçici gösterilmez', () => {
    expect(activeCountries([zone()], [STR])).toEqual(['FR']);
    expect(needsCountryChoice([zone()], [STR])).toBe(false);
  });

  it('ikinci ülkede depo açıldığı an seçici kendiliğinden belirir', () => {
    expect(activeCountries([zone()], [STR, KEHL])).toEqual(['DE', 'FR']);
    expect(needsCountryChoice([zone()], [STR, KEHL])).toBe(true);
  });

  it('pasif depo ülke kümesine girmez — kapalı tesis bir vaat değildir', () => {
    expect(needsCountryChoice([zone()], [STR, { ...KEHL, isActive: false }])).toBe(false);
  });

  it('sınır ötesi bölge de ülke kümesine katkı verir (ADR-002)', () => {
    const sinirOtesi = zone({ postalCodes: [{ country: 'FR', postalCode: '67000' }, { country: 'DE', postalCode: '77694' }] });
    expect(activeCountries([sinirOtesi], [STR])).toEqual(['DE', 'FR']);
  });
});
