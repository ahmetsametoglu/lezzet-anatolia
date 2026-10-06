/*
  Uygulama teması tabanın üstüne yayılır ve aynı adda uygulama kazanır; bu dosya ezmenin çalıştığını ve sızmadığını sabitler.
  Fark ile yeni ayrımı sayıyla sabitlenir ki tabanda aynı adı olan yeni token sessizce farka dönüşmesin.
*/
import { describe, expect, it } from 'vitest';
import {
  customerAppBlur,
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
} from './customer-app';
import { customerColors, customerRadius, customerShadow, customerSurface, customerText } from './customer';

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
    expect(composedColors['on-image-soft']).toBe('#d5d0c2'); // taban #dfe3cf
    expect(composedRadius.card).toBe('20px'); // taban 18px
    expect(composedRadius.pill).toBe('22px'); // taban 26px
  });

  it('foto-üstü ROL ikilisi ayrışmaz: ad `on-image`, altyazı `on-image-soft`', () => {
    // Ad ile altyazı aynı fotoğrafın üstünde yan yana durur; biri değişip öteki kalırsa çift soğuk ve sıcak diye ayrışır.
    expect(composedColors['on-image']).toBe('#f5f1e6');
    expect(customerAppColors).not.toHaveProperty('on-image');
    expect(composedColors).not.toHaveProperty('on-image-bright');
  });

  it('örtü ailesinde `.72` KENDİ durağıdır — `.82`ye yuvarlanmaz', () => {
    // .82 metni okunur kılar, .72 fotoğrafı soldurur; aynı değere çekilseler "bu ürün alınamaz" bilgisi kaybolurdu.
    expect(composedColors['scrim-72']).toBe('rgba(21, 23, 15, 0.72)');
    expect(composedColors['scrim-heavy']).toBe('rgba(21, 23, 15, 0.82)');
  });

  it('krem cam iki durak + bulanıklık kuralı birlikte durur', () => {
    // Saydamlık ile bulanıklık tek yüzeyi tarif eder; biri eksik kalsa altından akan metin çubuğu kirletirdi.
    expect(composedColors['cream-glass-soft']).toBe('rgba(243, 239, 226, 0.90)');
    expect(composedColors['cream-glass']).toBe('rgba(243, 239, 226, 0.96)');
    expect(customerAppBlur.glass).toBe('8px');
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
    expect(composedColors['sand-100']).toBe('#f0e9d6'); // 150/250 ara kademeleri de artık tabanda
    expect(composedColors['terracotta-bright']).toBe('#c25e3a');
    expect(composedText.h1).toBe('52px');
    expect(composedText['eyebrow-sm']).toBe('11px'); // web'in mobil forku — uygulama dokunmaz
    expect(composedRadius.soft).toBe('14px');
  });

  it('uygulamaya-YENİ anahtarlar tabanda yok, birleşimde var', () => {
    for (const key of ['error-line', 'cream-glass', 'cream-glass-soft', 'accent-leaf', 'brand-apple']) {
      expect(customerColors, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedColors, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['sheet-title']) {
      expect(customerText, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedText, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
  });

  it('TABANA ÇIKAN telefon token’ları: uygulamada yok, birleşimde tabanın değeriyle var', () => {
    // Taşıma değer değişikliği değil: uygulamada kopya kalmamalı ve birleşim aynı değeri vermeli.
    for (const key of ['sand-150', 'sand-250', 'ink-deep', 'scrim-soft', 'scrim', 'scrim-72', 'scrim-heavy', 'error', 'error-bg']) {
      expect(customerAppColors, `${key} uygulamada kopya kalmamalı`).not.toHaveProperty(key);
      expect(composedColors[key as keyof typeof composedColors]).toBe(customerColors[key as keyof typeof customerColors]);
    }
    for (const key of ['badge', 'badge--font-weight', 'badge--letter-spacing', 'badge-sm', 'helper', 'screen-title', 'button', 'button--font-weight']) {
      expect(customerAppText, `${key} uygulamada kopya kalmamalı`).not.toHaveProperty(key);
      expect(composedText[key as keyof typeof composedText]).toBe(customerText[key as keyof typeof customerText]);
    }
    for (const key of ['badge', 'control']) {
      expect(customerAppRadius, `${key} uygulamada kopya kalmamalı`).not.toHaveProperty(key);
      expect(composedRadius[key as keyof typeof composedRadius]).toBe(customerRadius[key as keyof typeof customerRadius]);
    }
    expect(customerColors['sand-150']).toBe('#efdfc2');
    expect(customerColors['ink-deep']).toBe('#15170f');
    expect(customerRadius.badge).toBe('12px');
    expect(customerRadius.control).toBe('16px');
  });

  it('rozet kademesi TEK kaynaktan: küçük boy yalnız ÖLÇÜ farkıdır', () => {
    // Küçük rozetin ağırlığı ve aralığı ayrıca yazılmaz; yazılsa iki rozet bir gün farklı görünmeye başlardı.
    expect(composedText.badge).toBe('12.5px');
    expect(composedText['badge--font-weight']).toBe('700');
    expect(composedText['badge--letter-spacing']).toBe('0.06em');
    expect(composedText['badge-sm']).toBe('10px');
    expect(composedText).not.toHaveProperty('badge-sm--font-weight');
    expect(composedText).not.toHaveProperty('badge-sm--letter-spacing');
  });

  it('fark/yeni dağılımı sabit: 8 fark (6 renk + 2 yarıçap), 19 yeni', () => {
    expect(sharedKeys(customerColors, customerAppColors)).toHaveLength(6);
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
      Object.keys(customerAppBlur).length +
      Object.keys(customerAppGradient).length;
    // Gölgelerin `soft`, `hard` ve `badge`i sayıda kalır: tema gölge ailesini bu nesneden okur ve tabandaki tanım burada yeniden verilir.
    expect(appTotal).toBe(27); // 8 fark + 19 uygulamaya-yeni
  });

  it('birleşim tabanı BÜYÜTÜR, küçültmez — hiçbir taban anahtarı kaybolmaz', () => {
    for (const key of Object.keys(customerColors)) expect(composedColors).toHaveProperty(key);
    expect(Object.keys(composedColors)).toHaveLength(
      Object.keys(customerColors).length + Object.keys(customerAppColors).length - 6,
    );
  });

  it('`soft`, `hard` ve `badge` gölgeleri TABANDAN okunur — ikinci kez yazılmamıştır', () => {
    expect(customerAppShadow.soft).toBe(customerShadow.soft);
    expect(customerAppShadow.hard).toBe(customerShadow.hard);
    expect(customerAppShadow.hard).toContain(customerSurface.ink);
    expect(customerAppShadow.badge).toBe(customerShadow.badge);
  });

  it('gradyanlarda şeffaf durak `transparent` değil `rgba(…, 0)`', () => {
    // `transparent` bazı motorlarda "şeffaf SİYAH"tır ve geçişin ortasını griye kirletir.
    for (const value of Object.values(customerAppGradient)) {
      expect(value).not.toContain('transparent');
      expect(value).toContain(', 0)');
    }
  });
});
