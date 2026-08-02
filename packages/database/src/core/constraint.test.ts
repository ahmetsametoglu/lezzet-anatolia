import { describe, expect, it } from 'vitest';
import { constraintOf } from './constraint';

/**
 * Kısıt adının hatadan çıkarılması (19.5 · operasyon talebi §7).
 *
 * Örnekler UYDURULMADI: yerel veritabanına gerçek ihlaller yaptırılıp PostgREST'in döndürdüğü
 * nesneler olduğu gibi alındı (02.08). Kırılganlık burada yaşıyor — biçim değişirse bu testler
 * düşsün, ekran sessizce "kural yok" demesin.
 */

describe('constraintOf', () => {
  it('unique ihlalinde kısıt adını verir', () => {
    expect(
      constraintOf({
        code: '23505',
        details: 'Key (country_code)=(FR) already exists.',
        hint: null,
        message: 'duplicate key value violates unique constraint "warehouse_single_online"',
      }),
    ).toBe('warehouse_single_online');
  });

  it('check ihlalinde TABLO adını değil kısıt adını verir', () => {
    // Mesaj iki tırnaklı ad taşıyor; ilki ilişki. İlkini almak, ekranı yanlış kural adına
    // bağlardı ve eşleşme hiç tutmadığı için hata yine ham cümle olarak düşerdi.
    expect(
      constraintOf({
        code: '23514',
        details: 'Failing row contains (FR, 67000, {X}, 1.000000, null).',
        hint: null,
        message: 'new row for relation "postal_code_place" violates check constraint "postal_code_place_point"',
      }),
    ).toBe('postal_code_place_point');
  });

  it('not-null ihlalinde null döner — o mesajda kısıt adı yoktur', () => {
    // Son tırnaklı ad ilişkinin adı; onu kısıt sanmak olmayan bir kurala göre cümle kurdururdu.
    expect(
      constraintOf({
        code: '23502',
        message: 'null value in column "name" of relation "warehouse" violates not-null constraint',
      }),
    ).toBeNull();
  });

  it('RPC’nin kendi hatasında null döner — o yol serbest metin taşır', () => {
    expect(constraintOf({ code: 'P0001', message: 'reserve_stock: depo zorunlu' })).toBeNull();
  });

  it('hata olmayan girdide patlamaz', () => {
    expect(constraintOf(null)).toBeNull();
    expect(constraintOf(new Error('ağ düştü'))).toBeNull();
    expect(constraintOf('metin')).toBeNull();
  });
});
