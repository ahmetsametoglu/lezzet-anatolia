/*
  CHECKOUT TEST/DEMO VERİSİ — 21.14 ilk etabı UI-only: sipariş oluşturma ucu YOK ve bu etapta
  backend işi ÜRETİLMEZ. Adresler, teslimat yolları, günler ve ödeme yolları buradan geliyor.

  TESLİMAT KURALI ŞABLONDAN, uydurma değil: bölge içi posta kodu (67…) kapıya teslim + kapıda
  ödeme demek; dışı kargo demek ve bazı ürünler kargoya verilemez. Kural burada bir VERİ olarak
  duruyor (adresin `inDeliveryZone` alanı), ekranın içine gömülmedi — gerçek kural sunucunun
  (`delivery-zone`) ve o gün buradan çıkıp oraya taşınacak.
*/

export interface CheckoutAddressView {
  id: string;
  label: string;
  line: string;
  isDefault: boolean;
  /** Bölge içi mi (67…) — teslimat yollarını ve kapıda ödemeyi bu belirler. */
  inDeliveryZone: boolean;
}

/** Teslimat yolu — kapıya teslim ⟷ kargo. */
export type DeliveryMode = 'door' | 'shipping';

/** Ödeme yolu. Küme kapalı: ekran bunun dışına çıkamaz. */
export type PaymentMethod = 'online' | 'on_delivery' | 'transfer';

export interface CheckoutData {
  addresses: CheckoutAddressView[];
  /** Kapıya teslim günleri — biçimlenmiş metinler. */
  deliveryDays: string[];
  /** Kargo ücreti (cent); ücretsiz eşiği aşıldıysa 0. */
  shippingFeeCents: number;
  /** Kargonun ücretsiz olduğu eşik (cent). */
  freeShippingThresholdCents: number;
  /** Kargoya verilemeyen ürünlerin adları (soğuk zincir) — boşsa engel yok. */
  shippingBlockedNames: string[];
  /** Oturum açık mı — misafirde doğrulama kapısı çıkar. */
  signedIn: boolean;
  /** Doğrulanmış müşterinin adı (oturum açıkken gösterilir). */
  customerName: string;
}

export function checkoutData(overrides: Partial<CheckoutData> = {}): CheckoutData {
  return {
    addresses: [
      {
        id: 'home',
        label: 'Ev',
        line: '12 Quai des Bateliers, 67000 Strasbourg',
        isDefault: true,
        inDeliveryZone: true,
      },
      {
        id: 'family',
        label: 'Aile',
        line: '48 Rue de la République, 69002 Lyon',
        isDefault: false,
        inDeliveryZone: false,
      },
    ],
    deliveryDays: ['Yarın 09:00 – 13:00', 'Cumartesi 14:00 – 18:00'],
    shippingFeeCents: 690,
    freeShippingThresholdCents: 6000,
    shippingBlockedNames: ['Künefe'],
    signedIn: true,
    customerName: 'Ayşe Demir',
    ...overrides,
  };
}
