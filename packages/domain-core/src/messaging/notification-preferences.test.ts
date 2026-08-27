import { describe, expect, it } from 'vitest';
import { MarketingChannelEnum } from '@lezzet/types';
import { marketingAllowed, notificationAllowed, notificationToken } from './notification-preferences';

/**
 * Bildirim tercihleri (22.08) — **iki kapı, iki ZIT varsayılan** ve testin asıl konusu bu.
 *
 * Dosya 26.08 denetiminde yazıldı: üç fonksiyonun üçü de testsizdi, `marketingAllowed`ı ise hiçbir
 * yerden çağıran yoktu (gönderim aracı `14.8` ile gelecek — künyesinde `BEKLEYEN` işareti duruyor).
 * Kapının beklerken DOĞRU beklediğinden emin olmak testin işi: yanlış yazılmış bir izin kapısı,
 * bağlandığı gün fark edilir ve o gün en kötü zamandır.
 *
 * Arızanın türü de burada özel: bu iki fonksiyonun hatası SESSİZDİR. Gönderilmeyen bir maili kimse
 * fark etmez, gönderilmemesi gereken bir maili ise yalnız alıcı fark eder — ve o bir şikâyettir.
 */

describe('marketingAllowed — OPT-IN: sessizlik rıza değildir', () => {
  it('anahtar HİÇ yoksa izin yoktur', () => {
    expect(marketingAllowed(null, 'email')).toBe(false);
    expect(marketingAllowed(undefined, 'email')).toBe(false);
    expect(marketingAllowed({}, 'email')).toBe(false);
  });

  it('anahtar var ama `granted` değilse izin yoktur', () => {
    expect(marketingAllowed({ email: { granted: false, at: '2026-08-01T00:00:00Z' } }, 'email')).toBe(false);
  });

  it('yalnız AÇIK onay izin verir', () => {
    expect(marketingAllowed({ email: { granted: true, at: '2026-08-01T00:00:00Z' } }, 'email')).toBe(true);
  });

  it('izin KANAL BAZINDADIR — birine verilen onay ötekini açmaz', () => {
    const consent = { email: { granted: true, at: '2026-08-01T00:00:00Z' } };
    for (const channel of MarketingChannelEnum.options) {
      expect(marketingAllowed(consent, channel)).toBe(channel === 'email');
    }
  });
});

describe('notificationAllowed — OPT-OUT: yalnız açık ret susturur', () => {
  it('anahtar hiç yoksa GÖNDERİLİR — özellik doğduğu gün susmasın diye', () => {
    expect(notificationAllowed(null, 'feedbackInvite')).toBe(true);
    expect(notificationAllowed(undefined, 'feedbackInvite')).toBe(true);
    expect(notificationAllowed({}, 'feedbackInvite')).toBe(true);
  });

  it('`granted: false` yazılıysa gitmez — ret açık olmalı', () => {
    expect(notificationAllowed({ feedbackInvite: { granted: false, at: '2026-08-01T00:00:00Z' } }, 'feedbackInvite')).toBe(false);
  });

  it('açık onay da elbette gönderir', () => {
    expect(notificationAllowed({ feedbackInvite: { granted: true, at: '2026-08-01T00:00:00Z' } }, 'feedbackInvite')).toBe(true);
  });
});

describe('iki kapının varsayılanı BİLEREK terstir', () => {
  /*
    Aynı "anahtar yok" hâli birinde hayır, ötekinde evet demeli. Tutarsızlık değil, iki ayrı hukuki
    zemin: kampanya açık rıza ister; teslim edilmiş bir siparişin değerlendirme daveti mevcut
    müşteri ilişkisine dayanır ve gereken şey rızanın kendisi değil kolay reddedilebilirliktir.
    Biri ötekine "tutarlılık" adına uydurulursa ya kampanya izinsiz gider ya davet hiç gitmez.
  */
  it('boş kayıt: kampanya HAYIR, davet EVET', () => {
    expect(marketingAllowed({}, 'email')).toBe(false);
    expect(notificationAllowed({}, 'feedbackInvite')).toBe(true);
  });
});

describe('notificationToken — süresiz anahtarın payı geniş olmalı', () => {
  it('24 hane: değerlendirme jetonunun 16’sından uzun, çünkü ömrü uzun', () => {
    expect(notificationToken()).toHaveLength(24);
  });

  it('telefonda okunabilen alfabe — karışan karakterler (I O S Z 0 1 2 5 8) yok', () => {
    for (const token of Array.from({ length: 100 }, () => notificationToken())) {
      expect(token).not.toMatch(/[IOSZ01258]/);
    }
  });

  it('rastgeledir — ardışık üretimler çakışmaz', () => {
    const uretilenler = new Set(Array.from({ length: 500 }, () => notificationToken()));
    expect(uretilenler.size).toBe(500);
  });

  it('rastgelelik enjekte edilebilir — üreteç testte sabitlenebilir', () => {
    expect(notificationToken(() => 0)).toBe('3'.repeat(24));
  });
});
