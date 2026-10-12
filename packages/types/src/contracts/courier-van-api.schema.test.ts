import { describe, expect, it } from 'vitest';

import { CourierVanStockScanRequestSchema, CourierVanStockSetRequestSchema } from './courier-van-api.schema';

/**
 * Araçtaki adedi yazan istek (`set`) varyantı, hedefi ve görülen tabanı zorunlu taşır; okutma isteği (`scan`) yalnız kodu taşır ve adet daima 1'dir.
 * Sınanan şey reddettikleridir, çünkü isteğe bağlı kalan bir alan korumayı tam da onu yazmayan istemcide atlatırdı.
 */
describe('araçtaki adedi yaz (`set`) — hedef ve taban ZORUNLU', () => {
  const variantId = '00000000-0000-4000-8000-000000000901';
  const gecerli = { variantId, targetQty: 5, observedQty: 3 };

  it('hedef + taban + varyant yeterlidir; anahtar isteğe bağlıdır', () => {
    expect(CourierVanStockSetRequestSchema.safeParse(gecerli).success).toBe(true);
    expect(CourierVanStockSetRequestSchema.safeParse({ ...gecerli, idempotencyKey: 'van-abc' }).success).toBe(true);
  });

  it('SIFIR hem meşru bir HEDEF hem meşru bir TABANDIR', () => {
    // Hedef sıfır = "araçtan çıkar"; taban sıfır = aday satırından ilk alma. `positive()` ikisini de
    // reddederdi ve ekranın iki gerçek yolu kapanırdı.
    expect(CourierVanStockSetRequestSchema.safeParse({ variantId, targetQty: 0, observedQty: 4 }).success).toBe(true);
    expect(CourierVanStockSetRequestSchema.safeParse({ variantId, targetQty: 1, observedQty: 0 }).success).toBe(true);
  });

  it('TABAN yazılmadan çağrılamaz — korumanın atlanacağı tek yol buydu', () => {
    // Taban isteğe bağlı olsaydı sunucu onu yazmayan istemcide kontrolü atlardı; eksiklik burada görünür biçimde reddedilir.
    expect(CourierVanStockSetRequestSchema.safeParse({ variantId, targetQty: 5 }).success).toBe(false);
    expect(CourierVanStockSetRequestSchema.safeParse({ variantId, observedQty: 3 }).success).toBe(false);
  });

  it('EKSİ adet bir hedef değildir; kesirli adet de değil', () => {
    expect(CourierVanStockSetRequestSchema.safeParse({ ...gecerli, targetQty: -1 }).success).toBe(false);
    expect(CourierVanStockSetRequestSchema.safeParse({ ...gecerli, observedQty: -1 }).success).toBe(false);
    expect(CourierVanStockSetRequestSchema.safeParse({ ...gecerli, targetQty: 1.5 }).success).toBe(false);
  });

  it('KOD bu kapıdan geçmez — okutmanın kendi kapısı var', () => {
    expect(CourierVanStockSetRequestSchema.safeParse({ code: '8690000000001', targetQty: 1, observedQty: 0 }).success).toBe(false);
  });

  it('BOŞ anahtar anahtar değildir — eşleştirme etiketi olarak hiçbir şey ayırmaz', () => {
    expect(CourierVanStockSetRequestSchema.safeParse({ ...gecerli, idempotencyKey: '' }).success).toBe(false);
  });
});

describe('okut ve bir tane al (`scan`) — yalnız kod', () => {
  it('kod tek başına yeterlidir: adet sabit 1, hedef ve taban YOK', () => {
    expect(CourierVanStockScanRequestSchema.safeParse({ code: '8690000000001' }).success).toBe(true);
  });

  it('boş kod kimlik SAYILMAZ — kırpılmış boşluk bir barkod değildir', () => {
    expect(CourierVanStockScanRequestSchema.safeParse({ code: '   ' }).success).toBe(false);
  });
});
