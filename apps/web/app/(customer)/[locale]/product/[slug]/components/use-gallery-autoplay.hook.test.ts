import { describe, expect, it } from 'vitest';
import { autoplayRuns, wrapIndex } from './use-gallery-autoplay.hook';

// Galeri müşteri fareyle üstündeyken, sekme arkadayken ya da hareket azaltılmışken kayarsa; ya da son görselden sonra
// durup ilkine dönmezse bu dosya kırmızıya döner.

const bos = { count: 4, held: false, hidden: false, reducedMotion: false };

describe('galerinin otomatik geçişi ne zaman işler', () => {
  it('kimse bakmıyorken ve birden çok görsel varken işler', () => {
    expect(autoplayRuns(bos)).toBe(true);
  });

  it('fare ya da odak galerideyken, sekme görünmezken ve hareket azaltılmışken durur', () => {
    expect(autoplayRuns({ ...bos, held: true })).toBe(false);
    expect(autoplayRuns({ ...bos, hidden: true })).toBe(false);
    expect(autoplayRuns({ ...bos, reducedMotion: true })).toBe(false);
  });

  it('tek görselde sayacak bir şey yok', () => {
    expect(autoplayRuns({ ...bos, count: 1 })).toBe(false);
  });
});

describe('sıranın iki uçta dönmesi', () => {
  it('sondan sonra ilk görsel, ilkinden önce son görsel', () => {
    expect(wrapIndex(4, 4)).toBe(0);
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(2, 4)).toBe(2);
  });
});
