import 'server-only';
import { stripeClient } from '../stripe';

/**
 * **Stripe'ın muhasebe yüzü** (12.14 · kullanıcı kararı 13.09: ücret ödeme başına, payout otomatik) —
 * webhook işleyicisinin sağlayıcıya sorduğu iki şeyin PORTU (`ProviderRefunder` ile aynı desen):
 * testin sahtesi ağa çıkmadan "ücret şu kadar" ya da "payout şunları taşıyor" diyebilsin.
 *
 * Neden iki çağrı: webhook gövdesi ücreti TAŞIMAZ. `payment_intent.succeeded` niyeti verir, ücret
 * ödemenin `balance_transaction`ındadır; `payout.paid` toplamı verir, içi (hangi tahsilatlar, hangi
 * iadeler, ne kadar ücret) yine ayrı bir listedir. İkisi de sağlayıcıya sorulur.
 */

/** Ödemenin Stripe ücreti — `balance_transaction`dan. */
export interface PaymentFee {
  feeCents: number;
  balanceTransactionId: string;
  chargeId: string | null;
}

/** Payout'un içindeki bir kalem: tahsilat (`charge`/`payment`), iade (`refund`), ücret, düzeltme… */
export interface PayoutItem {
  /** Bakiye işleminin kimliği (`txn_…`) — ödeme dışı ücretin yazım kimliği bundan kurulur. */
  id: string;
  type: string;
  /** Brüt, işaretli (**cent**): tahsilat artı, iade eksi. */
  amountCents: number;
  feeCents: number;
  netCents: number;
  /** Tahsilat ya da iadeyse ödeme niyeti — siparişe bağ (tahsilatın künyesi `providerRef`). */
  paymentIntentId: string | null;
}

export interface StripeEffects {
  /** Ödemenin ücreti. `null` = öğrenilemedi (anahtar yok ya da işlem henüz yerleşmedi); tahsilat yine onaylanır, ücret payout'ta tamamlanır. */
  feeOf(paymentIntentId: string): Promise<PaymentFee | null>;
  /** Payout'un kalemleri; anahtarsız ortamda boş — transfer yine yazılır, künyesi boş kalır. */
  payoutItems(payoutId: string): Promise<PayoutItem[]>;
}

/** Portun bugünkü uygulaması. Anahtar yoksa "bilinmiyor" döner — uydurma sıfır değil. */
export function stripeEffects(): StripeEffects {
  return {
    async feeOf(paymentIntentId) {
      const stripe = stripeClient();
      if (!stripe) return null;
      // Tek çağrı: niyet → son ödeme → bakiye işlemi. Ücret yalnız burada yazılı.
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] });
      const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
      const transaction = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
      if (!transaction) return null;
      return { feeCents: transaction.fee, balanceTransactionId: transaction.id, chargeId: charge?.id ?? null };
    },

    async payoutItems(payoutId) {
      const stripe = stripeClient();
      if (!stripe) return [];
      const items: PayoutItem[] = [];
      // Sayfalama kütüphanenin: 100'lük sayfalar, hepsi gezilir — yarım payout içeriği yarım künye olurdu.
      for await (const transaction of stripe.balanceTransactions.list({ payout: payoutId, limit: 100, expand: ['data.source'] })) {
        // Payout'un kendisi listede eksi kalem olarak durur; içerik değil, kabuk.
        if (transaction.type === 'payout') continue;
        const source = typeof transaction.source === 'object' ? transaction.source : null;
        const intent =
          source && (source.object === 'charge' || source.object === 'refund')
            ? typeof source.payment_intent === 'string'
              ? source.payment_intent
              : (source.payment_intent?.id ?? null)
            : null;
        items.push({
          id: transaction.id,
          type: transaction.type,
          amountCents: transaction.amount,
          feeCents: transaction.fee,
          netCents: transaction.net,
          paymentIntentId: intent,
        });
      }
      return items;
    },
  };
}
