import type { CartState } from '@/screens/customer-kit/cart-store';

/*
  SEPET DEMO/TEST VERİSİ — 21.14 ilk etabı UI-only. Sepetin bir UCU YOK; ekran sepet deposundan
  (`customer-kit/cart-store`) besleniyor ve depo bu dosyadaki satırlarla kuruluyor.

  KUPON SÖZLÜĞÜ de burada: gerçek kupon doğrulaması SUNUCUNUN işidir (kod · geçerlilik · asgari
  tutar · tek kullanım). Bu etapta ekranın "kod girildi → indirim düştü → satır göründü"
  davranışını GERÇEKTEN çalıştırabilmesi için bilinen iki kod yeterli; sunucu geldiğinde bu sözlük
  silinir, ekranın kupon akışı aynen kalır.
*/

/** Bilinen kuponlar: kod → indirim (cent). Kod büyük harfe çevrilerek aranır. */
export const DEMO_COUPONS: Record<string, number> = {
  LEZZET5: 500,
  PUAN5: 500,
};

/**
 * ASGARİ SEPET TUTARI (cent) — şablonun 25 €'su. Gerçekte bir AYAR olacak (`settings`), bu etapta
 * parametrik bir sabit: değeri değiştirmek tek satır (CLAUDE §4 — eşik sorulmaz, makul varsayılan
 * konur ve parametrik yapılır).
 */
export const MINIMUM_ORDER_CENTS = 2500;

/** Şablonun dolu sepeti: bir hazır paket + iki ürün satırı. */
export function cartFixture(overrides: Partial<CartState> = {}): CartState {
  return {
    products: [
      {
        id: 'su-boregi-500g',
        slug: 'su-boregi',
        name: 'Su Böreği',
        variantLabel: '500 g',
        unitCents: 1290,
        quantity: 2,
        photoUri: null,
        discounted: false,
        soldOut: false,
      },
      {
        id: 'kunefe-1kg',
        slug: 'kunefe',
        name: 'Künefe',
        variantLabel: '1 kg',
        unitCents: 950,
        quantity: 1,
        photoUri: null,
        discounted: true,
        soldOut: false,
      },
    ],
    bundles: [
      {
        id: 'kahvalti-paketi',
        name: 'Kahvaltı Paketi',
        contentLabel: 'Beyaz peynir · zeytin · bal · tereyağı · simit · reçel',
        unitCents: 3490,
        quantity: 1,
        photoUri: null,
      },
    ],
    coupon: null,
    ...overrides,
  };
}
