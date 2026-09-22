'use client';

import { useState } from 'react';
import { addressTitle } from '@lezzet/address';
import type { PaymentMethod } from '@lezzet/types';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { SummaryRow, summaryCopy } from '@/components/customer/ui/summary-row';
import { PlaceRestriction, restrictedLines } from '@/components/customer/delivery/place-restriction';
import { signOutAction } from '@/lib/auth/actions';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { cartKey } from '@/lib/cart/cart-types';
import { discountLabel, orderDiscountLabel } from '@/lib/cart/discount-label';
import { UNKNOWN_AMOUNT, formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { checkoutBlocker, pointOptionsByCarrier, selectableShippingOptions, servicePointMissing, type CheckoutViewProps } from '../checkout-types';
import { ServicePointPicker } from './service-point-picker';

/**
 * Checkout'un üç adımı, masaüstü ve mobil web için aynı bloklar. Cihaz forku yerleşimi ayırır, mantığı değil; bu yüzden bloklar
 * burada tek kez yazılır ve iki ekran dosyası yalnız onları farklı düzenlerde sıralar.
 */

export function StepShell({ step, title, compact, children }: { step: string; title: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <section
      // Tasarım künyesi: `bg #fff · 1px kum-200 kenar · radius 18 · ped 22/26 · gap 14`.
      className={['flex flex-col gap-3.5 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-6.5 py-5.5'].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* Tasarım: 30×30 daire, 700 15px. Küçüğü (28/13) başlığın yanında cılız kalıyordu. */}
        <span className="flex size-[30px] flex-none items-center justify-center rounded-full bg-olive font-sans text-body font-bold text-white">{step}</span>
        {/* Tasarım: 600 19px Lora — `card-title-sm` (18) en yakın durak, yeni token açılmadı. */}
        <span className="font-serif text-card-title-sm text-ink">{title}</span>
      </div>
      {children}
    </section>
  );
}

/** Seçeneklerin en düşük fiyatı — "… €'dan başlayan fiyatlarla" cümlesinin sayısı. */
const minPriceOf = (options: readonly { priceCents: number }[]): number => Math.min(...options.map((o) => o.priceCents));

/** Seçilebilir kart — adres, gün ve ödeme yöntemi aynı görsel dili konuşur (tasarım). */
function ChoiceCard({
  selected,
  onClick,
  disabled,
  center,
  small,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Gün kartları ORTALANMIŞ (tasarım: `padding 12px 20px`, içerik merkezde); adres/ödeme sola. */
  center?: boolean;
  /** Bir seçimin altındaki alt seçenek: daha dar ve hafif, ki üstteki kararla aynı ağırlıkta okunmasın. */
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      // Tasarım: seçili `2px zeytin + zeytin-zemin`, normal `1.5px kum-400 + beyaz`; radius 14,
      // ped 14/18, satır arası 3. Seçili kenarın kalınlaşması kartı 1px büyütür — tasarım da öyle.
      className={[
        'flex cursor-pointer flex-col gap-[3px] rounded-soft text-left transition-colors',
        small ? 'px-3.5 py-2.5' : 'px-[18px] py-3.5',
        'disabled:cursor-not-allowed disabled:border-sand-200 disabled:bg-sand-25 disabled:opacity-60',
        selected ? 'border-2 border-olive bg-olive-bg' : 'border-[1.5px] border-sand-400 bg-card hover:border-olive',
        center ? 'items-center text-center' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

interface ModeCardProps {
  icon: 'building' | 'home';
  title: string;
  from: string;
  selected: boolean;
  onClick: () => void;
}

/** Teslim türü kartı: ikon başta ve büyük, çünkü tür ilk bakışta ikondan okunmalı; altında en düşük fiyat. */
function ModeCard({ icon, title, from, selected, onClick }: ModeCardProps) {
  return (
    <ChoiceCard selected={selected} onClick={onClick}>
      <span className="flex items-center gap-3.5">
        <span
          className={[
            'flex size-12 flex-none items-center justify-center rounded-full text-olive',
            selected ? 'bg-card' : 'bg-olive-bg',
          ].join(' ')}
        >
          <Icon name={icon} size={26} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-sans text-body font-bold text-ink">{title}</span>
          <span className="font-sans text-note text-muted">{from}</span>
        </span>
      </span>
    </ChoiceCard>
  );
}

/**
 * Girişli müşterinin kimlik satırı adım değil künyedir: doğrulanmış müşteriden ikinci doğrulama sürtünmedir, ama siparişin kime
 * bağlandığı görünmeli, çünkü paylaşılan cihazda bir öncekinin oturumu açık kalmış olabilir.
 */
export function AccountLine({ t, email, compact }: { t: CheckoutViewProps['t']; email: string; compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!email) return null;

  /**
   * "Siz değil misiniz?" gerçekten çıkış yapar, yoksa paylaşılan cihazda ikinci kişi birincinin hesabıyla sipariş verebilirdi.
   * Tam yenileme, çünkü oturuma göre kurulmuş her şey (sepet, adresler, seçili adım) sıfırdan kurulmalı.
   */
  const signOut = async () => {
    setBusy(true);
    await signOutAction();
    window.location.reload();
  };

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-1',
        // Telefonda native ödeme ekranının hesap bandı (kum kutu, kontrol köşe, mürekkep yazı); masaüstünde zeytin künye.
        compact ? 'rounded-control bg-sand-150 px-3.5 py-3' : 'rounded-soft bg-olive-bg px-4 py-2.5',
      ].join(' ')}
    >
      <span className={['inline-flex items-center gap-1.5 font-sans text-note', compact ? 'font-semibold text-ink' : 'text-olive-dark'].join(' ')}>
        <Icon name="check" size={14} className="flex-none" />
        {t.verify.accountAs.replace('{email}', email)}
      </span>
      {/* Tek tıkla çıkış YOK: sipariş ortasında yanlışlıkla basan müşteri oturumunu kaybetmesin.
          Ayrı bir pencere de açılmaz — soru satırın kendi içinde sorulur (sade & sezgisel). */}
      {confirming ? (
        <span className="ml-auto flex items-center gap-3">
          <span className="font-sans text-micro text-olive-dark">{t.verify.notYouConfirm}</span>
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => void signOut()}>
            {t.verify.notYouYes}
          </Button>
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => setConfirming(false)}>
            {t.verify.notYouCancel}
          </Button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="ml-auto cursor-pointer font-sans text-micro font-semibold text-olive underline hover:text-olive-dark"
        >
          {t.verify.notYou}
        </button>
      )}
    </div>
  );
}

/**
 * Adres adımı salt okunur: seçim, ekleme ve düzenleme sepette (`CartIdentity` → `AddressPickerDialog`), iki ekran iki ayrı
 * adresle konuşmasın diye. Çıkış bağlantısı şart, çünkü yanlış adresi ödeme adımında fark eden müşteri nereye gideceğini aramamalı.
 */
export function AddressStep({ t, compact, selectedAddress }: CheckoutViewProps) {
  return (
    <StepShell step={t.address.step} title={t.address.title} compact={compact}>
      {selectedAddress ? (
        // Seçili kartın dili: `2px zeytin + zeytin-zemin` (tasarımın seçili adres kartı) — ama bir
        // `<button>` değil, çünkü burada seçilecek bir şey yok.
        <div className="flex w-max max-w-full flex-col gap-[3px] rounded-soft border-2 border-olive bg-olive-bg px-[18px] py-3.5">
          <span className="font-sans text-body-sm font-bold text-ink">{addressTitle(selectedAddress)}</span>
          <span className="font-sans text-note leading-relaxed text-body">
            {selectedAddress.line1}
            {selectedAddress.line2 && `, ${selectedAddress.line2}`}
          </span>
          <span className="font-sans text-note leading-relaxed text-body">
            {selectedAddress.postalCode} {selectedAddress.city}
          </span>
        </div>
      ) : (
        // Buraya adressiz gelinmez (sepet kapısı) — derin bağlantıyla gelen için cümle + çıkış.
        <p className="font-sans text-note leading-relaxed text-body">{t.address.missing}</p>
      )}
      <Link href="/cart" className="w-max cursor-pointer font-sans text-note font-semibold text-olive underline hover:text-olive-dark">
        {selectedAddress ? t.address.changeInCart : t.address.missingCta}
      </Link>
    </StepShell>
  );
}

export function DeliveryStep(props: CheckoutViewProps) {
  const { t, locale, snapshot, state, compact, onSelectDate, onSelectShipping, onSelectServicePoint, onSelectShippingMode, cart, selectedAddress } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const homeOptions = selectableShippingOptions(snapshot.shipping?.options ?? []);
  // Telefon görünümünde nokta seçimi yok (K.28): orada yalnız eve teslim servisleri listelenir.
  const pointOptions = compact ? new Map<string, never>() : pointOptionsByCarrier(snapshot.shipping?.options ?? []);
  const hasModes = homeOptions.length > 0 && pointOptions.size > 0;
  const mode: 'home' | 'point' = homeOptions.length === 0 && pointOptions.size > 0 ? 'point' : hasModes ? state.shippingMode : 'home';
  const router = useRouter();
  const delivery = snapshot.delivery;
  const payment = snapshot.payment;
  if (!delivery) return null;

  const inRoute = delivery.deliveryType === 'route';

  /**
   * Kısıt bloğu seçili adrese bakar, sitenin ortak cevabına (başlıktaki hap) değil: müşteri sepette kod vermemişse hap boştur
   * ve hangi kalemin gelemeyeceği hiçbir yerde yazmazdı. Bölge adı ve gün taşınmaz, çünkü blok yalnız "rota içinde mi" diye sorar.
   */
  const addressPlace = selectedAddress
    ? {
        postalCode: selectedAddress.postalCode,
        // Ülke adresin kendisinden gelir, posta kodundan türetilmez: türetme yalnız kod tek başına girildiğinde gerekir.
        country: selectedAddress.country,
        // Yer adı, yerleşim listesi ve bölge adı TAŞINMAZ: blok üçünü de kullanmıyor, tek sorduğu
        // "rota içinde mi".
        placeName: null,
        places: [],
        zoneName: null,
        inRoute,
        nextDate: null,
        // Koordinat da taşınmaz: nokta yalnız adres önerisini sıralamak için var ve bu blok öneri göstermiyor.
        point: null,
      }
    : null;
  const restricted = restrictedLines(addressPlace, cart.lines);
  // Eşik sepet okumasından gelir; ekran ayar okumaz (tek kaynak).
  const freeThresholdCents = cart.freeShippingCents;

  return (
    <StepShell step={t.delivery.step} title={t.delivery.title} compact={compact}>
      {/* Teslimat türü önce söylenir, çünkü gün seçeneği ancak "kim getiriyor" bilinince anlam kazanır; kargo hata gibi yazılmaz.
          Tür bir rozet, açıklaması altında düz metin: renkli kutu bilgiyi uyarı gibi gösterirdi. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex w-max items-center gap-1.5 rounded-[12px] bg-olive-bg px-2.5 py-[3px] font-sans text-note font-semibold text-olive">
            <Icon name={inRoute ? 'truck' : 'box'} size={13} />
            {inRoute ? t.delivery.route : t.delivery.shipping}
          </span>
          {/* Ücret rozetin yanında: teslimat türünü okuyan müşteri bedelini aynı anda görmeli —
              özete kadar aşağı inip bulmak sürpriz hissi verirdi. */}
          {!inRoute && payment && payment.shippingFeeCents > 0 && (
            <span className="font-sans text-body-sm font-bold text-ink">{formatPrice(payment.shippingFeeCents, locale)}</span>
          )}
        </div>
        <span className="font-sans text-body-sm leading-relaxed text-body">{inRoute ? t.delivery.routeBody : t.delivery.shippingBody}</span>
        {!inRoute && (
          <span className="font-sans text-note leading-relaxed text-muted">
            {t.delivery.shippingScope}
            {freeThresholdCents > 0 && ` ${t.delivery.shippingFree.replace('{threshold}', formatPrice(freeThresholdCents, locale))}`}
          </span>
        )}
      </div>

      {/* Teslimat kısıtı sepettekiyle aynı bileşen: aynı sıra, aynı dil, aynı üç çıkış. Sepet ve ödeme ekranı aynı adresi okuduğu
          için sepette çözülmüş kısıt burada yeniden doğmaz; blok yalnız derin bağlantıyla gelen ya da sepeti atlayan müşteride
          görünür. */}
      <PlaceRestriction
        locale={locale}
        lines={cart.lines}
        minBasketCents={cart.minBasketCents}
        freeShippingCents={cart.freeShippingCents}
        compact={compact}
        place={addressPlace}
        // Adres sepette değişir: çıkış sepete götürür, burada seçici açılmaz.
        onChangePlace={() => router.push('/cart')}
      />
      {/* Sunucu "gönderilemez" diyor ama blok çizilmediyse (ör. kalem aynı zamanda tükendiği için
          bloğun kapsamı dışında) müşteri sebepsiz kalmasın — cümle YEDEK olarak durur. */}
      {delivery.blocked && restricted.length === 0 && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.delivery.blocked}</p>
      )}

      {/* Komşu daveti günün üstünde, çünkü altında dursaydı davetli önce günü seçer sonra nedenini okurdu; cümle davet edenin
          yalnız adını taşır. Her davet kendi satırında, çünkü müşteriyi birden çok komşu birden çok güne çağırmış olabilir. */}
      {inRoute &&
        !delivery.blocked &&
        delivery.neighborInvites.map((invite) => (
          <p
            key={invite.inviteId}
            className="flex items-start gap-2 rounded-soft bg-olive-bg px-4 py-3 font-sans text-note leading-relaxed font-semibold text-olive-dark"
          >
            <Icon name="truck" size={15} className="mt-0.5 flex-none" />
            {t.delivery.neighborInvite
              .replace('{name}', invite.inviterName)
              .replace('{date}', formatDeliveryDate(invite.deliveryDate, locale))}
          </p>
        ))}

      {/* Kargoda gün SEÇİLMEZ: tarih taşıyıcıya bağlı, söz vermiyoruz (DOMAIN §6). */}
      {inRoute && !delivery.blocked && (
        delivery.requiresDateChoice ? (
          <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-3 gap-2.5'}>
            {delivery.availableDates.map((date) => (
              <ChoiceCard key={date} selected={state.deliveryDate === date} onClick={() => onSelectDate(date)} center>
                <span className="font-sans text-body font-bold text-ink">{formatDeliveryDate(date, locale)}</span>
              </ChoiceCard>
            ))}
          </div>
        ) : (
          // Tek gün varsa seçim SUNULMAZ, gösterilir — seçeneksiz bir seçim ekranı sahte karardır.
          <span className="font-sans text-note font-semibold text-olive-dark">
            {t.delivery.single.replace('{date}', formatDeliveryDate(delivery.availableDates[0] ?? '', locale))}
          </span>
        )
      )}
      {/* Kargo servisi seçimi: seçenekler taşıyıcıdan canlı gelir ve fiyat istemcide hesaplanmaz, seçim sunucuya gidip anlık
          görüntüyü yeniden çözer. Eşik üstünde seçim sorulmaz, çünkü ücret sıfır ve koli eve gider; kural asıl sevkte bağlayıcı
          (`quoteOrderShipment` → `requiresHomeDelivery`), burası yalnız sormama kısmı. */}
      {!inRoute && !delivery.blocked && snapshot.shipping?.mode === 'auto' && (
        <div className="flex flex-col gap-1">
          <span className="font-sans text-body-sm font-bold text-ink">{t.delivery.carrierTitle}</span>
          <span className="font-sans text-body-sm text-body">{t.delivery.carrierFreeHome}</span>
        </div>
      )}

      {!inRoute && !delivery.blocked && snapshot.shipping?.mode !== 'auto' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-body-sm font-bold text-ink">{t.delivery.carrierTitle}</span>
            {snapshot.shipping !== null && snapshot.shipping.parcelCount > 1 && (
              <span className="font-sans text-note text-muted">
                {t.delivery.carrierParcels.replace('{count}', String(snapshot.shipping.parcelCount))}
              </span>
            )}
          </div>

          {snapshot.shipping !== null && (homeOptions.length > 0 || (!compact && pointOptions.size > 0)) ? (
            <>
              {/* Önce teslim türü seçilir, servis ya da nokta onun altında açılır; her tür en düşük fiyatıyla görünür. */}
              {hasModes && (
                <div className="grid grid-cols-2 gap-2.5">
                  <ModeCard
                    icon="building"
                    title={t.delivery.carrierPoint}
                    from={t.delivery.carrierFrom.replace('{price}', formatPrice(minPriceOf([...pointOptions.values()]), locale))}
                    selected={mode === 'point'}
                    onClick={() => onSelectShippingMode('point')}
                  />
                  <ModeCard
                    icon="home"
                    title={t.delivery.carrierHome}
                    from={t.delivery.carrierFrom.replace('{price}', formatPrice(minPriceOf(homeOptions), locale))}
                    selected={mode === 'home'}
                    onClick={() => onSelectShippingMode('home')}
                  />
                </div>
              )}

              {/* Tür kararıyla altındaki seçim arasında çizgi ve başlık: ikisi yan yana aynı ölçüde dursa tek bir liste gibi okunuyordu. */}
              {hasModes && (
                <div className="mt-1 flex flex-col gap-2 border-t border-sand-200 pt-3.5">
                  <span className="font-sans text-note font-semibold text-muted">
                    {mode === 'home' ? t.delivery.carrierPickHome : t.delivery.carrierPickPoint}
                  </span>
                </div>
              )}

              {mode === 'home' && homeOptions.length > 0 && (
                <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
                  {homeOptions.map((option, index) => (
                    <ChoiceCard
                      key={option.code}
                      small={hasModes}
                      selected={state.shippingOptionCode === option.code}
                      onClick={() => onSelectShipping(option.code)}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-sans text-note font-bold text-ink">{option.carrierName}</span>
                        <span className="font-sans text-note font-bold text-ink">{formatPrice(option.priceCents, locale)}</span>
                      </span>
                      <span className="font-sans text-note text-muted">
                        {[
                          option.leadTimeHours ? t.delivery.carrierDays.replace('{hours}', String(option.leadTimeHours)) : null,
                          option.tracked ? t.delivery.carrierTracked : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {/* Liste sunucuda en ucuz + en hızlı diye kısaltıldı (`homeShortlist`); iki kart varsa neden o ikisi olduğu söylenir. */}
                      {homeOptions.length === 2 && (
                        <span className="font-sans text-helper font-semibold text-olive">
                          {index === 0 ? t.delivery.carrierCheapest : t.delivery.carrierFastest}
                        </span>
                      )}
                    </ChoiceCard>
                  ))}
                </div>
              )}

              {mode === 'point' && (
                <>
                  <ChoiceCard selected={state.servicePoint !== null} onClick={() => setPickerOpen(true)}>
                    {state.servicePoint ? (
                      <>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-sans text-body-sm font-bold text-ink capitalize">{state.servicePoint.name.toLowerCase()}</span>
                          {pointOptions.get(state.servicePoint.carrierCode) && (
                            <span className="font-sans text-body-sm font-bold text-ink">
                              {formatPrice(pointOptions.get(state.servicePoint.carrierCode)!.priceCents, locale)}
                            </span>
                          )}
                        </span>
                        <span className="font-sans text-note text-body capitalize">
                          {[state.servicePoint.street, state.servicePoint.houseNumber].filter(Boolean).join(' ').toLowerCase()}, {state.servicePoint.postalCode}{' '}
                          {state.servicePoint.city.toLowerCase()}
                        </span>
                        <span className="font-sans text-note font-semibold text-olive">
                          {pointOptions.get(state.servicePoint.carrierCode)?.carrierName} · {t.delivery.pointChange}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-2 font-sans text-body-sm font-bold text-ink">
                          <Icon name="pin" size={15} />
                          {t.delivery.pointChoose}
                        </span>
                        <span className="font-sans text-note text-muted">{t.delivery.pointMapHint}</span>
                      </>
                    )}
                  </ChoiceCard>
                  {servicePointMissing(state) && <span className="font-sans text-note font-semibold text-honey">{t.delivery.pointNone}</span>}
                  {pickerOpen && state.addressId && (
                    <ServicePointPicker
                      t={t}
                      locale={locale}
                      addressId={state.addressId}
                      home={selectedAddress?.lat != null && selectedAddress.lng != null ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null}
                      options={snapshot.shipping.options}
                      selected={state.servicePoint}
                      onSelect={onSelectServicePoint}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </>
              )}
              <span className="font-sans text-note text-muted">{t.delivery.carrierHint}</span>
            </>
          ) : (
            /* Sessiz geri düşüş yok: teklif alınamadıysa sebebi yazılır ve sabit tarife uygulandığı söylenir. Sebepler ayrı
               cümleler, çünkü çözümleri de ayrı: ölçü eksikliği bizim işimiz, seçenek yokluğu adresin gerçeği. */
            <span className="font-sans text-note leading-relaxed text-muted">
              {snapshot.shipping?.status === 'unmeasured'
                ? t.delivery.carrierUnmeasured
                : snapshot.shipping?.status === 'ok'
                  ? t.delivery.carrierNone
                  : t.delivery.carrierOff}
            </span>
          )}
        </div>
      )}
      {!inRoute && (
        <span className="inline-flex items-center gap-1.5 font-sans text-note font-semibold text-body">
          <Icon name="box" size={14} />
          {t.delivery.shippingDays}
        </span>
      )}
    </StepShell>
  );
}

export function PaymentStep({ t, snapshot, state, compact, onSelectPayment, onToggleConsent, paymentSlot }: CheckoutViewProps) {
  const payment = snapshot.payment;
  if (!payment) return null;

  const options: { method: PaymentMethod; onAccount: boolean; title: string; body: string; blocked: string | null }[] = [
    // `online` Stripe yoludur (peşin, sayfa içinde); `card`/`cheque` kapıda kullanılan araçlardır ve hangisinin kullanıldığını
    // kurye kapanışta yazar.
    { method: 'online', onAccount: false, title: t.payment.card, body: t.payment.cardBody, blocked: null },
    {
      method: 'cash',
      onAccount: false,
      title: t.payment.cod,
      body: t.payment.codBody,
      blocked: payment.codBlockedReason ? (t.payment.codBlocked[payment.codBlockedReason as keyof typeof t.payment.codBlocked] ?? null) : null,
    },
  ];
  // Havale: motorun açtığı bir yol (peşin, faturayla). Vadeliden AYRI karttır — biri paranın nasıl
  // geldiği, öbürü ne zaman geldiğidir.
  if (payment.methods.includes('bank_transfer')) {
    options.push({ method: 'bank_transfer', onAccount: false, title: t.payment.transfer, body: t.payment.transferBody, blocked: null });
  }
  // Vadeli YALNIZ açıksa çizilir: kapalıyken göstermek B2C müşteriye anlamı olmayan bir kapı açardı.
  // Gri/kilitli bile değil — geçersiz yol DOM'da hiç yoktur (tasarım sözleşmesi).
  if (payment.creditAvailable) {
    options.push({ method: 'bank_transfer', onAccount: true, title: t.payment.credit, body: t.payment.creditBody, blocked: null });
  }

  return (
    <StepShell step={t.payment.step} title={t.payment.title} compact={compact}>
      <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2.5'}>
        {options.map((option) => {
          const available = payment.methods.includes(option.method) && !option.blocked;
          return (
            <ChoiceCard
              key={option.method}
              selected={state.paymentMethod === option.method && state.onAccount === option.onAccount}
              disabled={!available}
              onClick={() => onSelectPayment(option.method, option.onAccount)}
            >
              <span className="font-sans text-body-sm font-bold text-ink">{option.title}</span>
              <span className="font-sans text-note leading-relaxed text-body">{option.blocked ?? option.body}</span>
            </ChoiceCard>
          );
        })}
      </div>

      {/* Tavan üstü tutarda kural TEK cümleyle söylenir; kapıda kartı kilitli göstermek yerine. */}
      {payment.codBlockedReason === 'over_limit' && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.payment.onlineRequired}</p>
      )}

      {state.paymentMethod === 'cash' && payment.cashWarning && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.payment.cashWarning}</p>
      )}

      {/* Kart alanı yalnız online ödeme seçiliyken monte edilir: Stripe iframe'ini görünmez de olsa
          baştan yüklemek, ödemeyi seçmeyen müşteriye üçüncü tarafa istek attırmak olurdu. */}
      {state.paymentMethod === 'online' && paymentSlot}

      {/* İzin kutusu BAŞTAN İŞARETSİZ (AB açık eylem şartı, DOMAIN §11). */}
      <label className="flex cursor-pointer items-start gap-2.5">
        {/* Tasarım: 20×20, 2px kum-400 kenar, radius 6 — envanterin dokunma tablosu da 22px diyor. */}
        <input
          type="checkbox"
          checked={state.marketingConsent}
          onChange={(e) => onToggleConsent(e.target.checked)}
          className="mt-px size-5 flex-none cursor-pointer rounded-[6px] border-2 border-sand-400 accent-olive"
        />
        <span className="font-sans text-body-sm leading-relaxed text-body">
          {t.payment.consent} <span className="text-muted">{t.payment.consentOptional}</span>
        </span>
      </label>
    </StepShell>
  );
}

/** Sağdaki (mobil webde alttaki) özet — kalemler, indirim, kargo, toplam ve onay düğmesi. */
export function OrderSummary(props: CheckoutViewProps) {
  const { t, locale, cart, cartReady, cartFailed, snapshot, state, compact, busy, error, onConfirm, selectedAddress } = props;
  const { addressNotice, onAcceptAddressFix, onDismissAddressNotice } = props;
  const payment = snapshot.payment;
  const delivery = snapshot.delivery;
  // Özetin ortak sözcükleri: aynı blok sepette, onay ekranında ve sipariş detayında da çiziliyor ve dört sözlükte ayrı tutulunca
  // diller arasında ayrışır.
  const summary = summaryCopy(locale);

  /**
   * `payment` yokken teslimat satırına "Ücretsiz" yazılmaz: ücret adresten çıkar (rota ücretsiz, kargo ücretli) ve adres seçilmeden
   * yazmak tutmayacağımız bir söz olurdu. Bilinmeyen tutar bu blokta "—" ile yazılır.
   */
  const shippingLabel = !payment
    ? UNKNOWN_AMOUNT
    : payment.shippingFeeCents > 0
      ? formatPrice(payment.shippingFeeCents, locale)
      : summary.free;
  const totalCents = payment?.orderTotalCents ?? cart.totalCents;
  /*
    Döküm ve toplam aynı okumadan: özet varsa satırlar da indirim de ondan, yoksa ikisi de sepetten, asla karışık, çünkü sepet iki
    yüzeyde paylaşıldığı için liste ile toplam ayrışabilir. Adres seçilmeden özet yoktur ve o hâlde sepete düşmek doğrudur.
  */
  const orderSummary = snapshot.summary;
  const summaryLines: { key: string; kind: 'variant' | 'bundle'; name: string; qty: number; lineTotalCents: number | null }[] =
    orderSummary === null
      ? cart.lines.map((line) => ({ key: cartKey(line), kind: line.kind, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : orderSummary.lines.map((line, index) => ({ key: `order-${index}`, ...line }));
  const discountCents =
    orderSummary !== null
      ? (orderSummary.discount?.amountCents ?? 0)
      : cart.discount.status === 'applied' || cart.discount.status === 'automatic'
        ? cart.discount.amountCents
        : 0;

  // Onay düğmesi kart ödemesinde ÇİZİLMEZ: orada onayı Stripe formunun kendi düğmesi veriyor
  // (önce kartı valide etmesi gerekiyor). İki düğme müşteriye hangisinin bitirdiğini sordururdu.
  const showConfirm = state.paymentMethod !== null && state.paymentMethod !== 'online';
  // Engel tek yerde kararlaşır (`checkoutBlocker`): burada ve kart ödemesinin formunda aynı cevap okunur. Sepet okunamadıysa da
  // sipariş verilemez, çünkü ekrandaki 0,00 € bir toplam değil cevapsızlıktır.
  const blocked =
    checkoutBlocker({ cartFailed, cartHasBlocked: cart.hasBlocked, snapshot, addressId: state.addressId, pointMissing: servicePointMissing(state) }) !== null;

  return (
    // Tasarım künyesi `radius 18 · ped 22/24 · gap 12`: adım kartlarıyla aynı aile, bir tık dar; `snug` tam olarak bu.
    <Card compact={compact} pad="snug">
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{summary.title}</span>

      {/* Kalemler özetin içinde, tek sütunda: checkout'un sorusu "ne aldım" değil "ne ödüyorum" ve ad satırları o toplamın
          dökümü. Ara toplam yazılmaz, çünkü genel toplamla karıştırılan üçüncü bir sayı olurdu. */}
      <div className="flex flex-col gap-1.5">
        {/* Sepet istemcide okunduğu için ilk karede kalem yok; boş bırakmak "özetiniz yok" gibi okunur, iskelet yerini tutar ve
            tutarlar gelince sayfa zıplamaz. */}
        {!cartReady &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        {cartReady &&
          summaryLines.map((line) => (
            <SummaryRow
              key={line.key}
              // Paket satırı adetle değil KÜNYESİYLE anılır (tasarım: "Bayram Sofrası (paket)"):
              // paketin adedi tek, satılan şey bütünün kendisi.
              label={line.kind === 'bundle' ? `${line.name} ${t.summary.packageSuffix}` : `${line.name} × ${line.qty}`}
              value={line.lineTotalCents === null ? UNKNOWN_AMOUNT : formatPrice(line.lineTotalCents, locale)}
            />
          ))}
        {discountCents > 0 && (
          // Etiket sepetle AYNI yardımcıdan: müşteri iki ekranda aynı indirimi iki türlü okumamalı.
          <SummaryRow
            /* Künye de aynı kaynaktan: özet varsa sunucunun çözdüğü ad, yoksa sepetin türetmesi.
               Adı olmayan kampanyada iki yol da SEBEBİ yazar — müşteri aynı indirimi iki ekranda
               iki türlü okumasın. */
            label={orderSummary !== null ? orderDiscountLabel(orderSummary.discount, summary) : discountLabel(cart.discount, summary, locale)}
            value={`−${formatPrice(discountCents, locale)}`}
            tone="olive"
          />
        )}
        {/* Ücretsizde yalnız tutar yeşil, çünkü ücretsizlik bir kazançtır; `payment` yokken ton nötr kalır, yoksa "—" yeşil çıkar
            ve iyi haber gibi okunurdu. */}
        <SummaryRow
          label={summary.delivery}
          value={shippingLabel}
          tone={!payment || payment.shippingFeeCents > 0 ? 'default' : 'oliveValue'}
        />
        {/* Toplam satırı tasarımda **Karla 700/18** — serif DEĞİL. Serif yapmak onu bir başlığa
            çeviriyor; oysa bu bir sayı satırı ve üstündeki satırlarla aynı ailede okunmalı. */}
        <div className="flex items-baseline justify-between gap-3 border-t border-sand-200 pt-2.5">
          <span className="font-sans text-card-title-sm font-bold text-ink">{summary.total}</span>
          {/* Sepet okunmadan toplam yazılmaz: `formatPrice(0)` misafirde kalıcı olarak "0,00 €" gösterir ve sepet boş ya da bedava
              gibi okunurdu. */}
          {cartReady ? (
            <span className="font-sans text-card-title-sm font-bold text-ink">{formatPrice(totalCents, locale)}</span>
          ) : (
            <Skeleton className="h-4 w-20" />
          )}
        </div>
        <span className="font-sans text-micro text-muted">{summary.vatIncluded}</span>
      </div>

      {/* Sepet okunamadıysa bu söylenir: boş sepet bir durum, ulaşılamayan sepet bir arızadır. */}
      {cartFailed && <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.summary.cartUnreachable}</p>}

      {/* Gönderilemeyen kalem varken toplam nihai değil; satır kalem adı taşımaz, çünkü hangisi olduğunu adım 2'deki blok söyler
          ve özette ikinci liste tutulmaz. */}
      {snapshot.delivery?.blocked && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.summary.blockedTotal}</p>
      )}

      {/* Alt sınır yere bağlıdır ve cümle yeri taşır: sepet çerezdeki koda, checkout seçilen adrese göre hesaplar ve iki ayrı
          bölgeye düşen müşteride sayı değişir. */}
      {payment && !payment.minBasketOk && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">
          {t.summary.minBasket
            .replace('{place}', payment.placeLabel)
            .replace('{min}', formatPrice(payment.orderTotalCents + payment.missingForMinBasketCents, locale))
            .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale))}
        </p>
      )}

      {error && <p className="font-sans text-note leading-relaxed font-semibold text-terracotta">{error}</p>}

      {/* Adresin kapısı sipariş anında sorulur ve söylenecek bir şey varsa akış bir kez durur. İki hâl yapısal olarak farklı:
          başka kodda bulunan kapı düzeltilebilir hatadır ve düğmesi vardır, ötekiler düğmesiz belirsizliktir. */}
      {addressNotice && addressNotice.status === 'wrong_postal_code' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-honey/40 bg-honey/10 p-3">
          <span className="font-sans text-note leading-relaxed text-body">{t.addressCheck.foundElsewhere}</span>
          {/* Metin SERVİSİN etiketi — biz cümle kurmayız, kendi birleştirmemiz servisin bildiği
              yazımdan (aksan, kısaltma) sapardı ve müşteriye tanımadığı bir adres gösterirdi. */}
          <span className="font-sans text-note font-semibold leading-relaxed text-ink">{addressNotice.label}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" compact={compact} disabled={busy} onClick={onAcceptAddressFix}>
              {t.addressCheck.useIt}
            </Button>
            {/* "İptal" DEĞİL: ret bir vazgeçiş değil bir BEYAN — müşteri haklı olabilir (yeni bina,
                `bis/ter` ekli numara) ve o beyan kayıtta `geo_alt_label` olarak duruyor. */}
            <Button size="sm" compact={compact} variant="ghost" disabled={busy} onClick={onDismissAddressNotice}>
              {t.addressCheck.keepMine}
            </Button>
          </div>
        </div>
      ) : addressNotice ? (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">
          {addressNotice.status === 'not_found' ? t.addressCheck.notFound : t.addressCheck.streetOnly}
        </p>
      ) : null}

      {showConfirm && (
        <Button size="md" compact={compact} fullWidth disabled={busy || blocked} onClick={onConfirm}>
          {t.summary.submit}
        </Button>
      )}

      {/* Onay isteyen cümlenin okunacak bir karşılığı olmalı; bağ ayrı satırda, çünkü yerelleştirilmiş cümleye bağ gömmek üç
          dilde kırılgan olurdu. */}
      <span className="font-sans text-micro leading-relaxed text-muted">
        {t.summary.terms}{' '}
        <Link href="/legal/sales" className="cursor-pointer font-bold text-olive transition-colors hover:text-olive-dark">
          {t.summary.termsLink}
        </Link>
      </span>

      {/* Soğuk zincir güvencesi: kapıya teslimde ve gün belliyken. Kargoda söylenmez — o zincire
          biz kefil olamayız, zaten soğuk zincir kalemi kargoya hiç girmiyor. */}
      {delivery?.deliveryType === 'route' && state.deliveryDate && selectedAddress && (
        // Kum zemin, zeytin değil: bu bir güvence cümlesi ve yeşil kutu onu "her şey yolunda" rozetine çevirip özetteki ücretsiz
        // teslimat satırıyla yarıştırırdı.
        <p className="rounded-soft bg-sand-100 px-4 py-3 font-sans text-note leading-loose text-body">
          {t.summary.coldChain.replace('{date}', formatDeliveryDate(state.deliveryDate, locale))}
        </p>
      )}
    </Card>
  );
}
