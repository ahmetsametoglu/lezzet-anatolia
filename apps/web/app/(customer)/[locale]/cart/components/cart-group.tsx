'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { cartKey, shippingGroupFee, type CartLine, type CartView } from '@/lib/cart/cart-types';
import { CartLineRow } from './cart-line';
import { checkoutBlockReason } from './cart-summary';
import type { Messages } from '../cart-types';

/**
 * Sepetin İKİ GRUBU (19.7 · tasarım `Musteri - Sepet.dc.html`, "tek sepet, iki grup, iki checkout").
 *
 * **Gruplama kalemin hâlinden kendiliğinden doğar; müşteri kalem taşımaz, yol seçmez.** Yolu stok
 * belirler (`decideCartAgainstWarehouse`): kendi deposunda bulunan her şey — kargolanabilir olsa
 * bile — araçla gider, çünkü ücretsiz kapı teslimi varken paralı kargo seçtirmek karşılığı olmayan
 * bir karar yükü. "Bunu kargoyla istiyorum" diye bir seçenek YOKTUR ve arayüzde de olmamalı.
 *
 * **İki grup = iki sipariş = iki ödeme** ve ikincisi ZORUNLU DEĞİL. Bu, "bir sipariş tek depodan
 * çıkar" kuralının bozulması değil korunmasıdır: sipariş bölünmüyor, ikinci bir sipariş doğuyor.
 * Müşteri ikincisini vermezse kalemler sepette bekler, kapıya siparişi hiç etkilenmez.
 *
 * ── GRUP BAŞLIKLARI TEK GRUPTA ÇİZİLMEZ ──────────────────────────────────────
 * Ayrım ancak ayrılacak bir şey varken bilgidir. Tek yolu olan sepette başlık, olmayan bir seçimi
 * varmış gibi gösterir ve müşteriye "acaba öteki grupta ne vardı" diye düşündürür.
 */

interface CartGroupProps {
  kind: 'route' | 'shipping';
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

  // Grubun kalem toplamı — kendi satırlarından. İndirim BURADA yazılmaz: kupon/kampanya siparişin
  // kendi kalemlerine göre checkout'ta yeniden çözülüyor, sepette bir gruba düşecek payı kesin
  // bilemeyiz. Dökümün yeri özet kartı; orası da bunu bir cümleyle söyler (`discountSplit`).
  const itemsCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  // Ücret motordan: sepette "6,90 €" yazıp kasada başka bir sayı kesmek ekranın sözünü tutmamasıdır.
  const fee = shippingGroupFee(view);
  const totalCents = shipping ? itemsCents + fee.feeCents : itemsCents;

  const title = shipping
    ? g.shippingTitle
    : place?.nextDate
      ? g.routeTitleDated.replace('{date}', formatDeliveryDate(place.nextDate, locale))
      : g.routeTitle;

  return (
    <div className={['flex flex-col', compact ? 'gap-2.5' : 'gap-3.5'].join(' ')}>
      {/* Başlık + saç teli çizgi: grubu komşusundan ayırır ama bir kutu kurmaz — kalemler kendi
          kartlarında kalsın, ikinci bir çerçeve sepeti kutu içinde kutu yapardı. */}
      <div className="flex items-center gap-3">
        <span className={['font-sans font-bold', compact ? 'text-micro' : 'text-note', shipping ? 'text-muted' : 'text-olive-dark'].join(' ')}>
          {title}
        </span>
        <span className="h-px flex-1 bg-sand-200" />
      </div>

      {lines.map((line) => (
        <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} compact={compact} tone={shipping ? 'shipping' : 'default'} />
      ))}

      {shipping ? (
        <ShippingAction view={view} t={t} locale={locale} compact={compact} itemsCents={itemsCents} totalCents={totalCents} feeCents={fee.feeCents} remainingCents={fee.remainingForFreeCents} />
      ) : (
        <RouteAction view={view} t={t} locale={locale} compact={compact} totalCents={totalCents} />
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
 * Rota grubunun eylemi — sepetin ASIL akışı, o yüzden dolu düğme ve zeytin zemin.
 *
 * Engeller sepetin tamamına aittir (tükenen kalem, asgari sepet) ve burada da geçerlidir: ikisi de
 * checkout'ta yeniden kontrol ediliyor, buradaki kilit müşteriyi boşuna bir adım ilerletmemek için.
 */
function RouteAction({ view, t, locale, compact, totalCents }: RouteActionProps) {
  const reason = checkoutBlockReason(view, t, locale);
  const blocked = view.hasBlocked || !view.minBasketOk;

  return (
    <div
      className={[
        'flex items-center gap-4 rounded-card border border-olive-line bg-olive-bg',
        compact ? 'flex-col items-stretch gap-2.5 px-3.5 py-3' : 'px-5 py-4',
      ].join(' ')}
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <span className={['font-sans font-bold text-ink', compact ? 'text-body' : 'text-card-title-sm'].join(' ')}>
          {t.group.routeTotal.replace('{amount}', formatPrice(totalCents, locale))}
        </span>
        <span className={['font-sans text-olive-dark', compact ? 'text-micro' : 'text-note'].join(' ')}>{t.group.routeNote}</span>
      </div>
      {blocked ? (
        <button
          type="button"
          disabled
          title={reason ?? undefined}
          className={buttonClass({ variant: 'primary', size: 'md', fullWidth: compact, className: 'disabled:cursor-not-allowed' })}
        >
          {t.checkout}
        </button>
      ) : (
        <Link href="/checkout" className={buttonClass({ variant: 'primary', size: 'md', fullWidth: compact })}>
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
  totalCents: number;
  feeCents: number;
  remainingCents: number;
}

/**
 * Kargo grubunun eylemi — ÇERÇEVELİ düğme, kum zemin. Ağırlık farkı sırayı söyler: asıl akış kapıya
 * gidendir, bu ikinci ve isteğe bağlı bir sipariştir.
 *
 * **Karakter farkı burada sezdirilir** (tasarım §4): kendi kargo ücreti, kendi eşiği (kendi
 * tutarından — iki grup birbirinin eşiğini beslemez, K37) ve yalnız online peşin ödeme. Üçü de
 * checkout'ta karşılaşılacak gerçekler; burada söylenmezse ikinci sipariş sürprizle başlar.
 *
 * Ücret YAZILIR ve bu, özet kartının "sepette kargo satırı yok" kuralıyla çelişmez: o kural ücretin
 * teslimat türüne, türün de adrese bağlı olmasından doğuyordu. Kargo grubunda tür zaten belli.
 */
function ShippingAction({ view, t, locale, compact, itemsCents, totalCents, feeCents, remainingCents }: ShippingActionProps) {
  const g = t.group;
  const blocked = view.hasBlocked;

  const breakdown = [
    feeCents > 0
      ? g.shippingFee.replace('{items}', formatPrice(itemsCents, locale)).replace('{fee}', formatPrice(feeCents, locale))
      : g.shippingFeeFree.replace('{items}', formatPrice(itemsCents, locale)),
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
          <span className={['font-sans font-bold text-ink', compact ? 'text-body' : 'text-card-title-sm'].join(' ')}>
            {g.shippingTotal.replace('{amount}', formatPrice(totalCents, locale))}
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
            title={t.checkoutBlocked}
            className={buttonClass({ variant: 'outlineOlive', size: 'md', fullWidth: compact, className: 'disabled:cursor-not-allowed' })}
          >
            {compact ? g.shippingCtaShort : g.shippingCta}
          </button>
        ) : (
          <Link
            href={{ pathname: '/checkout', query: { group: 'shipping' } }}
            className={buttonClass({ variant: 'outlineOlive', size: 'md', fullWidth: compact })}
          >
            {compact ? g.shippingCtaShort : g.shippingCta}
          </Link>
        )}
      </div>
      <span className="font-sans text-micro leading-relaxed text-muted">{g.shippingFootnote}</span>
    </div>
  );
}
