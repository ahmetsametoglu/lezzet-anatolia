import { describe, expect, it } from 'vitest';
import { canChangeChannel, deriveChannel, usesFastSalePath } from './channel';
import { generateReferenceNo, isValidReferenceNo, purchaseOrderReferenceNo } from './reference-no';

describe('kanal türetimi (03.2)', () => {
  it('şirket → b2b, bireysel → b2c', () => {
    expect(deriveChannel({ isCompany: true })).toBe('b2b');
    expect(deriveChannel({ isCompany: false })).toBe('b2c');
  });

  it('kanal siparişe yazıldıktan sonra değişmez', () => {
    expect(canChangeChannel()).toBe(false);
  });
});

describe('kaynak ekseni kanaldan bağımsızdır', () => {
  it('yalnız kapı önü hızlı satış yolunu kullanır', () => {
    expect(usesFastSalePath('door')).toBe(true);
    for (const s of ['web', 'whatsapp', 'manual'] as const) {
      expect(usesFastSalePath(s)).toBe(false);
    }
  });

  it('aynı müşteri farklı kaynaklardan sipariş verir, kanalı değişmez', () => {
    const customer = { isCompany: false };
    expect(deriveChannel(customer)).toBe('b2c'); // siteden
    expect(deriveChannel(customer)).toBe('b2c'); // WhatsApp'tan — aynı
  });
});

describe('referans numarası (03.11)', () => {
  it('biçim: marka-yıl-6 karakter', () => {
    const ref = generateReferenceNo({ year: 2026, random: () => 0 });
    expect(ref).toBe('LA-26-333333');
    expect(isValidReferenceNo(ref)).toBe(true);
  });

  it('karışabilen karakterler (I O S Z 0 1 2 5 8) kullanılmaz — telefonda okunur', () => {
    const uretilenler = Array.from({ length: 200 }, () => generateReferenceNo({ year: 2026 }));
    for (const ref of uretilenler) {
      expect(ref.slice(6)).not.toMatch(/[IOSZ01258]/);
      expect(isValidReferenceNo(ref)).toBe(true);
    }
  });

  it('rastgeledir — sıralı numara hacim sızdırır, o yüzden ardışık üretimler farklıdır', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateReferenceNo({ year: 2026 })));
    expect(set.size).toBeGreaterThan(490); // çakışma olabilir ama nadir; benzersizliği DB garantiler
  });

  it('marka öneki değiştirilebilir', () => {
    expect(generateReferenceNo({ prefix: 'XY', year: 2027, random: () => 0 })).toMatch(/^XY-27-/);
  });

  it('tedarik siparişi KENDİ önekini taşır — telefonda karışmasın', () => {
    // Önek çağıranın değil domain'in kararı: her çağıran kendi yazsaydı seed `TS`, uygulama `TD`
    // yazar ve iki numara ailesi doğardı — üstelik ikisi de "çalışır".
    expect(purchaseOrderReferenceNo(2026, () => 0)).toMatch(/^TS-26-/);
    expect(isValidReferenceNo(purchaseOrderReferenceNo(2026))).toBe(true);
  });

  it('geçersiz biçimler reddedilir', () => {
    expect(isValidReferenceNo('LA-26-1234')).toBe(false); // kısa
    expect(isValidReferenceNo('LA-2026-7K4M2P')).toBe(false); // 4 haneli yıl
    expect(isValidReferenceNo('LA-26-7K4M2O')).toBe(false); // yasak karakter (O)
    expect(isValidReferenceNo('la-26-7k4m2p')).toBe(false); // küçük harf
  });
});
