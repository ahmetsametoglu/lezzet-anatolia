import { describe, expect, it } from 'vitest';
import { hasEmphasis, parseEmphasis, stripEmphasis, toggleEmphasis } from './rich-text';

/**
 * Vurgu ayrıştırma saf mantıktır → birim test. Önemi yalnız görsel değil YASAL: bu metin içindekiler
 * beyanı; ayrıştırma yanlışsa müşteriye eksik ya da bozuk bir liste gösterilir. Özellikle "kapanmayan
 * işaret" hâli kritik — yarım yazılmış bir yıldız çifti metnin geri kalanını yutmamalı.
 */
const INGREDIENTS = 'El açması yufka (**buğday unu**, su, tuz), Antep fıstığı (%28), **tereyağı**, şeker.';

describe('parseEmphasis', () => {
  it('vurgulu ve düz parçaları sırayla ayırır', () => {
    expect(parseEmphasis(INGREDIENTS)).toEqual([
      { text: 'El açması yufka (', strong: false },
      { text: 'buğday unu', strong: true },
      { text: ', su, tuz), Antep fıstığı (%28), ', strong: false },
      { text: 'tereyağı', strong: true },
      { text: ', şeker.', strong: false },
    ]);
  });

  it('işaretsiz metni tek düz parça olarak döner', () => {
    expect(parseEmphasis('Sade metin')).toEqual([{ text: 'Sade metin', strong: false }]);
  });

  it('KAPANMAYAN işaret metni yutmaz — kalanı düz gösterilir', () => {
    expect(parseEmphasis('Yufka (**buğday unu, su, tuz)')).toEqual([{ text: 'Yufka (**buğday unu, su, tuz)', strong: false }]);
  });

  it('tek yıldız (dipnot) vurgu saymaz', () => {
    expect(parseEmphasis('Fiyat 12,50 € *KDV dâhil')).toEqual([{ text: 'Fiyat 12,50 € *KDV dâhil', strong: false }]);
  });

  it('boş işaret çifti parça üretmez', () => {
    expect(parseEmphasis('a****b')).toEqual([
      { text: 'a', strong: false },
      { text: 'b', strong: false },
    ]);
  });

  it('boş metin boş dizi döner', () => {
    expect(parseEmphasis('')).toEqual([]);
  });
});

describe('stripEmphasis', () => {
  it('işaretleri söker, metni bozmaz', () => {
    expect(stripEmphasis(INGREDIENTS)).toBe('El açması yufka (buğday unu, su, tuz), Antep fıstığı (%28), tereyağı, şeker.');
  });
});

describe('hasEmphasis', () => {
  it('vurgu varlığını bildirir', () => {
    expect(hasEmphasis(INGREDIENTS)).toBe(true);
    expect(hasEmphasis('Sade metin')).toBe(false);
    expect(hasEmphasis('yarım **işaret')).toBe(false);
  });
});

describe('toggleEmphasis', () => {
  it('seçimi sarar ve imleci işaretin İÇİNDE bırakır', () => {
    const r = toggleEmphasis('buğday unu, su', 0, 10);
    expect(r.text).toBe('**buğday unu**, su');
    expect(r.text.slice(r.start, r.end)).toBe('buğday unu'); // seçim kaymadı
  });

  it('zaten vurguluysa kaldırır (aynı düğme iki yönlü)', () => {
    const r = toggleEmphasis('**buğday unu**, su', 2, 12);
    expect(r.text).toBe('buğday unu, su');
    expect(r.text.slice(r.start, r.end)).toBe('buğday unu');
  });

  it('boş seçimde metne DOKUNMAZ (yarım işaret bırakmaz)', () => {
    expect(toggleEmphasis('buğday unu', 4, 4)).toEqual({ text: 'buğday unu', start: 4, end: 4 });
  });

  it('sarma → kaldırma gidiş-dönüşü metni aynen geri verir', () => {
    const wrapped = toggleEmphasis('su, tuz, şeker', 4, 7);
    const back = toggleEmphasis(wrapped.text, wrapped.start, wrapped.end);
    expect(back.text).toBe('su, tuz, şeker');
  });
});
