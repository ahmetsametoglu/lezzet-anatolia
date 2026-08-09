import Stripe from 'stripe';
import type { CheckoutSessionCreator } from '@lezzet/application';
import { CurrencyEnum } from '@lezzet/types';

/**
 * Sağlayıcı istemcisi — `apps/mobile-api`nin TEK Stripe kapısı.
 *
 * **Neden burada, `payments.ts` içinde değil:** o dosyanın künyesi kuralı zaten yazmıştı — *"ikinci
 * tüketicisi çıktığında dosya-içi olmaktan çıkıp `src/lib/stripe.ts`e taşınır."* İkinci tüketici
 * checkout ucudur (siparişi açarken ödeme niyetini de açması gerekiyor); iki dosyanın kendi
 * istemcisini kurması, anahtarın iki yerden okunması ve bir gün birinin ötekinden geride kalması
 * demekti.
 *
 * **Web'in `apps/web/lib/stripe.ts`i ile aynı desen ve bu bir KOPYA DEĞİL, mecburiyet:** o dosya bir
 * Next uygulamasının içinde yaşıyor ve `apps/mobile-api` onu import edemez. Ortak bir pakete
 * çıkarmak da doğru değil: `stripe` npm paketi `@lezzet/application`ın bağımlılığı OLAMAZ — o paket
 * React Native tarafından da okunabilen bir bağımlılık ağacında yaşıyor. Kural bu yüzden şudur:
 * **sağlayıcı istemcisi UÇTA kalır, paylaşılan katman onu PORT olarak ister** (`CheckoutSessionCreator`).
 *
 * Anahtarsızlık SESSİZ BAŞARI DEĞİLDİR: yerelde ödeme anahtarsız çalışmak meşrudur ama "ödeme
 * alındı" demek değildir — çağıran `null` görüp adlı bir retle döner (`provider_unavailable`).
 */
let cachedStripe: Stripe | null | undefined;

export function stripeClient(): Stripe | null {
  if (cachedStripe !== undefined) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  cachedStripe = key ? new Stripe(key) : null;
  return cachedStripe;
}

/** Stripe cent ve KÜÇÜK HARFLİ kod bekler; tek kaynak yine şemanın kendisi (`CurrencyEnum`). */
export const PROVIDER_CURRENCY = CurrencyEnum.options[0].toLowerCase();

/**
 * Paylaşılan katmanın istediği ödeme kapısı (`CheckoutSessionCreator`) — Stripe'a bağlanmış hâli.
 *
 * Kapının şekli `@lezzet/application`ta tanımlı; burada yalnız SAĞLAYICIYA çevriliyor. Alanların
 * gerekçeleri `payments.ts`in niyet çağrısında yazılı ve BİREBİR aynı tutuldu — iki yol da aynı
 * webhook'a düşüyor, yani künye (`order_id`) ve yöntem kümesi ayrışırsa onay bir yolda çalışıp
 * ötekinde çalışmaz:
 * · `payment_method_types: ['card']` — cüzdanlar (Apple/Google Pay) da kart yöntemidir. Otomatik
 *   yöntemler açık bırakılsaydı sepete uymayan seçenekler (taksit, sonra öde) belirirdi.
 * · `metadata.order_id` — siparişe geri dönüşün TEK yolu; webhook bu alanı okur.
 * · `surface` yalnız künye: hangi yüzeyden ödendiği sağlayıcı panelinde görünsün diye.
 *
 * **İdempotency anahtarı TUTARI da içerir:** aynı siparişin tutarı değişirse (kalem çıkarıldı,
 * kupon uygulandı) o artık başka bir ödemedir ve sağlayıcının eski niyeti döndürmesi yanlış tutarı
 * tahsil ettirirdi. `payments.ts`teki anahtarla aynı biçim.
 *
 * `null` istemcide kapı da `null`dır — `placeOrder` onu "anahtar yok" diye okur ve
 * `provider_unavailable` döner. Sessiz başarı YOK.
 */
export function paymentSessionCreator(): CheckoutSessionCreator | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  return async ({ amountCents, orderId, description, reservationExpiresAt }) => {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: PROVIDER_CURRENCY,
        description,
        payment_method_types: ['card'],
        metadata: { order_id: orderId, surface: 'mobile', reservation_expires_at: reservationExpiresAt },
      },
      { idempotencyKey: `mobile:order:${orderId}:${amountCents}` },
    );
    return { id: intent.id, clientSecret: intent.client_secret };
  };
}
