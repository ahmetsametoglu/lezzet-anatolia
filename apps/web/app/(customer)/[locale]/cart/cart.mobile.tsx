'use client';

import { Fragment, useCallback, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { resolveLocalizedText } from '@lezzet/types';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { SectionHeader } from '@/components/customer/phone-kit/section-header';
import { StickyBar } from '@/components/customer/phone-kit/sticky-bar';
import { SummaryPanel, type SummaryRow } from '@/components/customer/phone-kit/summary-panel';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { useCart } from '@/components/customer/cart/cart-context';
import { SavedList } from '@/components/customer/delivery/saved-list';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import placeMessages from '@/components/customer/delivery/place-messages.json';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { BackButton } from '@/components/customer/ui/back-button';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { summaryCopy } from '@/components/customer/ui/summary-row';
import { Link } from '@/i18n/navigation';
import { cartKey, cartPayableCents, shippingGroupFee, type CartLine } from '@/lib/cart/cart-types';
import { discountLabel } from '@/lib/cart/discount-label';
import { formatPrice } from '@/lib/storefront/format';
import { CartIdentity } from './components/cart-identity';
import { useCheckoutGate } from './components/cart-summary';
import { placeChangeText } from './components/place-change-card';
import { PhoneCartLine } from './components/phone-cart-line';
import { PhoneCartRowsSkeleton } from './components/phone-cart-skeleton';
import type { CartCopy, CartViewProps } from './cart-types';

/**
 * Sepetin telefon görünümü, native sepet ekranının web ikizi: metin ortak sözlükten (`@lezzet/i18n/customer/cart`), sıra native'in
 * ve engelin kısa sebebi düğmenin üstünde, çünkü kilitli düğme neden kilitli olduğunu söylemeli. Web'e özgü: kimlik ve adres sepette
 * çözülür (`CartIdentity`, `useCheckoutGate`), tutar ödenecek tutardır (`cartPayableCents`), sepet tarayıcıda çözüldüğü için ilk
 * karede iskelet durur ve okuma düşerse boş sepet çizilmez.
 */

/** Ürünler üstte, paketler altta, yalnız grup içinde (native `productsFirst`); `sort` kararlı. */
function productsFirst(lines: readonly CartLine[]): CartLine[] {
  return [...lines].sort((a, b) => Number(a.kind === 'bundle') - Number(b.kind === 'bundle'));
}

const sumOf = (lines: readonly CartLine[]): number => lines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);

/** Barın düğmesi — 52 · kontrol köşe · sert gölge; solda eylem, sağda tutar hapı (native `checkoutButton`). */
const CHECKOUT = 'flex h-13 w-full items-center justify-between rounded-control pr-2 pl-5 font-sans text-step-sm text-card shadow-hard';

/** Grubun künyesi — satırların kartından ayrı, kum kutu (native `groupCard`). */
const GROUP_CARD = 'flex flex-col gap-1.5 rounded-card border-[1.5px] border-sand-300 bg-sand-100 p-4';

export function CartMobile({ t, locale, awaitingPayment }: CartViewProps) {
  const copy = cartMessages[locale];
  const { view, ready, failed, reload, applyCoupon, clearCoupon, addSkipped, placeChange, dismissPlaceChange } = useCart();
  const { address, place, setPanelOpen } = useDeliveryPlace();
  const gate = useCheckoutGate(t);
  const [couponOpen, setCouponOpen] = useState(false);
  // Kapanış SABİT bir işlev: `Dialog` odak ve kaydırma kilidini ona bağlı kuruyor; her karede yeni işlev kurulumu tazelerdi.
  const closeCoupon = useCallback(() => setCouponOpen(false), []);

  const header = (
    <header className="flex items-center gap-2 px-4 pt-1.5">
      <BackButton label={copy.back} fallback="/catalog" />
      <h1 className="min-w-0 flex-1 font-serif text-screen-title text-ink">{copy.title}</h1>
      {ready && !failed && (
        <span className="font-sans text-note font-semibold text-muted">
          {view.itemCount === 1 ? t.countOne : copy.count.replace('{n}', String(view.itemCount))}
        </span>
      )}
    </header>
  );

  if (failed) {
    return (
      <div className="flex flex-col pt-2.5">
        {header}
        <div className="px-4.5 pt-4.5">
          <Note tone="terracotta" description={copy.unresolved.failed} action={<TextAction label={t.unreachable.retry} onClick={reload} />} />
        </div>
      </div>
    );
  }

  // İlk okuma sürüyor ya da tekrar siparişin satırları henüz dönmedi (başlıktaki sayı "3" derken orta "boş" demesin).
  if (!ready || (view.lines.length === 0 && view.itemCount > 0)) {
    return (
      <div className="flex flex-col pt-2.5">
        {header}
        <div className="px-4.5 pt-4.5">
          <PhoneCartRowsSkeleton label={copy.unresolved.loading} />
        </div>
      </div>
    );
  }

  if (view.lines.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col pt-2.5">
        {header}
        <EmptyState
          fill
          icon={<MobileIcon name="cart" size={80} className="text-sand-600" />}
          title={copy.empty.title}
          description={copy.empty.body}
          action={<PrimaryButton label={copy.empty.cta} href="/catalog" />}
        />
      </div>
    );
  }

  // Grubu SÖZLEŞME söyler (`line.group`), ekran türetmez: kapıya teslim · kargo · bu adrese gelemeyen.
  const localLines = productsFirst(view.lines.filter((line) => line.group === 'local'));
  const shippingLines = productsFirst(view.lines.filter((line) => line.group === 'shipping'));
  const undeliverableLines = productsFirst(view.lines.filter((line) => line.group === 'undeliverable'));
  const groups = [
    { key: 'local', eyebrow: copy.group.local, lines: localLines },
    { key: 'shipping', eyebrow: copy.group.shipping, lines: shippingLines },
    { key: 'undeliverable', eyebrow: copy.group.undeliverable, lines: undeliverableLines },
  ].filter((group) => group.lines.length > 0);
  // İKİ SİPARİŞ yalnız gerçekten iki sipariş doğacaksa: gelemeyen kalem bir sipariş açmaz, sepette bekler.
  const split = localLines.length > 0 && shippingLines.length > 0;
  const localItemsCents = sumOf(localLines);
  const shippingItemsCents = sumOf(shippingLines);
  // Kargo ücreti ve eşiğe kalan motordan: istemci eşik aritmetiği yapmaz.
  const fee = shippingGroupFee(view);
  const placeLabel = address?.postalCode ?? place?.postalCode ?? '';

  const discount = view.discount;
  // İndirim tutarı türetilir, yeniden hesaplanmaz — kararın sahibi motor.
  const discountCents = view.subtotalCents - view.totalCents;
  const rejected = discount.status === 'rejected' ? discount : null;
  const rejectionText =
    rejected === null
      ? null
      : rejected.reason === 'outranked'
        ? copy.coupon.rejected.outranked.replace('{amount}', formatPrice(rejected.appliedInsteadCents, locale))
        : copy.coupon.rejected[rejected.reason];

  const reach = view.reachableDiscount;
  const reachableNote =
    reach === null
      ? null
      : (reach.label === null ? copy.summary.reachableAnon : copy.summary.reachable.replace('{label}', resolveLocalizedText(reach.label, locale)))
          .replace('{missing}', formatPrice(reach.missingCents, locale))
          .replace('{amount}', formatPrice(reach.projectedCents, locale));

  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: copy.summary.subtotal, value: formatPrice(view.subtotalCents, locale) },
    ...(discountCents > 0
      ? [{ key: 'discount', label: discountLabel(discount, summaryCopy(locale), locale), value: `−${formatPrice(discountCents, locale)}`, tone: 'olive' as const }]
      : []),
    // Sepetin tamamı kargodaysa tek sipariş doğar ve ücreti BELLİ — saklamak müşteriyi kasada sürprizle karşılardı.
    ...(view.shippingOnly
      ? [{ key: 'shipping', label: t.group.shippingRow, value: fee.feeCents > 0 ? formatPrice(fee.feeCents, locale) : t.group.free }]
      : []),
    // Gelemeyen kalem toplamda durur ama siparişe girmez: kapsam belirsiz kalmasın diye ayrı satır.
    ...(view.undeliverableSubtotalCents > 0
      ? [{ key: 'undeliverable', label: copy.summary.undeliverable, value: formatPrice(view.undeliverableSubtotalCents, locale) }]
      : []),
  ];
  const summaryNote = [
    copy.summary.note,
    view.undeliverableSubtotalCents > 0 ? copy.summary.undeliverableNote : null,
    discountCents > 0 ? copy.summary.singleRule : null,
    // İki gruplu sepette indirim iki siparişe dağılacak: burada tek sayı "bunu ödeyeceksiniz" diye okunmasın.
    split && discountCents > 0 ? t.group.discountSplit : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  // Sıra anlamlı: satılamayan kalem asgari sepetten ÖNCE (kalem çıkınca tutar da değişir), kimlik/adres kapısı en son.
  const barBlockText = view.hasBlocked
    ? copy.barBlock.blocked
    : !view.minBasketOk
      ? copy.barBlock.minimum.replace('{missing}', formatPrice(view.missingForMinBasketCents, locale))
      : gate;
  // Bölünmüş sepette bar ROTA siparişinin tutarını yazar: düğme o siparişi açıyor.
  const barTotal = split ? localItemsCents : cartPayableCents(view);
  const barInner = (
    <>
      <span>{copy.checkout}</span>
      <span className="rounded-badge bg-scrim-soft px-3.5 py-2.5">{formatPrice(barTotal, locale)}</span>
    </>
  );

  const shippingBreakdown = [
    fee.feeCents > 0
      ? copy.group.shippingFee.replace('{items}', formatPrice(shippingItemsCents, locale)).replace('{fee}', formatPrice(fee.feeCents, locale))
      : copy.group.shippingFeeFree.replace('{items}', formatPrice(shippingItemsCents, locale)),
    fee.remainingForFreeCents > 0 ? copy.group.shippingRemaining.replace('{amount}', formatPrice(fee.remainingForFreeCents, locale)) : null,
    copy.group.shippingPayment,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  // Ücretsiz kargo eşiği YALNIZ kargo grubu varken anlamlı; bölünmüş sepette aynı bilgi grubun kendi kutusunda.
  const freeShippingNote =
    view.freeShippingCents === 0 || shippingLines.length === 0 || split ? null : fee.remainingForFreeCents > 0 ? (
      <Note tone="warm" description={copy.freeShipping.remaining.replace('{amount}', formatPrice(fee.remainingForFreeCents, locale))} />
    ) : (
      <Note tone="olive" description={copy.freeShipping.reached} />
    );

  return (
    <div className="flex flex-col pt-2.5 pb-36">
      {header}

      <div className="flex flex-col gap-3 px-4.5 pt-4.5">
        {awaitingPayment && (
          <Note
            tone="warm"
            title={t.awaitingPayment.title}
            description={t.awaitingPayment.body.replace('{amount}', formatPrice(awaitingPayment.totalCents, locale))}
            action={<TextAction label={t.awaitingPayment.cta} href={{ pathname: '/checkout/[reference]', params: { reference: awaitingPayment.orderId } }} />}
          />
        )}
        {/* Sessiz daralma yok: yer değişince her kalemin yeni hâli tek tek söylenir, hiçbir kalem silinmez. */}
        {placeChange !== null && placeChange.length > 0 && (
          <Note
            tone="warm"
            title={t.placeChange.title.replace('{n}', String(placeChange.length))}
            description={t.placeChange.note}
            action={<TextAction label={t.placeChange.dismiss} onClick={dismissPlaceChange} />}
          >
            <ul className="flex flex-col gap-1 pb-1">
              {placeChange.map((change, index) => (
                <li key={`${change.kind}:${index}`} className="font-sans text-note leading-[1.6]">
                  {placeChangeText(change, t, locale)}
                </li>
              ))}
            </ul>
          </Note>
        )}
        {addSkipped !== null && <Note tone="warm" description={t.empty.skipped.replace('{n}', String(addSkipped))} />}

        <CartIdentity t={t} locale={locale} compact />

        {/* Gelemeyen kalemlerin tek uyarısı satırların üstünde ve `warm` tonda, çünkü hata değil adresin gerçeği. Çıkış adres varken
            künyedeki "Değiştir", yokken kutunun posta kodu çekmecesi; "kaldırın" yazılmaz. */}
        {undeliverableLines.length > 0 && (
          <Note
            tone="warm"
            title={copy.undeliverable.title.replace('{place}', placeLabel)}
            description={copy.undeliverable.body.replace('{place}', placeLabel)}
            action={address ? undefined : <TextAction label={copy.undeliverable.change} onClick={() => setPanelOpen(true)} />}
          />
        )}

        <div className="flex flex-col gap-2.5">
          {groups.map((group) => (
            <Fragment key={group.key}>
              {groups.length > 1 && <SectionHeader eyebrow={group.eyebrow} />}
              {group.lines.map((line) => (
                <PhoneCartLine key={cartKey(line)} line={line} copy={copy} t={t} locale={locale} />
              ))}
              {split && group.key === 'local' && (
                <div className={GROUP_CARD}>
                  <span className="font-sans text-copy font-semibold text-ink">{copy.group.routeTotal.replace('{amount}', formatPrice(localItemsCents, locale))}</span>
                  <span className="font-sans text-body-sm leading-[1.6] text-muted">{copy.group.routeNote}</span>
                </div>
              )}
              {/* Kargo grubunun KENDİ eylemi — ikinci ve isteğe bağlı sipariş. Asgari sepet bu gruba işlemez;
                  satılamayan kalem ve kimlik/adres kapısı işler. */}
              {split && group.key === 'shipping' && (
                <div className={GROUP_CARD}>
                  <span className="font-sans text-copy font-semibold text-ink">
                    {copy.group.shippingTotal.replace('{amount}', formatPrice(shippingItemsCents + fee.feeCents, locale))}
                  </span>
                  <span className="font-sans text-body-sm leading-[1.6] text-muted">{shippingBreakdown}</span>
                  <SecondaryButton label={copy.group.shippingCta} href={{ pathname: '/checkout', query: { group: 'shipping' } }} disabled={view.hasBlocked || gate !== null} />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <SavedList locale={locale} compact />

        {freeShippingNote}
        {split && <Note tone="warm" description={copy.group.split} />}

        {discount.status === 'applied' ? (
          <div className="flex items-center gap-2.5 rounded-control bg-sand-150 px-3.5 py-3">
            <MobileIcon name="coupon" size={17} className="flex-none text-olive-dark" />
            <span className="min-w-0 flex-1 font-sans text-note font-bold text-olive-dark">{copy.coupon.applied.replace('{code}', discount.code)}</span>
            <TextAction label={copy.coupon.remove} onClick={clearCoupon} ariaLabel={copy.coupon.removeLabel} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCouponOpen(true)}
            className="flex cursor-pointer items-center gap-2.5 rounded-card bg-sand-250 px-4 py-3.5 text-left transition-[scale,background-color] hover:bg-sand-300 active:scale-[0.98]"
          >
            <MobileIcon name="coupon" size={17} className="flex-none text-terracotta" />
            <span className="min-w-0 flex-1 font-sans text-note font-bold text-ink">{copy.coupon.add}</span>
            <span aria-hidden className="font-sans text-icon-sm leading-none text-sand-600">
              ›
            </span>
          </button>
        )}
        {rejectionText !== null && <Note tone="terracotta" description={rejectionText} />}
        {/* Sunucu yalnız KAZANILABİLİR olanı gönderir — boş vaat yerine sessizlik. */}
        {reachableNote !== null && <Note tone="olive" description={reachableNote} />}

        <SummaryPanel rows={summaryRows} totalLabel={copy.summary.total} totalValue={formatPrice(cartPayableCents(view), locale)} note={summaryNote} />

        {view.hasBlocked && <Note tone="error" description={copy.blocked} />}
        {/* Dipteki kutu eşiği ve ne yapılacağını söyler, eksik tutar barda: aynı sayı iki kez okunmasın. */}
        {!view.minBasketOk && <Note tone="terracotta" description={copy.minimum.replace('{minimum}', formatPrice(view.minBasketCents, locale))} />}

        <div className="flex justify-center pt-1">
          <TextAction label={copy.continue} href="/catalog" />
        </div>
      </div>

      <StickyBar spacing="cart">
        {barBlockText !== null && <p className="pb-2.5 text-center font-sans text-note font-semibold text-terracotta">{barBlockText}</p>}
        {barBlockText !== null ? (
          <button type="button" disabled className={`${CHECKOUT} cursor-not-allowed bg-disabled-fill`}>
            {barInner}
          </button>
        ) : (
          // Sepetin tamamı kargodaysa açılacak taslak da kargo taslağıdır.
          <Link
            href={view.shippingOnly ? { pathname: '/checkout', query: { group: 'shipping' } } : '/checkout'}
            className={`${CHECKOUT} cursor-pointer bg-olive transition-[translate,box-shadow,background-color] hover:bg-olive-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none`}
          >
            {barInner}
          </Link>
        )}
      </StickyBar>

      {couponOpen && <CouponSheet copy={copy} locale={locale} onApply={applyCoupon} onClose={closeCoupon} />}
    </div>
  );
}

interface CouponSheetProps {
  copy: CartCopy;
  locale: Locale;
  onApply: (code: string) => void;
  onClose: () => void;
}

/**
 * Kupon kodu çekmecesi, native kupon yüzeninin web ikizi: durum çekmecenin kendisinde, yazarken sepet yeniden çizilmez. Ret sunucudan
 * gelir ve sepette yazar, çünkü çekmeceyi ağ cevabını beklerken açık tutmak müşteriyi boş formun başında bekletirdi; alanın kendi
 * hata satırı yalnız boş kodu durdurur.
 */
function CouponSheet({ copy, locale, onApply, onClose }: CouponSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    // Kod bir KİMLİKTİR, dilin harf kuralına tabi değil: `toLocaleUpperCase('tr')` "i"yi "İ" yapar, kod bulunamazdı.
    const code = value.trim().toUpperCase();
    if (code === '') {
      setError(copy.coupon.empty);
      return;
    }
    onApply(code);
    onClose();
  };

  return (
    <Dialog placement="sheet" title={copy.coupon.sheetTitle} closeLabel={placeMessages[locale].close} onClose={onClose}>
      <FormInputField
        label={copy.coupon.field}
        hideLabel
        value={value}
        placeholder={copy.coupon.placeholder}
        autoCapitalize="characters"
        autoComplete="off"
        error={error ?? undefined}
        onChange={(e) => {
          setValue(e.target.value);
          // Yazmaya başlayınca hata düşer: eski bir ret yeni kodun üstünde durmasın.
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <PrimaryButton label={copy.coupon.apply} onClick={submit} shape="block" />
    </Dialog>
  );
}
