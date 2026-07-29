'use client';

import { useState } from 'react';
import type { PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { PlaceRestriction, restrictedLines } from '@/components/customer/delivery/place-restriction';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { signOutAction } from '@/lib/auth/actions';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { cartKey } from '@/lib/cart/cart-types';
import { discountLabel } from '@/lib/cart/discount-label';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import type { CheckoutViewProps, NewAddressInput } from '../checkout-types';

/**
 * Checkout'un üç adımı — masaüstü ve mobil AYNI bloklar (tasarım: numaralı 1·2·3 kartları).
 * Cihaz forku yerleşimi ayırır, mantığı değil; bu yüzden bloklar burada tek kez yazılır ve iki
 * ekran dosyası yalnız onları farklı düzenlerde sıralar.
 */

export function StepShell({ id, step, title, hint, compact, muted, children }: { id?: string; step: string; title: string; hint?: string; compact?: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <section
      id={id}
      // Tasarım künyesi: `bg #fff · 1px kum-200 kenar · radius 18 · ped 22/26 · gap 14`.
      className={[
        'flex flex-col gap-3.5 rounded-card border bg-card',
        muted ? 'border-sand-100' : 'border-sand-200',
        compact ? 'px-4 py-4' : 'px-6.5 py-5.5',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* Tasarım: 30×30 daire, 700 15px. Küçüğü (28/13) başlığın yanında cılız kalıyordu. */}
        <span
          className={[
            'flex size-[30px] flex-none items-center justify-center rounded-full font-sans text-body font-bold',
            muted ? 'bg-sand-200 text-muted' : 'bg-olive text-white',
          ].join(' ')}
        >
          {step}
        </span>
        {/* Tasarım: 600 19px Lora — `card-title-sm` (18) en yakın durak, yeni token açılmadı. */}
        <span className={['font-serif text-card-title-sm', muted ? 'text-muted' : 'text-ink'].join(' ')}>{title}</span>
        {/* Künye: adımın MALİYETİNİ önden söyler ("giriş · güvenlik · 30 saniye"). Ne kadar
            süreceğini bilmediği bir adıma giren müşteri, o adımı bir engel gibi okur. */}
        {hint && !compact && <span className="ml-auto font-sans text-micro text-muted">{hint}</span>}
      </div>
      {hint && compact && <span className="-mt-2 font-sans text-micro text-muted">{hint}</span>}
      {children}
    </section>
  );
}

/**
 * Henüz sırası gelmemiş adım — BAŞLIĞIYLA çizilir, içeriğiyle değil.
 *
 * Tasarımın "tek sayfada dikey bölümler, akordeon daraltma yok — az adım, tam görünürlük" kuralı
 * bunu gerektiriyor: müşteri daha ilk adımdayken kaç adım kaldığını görmeli. Bu adımları hiç
 * çizmemek, doğrulama ekranını bir GİRİŞ DUVARI gibi gösterirdi — tasarımın tam kaçındığı şey.
 */
export function LockedStep({ step, title, hint, compact }: { step: string; title: string; hint: string; compact?: boolean }) {
  return (
    <StepShell step={step} title={title} compact={compact} muted>
      <span className="font-sans text-note text-muted">{hint}</span>
    </StepShell>
  );
}

/**
 * Adres adımının çıpası — kısıt bloğunun "bölge içi bir adres seç" çıkışı buraya götürür.
 * Müşteri sepete geri GÖNDERİLMEZ, çözüm checkout içinde biter (tasarım).
 */
const ADDRESS_STEP_ID = 'checkout-address-step';

/** Seçilebilir kart — adres, gün ve ödeme yöntemi aynı görsel dili konuşur (tasarım). */
function ChoiceCard({
  selected,
  onClick,
  disabled,
  center,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Gün kartları ORTALANMIŞ (tasarım: `padding 12px 20px`, içerik merkezde); adres/ödeme sola. */
  center?: boolean;
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
        'flex cursor-pointer flex-col gap-[3px] rounded-soft px-[18px] py-3.5 text-left transition-colors',
        'disabled:cursor-not-allowed disabled:border-sand-200 disabled:bg-sand-25 disabled:opacity-60',
        selected ? 'border-2 border-olive bg-olive-bg' : 'border-[1.5px] border-sand-400 bg-card hover:border-olive',
        center ? 'items-center text-center' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * Girişli müşteride kimlik satırı — adım DEĞİL, ince bir künye.
 *
 * Doğrulanmış müşteriden ikinci kez doğrulama istemek sürtünmedir; ama siparişin KİME bağlandığı
 * da görünmeli. Paylaşılan bir cihazda (aile bilgisayarı) bir öncekinin oturumu açık kalmış
 * olabilir ve sipariş sessizce ona yazılır. Tek satır, tek çıkış (desen: referans projedeki
 * "Connecté en tant que X · Pas vous ?").
 */
export function AccountLine({ t, email, compact }: { t: CheckoutViewProps['t']; email: string; compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!email) return null;

  /**
   * "Siz değil misiniz?" GERÇEKTEN çıkış yapar. Önceden yalnız giriş sayfasına bağlanıyordu ve
   * oturum ayakta kalıyordu — paylaşılan cihazda ikinci kişi birincinin hesabıyla sipariş
   * verebilirdi (referans projedeki `logoutCheckout` aynı senaryo için var).
   *
   * Tam yenileme: oturum sunucuda çözülüyor ve ona göre kurulmuş her şey (sepet, adresler, seçili
   * adım) sıfırdan kurulmalı.
   */
  const signOut = async () => {
    setBusy(true);
    await signOutAction();
    window.location.reload();
  };

  return (
    <div className={['flex flex-wrap items-center gap-x-3 gap-y-1 rounded-soft bg-olive-bg px-4', compact ? 'py-2' : 'py-2.5'].join(' ')}>
      <span className="font-sans text-note text-olive-dark">
        ✓ {t.verify.accountAs.replace('{email}', email)}
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

export function AddressStep({ t, locale, snapshot, state, compact, onSelectAddress, onAddAddress }: CheckoutViewProps) {
  const [adding, setAdding] = useState(false);

  return (
    <StepShell id={ADDRESS_STEP_ID} step={t.address.step} title={t.address.title} compact={compact}>
      {snapshot.addresses.length === 0 && !adding && (
        <p className="font-sans text-note leading-relaxed text-body">{t.address.empty}</p>
      )}

      <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2.5'}>
        {snapshot.addresses.map((address) => (
          <ChoiceCard key={address.id} selected={state.addressId === address.id} onClick={() => onSelectAddress(address.id)}>
            <span className="font-sans text-body-sm font-bold text-ink">
              {address.label ?? address.city}
              {address.isDefault && <span className="font-semibold text-muted"> · {t.address.default}</span>}
            </span>
            <span className="font-sans text-note leading-relaxed text-body">{address.line1}</span>
            <span className="font-sans text-note leading-relaxed text-body">
              {address.postalCode} {address.city}
            </span>
          </ChoiceCard>
        ))}
      </div>

      {adding ? (
        <AddressForm t={t} locale={locale} onCancel={() => setAdding(false)} onSave={async (input) => { await onAddAddress(input); setAdding(false); }} />
      ) : (
        // Tasarımda KESİKLİ ÇERÇEVELİ KART — adres kartlarının yanında onlarla aynı ızgarada durur.
        // Metin bağlantısı yapmak onu ızgaradan çıkarıyor ve "yeni adres" bir kart eklemek değil de
        // sayfadan ayrılmak gibi okunuyordu.
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="grid w-max cursor-pointer place-items-center rounded-soft border-[1.5px] border-dashed border-sand-500 px-[18px] py-3.5 font-sans text-body-sm font-bold text-olive transition-colors hover:border-olive hover:bg-olive-bg"
        >
          {t.address.add}
        </button>
      )}
    </StepShell>
  );
}

/**
 * **K35 · Adres Formu** — K34 alanlarının bileşimi, yeni bir bileşen değil.
 *
 * Alan sırası envanterde SABİT: başlık · alıcı adı · sokak ve numara · kapı/kat/zil (isteğe bağlı) ·
 * posta kodu + şehir · telefon · ülke (sabit) · varsayılan yap.
 *
 * **Alanlar İKİŞER durur**, hepsi tam genişlik değil (tasarım): başlık | alıcı adı · posta kodu (dar) |
 * şehir · telefon | ülke (dar). Kısa değerleri tam genişliğe yaymak göze her satırda uzun bir tarama
 * yaptırıyor ve formu olduğundan uzun gösteriyordu.
 *
 * **Zorunluluk yıldızla değil, isteğe bağlı olan işaretlenerek** anlatılır (K34) — ve tasarımda
 * "(isteğe bağlı)" YALNIZ kapı/kat/zil satırındadır. Telefon zorunludur çünkü kapıya teslimde kurye
 * onu arar; adres başlığı da zorunludur, listedeki kartın adı odur.
 */
function AddressForm({ t, locale, onSave, onCancel }: { t: CheckoutViewProps['t']; locale: Locale; onSave: (i: NewAddressInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<NewAddressInput>({ line1: '', postalCode: '', city: '' });
  const [busy, setBusy] = useState(false);
  const [postalError, setPostalError] = useState<string | null>(null);
  const { place, setPostalCode } = useDeliveryPlace();

  const filled = (key: keyof NewAddressInput) => Boolean((form[key] as string | undefined)?.trim());
  const complete = filled('label') && filled('recipient') && filled('line1') && filled('postalCode') && filled('city') && filled('phone');

  /**
   * `autoComplete` ŞART ve alanın kendi jetonuyla: tarayıcı kayıtlı adresi ancak alanın ne olduğunu
   * anlarsa önerir. Jeton yoksa öneri hiç çıkmaz ve müşteri adresini elle yazar — bir adres
   * formunda en pahalı sürtünme budur. `name` de veriliyor; bazı tarayıcılar sezgilerini ondan kurar.
   */
  const META: Record<string, { autoComplete: string; name: string }> = {
    label: { autoComplete: 'off', name: 'address-label' },
    recipient: { autoComplete: 'name', name: 'recipient' },
    line1: { autoComplete: 'address-line1', name: 'address-line1' },
    line2: { autoComplete: 'address-line2', name: 'address-line2' },
    postalCode: { autoComplete: 'postal-code', name: 'postal-code' },
    city: { autoComplete: 'address-level2', name: 'city' },
    phone: { autoComplete: 'tel', name: 'phone' },
  };

  const field = (key: keyof NewAddressInput, label: string, optional = false) => (
    <FormInputField
      label={label}
      optional={optional}
      optionalLabel={t.address.form.optional}
      value={(form[key] as string) ?? ''}
      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      autoComplete={META[key]?.autoComplete}
      name={META[key]?.name}
    />
  );

  /**
   * Posta kodu ALAN TERK EDİLİNCE doğrulanır ve teslimat cevabı orada verilir (K34: "doğrulama alan
   * terk edilince çalışır, kaydete basınca değil"; K35: "posta kodu yazıldığı an teslimat cevabı
   * verir"). Müşteri formun sonuna kadar yazıp da adresin gönderilebilir olmadığını en sonda
   * öğrenmemeli.
   *
   * Çözümü sitenin ORTAK yer bağlamı yapar (`setPostalCode`) — burada ikinci bir çözüm yazılsaydı
   * başlıktaki yer hapı ile formun cevabı ayrışabilirdi. Yan etkisi de istediğimiz şey: kod bölge
   * dışıysa aşağıdaki K32 kısıt bloğu kendiliğinden açılır.
   */
  const checkPostal = async (raw: string) => {
    const value = raw.trim();
    if (!value) return setPostalError(null);
    const failure = await setPostalCode(value);
    setPostalError(failure ? t.address.form.postalHint : null);
  };

  const answer = !postalError && place && place.postalCode === form.postalCode.trim() ? place : null;

  return (
    /* Tasarım künyesi: beyaz kart · 1px kum-200 kenar · radius 18 · ped 20/22 · gap 14.
       Satır içi açılır, ayrı sayfa yoktur (envanter). */
    <div className="flex w-full flex-col gap-3.5 rounded-card border border-sand-200 bg-card px-5.5 py-5">
      <div className="flex gap-3">
        <div className="flex-1">{field('label', t.address.form.label)}</div>
        <div className="flex-1">{field('recipient', t.address.form.recipient)}</div>
      </div>
      {field('line1', t.address.form.line1)}
      {field('line2', t.address.form.line2, true)}

      <div className="flex gap-3">
        {/* Posta kodu DAR (150px): beş hane, tam genişlikte kutu değerinden büyük görünüyor. */}
        <div className="w-[150px] flex-none">
          <FormInputField
            label={t.address.form.postalCode}
            value={form.postalCode}
            onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
            onBlur={(e) => void checkPostal(e.target.value)}
            error={postalError ?? undefined}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            name="postal-code"
          />
        </div>
        <div className="flex-1">{field('city', t.address.form.city)}</div>
      </div>

      {/* Teslimat cevabı. Bölge dışı bir HATA DEĞİLDİR (tasarım): nötr krem satır kullanılır,
          kırmızı yalnız biçim hatasına ayrılmıştır. */}
      {answer && (
        <div
          className={[
            'rounded-[12px] px-3.5 py-2.5 font-sans text-note leading-relaxed font-semibold',
            answer.inRoute ? 'border border-olive-line bg-olive-bg text-olive-dark' : 'bg-sand-100 text-body',
          ].join(' ')}
        >
          {answer.inRoute
            ? answer.nextDate
              ? t.address.form.placeInRoute.replace('{date}', formatDeliveryDate(answer.nextDate, locale))
              : t.address.form.placeInRouteNoDate
            : t.address.form.placeShipping}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">{field('phone', t.address.form.phone)}</div>
        {/* Ülke SALT OKUNUR (K34'ün beşinci hâli): bugün yalnız Fransa'ya teslim ediyoruz,
            seçim sunmak müşteriye olmayan bir olasılık göstermek olurdu. */}
        <div className="w-[170px] flex-none">
          <FormInputField label={t.address.form.country} value={t.address.form.countryValue} readOnly name="country" autoComplete="country-name" />
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.makeDefault ?? false}
          onChange={(e) => setForm((prev) => ({ ...prev, makeDefault: e.target.checked }))}
          className="size-[22px] flex-none cursor-pointer rounded-[6px] accent-olive"
        />
        <span className="font-sans text-body-sm text-ink">{t.address.form.makeDefault}</span>
      </label>

      {/* Tasarımda eylem satırı İNCE BİR AYRAÇLA ayrılır: formun sonu ile kararın başladığı yer. */}
      <div className="flex items-center gap-2.5 border-t border-sand-100 pt-3.5">
        <Button
          disabled={!complete || busy}
          onClick={async () => {
            setBusy(true);
            await onSave({
              ...form,
              label: form.label?.trim() || undefined,
              recipient: form.recipient?.trim() || undefined,
              line2: form.line2?.trim() || undefined,
              phone: form.phone?.trim() || undefined,
            });
            setBusy(false);
          }}
        >
          {t.address.form.save}
        </Button>
        {/* Vazgeç ÇERÇEVELİ (K2), hayalet metin değil: kaydetin yanında duran ikinci bir karar,
            metne kaçmış bir bağlantı değil. */}
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t.address.form.cancel}
        </Button>
      </div>
    </div>
  );
}

export function DeliveryStep(props: CheckoutViewProps) {
  const { t, locale, snapshot, state, compact, onSelectDate, cart, selectedAddress } = props;
  const delivery = snapshot.delivery;
  const payment = snapshot.payment;
  if (!delivery) return null;

  const inRoute = delivery.deliveryType === 'route';

  /**
   * Kısıt bloğunun bakacağı yer: SEÇİLİ ADRES. Blok eskiden sitenin ortak cevabına (başlıktaki
   * hap) bakıyordu ve checkout'ta neredeyse hiç doğmuyordu — müşteri sepette "şimdi değil" deyip
   * kod vermemişse hap boştu, blok da yoktu. Geriye yalnız soluk bir cümle kalıyor, hangi kalemin
   * gelemeyeceği hiçbir yerde yazmıyordu (29.07 kullanıcı geri bildirimi).
   *
   * Bölge adı ve gün TAŞINMAZ: blok ikisini de kullanmıyor, tek sorduğu "rota içinde mi".
   */
  const addressPlace = selectedAddress
    ? { postalCode: selectedAddress.postalCode, zoneName: null, inRoute, nextDate: null }
    : null;
  const restricted = restrictedLines(addressPlace, cart.lines);
  // Eşik sepet okumasından gelir; ekran ayar okumaz (tek kaynak).
  const freeThresholdCents = cart.freeShippingCents;

  return (
    <StepShell step={t.delivery.step} title={t.delivery.title} compact={compact}>
      {/* Teslimat TÜRÜ önce söylenir: gün seçeneği ancak "kim getiriyor" bilindikten sonra anlam
          kazanıyor. Kargo bir HATA gibi yazılmaz — o da bizim teslimat yolumuz. */}
      {/* Tasarımda teslimat türü bir ROZET (zeytin metin, zeytin-zemin, radius 12, ped 3/10),
          açıklaması onun altında DÜZ metin. Renkli bir kutu içine almak bilgiyi uyarı gibi
          gösteriyordu — oysa burada bir sorun yok, bir künye var. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-max rounded-[12px] bg-olive-bg px-2.5 py-[3px] font-sans text-note font-semibold text-olive">
            {inRoute ? t.delivery.route : `📦 ${t.delivery.shipping}`}
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

      {/* Teslimat kısıtı — sepettekiyle AYNI bileşen (tasarım): aynı sıra, aynı dil, aynı üç çıkış.
          Müşteri sepete geri GÖNDERİLMEZ, çözüm burada biter. Adım kilitlenmez, sadece bekler.
          Sepette çözülmüşse blok hiç doğmaz; yalnız müşteri burada adresi değiştirirse görünür. */}
      <PlaceRestriction
        locale={locale}
        lines={cart.lines}
        minBasketCents={cart.minBasketCents}
        freeShippingCents={cart.freeShippingCents}
        compact={compact}
        place={addressPlace}
        // Checkout'ta yer bir KODLA değil adresle değişir: çıkış adres adımına götürür.
        onChangePlace={() => document.getElementById(ADDRESS_STEP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      />
      {/* Sunucu "gönderilemez" diyor ama blok çizilmediyse (ör. kalem aynı zamanda tükendiği için
          bloğun kapsamı dışında) müşteri sebepsiz kalmasın — cümle YEDEK olarak durur. */}
      {delivery.blocked && restricted.length === 0 && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.delivery.blocked}</p>
      )}

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
            📅 {t.delivery.single.replace('{date}', formatDeliveryDate(delivery.availableDates[0] ?? '', locale))}
          </span>
        )
      )}
      {!inRoute && <span className="font-sans text-note font-semibold text-body">📦 {t.delivery.shippingDays}</span>}
    </StepShell>
  );
}

export function PaymentStep({ t, snapshot, state, compact, onSelectPayment, onToggleConsent, paymentSlot }: CheckoutViewProps) {
  const payment = snapshot.payment;
  if (!payment) return null;

  const options: { method: PaymentMethod; onAccount: boolean; title: string; body: string; blocked: string | null }[] = [
    // `online` = Stripe yolu (peşin, sayfa içinde). `card`/`cheque` KAPIDA kullanılan araçlardır;
    // müşteri burada "kapıda öderim" der, hangi aracı kullandığını kurye kapanışta yazar (11.x).
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

/** Sağdaki (mobilde alttaki) özet — kalemler, indirim, kargo, toplam ve onay düğmesi. */
export function OrderSummary(props: CheckoutViewProps) {
  const { t, locale, cart, cartReady, cartFailed, snapshot, state, compact, busy, error, onConfirm, selectedAddress } = props;
  const payment = snapshot.payment;
  const delivery = snapshot.delivery;

  const shippingLabel =
    payment && payment.shippingFeeCents > 0 ? formatPrice(payment.shippingFeeCents, locale) : t.summary.free;
  const totalCents = payment?.orderTotalCents ?? cart.totalCents;
  const discountCents = cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? cart.discount.amountCents : 0;

  // Onay düğmesi kart ödemesinde ÇİZİLMEZ: orada onayı Stripe formunun kendi düğmesi veriyor
  // (önce kartı valide etmesi gerekiyor). İki düğme müşteriye hangisinin bitirdiğini sordururdu.
  const showConfirm = state.paymentMethod !== null && state.paymentMethod !== 'online';
  // Sepet OKUNAMADIYSA sipariş verilemez: ekrandaki 0,00 € bir toplam değil, cevapsızlıktır.
  const blocked = cartFailed || delivery?.blocked || !payment?.minBasketOk || !state.addressId || cart.hasBlocked;

  return (
    // Tasarım künyesi: `radius 18 · ped 22/24 · gap 12` — adım kartlarıyla aynı aile, bir tık dar.
    <section className={['flex flex-col gap-3 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-6 py-5.5'].join(' ')}>
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.summary.title}</span>

      {/* Kalemler ÖZETİN İÇİNDE, tasarımdaki gibi: `ad × adet ——— tutar`, sonra indirim, teslimat
          ve genel toplam; hepsi TEK sütunda, aynı ölçüde (400 14px). Sol sütunda ayrı bir
          "Sepetiniz" kartı vardı (referans projeden gelen bir ekleme) — tasarımda öyle bir kart
          yok ve olması aynı listeyi iki yerde tutmak demekti. Checkout'un sorusu "ne aldım" değil,
          "ne ödüyorum"; ad satırı o toplamın dökümüdür, ikinci bir sepet ekranı değil.

          Ara toplam satırı DÜŞTÜ: kalemler zaten tek tek yazılıyorken onların toplamını bir kez
          daha yazmak, altındaki genel toplamla karıştırılan üçüncü bir sayı üretiyordu. */}
      <div className="flex flex-col gap-1.5">
        {/* Sepet istemcide okunuyor: ilk karede kalem satırları yok. Boş bırakmak "özetiniz yok"
            gibi okunuyordu; iskelet üç satırlık yerini tutar ve tutarlar gelince sayfa zıplamaz. */}
        {!cartReady &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        {cartReady &&
          cart.lines.map((line) => (
            <Row
              key={cartKey(line)}
              // Paket satırı adetle değil KÜNYESİYLE anılır (tasarım: "Bayram Sofrası (paket)"):
              // paketin adedi tek, satılan şey bütünün kendisi.
              label={line.kind === 'bundle' ? `${line.name} ${t.summary.packageSuffix}` : `${line.name} × ${line.qty}`}
              value={line.lineTotalCents === null ? '—' : formatPrice(line.lineTotalCents, locale)}
              tone="ink"
            />
          ))}
        {discountCents > 0 && (
          // Etiket sepetle AYNI yardımcıdan: müşteri iki ekranda aynı indirimi iki türlü okumamalı.
          <Row label={discountLabel(cart.discount, t.summary, locale)} value={`−${formatPrice(discountCents, locale)}`} tone="olive" />
        )}
        <Row label={t.summary.delivery} value={shippingLabel} tone={payment?.shippingFeeCents ? 'ink' : 'olive'} />
        {/* Toplam satırı tasarımda **Karla 700/18** — serif DEĞİL. Serif yapmak onu bir başlığa
            çeviriyor; oysa bu bir sayı satırı ve üstündeki satırlarla aynı ailede okunmalı. */}
        <div className="flex items-baseline justify-between gap-3 border-t border-sand-200 pt-2.5">
          <span className="font-sans text-card-title-sm font-bold text-ink">{t.summary.total}</span>
          <span className="font-sans text-card-title-sm font-bold text-ink">{formatPrice(totalCents, locale)}</span>
        </div>
        <span className="font-sans text-micro text-muted">{t.summary.vatIncluded}</span>
      </div>

      {/* Sepet okunamadı: kalemsiz bir özet ve 0,00 € toplam çizilmişken sessiz kalmak, müşteriye
          sepetini kaybettiğini düşündürüyordu. Boş sepet bir DURUM, ulaşılamayan sepet bir ARIZA. */}
      {cartFailed && <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.summary.cartUnreachable}</p>}

      {/* Sipariş bu hâliyle verilemiyor (gönderilemeyen kalem var): toplam da nihai değil. Tek
          satır, kalem ADI YOK — hangi kalem olduğunu adım 2'deki blok söyler, özet dar bir yer ve
          orada ikinci bir liste tutmak (kullanıcı geri bildirimi) doğru yöntem değil. */}
      {snapshot.delivery?.blocked && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.summary.blockedTotal}</p>
      )}

      {payment && !payment.minBasketOk && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">
          {t.summary.minBasket
            .replace('{min}', formatPrice(payment.orderTotalCents + payment.missingForMinBasketCents, locale))
            .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale))}
        </p>
      )}

      {error && <p className="font-sans text-note leading-relaxed font-semibold text-terracotta">{error}</p>}

      {showConfirm && (
        <Button size="md" fullWidth disabled={busy || blocked} onClick={onConfirm}>
          {t.summary.submit}
        </Button>
      )}

      <span className="font-sans text-micro leading-relaxed text-muted">{t.summary.terms}</span>

      {/* Soğuk zincir güvencesi: kapıya teslimde ve gün belliyken. Kargoda söylenmez — o zincire
          biz kefil olamayız, zaten soğuk zincir kalemi kargoya hiç girmiyor. */}
      {delivery?.deliveryType === 'route' && state.deliveryDate && selectedAddress && (
        // Tasarımda KUM zemin (kum-100), zeytin değil: bu bir güvence cümlesi, olumlu bir DURUM
        // bildirimi değil. Yeşil kutu onu "her şey yolunda" rozetine çeviriyor ve özetteki asıl
        // yeşil öğeyle (ücretsiz teslimat satırı) yarışıyordu.
        <p className="rounded-soft bg-sand-100 px-4 py-3 font-sans text-note leading-loose text-body">
          {t.summary.coldChain.replace('{date}', formatDeliveryDate(state.deliveryDate, locale))}
        </p>
      )}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'olive' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-sans text-body-sm text-body">{label}</span>
      <span className={['font-sans text-body-sm font-semibold', tone === 'olive' ? 'text-olive-dark' : 'text-ink'].join(' ')}>{value}</span>
    </div>
  );
}
