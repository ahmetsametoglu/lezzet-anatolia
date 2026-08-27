import { describe, expect, it } from 'vitest';
import { TemperatureLogInsertSchema } from './temperature-log.schema';

/**
 * **Bir sıcaklık ölçümü TEK bir noktaya yazılır: ya depo alanı ya araç.**
 *
 * Kural iki yönlü ve ikisi de gerçek: noktasız kayıt "kim ölçtü, nerede" sorusunu cevapsız bırakır
 * (soğuk zincir kaydının tek işi budur); iki noktalı kayıt ise aynı ölçümü iki yere sayar ve
 * uyumsuzluk raporunda hangi dolabın bozulduğu görünmez.
 */
describe('TemperatureLogInsert — tek nokta', () => {
  const temel = {
    warehouseId: '44444444-4444-4444-8444-444444444444',
    temperatureC: -18.5,
  };
  const alan = '55555555-5555-4555-8555-555555555555';
  const arac = '66666666-6666-4666-8666-666666666666';

  it('nokta VERİLMEZSE reddedilir', () => {
    const sonuc = TemperatureLogInsertSchema.safeParse(temel);
    expect(sonuc.success).toBe(false);
    if (!sonuc.success) expect(sonuc.error.issues[0]?.message).toContain('seçilmedi');
  });

  it('İKİ nokta birden verilirse reddedilir', () => {
    const sonuc = TemperatureLogInsertSchema.safeParse({ ...temel, storageAreaId: alan, vehicleId: arac });
    expect(sonuc.success).toBe(false);
    if (!sonuc.success) expect(sonuc.error.issues[0]?.message).toContain('ikisi değil');
  });

  it('tek nokta geçer — alan da araç da', () => {
    expect(TemperatureLogInsertSchema.safeParse({ ...temel, storageAreaId: alan }).success).toBe(true);
    expect(TemperatureLogInsertSchema.safeParse({ ...temel, vehicleId: arac }).success).toBe(true);
  });

  /** `null` "verilmedi" demektir — `undefined` ile aynı sayılmalı, yoksa boş form iki nokta sayardı. */
  it('`null` nokta DOLU sayılmaz', () => {
    expect(TemperatureLogInsertSchema.safeParse({ ...temel, storageAreaId: alan, vehicleId: null }).success).toBe(true);
  });
});
