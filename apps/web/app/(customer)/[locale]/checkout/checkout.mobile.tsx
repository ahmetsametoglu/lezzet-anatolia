'use client';

import type { PaymentMethod } from '@lezzet/types';
import { brand } from '@lezzet/brand';
import { shippingNotice } from '@lezzet/helper';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { Chip } from '@/components/customer/phone-kit/chip';
import { ThumbStack } from '@/components/customer/phone-kit/thumb-stack';
import { Note } from '@/components/customer/phone-kit/note';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { PhoneOptionRow } from './components/phone-option-row';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SummaryPanel, type SummaryRow } from '@/components/customer/phone-kit/summary-panel';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Icon } from '@/components/customer/ui/icons';
import { summaryCopy } from '@/components/customer/ui/summary-row';
import { addressContact, addressLine, addressTitle } from '@lezzet/address';
import { cartKey } from '@/lib/cart/cart-types';
import { discountLabel, orderDiscountLabel } from '@/lib/cart/discount-label';
import { UNKNOWN_AMOUNT, formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { getPathname } from '@/i18n/navigation';
import { PayProgress } from './components/payment-element';
import { PhoneCheckoutSkeleton } from './components/phone-checkout-skeleton';
import { PhoneShippingChoice } from './components/phone-shipping-choice';
import { ShippingOrderNote } from './components/shipping-order-note';
import { checkoutBlocker, servicePointMissing, type CheckoutCopy, type CheckoutViewProps } from './checkout-types';

/**
 * Ödemenin telefon görünümü, native "Siparişi tamamla" ekranının web ikizi: metin ortak sözlükten, durum ve sunucu turları
 * `checkout-client.tsx`te masaüstüyle ortak. Web'e özgü farklar: adres sepette seçilir ve burada salt okunur, kart alanları
 * sayfanın içinde durur (native'de ödeme kartı düğmeden sonra açılır), kargoda taşıyıcı seçenekleri çıkar.
 */

/** Kahraman satırının küçük resimleri — en fazla dört; yığın kitte (`ThumbStack`, native `AvatarThumb` `stacked`). */
const THUMB_LIMIT = 4;

/** Ödeme satırı — native `payOpts()`; havale iki kez geçebilir (peşin ⟷ vadeli), yöntem anahtar olamaz. */
interface PaymentOption {
  key: string;
  method: PaymentMethod;
  /** Vadeli — ödeme YÖNTEMİ değil, siparişin bayrağı. */
  onAccount: boolean;
  label: string;
  body: string;
  available: boolean;
}

/** Özet satırı — siparişin ya da (adres yokken) sepetin kalemi. */
interface SummaryLine {
  key: string;
  name: string;
  qty: number;
  lineTotalCents: number | null;
}

export function CheckoutMobile(props: CheckoutViewProps) {
  const { t, locale, cart, cartReady, cartFailed, snapshot, snapshotReady, state, busy, error, selectedAddress, addressNotice } = props;
  const copy = checkoutMessages[locale];
  const delivery = snapshot.delivery;
  const payment = snapshot.payment;
  const summary = snapshot.summary;
  const isRoute = delivery?.deliveryType === 'route';
  // Bölge içindeki kargo siparişinde kapı yolu bölge dışı olduğu için değil, ürünler bölgenin deposunda olmadığı için kapalıdır.
  const doorClosedHere = !isRoute && delivery?.addressInRoute === true;
  // Gel-al adres seçicide seçilir (sepet); burada depo, telefon ve fatura adresi olarak kalan adres gösterilir (native ikizi).
  const isPickup = delivery?.deliveryType === 'pickup';
  const pickedWarehouse = snapshot.pickup?.warehouses.find((w) => w.id === snapshot.pickup?.selectedWarehouseId) ?? null;
  const dates = delivery?.availableDates ?? [];

  // Döküm ve toplam aynı okumadan gelir: özet varsa ikisi de ondan, adres seçilmediği için özet yoksa ikisi de sepetten, asla karışık.
  // Sunucu cevap vermeden özet sepetten kurulmaz, çünkü sepet bu siparişin grubunu bilmez ve bölünmüş sepette bütün sepeti yazardı.
  const settled = cartReady && snapshotReady;
  const orderedCartLines = cart.lines.filter((line) => line.group !== 'undeliverable');
  const summaryLines: SummaryLine[] = !settled
    ? []
    : summary === null
      ? orderedCartLines.map((line) => ({ key: cartKey(line), name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.lines.map((line, index) => ({ key: `order-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));
  // Bu adrese gelemeyen kalem siparişe girmez, sepette bekler; özette üstü çizili durur.
  const droppedLines: SummaryLine[] = !settled
    ? []
    : summary === null
      ? cart.lines
          .filter((line) => line.group === 'undeliverable')
          .map((line) => ({ key: `dropped-${cartKey(line)}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.excludedLines.map((line, index) => ({ key: `dropped-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));

  // Toplam SUNUCUNUN kararıdır; sepet okunmadan yazılmaz (CLAUDE §1 — ölçülemeyen değer sıfır değil).
  const totalCents = payment ? payment.orderTotalCents : cart.totalCents;
  const totalLabel = settled && totalCents !== null ? formatPrice(totalCents, locale) : UNKNOWN_AMOUNT;
  const feeLabel = !settled
    ? UNKNOWN_AMOUNT
    : payment === null
      ? copy.summary.pending
      : payment.shippingFeeCents === null
        ? UNKNOWN_AMOUNT
        : payment.shippingFeeCents === 0
          ? copy.summary.free
          : formatPrice(payment.shippingFeeCents, locale);
  const discountCents = !settled
    ? 0
    : summary !== null
      ? (summary.discount?.amountCents ?? 0)
      : cart.discount.status === 'applied' || cart.discount.status === 'automatic'
        ? cart.discount.amountCents
        : 0;
  const words = summaryCopy(locale);
  const rows: SummaryRow[] = [
    ...summaryLines.map((line) => ({ key: line.key, label: lineLabel(copy, line), value: lineValue(copy, line, locale) })),
    ...droppedLines.map((line) => ({ key: line.key, label: lineLabel(copy, line), value: lineValue(copy, line, locale), tone: 'danger' as const, strike: true })),
    ...(droppedLines.length === 0 ? [] : [{ key: 'undeliverable-note', label: copy.summary.undeliverableNote, value: '', tone: 'danger' as const }]),
    {
      key: 'subtotal',
      label: copy.summary.subtotal,
      value: settled ? formatPrice(summary?.subtotalCents ?? cart.subtotalCents - cart.undeliverableSubtotalCents, locale) : UNKNOWN_AMOUNT,
    },
    // İndirimin KÜNYESİ sepetle aynı yardımcıdan: müşteri aynı indirimi iki ekranda iki adla okumasın.
    ...(discountCents > 0
      ? [
          {
            key: 'discount',
            label: summary !== null ? orderDiscountLabel(summary.discount, words) : discountLabel(cart.discount, words, locale),
            value: `−${formatPrice(discountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]
      : []),
    { key: 'delivery', label: copy.summary.delivery, value: feeLabel },
  ];

  const methods = payment?.methods ?? [];
  const codReason = payment?.codBlockedReason ?? null;
  const paymentOptions: PaymentOption[] = [
    // `online` Stripe yolu (peşin, sayfanın içinde); `cash` KAPIDA ödemedir — aracı (nakit ya da kart) kurye kapanışta yazar.
    { key: 'online', method: 'online', onAccount: false, label: copy.payment.online, body: copy.payment.onlineBody, available: methods.includes('online') },
    {
      key: 'cod',
      method: 'cash',
      onAccount: false,
      label: isPickup ? copy.payment.atPickup : copy.payment.onDelivery,
      // Kapalı yolun SEBEBİ yazılır: "yok" ile "bu tutarda yok" ayrı cümleler — ikincisinde müşteri sepeti küçültebilir.
      body:
        codReason === null
          ? isPickup
            ? copy.payment.atPickupBody
            : copy.payment.onDeliveryBody
          : (copy.payment.codBlocked[codReason as keyof CheckoutCopy['payment']['codBlocked']] ?? copy.payment.onDeliveryBody),
      available: methods.includes('cash') && codReason === null,
    },
    ...(methods.includes('bank_transfer')
      ? [{ key: 'transfer', method: 'bank_transfer' as const, onAccount: false, label: copy.payment.transfer, body: copy.payment.transferBody, available: true }]
      : []),
    // Vadeli YALNIZ açıksa çizilir: kapalıyken göstermek B2C müşteriye anlamı olmayan bir kapı açardı.
    ...(payment?.creditAvailable
      ? [{ key: 'credit', method: 'bank_transfer' as const, onAccount: true, label: copy.payment.credit, body: copy.payment.creditBody, available: true }]
      : []),
  ];

  // Engel tek yerde kararlaşır (`checkoutBlocker`, masaüstü de aynı cevabı okur); telefon native'in ek şartlarını da söyler: gün,
  // ödeme yolu ve satış koşulları. Okuma düştüyse "güncelleniyor" denmez, çünkü bitmeyecek bir bekleyiş olurdu.
  const blocker = checkoutBlocker({
    cartFailed,
    cartHasBlocked: cart.hasBlocked,
    snapshot,
    addressId: state.addressId,
    pointMissing: servicePointMissing(state, snapshot.shipping),
    nameMissing: props.contact.missing,
  });
  const blockText = !snapshotReady
    ? copy.block.loading
    : blocker === 'cart_unreachable'
      ? t.summary.cartUnreachable
      : blocker === 'name_missing'
        ? copy.block.contact
        : blocker === 'address_missing'
          ? state.addressId === null
            ? copy.block.address
            : error !== null
              ? copy.state.failed
              : copy.block.loading
          : blocker === 'undeliverable_line'
            ? copy.block.shipping
            : blocker === 'min_basket' && payment !== null
              ? copy.block.minBasket
                  .replace('{place}', payment.placeLabel)
                  .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale))
              : blocker === 'service_point_missing'
                ? copy.point.none
                : blocker === 'shipping_unpriced'
                  ? shippingNotice(snapshot.shipping, copy.carrier)
                  : isRoute && delivery?.requiresDateChoice && state.deliveryDate === null
                    ? copy.block.day
                    : state.paymentMethod === null
                      ? copy.block.payment
                      : !state.termsAccepted
                        ? copy.block.terms
                        : null;

  // Küçük resimler siparişin kendisini gösterir — kapsam dışı kalemin fotoğrafı "bunlar geliyor" diye okunurdu.
  // Paketler önce (native'in sırası).
  const thumbs = [...orderedCartLines].sort((a, b) => Number(b.kind === 'bundle') - Number(a.kind === 'bundle')).slice(0, THUMB_LIMIT);

  return (
    <div className="flex w-full flex-col pb-[calc(30px+env(safe-area-inset-bottom))]">
      <AppBar title={copy.title} left={<BackButton label={copy.back} fallback="/cart" />} />

      <div className="flex flex-col gap-4 px-4.5 pt-4.5">
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 font-serif text-page-title-sm leading-[1.15] text-ink">{copy.hero}</h1>
          {thumbs.length > 0 && <ThumbStack items={thumbs.map((line) => ({ key: cartKey(line), name: line.name, image: line.image }))} />}
        </div>

        <ShippingOrderNote {...props} />

        {/* Üç bölüm seçili adresin cevabı ve istemcide çözülüyor: bitmeden iskelet (native `CheckoutSkeleton`). */}
        {snapshotReady ? (
          <>
            {/* Ad kutusu yalnız ad eksikken ve en üstte, native'in sırası; neden sorulduğu alanın önünde yazılı. */}
            {props.contact.missing && (
              <section className="flex flex-col gap-2">
                <Eyebrow text={copy.contact.eyebrow} />
                <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.contact.reason}</p>
                <FormInputField
                  label={copy.contact.name}
                  value={props.contact.name}
                  onChange={(event) => props.contact.onChangeName(event.target.value)}
                  autoComplete="name"
                />
                {props.contact.error !== null && <Note tone="error" description={props.contact.error} />}
                <PrimaryButton
                  label={props.contact.saving ? copy.contact.saving : copy.contact.save}
                  onClick={props.contact.onSave}
                  disabled={props.contact.saving || props.contact.name.trim() === ''}
                />
              </section>
            )}

            <section className="flex flex-col gap-2">
              <Eyebrow text={copy.address.eyebrow} />
              {pickedWarehouse ? (
                <div className="flex flex-col gap-2" data-testid="checkout-pickup-place">
                  <PhoneOptionRow
                    label={copy.address.pickupTitle}
                    description={`${pickedWarehouse.name} · ${pickedWarehouse.addressLine}`}
                    selected
                    trailing={<TextAction label={copy.address.change} href="/cart" />}
                  />
                  <p className="font-sans text-micro leading-[1.45] text-muted">
                    {copy.address.pickupNote.replace('{phone}', brand.contact.phoneDisplay)}
                  </p>
                  {selectedAddress && (
                    <p className="font-sans text-micro leading-[1.45] text-muted">
                      {copy.address.billing.replace('{address}', `${addressTitle(selectedAddress)} · ${addressLine(selectedAddress)}`)}
                    </p>
                  )}
                </div>
              ) : selectedAddress ? (
                <PhoneOptionRow
                  label={addressTitle(selectedAddress)}
                  description={addressLine(selectedAddress)}
                  detail={addressContact(selectedAddress) ?? undefined}
                  selected
                  trailing={<TextAction label={copy.address.change} href="/cart" />}
                />
              ) : (
                // Buraya adressiz gelinmez (sepetin kapısı) — derin bağlantıyla gelen için cümle + çıkış.
                <Note description={copy.address.missing} action={<TextAction label={copy.address.missingCta} href="/cart" />} />
              )}
              {selectedAddress && !pickedWarehouse && <p className="font-sans text-micro leading-[1.45] text-muted">{copy.address.inCartNote}</p>}
            </section>

            {/* Engel değil bilgi: o kalemler bu siparişe girmiyor, sepette bekliyor. */}
            {droppedLines.length > 0 && (
              <Note
                title={copy.undeliverable.title}
                description={`${copy.undeliverable.body} ${copy.undeliverable.items.replace('{items}', droppedLines.map((line) => line.name).join(', '))}`}
              />
            )}

            {delivery !== null && (
              <section className="flex flex-col gap-2">
                <Eyebrow text={copy.delivery.eyebrow} />
                {/* Gel-al'da kapı/kargo satırları çizilmez; depo bloğu konuşur (native ikizi). */}
                {isPickup && (
                  <p className="font-sans text-body-sm leading-[1.6] text-body" data-testid="checkout-pickup-phone">
                    {copy.delivery.pickupBody}
                    <br />
                    {copy.delivery.pickupPhone.replace('{phone}', brand.contact.phoneDisplay)}
                  </p>
                )}
                {/* Yol ADRESİN CEVABIDIR, seçim değil: iki satır da çizilir (hangisi geçerli, öteki NEDEN değil) ama
                    dokunuş bir şey değiştirmez — satırlar düğme değil. Kapalı yolun sebebi kırmızı. */}
                {!isPickup && (
                  <>
                    <PhoneOptionRow
                      label={copy.delivery.door}
                      description={
                        isRoute
                          ? copy.delivery.doorBody.replace('{fee}', feeLabel)
                          : doorClosedHere
                            ? copy.delivery.shippingInZone
                            : copy.delivery.doorUnavailable
                      }
                      selected={isRoute}
                      disabled={!isRoute}
                      descriptionTone={isRoute || doorClosedHere ? 'muted' : 'danger'}
                    />
                    <PhoneOptionRow
                      label={copy.delivery.shipping}
                      description={isRoute ? copy.delivery.shippingUnavailable : copy.delivery.shippingBody.replace('{fee}', feeLabel)}
                      selected={!isRoute}
                      disabled={isRoute}
                      descriptionTone={isRoute ? 'danger' : 'muted'}
                    />
                  </>
                )}
                {delivery.blocked && <Note tone="error" description={t.delivery.blocked} />}
                {/* Komşu daveti gün seçiminin hemen üstünde, çünkü cümle o seçimin gerekçesi. Cümle seçime bağlı: başka güne
                    geçen müşteriye "o gün sizin için seçili" demek yalan olurdu. */}
                {isRoute &&
                  !delivery.blocked &&
                  delivery.neighborInvites.map((invite) => (
                    <Note
                      key={invite.inviteId}
                      tone="olive"
                      description={(state.deliveryDate === invite.deliveryDate ? copy.delivery.neighborInvite : copy.delivery.neighborInviteOtherDay)
                        .replace('{name}', invite.inviterName || copy.delivery.neighborSomeone)
                        .replace('{day}', formatDeliveryDate(invite.deliveryDate, locale))}
                    />
                  ))}
                {/* Gün YALNIZ rota-içi teslimatta; tek gün varsa seçim sunulmaz, gösterilir (seçeneksiz seçim sahte karardır). */}
                {isRoute &&
                  !delivery.blocked &&
                  dates.length > 0 &&
                  (delivery.requiresDateChoice ? (
                    <div className="flex flex-wrap gap-2">
                      {dates.map((date) => (
                        <Chip key={date} label={formatDeliveryDate(date, locale)} selected={state.deliveryDate === date} onClick={() => props.onSelectDate(date)} />
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-body-sm font-semibold text-olive-dark">
                      {copy.delivery.dayLabel.replace('{day}', formatDeliveryDate(dates[0] ?? '', locale))}
                    </p>
                  ))}
                {!isRoute && !isPickup && !delivery.blocked && <PhoneShippingChoice {...props} />}
              </section>
            )}

            {payment !== null && (
              <section className="flex flex-col gap-2">
                <Eyebrow text={copy.payment.eyebrow} />
                {paymentOptions.map((option) => (
                  <PhoneOptionRow
                    key={option.key}
                    label={option.label}
                    description={option.body}
                    selected={state.paymentMethod === option.method && state.onAccount === option.onAccount}
                    disabled={!option.available}
                    descriptionTone={option.available ? 'muted' : 'danger'}
                    onClick={() => props.onSelectPayment(option.method, option.onAccount)}
                  />
                ))}
                {/* Tavan üstü tutarda kural TEK cümle; nakit sınırı yalnız o yol seçiliyken — seçilmeyen yolun uyarısı gürültü. */}
                {codReason === 'over_limit' && <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.payment.onlineRequired}</p>}
                {state.paymentMethod === 'cash' && payment.cashWarning && (
                  <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.payment.cashWarning}</p>
                )}
                {state.paymentMethod === 'online' && props.paymentSlot}
              </section>
            )}
          </>
        ) : (
          <PhoneCheckoutSkeleton label={copy.state.loading} />
        )}

        <SummaryPanel eyebrow={copy.summary.eyebrow} rows={rows} totalLabel={copy.summary.total} totalValue={totalLabel} totalTone="terracotta" />

        {/* Kabul bloğu özetle düğmenin arasında, native'deki sırayla. Bağ yeni sekmede açılır ki koşulları okuyan müşterinin seçimleri
            ve kart bilgisi kaybolmasın. */}
        <PhoneCheckRow checked={state.marketingConsent} onChange={props.onToggleConsent} label={copy.marketing} />
        <PhoneCheckRow
          checked={state.termsAccepted}
          onChange={props.onToggleTerms}
          label={copy.terms}
          link={<TextAction label={copy.termsLink} externalHref={getPathname({ href: '/legal/sales', locale })} />}
        />

        {/* Adres teklifi onay düğmesinin hemen üstünde, çünkü soru o anda doğar; iki hâl ayrı yapıdır: başka kodda bulunduysa
            iki eylem, doğrulanamadıysa tek cümle. Metin servisin etiketidir, biz cümle kurmayız. */}
        {addressNotice?.status === 'wrong_postal_code' ? (
          <Note
            title={copy.addressCheck.foundElsewhere}
            description={addressNotice.label}
            action={
              <>
                <PrimaryButton label={copy.addressCheck.useIt} onClick={props.onAcceptAddressFix} disabled={busy} />
                <TextAction label={copy.addressCheck.keepMine} onClick={props.onDismissAddressNotice} />
              </>
            }
          />
        ) : addressNotice ? (
          <Note description={addressNotice.status === 'not_found' ? copy.addressCheck.notFound : copy.addressCheck.streetOnly} />
        ) : null}

        {cartFailed && <Note tone="error" description={t.summary.cartUnreachable} />}
        {error !== null && <Note tone="error" description={error} />}

        {blockText !== null && <p className="text-center font-sans text-body-sm font-semibold text-terracotta">{blockText}</p>}

        <PrimaryButton
          shape="block"
          label={props.payStage ? t.pay[props.payStage] : busy ? copy.submitting : copy.confirm.replace('{total}', totalLabel)}
          onClick={props.onConfirm}
          disabled={busy || blockText !== null || !props.payReady}
        />
        {props.payStage && <PayProgress stage={props.payStage} />}

        {/* Güvence satırı yalnız kartla ödemede: kapıda ve vadeli ödemede Stripe devreye girmez, satır yanlış bilgi olurdu. */}
        {state.paymentMethod === 'online' && (
          <span className="flex items-center justify-center gap-1.5 font-sans text-micro font-semibold text-muted">
            <Icon name="lock" size={13} />
            {t.secure}
          </span>
        )}
      </div>
    </div>
  );
}

/** Bölüm üstbaşlığı — native `eyebrow` (terracotta, geniş aralık); tutar özetinin ve sepetin künyesiyle aynı kademe. */
function Eyebrow({ text }: { text: string }) {
  return <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{text}</span>;
}

interface PhoneCheckRowProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  /** Etiketin altındaki bağ; etiketin dışında durur ki bağa dokunmak kutuyu işaretlemesin. */
  link?: React.ReactNode;
}

/** Kabul bloğunun kutusu, native'in kutusu (26'lık kare, rozet köşe); işaretsiz başlar, çünkü izin de kabul de açık eylem ister. */
function PhoneCheckRow({ checked, onChange, label, link }: PhoneCheckRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="group flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className="grid size-6.5 flex-none place-items-center rounded-badge border-[1.5px] border-sand-500 bg-card font-sans text-note font-bold text-transparent transition-colors group-hover:border-olive peer-checked:border-olive peer-checked:bg-olive peer-checked:text-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive"
        >
          ✓
        </span>
        <span className="font-sans text-helper leading-[1.6] text-body">{label}</span>
      </label>
      {link && <span className="pl-9">{link}</span>}
    </div>
  );
}

function lineLabel(copy: CheckoutCopy, line: SummaryLine): string {
  return copy.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name);
}

/** Fiyatı çözülememiş satır SIFIR yazılmaz (CLAUDE §1): satışa kapanmış kalem "bedava" değildir. */
function lineValue(copy: CheckoutCopy, line: SummaryLine, locale: CheckoutViewProps['locale']): string {
  return line.lineTotalCents === null ? copy.summary.noPrice : formatPrice(line.lineTotalCents, locale);
}
