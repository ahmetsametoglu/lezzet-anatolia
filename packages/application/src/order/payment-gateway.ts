import type { ProviderPaymentStatus } from '@lezzet/domain-core';

/** Sağlayıcıya soran port: ödemenin durumu, iptali ve iadesi; uyarlama `revolut.ts`te, testte sahte. */

/** Sağlayıcıdaki ödemenin bize yeten yüzü. */
export interface PaymentSnapshot {
  id: string;
  status: ProviderPaymentStatus;
  /** Gerçekten alınan tutar (cent) — sipariş toplamı değil; ikisi ayrılırsa doğru olan paradır. */
  amountReceivedCents: number;
  /** Sağlayıcının künyesindeki sipariş — ödemenin BU siparişe ait olduğunu doğrulamak için. */
  orderId: string | null;
  /** Yarım kalan ödemeye dönmenin anahtarı: aynı ödeme yeniden açılır, ikinci ödeme doğmaz. */
  paymentToken: string | null;
}

export interface PaymentGateway {
  /** `null` = tanımadığımız bir durum: karar verilemez, bir sonraki soruya bırakılır. */
  read(paymentRef: string): Promise<PaymentSnapshot | null>;
  cancel(paymentRef: string): Promise<void>;
  /** Ödemenin iade edilmemiş kalanının tamamını iade eder. */
  refund(paymentRef: string): Promise<void>;
}
