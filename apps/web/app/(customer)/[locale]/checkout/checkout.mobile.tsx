'use client';

import type { PaymentMethod } from '@lezzet/types';
import { brand } from '@lezzet/brand';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { Chip } from '@/components/customer/phone-kit/chip';
import { ThumbStack } from '@/components/customer/phone-kit/thumb-stack';
import { Note } from '@/components/customer/phone-kit/note';
import { PhoneOptionRow } from './components/phone-option-row';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SummaryPanel, type SummaryRow } from '@/components/customer/phone-kit/summary-panel';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Icon } from '@/components/customer/ui/icons';
import { summaryCopy } from '@/components/customer/ui/summary-row';
import { addressLine, addressTitle } from '@lezzet/address';
import { cartKey } from '@/lib/cart/cart-types';
import { discountLabel, orderDiscountLabel } from '@/lib/cart/discount-label';
import { UNKNOWN_AMOUNT, formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { AccountLine } from './components/checkout-steps';
import { PhoneCheckoutSkeleton } from './components/phone-checkout-skeleton';
import { ShippingOrderNote } from './components/shipping-order-note';
import { checkoutBlocker, selectableShippingOptions, type CheckoutCopy, type CheckoutViewProps } from './checkout-types';

/**
 * Ödemenin telefon görünümü, native "Siparişi tamamla" ekranının web ikizi: metin ortak sözlükten, durum ve sunucu turları
 * `checkout-client.tsx`te masaüstüyle ortak. Web'e özgü farklar: adres sepette seçilir ve burada salt okunur, kart ödemesi
 * sayfanın içinde kendi düğmesiyle onaylanır, kargoda taşıyıcı seçenekleri çıkar.
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
  // Gel-al adres seçicide seçilir (sepet); burada depo, telefon ve fatura adresi olarak kalan adres gösterilir (native ikizi).
  const isPickup = delivery?.deliveryType === 'pickup';
  const pickedWarehouse = snapshot.pickup?.warehouses.find((w) => w.id === snapshot.pickup?.selectedWarehouseId) ?? null;
  const dates = delivery?.availableDates ?? [];

  // Döküm ve toplam aynı okumadan: özet varsa satırlar da indirim de ondan, yoksa ikisi de sepetten, asla karışık. Adres
  // seçilmeden özet yoktur ve o hâlde sepete düşmek doğrudur.
  const orderedCartLines = cart.lines.filter((line) => line.group !== 'undeliverable');
  const summaryLines: SummaryLine[] =
    summary === null
      ? orderedCartLines.map((line) => ({ key: cartKey(line), name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.lines.map((line, index) => ({ key: `order-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));
  // Bu adrese gelemeyen kalem siparişe girmez, sepette bekler; özette üstü çizili durur.
  const droppedLines: SummaryLine[] =
    summary === null
      ? cart.lines
          .filter((line) => line.group === 'undeliverable')
          .map((line) => ({ key: `dropped-${cartKey(line)}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.excludedLines.map((line, index) => ({ key: `dropped-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));

  // Toplam SUNUCUNUN kararıdır; sepet okunmadan yazılmaz (CLAUDE §1 — ölçülemeyen değer sıfır değil).
  const totalLabel = cartReady ? formatPrice(payment?.orderTotalCents ?? cart.totalCents, locale) : UNKNOWN_AMOUNT;
  const feeLabel = payment === null ? copy.summary.pending : payment.shippingFeeCents === 0 ? copy.summary.free : formatPrice(payment.shippingFeeCents, locale);
  const discountCents =
    summary !== null
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
      value: cartReady ? formatPrice(summary?.subtotalCents ?? cart.subtotalCents - cart.undeliverableSubtotalCents, locale) : UNKNOWN_AMOUNT,
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
    // `online` Stripe yolu (peşin, sayfanın içinde); `cash` KAPIDA ödemedir — aracı (nakit/kart/çek) kurye kapanışta yazar.
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

  // Engel TEK yerde kararlaşır (`checkoutBlocker` — kart formu da aynı cevabı okur); telefon native'in iki ek şartını da
  // söyler: gün seçilmedi · ödeme yolu seçilmedi. Okuma düştüyse "güncelleniyor" DENMEZ — bitmeyecek bir bekleyiş olurdu.
  const blocker = checkoutBlocker({ cartFailed, cartHasBlocked: cart.hasBlocked, snapshot, addressId: state.addressId });
  const blockText = !snapshotReady
    ? copy.block.loading
    : blocker === 'cart_unreachable'
      ? t.summary.cartUnreachable
      : blocker === 'address_missing'
        ? state.addressId === null
          ? copy.block.address
          : error !== null
            ? copy.state.failed
            : copy.block.loading
        : blocker === 'undeliverable_line'
          ? copy.block.shipping
          : blocker === 'min_basket' && payment !== null
            ? copy.block.minBasket.replace('{place}', payment.placeLabel).replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale))
            : isRoute && delivery?.requiresDateChoice && state.deliveryDate === null
              ? copy.block.day
              : state.paymentMethod === null
                ? copy.block.payment
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
        <AccountLine t={t} email={props.customerEmail} compact />

        {/* Üç bölüm seçili adresin cevabı ve istemcide çözülüyor: bitmeden iskelet (native `CheckoutSkeleton`). */}
        {snapshotReady ? (
          <>
            <section className="flex flex-col gap-2">
              <Eyebrow text={copy.address.eyebrow} />
              {pickedWarehouse ? (
                <div className="flex flex-col gap-2" data-testid="checkout-pickup-place">
                  <PhoneOptionRow
                    label={t.address.pickupTitle}
                    description={`${pickedWarehouse.name} · ${pickedWarehouse.addressLine}`}
                    selected
                    trailing={<TextAction label={t.address.change} href="/cart" />}
                  />
                  <p className="font-sans text-micro leading-[1.45] text-muted">
                    {t.address.pickupNote.replace('{phone}', brand.contact.phoneDisplay)}
                  </p>
                  {selectedAddress && (
                    <p className="font-sans text-micro leading-[1.45] text-muted">
                      {t.address.billing.replace('{address}', `${addressTitle(selectedAddress)} · ${addressLine(selectedAddress)}`)}
                    </p>
                  )}
                </div>
              ) : selectedAddress ? (
                <PhoneOptionRow
                  label={addressTitle(selectedAddress)}
                  description={addressLine(selectedAddress)}
                  selected
                  trailing={<TextAction label={t.address.change} href="/cart" />}
                />
              ) : (
                // Buraya adressiz gelinmez (sepetin kapısı) — derin bağlantıyla gelen için cümle + çıkış.
                <Note description={t.address.missing} action={<TextAction label={t.address.missingCta} href="/cart" />} />
              )}
              {selectedAddress && !pickedWarehouse && <p className="font-sans text-micro leading-[1.45] text-muted">{t.address.inCartNote}</p>}
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
                      description={isRoute ? copy.delivery.doorBody.replace('{fee}', feeLabel) : copy.delivery.doorUnavailable}
                      selected={isRoute}
                      disabled={!isRoute}
                      descriptionTone={isRoute ? 'muted' : 'danger'}
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
                {!isRoute && !isPickup && !delivery.blocked && <CarrierChoice {...props} />}
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

        {/* İzin kutusu BAŞTAN İŞARETSİZ (AB açık eylem şartı, DOMAIN §11). Kutu native'in: 26'lık kare, rozet köşe. */}
        <label className="group flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={state.marketingConsent} onChange={(e) => props.onToggleConsent(e.target.checked)} className="peer sr-only" />
          <span
            aria-hidden
            className="grid size-6.5 flex-none place-items-center rounded-badge border-[1.5px] border-sand-500 bg-card font-sans text-note font-bold text-transparent transition-colors group-hover:border-olive peer-checked:border-olive peer-checked:bg-olive peer-checked:text-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive"
          >
            ✓
          </span>
          <span className="font-sans text-helper leading-[1.6] text-body">
            {t.payment.consent} <span className="text-muted">{t.payment.consentOptional}</span>
          </span>
        </label>

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

        {state.paymentMethod !== 'online' && (
          <PrimaryButton
            shape="block"
            label={busy ? copy.submitting : copy.confirm.replace('{total}', totalLabel)}
            onClick={props.onConfirm}
            disabled={busy || blockText !== null}
          />
        )}

        {/* Satış koşulları düğmenin ALTINDA; cümle ile bağ ayrı satır — cümleyi parçalayıp bağ gömmek üç dilde kırılgan. */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-center font-sans text-body-sm leading-[1.6] text-body">{copy.terms}</p>
          <TextAction label={copy.termsLink} href="/legal/sales" />
        </div>

        <span className="flex items-center justify-center gap-1.5 font-sans text-micro font-semibold text-muted">
          <Icon name="lock" size={13} />
          {t.secure}
        </span>
      </div>
    </div>
  );
}

/** Bölüm üstbaşlığı — native `eyebrow` (terracotta, geniş aralık); tutar özetinin ve sepetin künyesiyle aynı kademe. */
function Eyebrow({ text }: { text: string }) {
  return <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{text}</span>;
}

function lineLabel(copy: CheckoutCopy, line: SummaryLine): string {
  return copy.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name);
}

/** Fiyatı çözülememiş satır SIFIR yazılmaz (CLAUDE §1): satışa kapanmış kalem "bedava" değildir. */
function lineValue(copy: CheckoutCopy, line: SummaryLine, locale: CheckoutViewProps['locale']): string {
  return line.lineTotalCents === null ? copy.summary.noPrice : formatPrice(line.lineTotalCents, locale);
}

/**
 * Kargo servisi seçimi web'e özgü: seçenekler taşıyıcıdan canlı gelir, fiyat istemcide hesaplanmaz. Eşik üstünde seçim
 * sorulmaz, çünkü ücreti biz ödüyoruz ve koli eve gider; teklif alınamadıysa sebebi ve sabit tarife söylenir.
 */
function CarrierChoice({ t, locale, snapshot, state, onSelectShipping }: CheckoutViewProps) {
  const shipping = snapshot.shipping;
  if (shipping?.mode === 'auto') return <p className="font-sans text-body-sm leading-[1.6] text-muted">{t.delivery.carrierFreeHome}</p>;
  if (shipping === null || selectableShippingOptions(shipping.options).length === 0) {
    return (
      <p className="font-sans text-body-sm leading-[1.6] text-muted">
        {shipping?.status === 'unmeasured' ? t.delivery.carrierUnmeasured : shipping?.status === 'ok' ? t.delivery.carrierNone : t.delivery.carrierOff}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-sans text-note font-bold text-ink">
        {t.delivery.carrierTitle}
        {shipping.parcelCount > 1 && ` · ${t.delivery.carrierParcels.replace('{count}', String(shipping.parcelCount))}`}
      </span>
      {selectableShippingOptions(shipping.options).map((option) => {
        const details = [
          option.leadTimeHours ? t.delivery.carrierDays.replace('{hours}', String(option.leadTimeHours)) : null,
          option.tracked ? t.delivery.carrierTracked : null,
        ].filter((part): part is string => part !== null);
        return (
          <PhoneOptionRow
            key={option.code}
            label={option.carrierName}
            description={details.length > 0 ? details.join(' · ') : undefined}
            selected={state.shippingOptionCode === option.code}
            onClick={() => onSelectShipping(option.code)}
            trailing={<span className="flex-none font-sans text-control text-ink">{formatPrice(option.priceCents, locale)}</span>}
          />
        );
      })}
      <p className="font-sans text-helper text-muted">{t.delivery.carrierHint}</p>
    </div>
  );
}
