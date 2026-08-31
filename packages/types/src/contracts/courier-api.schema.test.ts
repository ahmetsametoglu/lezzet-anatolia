import { describe, expect, it } from 'vitest';

import { CourierVanStockMoveRequestSchema } from './courier-api.schema';

/**
 * **ARACA AL / DEVRET İSTEĞİNİN KİMLİK KURALI** (31.08 · v3:19).
 *
 * Bu dosyadaki tek RED kuralı burada: gövde ya varyant kimliği ya BARKOD taşır — biri, yalnız
 * biri. Kural şemada durur çünkü uç ikisini de kabul ediyor ve çeviriyi kendisi yapıyor
 * (`variant_barcode`); şekil serbest bırakılsaydı "ikisi birden gelirse hangisi kazanır" sorusu
 * uçta bir `if` olarak yaşardı ve o `if` bir gün ötekinden ayrılırdı.
 *
 * Öteki şemalar düz ayna ya da ayrımlı birleşim — `rule-coverage` künyesinin kendi ölçütüyle
 * testi hak etmiyorlar (birleşimin kolları zaten `z.input<…>` ile derleme kilidinde).
 */
describe('serbest ürün hareketi — kimlik ya UUID ya BARKOD', () => {
  const variantId = '00000000-0000-4000-8000-000000000901';

  it('yalnız varyant kimliği geçerlidir', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ variantId, qty: 2 }).success).toBe(true);
  });

  it('yalnız kod geçerlidir — rampada okutulan şey budur', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ code: '8690000000001', qty: 1 }).success).toBe(true);
  });

  it('İKİSİ BİRDEN reddedilir — hangisinin kazanacağı sorusu doğmasın', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ variantId, code: '869', qty: 1 }).success).toBe(false);
  });

  it('HİÇBİRİ verilmeden çağrılamaz — kimliksiz bir hareket hangi malı taşıyacağını bilmez', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ qty: 1 }).success).toBe(false);
  });

  it('adet POZİTİF tamsayıdır: sıfır ve eksi bir hareket değildir', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ variantId, qty: 0 }).success).toBe(false);
    expect(CourierVanStockMoveRequestSchema.safeParse({ variantId, qty: -1 }).success).toBe(false);
  });

  it('boş kod kimlik SAYILMAZ — kırpılmış boşluk bir barkod değildir', () => {
    expect(CourierVanStockMoveRequestSchema.safeParse({ code: '   ', qty: 1 }).success).toBe(false);
  });
});
