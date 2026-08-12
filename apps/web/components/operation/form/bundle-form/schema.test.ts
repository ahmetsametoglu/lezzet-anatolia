import { describe, expect, it } from 'vitest';
import { bundleBlock, type BundleFormValues } from './schema';

/**
 * Kaydetme kapısı — şema doğrulaması VE altlıktaki kilit sebebi aynı fonksiyondan okuyor. Birim test
 * burada çünkü sonucu doğrudan operatör görüyor: yanlışsa ya kaydedilmeyecek paket kaydedilir ya da
 * doğru paketin kaydı sebepsiz kilitlenir.
 */
const form = (over: Partial<BundleFormValues> = {}): BundleFormValues => ({
  name: { tr: 'Bayram Sofrası' },
  description: null,
  totalPrice: 49.9,
  serves: null,
  status: 'active',
  // Vitrin işareti kaydetme kapısını İLGİLENDİRMEZ (05.18): işaretli bir paket de işaretsizi de
  // aynı ön koşullarla kaydedilir. Fikstürde kapalı — varsayılan hâl.
  isFeatured: false,
  imageFocalX: 50,
  imageFocalY: 50,
  imageZoom: 1,
  items: [
    { variantId: 'v1', qty: 1, allocatedUnitPrice: 28.5 },
    { variantId: 'v2', qty: 1, allocatedUnitPrice: 21.4 },
  ],
  ...over,
});

describe('bundleBlock', () => {
  it('tutan pakette engel yok', () => {
    expect(bundleBlock(form())).toBeNull();
  });

  it('adı boş paket engellenir (üç dil de boşsa)', () => {
    expect(bundleBlock(form({ name: {} }))?.path).toBe('name');
    expect(bundleBlock(form({ name: { tr: '   ' } }))?.path).toBe('name');
  });

  it('fiyatı 0 olan paket engellenir — "0 = 0" mutabakatı yeşil yanmasın', () => {
    // Kalemler de 0 olduğu için toplam teknik olarak TUTAR; kapı yine kapalı kalmalı.
    const v = form({ totalPrice: 0, items: [{ variantId: 'v1', qty: 1, allocatedUnitPrice: 0 }] });
    expect(bundleBlock(v)?.path).toBe('totalPrice');
  });

  it('kalemsiz paket engellenir', () => {
    expect(bundleBlock(form({ items: [] }))?.path).toBe('items');
  });

  it('paylar tutmuyorsa FARK sebebin içinde yazılı', () => {
    const block = bundleBlock(form({ totalPrice: 50.9 }));
    expect(block?.path).toBe('items');
    expect(block?.message).toContain('1,00 €');
    expect(block?.message).toContain('eksik');
  });

  it('paylar fazlaysa yön "fazla" yazılır', () => {
    const block = bundleBlock(form({ totalPrice: 48.9 }));
    expect(block?.message).toContain('fazla');
  });

  it('kuruş toplamı kayan noktadan etkilenmez (0,1 + 0,2 tuzağı)', () => {
    const v = form({
      totalPrice: 0.3,
      items: [
        { variantId: 'v1', qty: 1, allocatedUnitPrice: 0.1 },
        { variantId: 'v2', qty: 1, allocatedUnitPrice: 0.2 },
      ],
    });
    expect(bundleBlock(v)).toBeNull();
  });

  it('sıra bağlayıcı: ad eksikse fiyat/kalem sorunları beklemeye alınır', () => {
    // Tek seferde tek sebep gösterilir; operatör listeyle değil sırayla ilerler.
    expect(bundleBlock(form({ name: {}, totalPrice: 0, items: [] }))?.path).toBe('name');
  });
});
