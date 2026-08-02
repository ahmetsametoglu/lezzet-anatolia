import 'server-only';
import { captureError, SOURCES } from '@lezzet/observability';
import { stripeClient } from '../stripe';

/**
 * **Sağlayıcıya iade** (07.11) — paranın karta fiilen dönmesi. DOMAIN §9, ORDER_LIFECYCLE.
 *
 * 07.9 iadenin MUHASEBESİNİ kapatmıştı: hareket doğru hesaba doğru tutarla yazılıyor ve
 * `payment_status` ondan türüyor. Kapanmayan şey paranın dönmesiydi — kartla ödenmiş bir siparişte
 * defter "iade edildi" derken müşterinin kartı hiçbir şey görmüyordu. Burası o boşluğu kapatır.
 *
 * **Port olarak yazıldı** (`CheckoutSessionCreator` ile aynı desen): iadenin SIRASI ve başarısızlık
 * davranışı gerçek sağlayıcıya ağdan gitmeden sınanabilsin diye. Testin sahte üreteci parayı
 * döndürmeden "döndü" ya da "düştü" diyebilir.
 */

export type ProviderRefundOutcome =
  | { status: 'ok'; refundId: string }
  /** Sağlayıcı reddetti ya da ulaşılamadı — **hareket YAZILMAZ**, borç açıkta kalır. */
  | { status: 'failed'; error: string }
  /** Anahtar yok (yerel/geliştirme). "İade edildi" demekle karıştırılmaz. */
  | { status: 'unavailable' };

export interface ProviderRefundInput {
  /** Paranın GELDİĞİ ödeme niyeti — tahsilat hareketinin künyesinden okunur. */
  paymentIntentId: string;
  amountCents: number;
  /**
   * Aynı iadenin iki kez gönderilmesini sağlayıcı tarafında engelleyen anahtar.
   *
   * Bizim tarafımızda mükerrerlik zaten mümkün: çağrı başarılı olup hareket yazılamazsa operatör
   * tekrar dener. O ikinci deneme AYNI anahtarla gider ve Stripe ilk iadenin sonucunu döner —
   * para iki kez çıkmaz. Farklı bir iade (ikinci kısmi iade) farklı anahtar taşır.
   */
  idempotencyKey: string;
}

export type ProviderRefunder = (input: ProviderRefundInput) => Promise<ProviderRefundOutcome>;

/** Portun bugünkü uygulaması. Anahtar yoksa `unavailable` — sessiz başarı değil. */
export function stripeRefunder(): ProviderRefunder {
  return async (input) => {
    const stripe = stripeClient();
    if (!stripe) return { status: 'unavailable' };

    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
          // Müşteri malı beğenmediği için değil, biz karşılayamadığımız için dönüyor. Stripe'ın
          // `fraudulent`/`duplicate` sebepleri uyuşmaz; `requested_by_customer` en yakın olanı ve
          // ihtilaf (chargeback) istatistiğimizi bozmaz.
          reason: 'requested_by_customer',
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { status: 'ok', refundId: refund.id };
    } catch (error) {
      // **İZ BURADA DÜŞÜLÜR** (OBSERVABILITY §2, §6c). Dönen `error` alanını okuyan YOK: tek çağıran
      // (`refund.ts`) yalnız `status`'a bakıp `unsettled('provider_failed')` diyor, sağlayıcının
      // söylediği sebep ("charge already refunded", "balance insufficient") orada düşüyordu. Yani
      // müşterinin parası dönmemişken elimizde neden dönmediğini söyleyen tek satır kalmıyordu —
      // gitmeyen sipariş mailiyle aynı sınıf, ondan daha ağır sonuçlu.
      // Bağlam KİMLİK taşır (§5): ödeme niyeti ve iade anahtarı (içinde sipariş kimliği var).
      await captureError(error, {
        source: SOURCES.webAction,
        context: { paymentIntentId: input.paymentIntentId, idempotencyKey: input.idempotencyKey },
      });
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  };
}
