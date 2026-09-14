import { PAYMENT_INTENT_STATUSES, type PaymentIntentStatus } from '@lezzet/domain-core';

/**
 * **Sağlayıcıya soran port** (07.18) — ödemenin durumu, iptali ve iadesi.
 *
 * Paket `stripe` npm'ine bağlanamaz (bağımlılık ağacını React Native de okuyor — `checkout-session`
 * künyesi); istemci çağırandan gelir. Bu dosya istemcinin KULLANDIĞIMIZ yüzünü yapısal olarak tarif
 * eder (`StripeLike`) ve uyarlamayı TEK yerde tutar: web de arka uç da aynı uyarlamayı çağırır, iki
 * uygulamanın kendi kopyası olmaz.
 */

/** Sağlayıcıdaki ödemenin bize yeten yüzü. */
export interface PaymentSnapshot {
  id: string;
  status: PaymentIntentStatus;
  /** Gerçekten alınan tutar (cent) — sipariş toplamı değil; ikisi ayrılırsa doğru olan paradır. */
  amountReceivedCents: number;
  /** Sağlayıcının künyesindeki sipariş — ödemenin BU siparişe ait olduğunu doğrulamak için. */
  orderId: string | null;
}

export interface PaymentGateway {
  /** `null` = tanımadığımız bir durum: karar verilemez, bir sonraki soruya bırakılır. */
  read(intentId: string): Promise<PaymentSnapshot | null>;
  cancel(intentId: string): Promise<void>;
  refund(intentId: string): Promise<void>;
}

/** Stripe istemcisinin kullandığımız yüzü — yapısal: `stripe` paketinin tipine bağlanmaz. */
export interface StripeLike {
  paymentIntents: {
    retrieve(id: string): Promise<{ id: string; status: string; amount_received: number; metadata?: Record<string, string> | null }>;
    cancel(id: string): Promise<unknown>;
  };
  refunds: {
    create(params: { payment_intent: string }): Promise<unknown>;
  };
}

/** Stripe istemcisini porta uyarlar; anahtarsız ortamda istemci yoktur, port da yoktur. */
export function stripeGateway(client: StripeLike | null): PaymentGateway | null {
  if (!client) return null;
  return {
    async read(intentId) {
      const intent = await client.paymentIntents.retrieve(intentId);
      const status = PAYMENT_INTENT_STATUSES.find((known) => known === intent.status);
      // Sağlayıcı yeni bir durum eklediyse karar VERİLMEZ: yanlış tahmin, ödenmiş bir siparişi iptal
      // edebilirdi. Bir sonraki soru (sayfa ya da zamanlayıcı) yine sorar.
      if (!status) return null;
      return {
        id: intent.id,
        status,
        amountReceivedCents: intent.amount_received,
        orderId: intent.metadata?.['order_id'] ?? null,
      };
    },
    async cancel(intentId) {
      await client.paymentIntents.cancel(intentId);
    },
    async refund(intentId) {
      await client.refunds.create({ payment_intent: intentId });
    },
  };
}
