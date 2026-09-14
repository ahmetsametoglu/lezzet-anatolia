'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { focusRingClass } from '@/components/customer/ui/button';
import { formatPrice } from '@/lib/storefront/format';
import type { CustomerAwaitingPayment } from '@/lib/order/customer-orders';
import type { Messages } from '../cart-types';

/**
 * "Kart ödemeniz henüz onaylanmadı" bandı (07.18) — sepetin başında, uyarıların ilki.
 *
 * Sepet ancak sipariş onaylanınca boşalıyor. Ödemenin sonucu gelmemişken sepete dönen müşteri dolu
 * sepeti "hiç ödemedim" diye okuyordu (kullanıcı bildirimi 14.09). Bant yalnız olguyu söyler — sonuç
 * bize ulaşmadı — ve ödemenin sayfasına götürür; canlı durum (geçti · bankada · tamamlanmadı) orada
 * okunur. Yeniden ödemeye kalkan müşteriyi checkout ayrıca durdurur (`openPaymentBefore`): önceki ödeme
 * geçtiyse ya da bankada işleniyorsa ikinci çekim açılmaz.
 *
 * Dili sepetin öteki bal bantlarıyla aynı (stok uyarısı, yer değişimi) — müşteri hata yapmadı. Tasarım
 * paketinde çizili değil: işlev isteği, mevcut bandın kabuğuyla (KARARLAR 14.09).
 */
interface AwaitingPaymentNoticeProps {
  t: Messages;
  locale: Locale;
  awaiting: CustomerAwaitingPayment;
  compact?: boolean;
}

export function AwaitingPaymentNotice({ t, locale, awaiting, compact = false }: AwaitingPaymentNoticeProps) {
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-soft border border-honey-line bg-honey-bg',
        compact ? 'px-3.5 py-2.5' : 'px-4.5 py-3.5',
      ].join(' ')}
    >
      <span className={['font-sans font-semibold text-honey', compact ? 'text-note' : 'text-body-sm'].join(' ')}>
        {t.awaitingPayment.title}
      </span>
      <span className={['font-sans leading-relaxed text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
        {t.awaitingPayment.body.replace('{amount}', formatPrice(awaiting.totalCents, locale))}
      </span>
      <Link
        href={{ pathname: '/checkout/[reference]', params: { reference: awaiting.orderId } }}
        className={`w-fit cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
      >
        {t.awaitingPayment.cta}
      </Link>
    </div>
  );
}
