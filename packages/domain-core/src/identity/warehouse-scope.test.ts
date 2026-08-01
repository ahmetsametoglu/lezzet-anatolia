import { describe, expect, it } from 'vitest';
import { canAccessWarehouse, warehouseOptions, warehouseScope } from './warehouse-scope';

/**
 * Depo kapsamı (19.3) — DOMAIN §17 / T2.
 *
 * Sınanan asıl kural **fail-closed**: boş kapsam "hepsi" değil "hiçbiri"dir. Bu ayrım izin
 * sisteminin en kolay delinen yeri — `length === 0` gördüğünde "süzgeç yok, hepsini göster" diyen
 * tek bir satır, kapsamı boşaltılmış bir depocuya tüm ağı açar.
 */

describe('depoya bağlı roller', () => {
  it('kapsamlı depocu yalnız kendi deposunu görür', () => {
    const scope = warehouseScope(['warehouse'], ['w-str']);
    expect(scope).toEqual({ kind: 'limited', warehouseIds: ['w-str'] });
    expect(canAccessWarehouse(scope, 'w-str')).toBe(true);
    expect(canAccessWarehouse(scope, 'w-kehl')).toBe(false);
  });

  it('KAPSAMSIZ depocu HİÇBİR depoyu göremez — boş küme "hepsi" değildir', () => {
    const scope = warehouseScope(['warehouse'], []);
    expect(scope).toEqual({ kind: 'none' });
    expect(canAccessWarehouse(scope, 'w-str')).toBe(false);
  });

  it('kurye de depoya bağlıdır', () => {
    expect(warehouseScope(['courier'], [])).toEqual({ kind: 'none' });
    expect(warehouseScope(['courier'], ['w-str'])).toMatchObject({ kind: 'limited' });
  });
});

describe('depo-üstü roller', () => {
  it('admin kapsamsız olsa da tüm ağı görür — kapsamı hiç okunmaz', () => {
    const scope = warehouseScope(['admin'], []);
    expect(scope).toEqual({ kind: 'all' });
    expect(canAccessWarehouse(scope, 'her-hangi-bir-depo')).toBe(true);
  });

  it('muhasebe de depo-üstüdür: defterin tuttuğu şey ağ toplamıdır', () => {
    expect(warehouseScope(['accounting'], [])).toEqual({ kind: 'all' });
  });

  it('depo + muhasebe aynı kişideyse depo-üstü rol KAZANIR', () => {
    // Tersi olsaydı muhasebeci yalnız kendi deposunun defterini tutardı ve ağ toplamı kimsede olmazdı.
    expect(warehouseScope(['warehouse', 'accounting'], ['w-str'])).toEqual({ kind: 'all' });
  });
});

describe('personel olmayan', () => {
  it('müşterinin depo kapsamı yoktur', () => {
    expect(warehouseScope(['customer'], [])).toEqual({ kind: 'none' });
  });
});

describe('ekranın depo seçicisi', () => {
  const hepsi = ['w-str', 'w-kehl', 'w-de'];

  it('tek depolu personele seçenek sunulmaz — olmayan bir karar gösterilmez', () => {
    const { options, needsChoice } = warehouseOptions(warehouseScope(['warehouse'], ['w-str']), hepsi);
    expect(options).toEqual(['w-str']);
    expect(needsChoice).toBe(false);
  });

  it('çok depolu personel seçici görür ama VARSAYILAN seçilmez', () => {
    const { options, needsChoice } = warehouseOptions(warehouseScope(['warehouse'], ['w-str', 'w-kehl']), hepsi);
    expect(options).toEqual(['w-str', 'w-kehl']);
    // C2: sistem onun yerine karar vermez — seçimi operatör yapar.
    expect(needsChoice).toBe(true);
  });

  it('admin tüm depoları süzebilir', () => {
    expect(warehouseOptions(warehouseScope(['admin'], []), hepsi).options).toEqual(hepsi);
  });

  it('kapsamsız depocuya hiçbir seçenek yok — kapalı kapı', () => {
    expect(warehouseOptions(warehouseScope(['warehouse'], []), hepsi).options).toEqual([]);
  });
});
