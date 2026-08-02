'use client';

import { useState } from 'react';
import type { PaymentMethod } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { SummaryRow } from '@/components/customer/ui/summary-row';
import { PlaceRestriction, restrictedLines } from '@/components/customer/delivery/place-restriction';
import { signOutAction } from '@/lib/auth/actions';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { AddressForm, toFormInput } from '@/components/customer/delivery/address-form';
import { cartKey } from '@/lib/cart/cart-types';
import { discountLabel } from '@/lib/cart/discount-label';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import type { CheckoutViewProps } from '../checkout-types';

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

/**
 * Adres adımı — seçim + ekleme + **düzenleme**.
 *
 * Düzenleme bir süre YOKTU ve bu bir çıkmazdı (kullanıcı bildirimi, 01.08): kaydedilen adres bir
 * daha açılamıyordu, yazım hatası yapan müşterinin tek yolu ikinci bir adres eklemekti — kurye için
 * iki benzer kayıt, müşteri için "hangisi doğruydu". Hesap sayfasında düzenleme zaten vardı; eksik
 * olan checkout'un kendi kapısı ve bu ekrandı.
 *
 * **Düzenle bağlantısı SEÇİLİ adresin altında, her kartın içinde değil.** İki sebep: (a) kart bir
 * `<button>`, içine ikinci bir düğme konamaz (geçersiz HTML, klavye erişimi de bozulur); (b) burada
 * önemli olan siparişin GİDECEĞİ adres — düzeltilmeye değer olan o. Başka bir adresi düzeltmek
 * isteyen önce onu seçer, ki seçim zaten bu siparişe özel ve zararsız.
 *
 * Tasarımda karşılığı yok (`design/BACKLOG §3`): çizim adresi yalnız seçtiriyor.
 */
export function AddressStep({ t, locale, snapshot, state, compact, selectedAddress, onSelectAddress, onAddAddress, onUpdateAddress }: CheckoutViewProps) {
  /** Tek seferde tek form: ekleme ile düzenleme aynı yerde açılır, ikisi birden açık kalamaz. */
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const adding = editing === 'new';
  // Form kimliğin KENDİSİNDEN doldurulur, "seçili olan"dan değil: bugün ikisi hep aynı (düzenleme
  // yolu yalnız seçili adreste açılıyor) ama o bir yerleşim tercihi — yarın kartların içine bir
  // düzenle düğmesi konursa bu satırın sessizce yanlış adresi açması gerekmemeli.
  const editTarget = adding ? null : (snapshot.addresses.find((a) => a.id === editing) ?? null);

  return (
    <StepShell id={ADDRESS_STEP_ID} step={t.address.step} title={t.address.title} compact={compact}>
      {snapshot.addresses.length === 0 && !adding && (
        <p className="font-sans text-note leading-relaxed text-body">{t.address.empty}</p>
      )}

      {/* Düzenleme açıkken kart ızgarası GİZLENİR: aynı adres hem kart hem form olarak dururken
          hangisinin güncel olduğu belirsiz kalıyor ve adım gereksiz uzuyor. Eklemede ızgara kalır —
          orada form yeni bir kayıt, mevcutları örtmesi için bir sebep yok. */}
      {editTarget ? (
        <AddressForm
          copy={t.address.form}
          locale={locale}
          initial={toFormInput(editTarget)}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await onUpdateAddress(editTarget.id, input);
            setEditing(null);
          }}
        />
      ) : (
        <>
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
            <AddressForm copy={t.address.form} locale={locale} onCancel={() => setEditing(null)} onSave={async (input) => { await onAddAddress(input); setEditing(null); }} />
          ) : (
            <>
              {selectedAddress && (
                <button
                  type="button"
                  onClick={() => setEditing(selectedAddress.id)}
                  className="w-max cursor-pointer font-sans text-note font-semibold text-olive underline hover:text-olive-dark"
                >
                  {t.address.edit}
                </button>
              )}
              {/* Tasarımda KESİKLİ ÇERÇEVELİ KART — adres kartlarının yanında onlarla aynı ızgarada
                  durur. Metin bağlantısı yapmak onu ızgaradan çıkarıyor ve "yeni adres" bir kart
                  eklemek değil de sayfadan ayrılmak gibi okunuyordu. */}
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="grid w-max cursor-pointer place-items-center rounded-soft border-[1.5px] border-dashed border-sand-500 px-[18px] py-3.5 font-sans text-body-sm font-bold text-olive transition-colors hover:border-olive hover:bg-olive-bg"
              >
                {t.address.add}
              </button>
            </>
          )}
        </>
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
    ? {
        postalCode: selectedAddress.postalCode,
        // Ülke adresin KENDİSİNDEN gelir, posta kodundan türetilmez: burada zaten cevap verilmiş
        // bir soru var (19.8 türetmesi kod tek başına girildiğinde gerekir).
        country: selectedAddress.country,
        // Yer adı, yerleşim listesi ve bölge adı TAŞINMAZ: blok üçünü de kullanmıyor, tek sorduğu
        // "rota içinde mi".
        placeName: null,
        places: [],
        zoneName: null,
        inRoute,
        nextDate: null,
      }
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
    // `snug` tam olarak bu: paylaşılan kartın yaygın pedi 22/26, özet kartı tasarımda 22/24 (M2).
    <Card compact={compact} pad="snug">
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
            <SummaryRow
              key={cartKey(line)}
              // Paket satırı adetle değil KÜNYESİYLE anılır (tasarım: "Bayram Sofrası (paket)"):
              // paketin adedi tek, satılan şey bütünün kendisi.
              label={line.kind === 'bundle' ? `${line.name} ${t.summary.packageSuffix}` : `${line.name} × ${line.qty}`}
              value={line.lineTotalCents === null ? '—' : formatPrice(line.lineTotalCents, locale)}
            />
          ))}
        {discountCents > 0 && (
          // Etiket sepetle AYNI yardımcıdan: müşteri iki ekranda aynı indirimi iki türlü okumamalı.
          <SummaryRow label={discountLabel(cart.discount, t.summary, locale)} value={`−${formatPrice(discountCents, locale)}`} tone="olive" />
        )}
        {/* Ücretsizde YALNIZ tutar yeşil (tasarım): ücret bir maliyet, ücretsizlik bir kazanç. */}
        <SummaryRow label={t.summary.delivery} value={shippingLabel} tone={payment?.shippingFeeCents ? 'default' : 'oliveValue'} />
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
    </Card>
  );
}
