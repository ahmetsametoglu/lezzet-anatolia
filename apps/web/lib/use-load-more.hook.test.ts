import { describe, expect, it } from 'vitest';
import { loadMoreDecision } from './use-load-more.hook';

// Sona-yaklaşınca yüklemenin KARARI (09.17). Gözlemcinin kendisi DOM'a bağlı ve bu yüzeyde DOM
// harness'ı yok; karar saf bir fonksiyona çıkarıldı ki dört hâl de kanıtlanabilsin.
//
// Buradaki asıl nöbet "dinlenme hâli düğme değildir": `autoActive` yanlışlıkla false'a düştüğü an
// operasyon listesi yeniden titremeye başlar ve bunu ekranda görmek dışında fark etmenin yolu yok.

const base = { nearEnd: null as boolean | null, loading: false, hasMore: true, autoPages: 0, maxAutoPages: 3 };

describe('loadMoreDecision', () => {
  it('sayfa kalmadıysa ne çeker ne denetim gösterir; sayaç da sıfırlanır', () => {
    expect(loadMoreDecision({ ...base, hasMore: false, autoPages: 2 })).toEqual({
      fetch: false,
      autoPages: 0,
      autoActive: false,
    });
  });

  it('gözlemci henüz haber vermediyse çekmez ama otomatik yolu İŞLİYOR sayar', () => {
    // İlk boyamanın düğme göstermemesinin tek sebebi bu: `nearEnd` üç değerli olmasa, gözlemcinin
    // ilk raporu gelene kadar kısa listelerde düğme göz kırpardı.
    expect(loadMoreDecision({ ...base, nearEnd: null })).toEqual({ fetch: false, autoPages: 0, autoActive: true });
  });

  it('eşiğe girildiğinde çeker ve turu sayar', () => {
    expect(loadMoreDecision({ ...base, nearEnd: true })).toEqual({ fetch: true, autoPages: 1, autoActive: true });
  });

  it('yükleme sürerken ikinci kez çekmez', () => {
    // Gözlemci artık sökülmediği için aynı sayfayı iki kez istememeyi sağlayan yer BURASI.
    expect(loadMoreDecision({ ...base, nearEnd: true, loading: true, autoPages: 1 })).toEqual({
      fetch: false,
      autoPages: 1,
      autoActive: true,
    });
  });

  it('eşikten çıkmak ilerlemedir: sayaç sıfırlanır', () => {
    // Gelen sayfa nöbetçiyi aşağı itti. Sayaç "kaç sayfa çekildi" değil, "kullanıcı ilerlemeden kaç
    // sayfa çekildi" sayıyor.
    expect(loadMoreDecision({ ...base, nearEnd: false, autoPages: 2 })).toEqual({
      fetch: false,
      autoPages: 0,
      autoActive: false,
    });
  });

  it('sınıra varınca otomatik yol kapanır ve söz kullanıcıya geçer', () => {
    expect(loadMoreDecision({ ...base, nearEnd: true, autoPages: 3 })).toEqual({
      fetch: false,
      autoPages: 3,
      autoActive: false,
    });
  });

  it('eşikte kalan nöbetçi sınıra kadar sayar, sonra durur', () => {
    // Client süzgeci gelen satırları yiyorsa (fiyat/stok `scope` çipi) nöbetçi hiç görüş alanından
    // çıkmaz. Sınır olmasa katalogun tamamı kaydırma olmadan akardı.
    let autoPages = 0;
    const turlar: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      const d = loadMoreDecision({ ...base, nearEnd: true, autoPages });
      turlar.push(d.fetch);
      autoPages = d.autoPages;
    }
    expect(turlar).toEqual([true, true, true, false, false, false]);
    expect(autoPages).toBe(3);
  });

  it('sınır parametrik — 1 verildiğinde tek tur çeker', () => {
    expect(loadMoreDecision({ ...base, nearEnd: true, maxAutoPages: 1 }).fetch).toBe(true);
    expect(loadMoreDecision({ ...base, nearEnd: true, autoPages: 1, maxAutoPages: 1 })).toEqual({
      fetch: false,
      autoPages: 1,
      autoActive: false,
    });
  });
});
