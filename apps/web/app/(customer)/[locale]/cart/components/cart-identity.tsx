'use client';

import { useState } from 'react';
import { isValidEmail } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { Link, useRouter } from '@/i18n/navigation';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { cardClass } from '@/components/customer/ui/card';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { RadioMark } from '@/components/customer/form/radio-mark';
import { OtpCodeInput, type OtpResendResult, type OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { GoogleIcon } from '@/components/customer/auth/provider-icons';
import { useAccount } from '@/components/customer/account/account-context';
import { initialsOf } from '@/components/customer/account/account-entry';
import accountMessages from '@/components/customer/account/account-messages.json';
import { useCart } from '@/components/customer/cart/cart-context';
import { AddressPickerDialog } from '@/components/customer/delivery/address-picker';
import { DeliveryStrip } from '@/components/customer/delivery/delivery-strip';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { useMyAddresses } from '@/components/customer/delivery/use-my-addresses.hook';
import addressMessages from '@/components/customer/delivery/address-messages.json';
import placeMessages from '@/components/customer/delivery/place-messages.json';
import { createClient } from '@/lib/supabase/client';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp, verifyEmailOtp } from '@/lib/auth/otp-actions';
import { errorText } from '@/lib/customer-error-text';
import type { DeliveryPlace, PlaceAddress } from '@/lib/delivery/place-types';
import type { CustomerIdentity } from '@/lib/guard';
import { formatDeliveryDate } from '@/lib/storefront/format';
import type { Messages } from '../cart-types';

/**
 * **Sepetin kimlik ve adres bloğu** — özet panelinin üstünde (kullanıcı kararı 13.09).
 *
 * Ödeme ekranına geçmeden önce iki şey belli olmalı: KİM ve NEREYE. İkisi de burada sorulur;
 * ödeme ekranı yalnız gösterir (`AddressStep` salt okunur). Ölçülen pratik de bu: Picard'da
 * sepetteki "Commander" giriş sayfasına götürüyor, REWE hesapsız sipariş almıyor.
 *
 * ── İKİ HÂL, TEK YER ────────────────────────────────────────────────────────
 * · Girişsiz → kompakt giriş bloğu. Adres alanı HİÇ görünmez (kullanıcı kararı): kimliği olmayan
 *   müşteriye adres sormak, cevabı kaydedemeyeceğimiz bir soru sormaktır.
 * · Girişli, MASAÜSTÜ → v1'in birebir aynısı (14.09, kullanıcının görüntü çifti): kimlik kartı
 *   (baş harfli yuvarlak · ad · e-posta · "Hesabım") ve adres kartı — kayıtlı adresler seçim kartı
 *   olarak (seçmek = varsayılan yapmak), "+ Yeni adres", altta teslim şeridi. Düzenleme ve silme
 *   hesap sayfasında; v1 sepette "Değiştir · Düzenle" çizmiyor.
 * · Girişli, MOBİL WEB → native sepetin teslimat adresi KÜNYESİ (08.58, 14.09): kutu değil, sepetin başında
 *   duran bir durum bildirimi — terracotta üstbaşlık · tek satır adres · not · "Değiştir" (adres penceresi, ekran
 *   terk edilmez); adres yoksa aynı yerde "+ Adres ekle". Metin ortak sepet sözlüğünden (`@lezzet/i18n/customer/cart`).
 *   Misafirin giriş bloğu telefonda native sepetin grup kutusunun kabuğunda (kum zemin, kum çerçeve): native'de sepet
 *   girişsiz açılmıyor, bloğun karşılığı yok.
 *
 * ── GİRİŞ BLOĞU ÖDEME EKRANININ ESKİ BLOĞU DEĞİL ────────────────────────────
 * Oradaki "adım 0" kartı 480 px'lik ortalanmış bir sütundu ve kullanıcı sepet için onu kaba buldu.
 * Burası özet kartının kendi dilinde: aynı kart kabuğu (`cardClass snug`), aynı başlık kademesi,
 * giriş sayfasının sırası (Google · ayraç · e-posta · gönder). Yeni bir görsel dil yok.
 *
 * **Giriş sonrası sayfa TAZELENİR, yönlendirilmez:** oturum çereze düşer, `router.refresh()` layout'u
 * yeniden çizer (hesap künyesi ve yer bağlamı iner), sepet yeniden okunur (`reload` — misafir
 * sepeti sunucuya devralınır, `readCartAction` künyesi). Müşteri sepetinden ayrılmaz.
 */
interface CartIdentityProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartIdentity({ t, locale, compact = false }: CartIdentityProps) {
  const account = useAccount();
  if (!account) return <CartLogin t={t} locale={locale} compact={compact} />;
  return compact ? <CartAddress t={t} locale={locale} /> : <CartAccountDesktop t={t} locale={locale} account={account} />;
}

function CartLogin({ t, locale, compact }: Required<CartIdentityProps>) {
  const c = t.identity;
  const router = useRouter();
  const { reload } = useCart();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const validEmail = isValidEmail(trimmed);

  /** Anahtar → cümle. `authErrorMessage` saf tablo; çeviri ekranda yapılıyor (denetim S1). */
  const say = (key: AuthErrorKey | null): string => (key ? authErrorMessage(key, locale) : c.googleUnavailable);

  const google = async () => {
    setError(null);
    const supabase = createClient();
    const next = `${window.location.pathname}${window.location.search}`;
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dönüşte müşteri SEPETE döner, giriş sayfasına savrulmaz.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Paylaşılan cihazda hesap SEÇTİRİLİR: bir öncekinin oturumu sessizce devralınmasın.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (failure) setError(c.googleUnavailable);
  };

  const send = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError(null);
    const { data, errorKey } = await sendEmailOtp(trimmed);
    setBusy(false);
    if (!data) return setError(say(errorKey));
    setSent(true);
  };

  /** Yönlendirme adresi KULLANILMAZ: müşteri sepette kalır, sayfa tazelenince blok adrese döner. */
  const verify = async (code: string): Promise<OtpVerifyResult> => {
    const { data, errorKey } = await verifyEmailOtp(trimmed, code);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const resend = async (): Promise<OtpResendResult> => {
    const { data, errorKey } = await sendEmailOtp(trimmed);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const verified = () => {
    // Sıra önemli: önce sepet (misafir listesi sunucuya devralınır), sonra sunucu kareleri.
    reload();
    router.refresh();
  };

  // Masaüstünde DİKKAT TONU (kullanıcı isteği 14.09): ödemeye geçmenin ilk şartı bu kart, eksik adım
  // sepetin geri kalanından ayrışsın. Telefonda native sepetin grup kutusunun kabuğu (dosya künyesi).
  return (
    <div
      className={
        compact
          ? 'flex flex-col gap-2.5 rounded-card border-[1.5px] border-sand-300 bg-sand-100 p-4'
          : cardClass({ pad: 'snug', gap: 'md', tone: 'attention' })
      }
    >
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{c.loginTitle}</span>
      <p className="font-sans text-note leading-relaxed text-body">{c.loginBody}</p>

      {sent ? (
        // Kod gönderildi → odaklı görünüm: seçim kalkar, tek iş var. Kutu GİRİŞ SAYFASININ bileşeni.
        <div className="flex flex-col gap-3">
          <OtpCodeInput email={trimmed} locale={locale} onVerify={verify} onResend={resend} onSuccess={verified} />
          {/* Kilitlenmez: yanlış adres yazan ya da Google'a geçmek isteyen geri döner. */}
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            {c.otherMethod}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="secondary" compact={compact} fullWidth onClick={() => void google()}>
            <GoogleIcon /> {c.google}
          </Button>

          <div className="flex items-center gap-3 font-sans text-note text-sand-600">
            <span className="h-px flex-1 bg-sand-300" />
            {c.or}
            <span className="h-px flex-1 bg-sand-300" />
          </div>

          <div className="flex flex-col gap-2.5">
            <FormInputField
              label={c.email}
              hideLabel
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder={c.email}
            />
            <Button compact={compact} fullWidth disabled={!validEmail || busy} onClick={() => void send()}>
              {busy ? c.sending : c.send}
            </Button>
          </div>
        </div>
      )}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
    </div>
  );
}

/**
 * Telefon görünümü — native sepetin teslimat adresi künyesi (`cart-screen.tsx` `place`, dosya künyesi). Künye sepetin
 * NEYE göre değerlendirildiğini söyler; adresi değiştirmek sepeti terk ettirmez (native 10.08 kullanıcı bulgusu). Adres
 * tek satır (native `addressLine`: sokak · posta kodu şehir); düzenleme hesap sayfasında — native künye onu çizmiyor.
 */
function CartAddress({ t, locale }: Pick<CartIdentityProps, 't' | 'locale'>) {
  const copy = cartMessages[locale].address;
  const c = t.identity;
  const { address } = useDeliveryPlace();
  const [open, setOpen] = useState<'list' | 'new' | null>(null);

  return (
    <div className="flex flex-col items-start gap-0.5 px-4 pb-2.5">
      <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.eyebrow}</span>
      {address ? (
        <>
          <span className="font-sans text-body font-semibold text-ink">
            {address.line2 ? `${address.line1}, ${address.line2}` : address.line1}, {address.postalCode} {address.city}
          </span>
          <span className="font-sans text-body-sm leading-[1.6] text-muted">{copy.note}</span>
          <TextAction label={copy.change} onClick={() => setOpen('list')} />
        </>
      ) : (
        <>
          <span className="font-sans text-body-sm leading-[1.6] text-muted">{c.addressEmpty}</span>
          <TextAction label={c.addressAdd} onClick={() => setOpen('new')} />
        </>
      )}

      {open && <AddressPickerDialog locale={locale} compact initialMode={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * Masaüstü v1'in iki kartı (14.09) — kimlik ve teslimat adresi. Sağ sütunun `gap`i ikisini ayırır
 * (v1 14px); parça bu yüzden tek kutu değil, iki kart döndürür.
 */
interface CartAccountDesktopProps {
  t: Messages;
  locale: Locale;
  account: CustomerIdentity;
}

function CartAccountDesktop({ t, locale, account }: CartAccountDesktopProps) {
  return (
    <>
      <div className={cardClass({ pad: 'row' })}>
        <div className="flex items-center gap-2.75">
          {/* Başlıktaki hesap girişinin yuvarlağıyla aynı baş harfler ve aynı ton (v1 ikisinde de #efdfc2). */}
          <span aria-hidden className="grid size-9 flex-none place-items-center rounded-full bg-honey-line font-sans text-note font-bold text-honey">
            {initialsOf(account.name, account.email, locale)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate font-sans text-body-sm font-bold text-ink">{account.name || account.email}</span>
            {account.name && account.email && <span className="truncate font-sans text-micro text-muted">{account.email}</span>}
          </span>
          <Link href="/account" className={`flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}>
            {accountMessages[locale].myAccount}
          </Link>
        </div>
      </div>
      <AddressChoice t={t} locale={locale} />
    </>
  );
}

interface AddressChoiceProps {
  t: Messages;
  locale: Locale;
}

/**
 * Teslimat adresi kartı — kayıtlı adresler SEÇİM KARTI olarak (v1). Liste ve seçim adres penceresi
 * ve yer paneliyle ortak (`useMyAddresses`); seçmek = varsayılan yapmak, o yüzden seçili kart
 * "· varsayılan" taşır (yer panelinin kartıyla aynı dil). Çizim ayrı: v1 sepette kartı krem zeminde,
 * tek satır adresle ve kanal rozetsiz çiziyor.
 *
 * Altta TESLİM ŞERİDİ: seçili adresin kodu ve teslim şekli. Kargo hâlinde süre yazılmaz (v1 "2–3 iş
 * günü" diyor): taşıma süresini bu noktada bilmiyoruz, ekrana yalnız olgu yazılır.
 */
function AddressChoice({ t, locale }: AddressChoiceProps) {
  const c = t.identity;
  const am = addressMessages[locale];
  const { place, unresolved } = useDeliveryPlace();
  const { addresses, failed, busy, current, choose } = useMyAddresses();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liste açılışta çekiliyor; gelene kadar seçili adres (yer bağlamında hazır) tek kart olarak durur —
  // kart boş açılıp sonra dolmasın.
  const rows: PlaceAddress[] = addresses ?? (current ? [current] : []);

  const pick = async (id: string) => {
    setError(null);
    if (!(await choose(id))) setError(errorText(am.errors, null));
  };

  const dialog = adding && <AddressPickerDialog locale={locale} initialMode="new" onClose={() => setAdding(false)} />;

  // Seçilecek adres YOKSA kartın TAMAMI "+ Yeni adres"tir (kullanıcı isteği 14.09): köşedeki yeşil bağ
  // bal zeminde gözden kaçabiliyordu. Tek düğme — bağ burada yalnız görsel etiket, iç içe düğme yok;
  // pencere kartın DIŞINDA çizilir (düğmenin içinde etkileşimli içerik olamaz).
  if (rows.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cardClass({
            pad: 'side',
            gap: 'sm',
            tone: 'attention',
            className: `group w-full cursor-pointer text-left transition-colors hover:border-honey ${focusRingClass}`,
          })}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-serif text-card-title-sm text-ink">{c.addressTitle}</span>
            <span className="flex-none font-sans text-note font-bold text-olive transition-colors group-hover:text-olive-dark">{am.add}</span>
          </span>
          {failed && <span className="font-sans text-note font-semibold text-terracotta">{am.failed}</span>}
          {addresses !== null && <span className="font-sans text-note leading-relaxed text-body">{c.addressEmpty}</span>}
        </button>
        {dialog}
      </>
    );
  }

  // Seçili adres yoksa DİKKAT TONU (kullanıcı isteği 14.09) — koşul "Ödemeye geç" kapısının adres
  // şartıyla aynı (`useCheckoutGate`). Seçili adres sunucudan hazır geldiği için kart ilk karede doğru
  // tonda açılır. Karşılanamayan adreste kart düz kalır: uyarıyı kartın içindeki şerit söylüyor.
  return (
    <div className={cardClass({ pad: 'side', gap: 'sm', tone: current ? 'plain' : 'attention' })}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-card-title-sm text-ink">{c.addressTitle}</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          // Kitin odak halkası: pencere kapanınca odak bu düğmeye döner ve halka yazılmayınca
          // tarayıcının mavi çerçevesi çiziliyordu (14.09, kullanıcının görüntüsü).
          className={`flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
        >
          {am.add}
        </button>
      </div>

      {failed && <span className="font-sans text-note font-semibold text-terracotta">{am.failed}</span>}

      {rows.map((row) => {
        const selected = row.id === current?.id;
        return (
          <button
            key={row.id}
            type="button"
            disabled={busy}
            aria-pressed={selected}
            onClick={() => void pick(row.id)}
            className={[
              'flex cursor-pointer items-start gap-2.5 rounded-soft px-3.5 py-3 text-left transition-colors disabled:cursor-progress',
              focusRingClass,
              selected ? 'border-2 border-olive bg-olive-bg' : 'border border-sand-200 bg-cream hover:border-olive',
            ].join(' ')}
          >
            <RadioMark selected={selected} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-sans text-body-sm font-bold text-ink">
                {row.label || row.city}
                {selected && ` · ${placeMessages[locale].panelDefault}`}
              </span>
              {/* Alıcı — kapıda kimin karşılayacağı (kullanıcı isteği 14.09: gönderilen kişinin adı kartta
                  görünmeli). v1 kartı çizmiyor. */}
              <span className="truncate font-sans text-note text-ink">{row.recipient}</span>
              <span className="font-sans text-note leading-normal text-body">
                {row.line1} · {row.postalCode} {row.city}
              </span>
            </span>
          </button>
        );
      })}

      {current && place && (
        <DeliveryStrip inRoute={place.inRoute} tone="deep">
          <span>{stripText(c, locale, current, place)}</span>
        </DeliveryStrip>
      )}
      {/* Adres karşılanamıyorsa şerit bunu SÖYLER (14.09): önce hiç çizilmiyordu, sepet susuyordu ve
          müşteri ret cümlesini ancak siparişi onaylarken görüyordu (ölçüldü: 90451 Nürnberg). */}
      {current && !place && unresolved && (
        <DeliveryStrip inRoute={false} unreachable tone="deep">
          <span>{c.stripUnreachable.replace('{place}', `${current.postalCode} ${current.city}`)}</span>
        </DeliveryStrip>
      )}
      {error && (
        <span role="alert" className="font-sans text-note font-semibold text-terracotta">
          {error}
        </span>
      )}

      {dialog}
    </div>
  );
}

/** "67000 Strasbourg — Perşembe … kapınızda, ücretsiz" · "67380 Lingolsheim — kargoyla gönderilir". */
function stripText(c: Messages['identity'], locale: Locale, address: PlaceAddress, place: DeliveryPlace): string {
  const template = !place.inRoute ? c.stripShipping : place.nextDate ? c.stripInRoute : c.stripInRouteNoDate;
  return template
    .replace('{place}', `${address.postalCode} ${address.city}`)
    .replace('{date}', place.nextDate ? formatDeliveryDate(place.nextDate, locale) : '');
}
