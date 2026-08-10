import { describe, expect, it } from 'vitest';
import { trackingUrlOf } from './carrier';

/**
 * Takip adresi kuralı (08.5) — saf, DB'siz. Testler ADRESİN KENDİSİNİ değil DAVRANIŞI tutuyor:
 * taşıyıcı bir gün sitesini değiştirebilir, ama "bilinmeyen taşıyıcıya düğme çizilmez" değişmez.
 *
 * Web'den TAŞINDI (10.08 · denetim K5-1): kural pakete terfi ettikten sonra web nüshası köprü bile
 * olmadan sahipsiz kaldı ve testi köprüyü değil kuralı sınamalı — `apps/web/lib/order/carrier.ts`
 * ile testi birlikte silindi.
 */
describe('trackingUrlOf', () => {
  it('bilinen taşıyıcıya adres üretir', () => {
    expect(trackingUrlOf('colissimo', '8R452617334FR')).toContain('laposte.fr');
    expect(trackingUrlOf('chronopost', 'XY123')).toContain('chronopost.fr');
    expect(trackingUrlOf('dhl', 'XY123')).toContain('dhl.com');
    expect(trackingUrlOf('ups', 'XY123')).toContain('ups.com');
  });

  it('numara URL için KAÇIRILIR — gerçek takip numaraları boşluk taşır', () => {
    // Tasarımın örneği birebir bu: "8R 452 617 334 FR". Ham eklenseydi bağlantı bozulurdu.
    const url = trackingUrlOf('colissimo', '8R 452 617 334 FR');
    expect(url).toContain('8R%20452%20617%20334%20FR');
    expect(url).not.toContain('8R 452');
  });

  it('`other` için adres YOK — bilmediğimiz taşıyıcıya düğme sözü verilmez', () => {
    expect(trackingUrlOf('other', '8R452617334FR')).toBeNull();
  });

  it('numara yoksa adres de yok', () => {
    expect(trackingUrlOf('colissimo', null)).toBeNull();
    expect(trackingUrlOf('colissimo', '')).toBeNull();
    expect(trackingUrlOf('colissimo', '   ')).toBeNull();
  });

  it('taşıyıcı yoksa adres yok — rota siparişinde blok hiç çizilmez', () => {
    expect(trackingUrlOf(null, '8R452617334FR')).toBeNull();
  });
});
