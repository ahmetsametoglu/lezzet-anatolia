import { describe, expect, it } from 'vitest';
import { CROP_CENTER } from '@lezzet/types';
import type { StorefrontRecipeItem } from '@/lib/storefront/storefront-types';
import { buyableItems } from './recipe-types';

/**
 * **"Tümünü sepete ekle" hangi malzemeleri gönderir** (08.24).
 *
 * Kural DB'siz ve saf, çünkü sorduğu şey veri değil karar: aynı cevabı üç yer birden okuyor —
 * gönderilen liste, düğmenin pasifliği ve *"3 malzeme sepete eklendi ✓"* sayısı. Üçü ayrı ifade
 * olarak yazılsaydı biri bir gün ötekilerden ayrışır ve müşteriye eklenmeyen bir kalemi "eklendi"
 * diye sayardık — tasarımın açıkça uyardığı hata.
 */
const item = (over: Partial<StorefrontRecipeItem> = {}): StorefrontRecipeItem => ({
  variantId: 'v1',
  productSlug: 'peynir',
  name: 'Ezine Beyaz Peynir',
  unitLabel: '350 g',
  image: { url: null, crop: CROP_CENTER },
  qty: 1,
  unitPriceCents: 640,
  lineTotalCents: 640,
  stockId: null,
  soldOut: false,
  ...over,
});

describe('sepete girebilecek malzemeler', () => {
  it('alınabilir kalem geçer', () => {
    expect(buyableItems([item()])).toHaveLength(1);
  });

  it('TÜKENMİŞ kalem elenir — sepete giremez', () => {
    expect(buyableItems([item({ soldOut: true })])).toHaveLength(0);
  });

  it('FİYATSIZ kalem elenir — satışa kapalı ürün tutarsız bir toplam üretirdi', () => {
    // Kanal fiyatı girilmemiş ürün (`DOMAIN §5`): tükenmiş değil ama satılamaz.
    expect(buyableItems([item({ unitPriceCents: null, lineTotalCents: null })])).toHaveLength(0);
  });

  it('karışık listede yalnız alınabilirler kalır — sayı EKLENENİ söyler', () => {
    const list = [
      item({ variantId: 'a' }),
      item({ variantId: 'b', soldOut: true }),
      item({ variantId: 'c' }),
      item({ variantId: 'd', unitPriceCents: null, lineTotalCents: null }),
    ];
    // Dört malzemeden ikisi eklenir: onay mesajı "2" der, "4" değil.
    expect(buyableItems(list).map((i) => i.variantId)).toEqual(['a', 'c']);
  });
});
