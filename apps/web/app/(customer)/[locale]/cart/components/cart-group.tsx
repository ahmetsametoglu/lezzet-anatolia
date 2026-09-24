'use client';

import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { cartKey, shippingGroupFree, type CartLine, type CartView } from '@/lib/cart/cart-types';
import { CartLineRow } from './cart-line';
import { checkoutBlockReason, useCheckoutGate } from './cart-summary';
import type { Messages } from '../cart-types';

/**
 * Sepetin grupları: gruplama kalemin hâlinden doğar, müşteri yol seçmez; kendi deposunda olan her şey araçla gider. İki grup iki
 * sipariş ve iki ödemedir, ikincisi zorunlu değildir; tek grupta başlık çizilmez, çünkü ayrım ancak ayrılacak bir şey varken bilgidir.
 */

interface CartGroupProps {
  /** `undeliverable`: bu adrese gelemeyenler; siparişe girmezler, o yüzden toplamları ve eylemleri yoktur. */
  kind: 'route' | 'shipping' | 'undeliverable';
  lines: CartLine[];
  view: CartView;
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartGroup({ kind, lines, view, t, locale, compact = false }: CartGroupProps) {
  const { place } = useDeliveryPlace();
  const g = t.group;
  const shipping = kind === 'shipping';
  const undeliverable = kind === 'undeliverable';

  // Grubun kalem toplamı kendi satırlarından; indirim burada yazılmaz, çünkü her sipariş indirimini checkout'ta kendi kalemleriyle
  // yeniden alır.
  const itemsCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  // Kargo ücreti yazılmaz, çünkü taşıyıcı onu ödeme adımında seçilen servise göre fiyatlar; grup yalnız eşik cevabını söyler.
  const threshold = shippingGroupFree(view);

  const title = undeliverable
    ? cartMessages[locale].group.undeliverable
    : shipping
      ? g.shippingTitle
      : place?.nextDate
      ? g.routeTitleDated.replace('{date}', formatDeliveryDate(place.nextDate, locale))
      : g.routeTitle;

  return (
    <div className={['flex flex-col', compact ? 'gap-2.5' : 'gap-3.5'].join(' ')}>
      {/* Başlık + saç teli çizgi: grubu komşusundan ayırır ama bir kutu kurmaz — kalemler kendi
          kartlarında kalsın, ikinci bir çerçeve sepeti kutu içinde kutu yapardı. */}
      <div className="flex items-center gap-3">
        <span
          className={[
            'inline-flex items-center gap-1.5 font-sans font-bold',
            compact ? 'text-micro' : 'text-note',
            undeliverable ? 'text-honey' : shipping ? 'text-muted' : 'text-olive-dark',
          ].join(' ')}
        >
          <Icon name={undeliverable ? 'snowflake' : shipping ? 'box' : 'truck'} size={compact ? 13 : 15} />
          {title}
        </span>
        <span className="h-px flex-1 bg-sand-200" />
      </div>

      {lines.map((line) => (
        <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} compact={compact} tone={shipping ? 'shipping' : 'default'} />
      ))}

      {undeliverable ? null : shipping ? (
        <ShippingAction
          view={view}
          t={t}
          locale={locale}
          compact={compact}
          itemsCents={itemsCents}
          free={threshold.free}
          remainingCents={threshold.remainingForFreeCents}
        />
      ) : (
        <RouteAction view={view} t={t} locale={locale} compact={compact} totalCents={itemsCents} />
      )}
    </div>
  );
}

interface RouteActionProps {
  view: CartView;
  t: Messages;
  locale: Locale;
  compact: boolean;
  totalCents: number;
}

/**
 * Rota grubunun eylemi, sepetin asıl akışı; engeller sepetin tamamına aittir ve burada da kilitler ki müşteri boşuna bir adım
 * ilerlemesin.
 */
function RouteAction({ view, t, locale, compact, totalCents }: RouteActionProps) {
  // Kimlik ve adres kapısı sepetin engelinden sonra, özet kartıyla aynı sıra ve aynı kanca.
  const gate = useCheckoutGate(t);
  const reason = checkoutBlockReason(view, t, locale) ?? gate;
  const blocked = reason !== null;

  return (
    <div
      className={[
        'flex items-center gap-4 rounded-card border border-olive-line bg-olive-bg',
        compact ? 'flex-col items-stretch gap-2.5 px-3.5 py-3' : 'px-5 py-4',
      ].join(' ')}
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <span className={['font-sans font-bold text-ink', compact ? 'text-copy' : 'text-card-title-sm'].join(' ')}>
          {t.group.routeTotal.replace('{amount}', formatPrice(totalCents, locale))}
        </span>
        <span className={['font-sans text-olive-dark', compact ? 'text-micro' : 'text-note'].join(' ')}>{t.group.routeNote}</span>
      </div>
      {blocked ? (
        <button
          type="button"
          disabled
          title={reason ?? undefined}
          className={buttonClass({ variant: 'primary', size: 'md', compact, fullWidth: compact, className: 'disabled:cursor-not-allowed' })}
        >
          {t.checkout}
        </button>
      ) : (
        <Link href="/checkout" className={buttonClass({ variant: 'primary', size: 'md', compact, fullWidth: compact })}>
          {t.checkout}
        </Link>
      )}
    </div>
  );
}

interface ShippingActionProps {
  view: CartView;
  t: Messages;
  locale: Locale;
  compact: boolean;
  itemsCents: number;
  /** Kargo grubu ücretsiz kargo eşiğini geçti mi. */
  free: boolean;
  remainingCents: number;
}

/**
 * Kargo grubunun eylemi: çerçeveli düğme, çünkü bu ikinci ve isteğe bağlı sipariştir. Kendi eşiği, ücretin ödeme adımında belli olacağı
 * ve yalnız online ödeme burada söylenir, yoksa ikinci sipariş sürprizle başlar.
 */
function ShippingAction({ view, t, locale, compact, itemsCents, free, remainingCents }: ShippingActionProps) {
  const g = t.group;
  // Kargo siparişi de kimlik ve adres ister; tükenen kalem sepetin tamamını durdurur, kapı ondan sonra okunur.
  const gate = useCheckoutGate(t);
  const reason = view.hasBlocked ? t.checkoutBlocked : gate;
  const blocked = reason !== null;

  const breakdown = [
    (free ? g.shippingFeeFree : g.shippingFee).replace('{items}', formatPrice(itemsCents, locale)),
    remainingCents > 0 ? g.shippingRemaining.replace('{amount}', formatPrice(remainingCents, locale)) : null,
    g.shippingPayment,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-2.5'}>
      <div
        className={[
          'flex items-center gap-4 rounded-card border border-sand-300 bg-sand-100',
          compact ? 'flex-col items-stretch gap-2.5 px-3.5 py-3' : 'px-5 py-4',
        ].join(' ')}
      >
        <div className="flex flex-1 flex-col gap-0.5">
          <span className={['font-sans font-bold text-ink', compact ? 'text-copy' : 'text-card-title-sm'].join(' ')}>
            {g.shippingTotal.replace('{amount}', formatPrice(itemsCents, locale))}
          </span>
          <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>{breakdown}</span>
        </div>
        {/* Asgari sepet BU gruba işlemez: eşik siparişin kendi tutarına bakar ve kargo siparişi
            ayrı bir siparıştir — rota grubunun eksiği yüzünden kargo siparişini kilitlemek,
            olmayan bir bağ kurmak olurdu. Tükenen kalem ise sepetin tamamını durdurur. */}
        {blocked ? (
          <button
            type="button"
            disabled
            title={reason ?? undefined}
            className={buttonClass({ variant: 'outlineOlive', size: 'md', compact, fullWidth: compact, className: 'disabled:cursor-not-allowed' })}
          >
            {compact ? g.shippingCtaShort : g.shippingCta}
          </button>
        ) : (
          <Link
            href={{ pathname: '/checkout', query: { group: 'shipping' } }}
            className={buttonClass({ variant: 'outlineOlive', size: 'md', compact, fullWidth: compact })}
          >
            {compact ? g.shippingCtaShort : g.shippingCta}
          </Link>
        )}
      </div>
      <span className="font-sans text-micro leading-relaxed text-muted">{g.shippingFootnote}</span>
    </div>
  );
}
