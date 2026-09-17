import { describe, expect, it } from 'vitest';
import { barcodeProblem, gtinCheckDigit } from './barcode';

/**
 * Sağlama hanesi, OKUTULMADAN yazılan kodun tek doğrulamasıdır: ambalaj fotoğrafından okunan tek
 * yanlış rakam sessizce kaydedilir ve arıza ilk kez depoda, koli okutulup hiçbir şey olmayınca
 * görünür. Ölçülmüş örnek 24.08'den: elde basılı `18691000047514` geçersizdi, doğrusu ...16.
 */
describe('barkod sağlama hanesi', () => {
  it('dört GTIN uzunluğunda da son haneyi gövdeden hesaplar', () => {
    expect(gtinCheckDigit('869100000791')).toBe(9); // EAN-13
    expect(gtinCheckDigit('1869100004751')).toBe(6); // GTIN-14
    expect(gtinCheckDigit('000000000000')).toBe(0);
  });

  it('sağlaması tutmayan GTIN reddedilir, doğrusu söylenir', () => {
    expect(barcodeProblem('18691000047514')).toContain('18691000047516');
    expect(barcodeProblem('8691000007919')).toBeNull();
  });

  /** Sistem biçim dayatmıyor: iç etiket ve QR da okutuluyor — araç dayatsaydı okutulabilen kod yazılamazdı. */
  it('GTIN uzunluğunda olmayan kod serbesttir', () => {
    expect(barcodeProblem('LZT-2026-A')).toBeNull();
    expect(barcodeProblem('12345')).toBeNull();
    expect(barcodeProblem('  ')).toContain('boş');
    expect(barcodeProblem('869 100 007')).toContain('boşluk');
  });
});
