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
  customerAppBlur,
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
    // Token Kararlari #15: rolün RESMÎ değeri artık SICAK; web kendi turunda buna çekilecek.
    expect(composedColors['on-image-soft']).toBe('#d5d0c2'); // taban #dfe3cf
    expect(composedRadius.card).toBe('20px'); // taban 18px
    expect(composedRadius.pill).toBe('22px'); // taban 26px
  });

  it('foto-üstü ROL ikilisi ayrışmaz: ad `on-image`, altyazı `on-image-soft`', () => {
    /* Token Kararlari #14 tasarımı `on-image`e ÇEKTİ (`on-image-bright` açılmadı), #15 ise
       `on-image-soft`u sıcak değere aldı. İkisi bir ÇİFT: ad ile altyazı aynı fotoğrafın üstünde
       yan yana durur ve biri değişip öteki kalırsa çift soğuk/sıcak diye ayrışır. `on-image`
       tabandan gelmeye devam ediyor (uygulama ezmiyor) — bu test o hizanın bekçisi. */
    expect(composedColors['on-image']).toBe('#f5f1e6');
    expect(customerAppColors).not.toHaveProperty('on-image');
    expect(composedColors).not.toHaveProperty('on-image-bright');
  });

  it('örtü ailesinde `.72` KENDİ durağıdır — `.82`ye yuvarlanmaz', () => {
    // #18: .82 metni okunur kılar (gradyanın ucu), .72 fotoğrafı soldurur (tükendi örtüsü).
    // Aynı değere çekilseler "bu ürün alınamaz" bilgisi görsel olarak kaybolurdu.
    expect(composedColors['scrim-72']).toBe('rgba(21, 23, 15, 0.72)');
    expect(composedColors['scrim-heavy']).toBe('rgba(21, 23, 15, 0.82)');
  });

  it('krem cam iki durak + bulanıklık kuralı birlikte durur', () => {
    // #17: saydamlık ile bulanıklık TEK yüzeyi tarif eder; biri token olup öteki olmasaydı
    // çağıran yarım bir yüzey kurar ve altından akan metin çubuğu kirletirdi.
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
    expect(composedColors['sand-100']).toBe('#f0e9d6'); // uygulamada sand-150/250 var, 100 tabandan
    expect(composedColors['terracotta-bright']).toBe('#c25e3a');
    expect(composedText.h1).toBe('52px');
    expect(composedText['eyebrow-sm']).toBe('11px'); // web'in mobil forku — uygulama dokunmaz
    expect(composedRadius.soft).toBe('14px');
  });

  it('uygulamaya-YENİ anahtarlar tabanda yok, birleşimde var', () => {
    for (const key of [
      'sand-150',
      'sand-250',
      'error',
      'error-bg',
      'scrim',
      'scrim-72',
      'cream-glass',
      'cream-glass-soft',
      'accent-leaf',
      'ink-deep',
      'brand-google',
    ]) {
      expect(customerColors, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedColors, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['screen-title', 'sheet-title', 'helper', 'button', 'badge', 'badge-sm']) {
      expect(customerText, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedText, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['badge', 'control']) {
      expect(customerRadius, `${key} tabanda olmamalı`).not.toHaveProperty(key);
      expect(composedRadius, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
  });

  it('rozet kademesi TEK kaynaktan: küçük boy yalnız ÖLÇÜ farkıdır', () => {
    /* #16 — ağırlık/aralık `badge-sm` için ikinci kez YAZILMAZ; `badge`inkinden okunur. Alt
       anahtarların doğması, iki rozetin bir gün farklı görünmeye başlaması demek olurdu. */
    expect(composedText.badge).toBe('12.5px');
    expect(composedText['badge--font-weight']).toBe('700');
    expect(composedText['badge--letter-spacing']).toBe('0.06em');
    expect(composedText['badge-sm']).toBe('10px');
    expect(composedText).not.toHaveProperty('badge-sm--font-weight');
    expect(composedText).not.toHaveProperty('badge-sm--letter-spacing');
  });

  it('fark/yeni dağılımı sabit: 8 fark (6 renk + 2 yarıçap), 42 yeni', () => {
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
    /* 42 → `error-line` 30.08'de eklendi: HATA ailesinin üçüncü katmanı. Künye onu "gerçek bir
       ihtiyaç doğunca" diye ertelemişti; ihtiyaç paylaşılan kitte doğdu (`SecondaryButton`ın
       `error` tonu iki yüzeyde birden yaşıyor ve yalnız operasyonda var olan bir durak stil
       fabrikasında çözülemiyordu — cihazda ölçüldü). */
    expect(appTotal).toBe(50); // 8 fark + 42 uygulamaya-yeni
  });

  it('birleşim tabanı BÜYÜTÜR, küçültmez — hiçbir taban anahtarı kaybolmaz', () => {
    for (const key of Object.keys(customerColors)) expect(composedColors).toHaveProperty(key);
    expect(Object.keys(composedColors)).toHaveLength(
      Object.keys(customerColors).length + Object.keys(customerAppColors).length - 6,
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
