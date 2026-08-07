/*
  KOMPOZİSYON SÖZLEŞMESİ — `customer-app.ts`in güvencesi (21.3, kullanıcı kararı 07.08).

  Mobil uygulama temasının tek kuralı şu: taban (`customer.ts`) üstüne uygulama dosyası yayılır,
  aynı addaki anahtarda UYGULAMA kazanır. Bu dosya o kuralın iki yönünü de sabitler —
    · fark anahtarları gerçekten uygulama değerini veriyor mu (ezme ÇALIŞIYOR mu),
    · tabanın geri kalanı olduğu gibi geçiyor mu (ezme SIZMIYOR mu).
  Ayrıca "fark" ve "yeni" ayrımı sayıyla sabitlenir: uygulamaya eklenen bir token, tabanda aynı
  ad varken sessizce fark'a dönüşürse (ya da tersi) burada görünür — yorumla anlatılan şeyin
  makineyle doğrulanan hâli.

  Parite testinden AYRI dosya: o test CSS ikizini denetler ve `customer-app.ts`i hiç görmez.
  DB'siz, saf: birim projesinde koşar.
*/
import { describe, expect, it } from 'vitest';
import {
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
} from './customer-app';
import { customerColors, customerRadius, customerSurface, customerText } from './customer';

/** Uygulama temasının kurduğu birleşimin ta kendisi — tüketici (Unistyles) da böyle kurar. */
const composedColors = { ...customerColors, ...customerAppColors };
const composedText = { ...customerText, ...customerAppText };
const composedRadius = { ...customerRadius, ...customerAppRadius };

/** Bir haritanın öteki haritayla ORTAK olan anahtarları (fark token'ları). */
function sharedKeys(base: Record<string, string>, app: Record<string, string>): string[] {
  return Object.keys(app).filter((key) => key in base);
}

describe('customer-app ↔ customer kompozisyonu', () => {
  it('fark anahtarları uygulama değerini verir (uygulama tabanı EZER)', () => {
    expect(composedColors['sand-300']).toBe('#e2d8bd'); // taban #e0d8c2
    expect(composedColors['olive-line']).toBe('#cddbb0'); // taban #d7e3bd
    expect(composedColors.star).toBe('#d9a441'); // taban #d99a2b
    expect(composedColors['closed-bg']).toBe('#e9e2cf'); // taban #f0e9d6
    expect(composedColors['disabled-fill']).toBe('#b9b29e'); // taban #c9c3b0
    expect(composedRadius.card).toBe('20px'); // taban 18px
    expect(composedRadius.pill).toBe('22px'); // taban 26px
  });

  it('üstbaşlık ÜÇ alt-anahtarıyla birlikte ezilir — yarım ezme yok', () => {
    // Boyut/ağırlık/aralıktan biri tabandan kalsaydı ortaya hiçbir tasarımda olmayan bir
    // kademe çıkardı (10px ama .12em gibi); bilinçli çakışmanın bütünlüğü budur.
    expect(composedText.eyebrow).toBe('10px');
    expect(composedText['eyebrow--font-weight']).toBe('700');
    expect(composedText['eyebrow--letter-spacing']).toBe('0.18em');
  });

  it('ortak anahtarlar tabandan gelir — ezme yalnız beyan edilen adlara dokunur', () => {
    expect(composedColors.ink).toBe(customerSurface.ink);
    expect(composedColors['sand-100']).toBe('#f0e9d6'); // uygulamada sand-150/250 var, 100 tabandan
    expect(composedColors['terracotta-bright']).toBe('#c25e3a');
    expect(composedText.h1).toBe('52px');
    expect(composedText['eyebrow-sm']).toBe('11px'); // web'in mobil forku — uygulama dokunmaz
    expect(composedRadius.soft).toBe('14px');
  });

  it('uygulamaya-YENİ anahtarlar tabanda yok, birleşimde var', () => {
    for (const key of ['sand-150', 'sand-250', 'error', 'error-bg', 'scrim', 'brand-google']) {
      expect(customerColors, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedColors, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['screen-title', 'sheet-title', 'helper', 'button']) {
      expect(customerText, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedText, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['badge', 'control']) {
      expect(customerRadius, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedRadius, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
  });

  it('fark/yeni dağılımı sabit: 7 fark (5 renk + 2 yarıçap), 30 yeni', () => {
    expect(sharedKeys(customerColors, customerAppColors)).toHaveLength(5);
    expect(sharedKeys(customerRadius, customerAppRadius)).toHaveLength(2);
    // Tipografide tek çakışma üstbaşlığın üç alt-anahtarıdır; dördüncü bir çakışma bilinçsizdir.
    expect(sharedKeys(customerText, customerAppText)).toEqual([
      'eyebrow',
      'eyebrow--font-weight',
      'eyebrow--letter-spacing',
    ]);

    const appTotal =
      Object.keys(customerAppColors).length +
      Object.keys(customerAppText).length +
      Object.keys(customerAppRadius).length +
      Object.keys(customerAppShadow).length +
      Object.keys(customerAppGradient).length;
    expect(appTotal).toBe(37); // 7 fark + 30 uygulamaya-yeni
  });

  it('birleşim tabanı BÜYÜTÜR, küçültmez — hiçbir taban anahtarı kaybolmaz', () => {
    for (const key of Object.keys(customerColors)) expect(composedColors).toHaveProperty(key);
    expect(Object.keys(composedColors)).toHaveLength(
      Object.keys(customerColors).length + Object.keys(customerAppColors).length - 5,
    );
  });

  it('`hard` gölgesi tabandaki mürekkepten TÜRER — ikinci kez yazılmamıştır', () => {
    expect(customerAppShadow.hard).toContain(customerSurface.ink);
  });

  it('gradyanlarda şeffaf durak `transparent` değil `rgba(…, 0)`', () => {
    // `transparent` bazı motorlarda "şeffaf SİYAH"tır ve geçişin ortasını griye kirletir.
    for (const value of Object.values(customerAppGradient)) {
      expect(value).not.toContain('transparent');
      expect(value).toContain(', 0)');
    }
  });
});
