import { describe, expect, it } from 'vitest';
import { LOCALIZED_TEXT_KEYS, LocalizedTextSchema, resolveLocalizedText } from './localized-text.schema';

/**
 * **Çok dilli metnin tek kuralı: en az bir dil DOLU olmalı** (01.1'in bitiş kriteri).
 *
 * Kuralın değeri boş nesneyi reddetmesinde değil — asıl yakaladığı şey BOŞLUK: `{ tr: '   ' }`
 * `Boolean('   ')` ile `true`dur, yani `.trim()` olmasa geçerdi. Geçseydi katalogda adı görünmeyen
 * bir ürün doğardı ve hiçbir yerde hata vermezdi: `resolveLocalizedText` boş dize döndürür, ekran
 * boş bir satır çizer, kimse "ad nerede" diye sormaz.
 */
describe('LocalizedText — en az bir dil', () => {
  it('üç dil de boşsa REDDEDİLİR', () => {
    expect(LocalizedTextSchema.safeParse({}).success).toBe(false);
    expect(LocalizedTextSchema.safeParse({ tr: '', fr: '', de: '' }).success).toBe(false);
  });

  it('YALNIZ BOŞLUKTAN ibaret metin de reddedilir — `.trim()` kuralın kendisidir', () => {
    expect(LocalizedTextSchema.safeParse({ tr: '   ' }).success).toBe(false);
    expect(LocalizedTextSchema.safeParse({ fr: '\t\n' }).success).toBe(false);
  });

  it('tek dil yeter — üçü birden zorunlu DEĞİL', () => {
    for (const key of LOCALIZED_TEXT_KEYS) {
      expect(LocalizedTextSchema.safeParse({ [key]: 'Lezzet' }).success).toBe(true);
    }
  });

  /**
   * Dil anahtarları ŞEMADAN türer (elle liste yazılmaz). Sayı sabitlenmiyor — yeni bir dil
   * eklendiğinde bu test kırılmamalı; kırılması gereken şey türetimin BOZULMASIDIR.
   */
  it('anahtar listesi şemadan türetilir ve üç dili taşır', () => {
    expect(LOCALIZED_TEXT_KEYS).toEqual(expect.arrayContaining(['tr', 'fr', 'de']));
  });

  it('yedek zinciri: seçili dil yoksa TR → FR → DE sırasıyla düşer', () => {
    const metin = LocalizedTextSchema.parse({ fr: 'Bonjour', de: 'Hallo' });
    expect(resolveLocalizedText(metin, 'de')).toBe('Hallo'); // seçili dil önce
    expect(resolveLocalizedText(metin)).toBe('Bonjour'); // TR yok → FR
  });
});
