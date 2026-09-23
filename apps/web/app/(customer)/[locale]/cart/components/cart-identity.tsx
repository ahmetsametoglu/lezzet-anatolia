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
import addressMessages from '@lezzet/i18n/customer/address';
import placeMessages from '@/components/customer/delivery/place-messages.json';
import { addressLine, addressTitle } from '@lezzet/address';
import { createClient } from '@/lib/supabase/client';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp, verifyEmailOtp } from '@/lib/auth/otp-actions';
import { errorText } from '@/lib/customer-error-text';
import type { DeliveryPlace, PlaceAddress } from '@/lib/delivery/place-types';
import type { CustomerIdentity } from '@/lib/guard';
import { formatDeliveryDate } from '@/lib/storefront/format';
import type { Messages } from '../cart-types';

/**
 * Sepetin kimlik ve adres bloğu: ödemeye geçmeden önce "kim" ve "nereye" burada sorulur, ödeme ekranı yalnız gösterir.
 * Girişsiz müşteriye adres sorulmaz, çünkü cevabı kaydedilemez; giriş sonrası sayfa yönlendirilmez, tazelenir ki müşteri
 * sepetinden ayrılmasın.
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

  /** Anahtar → cümle: `authErrorMessage` saf tablo, çeviri ekranda yapılır. */
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

  // Masaüstünde dikkat tonu: ödemeye geçmenin ilk şartı bu kart ve eksik adım sepetin geri kalanından ayrışmalı.
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
 * Telefon görünümünün adres künyesi, native sepetinkinin ikizi: sepetin neye göre değerlendirildiğini söyler ve adresi
 * değiştirmek sepeti terk ettirmez.
 */
function CartAddress({ t, locale }: Pick<CartIdentityProps, 't' | 'locale'>) {
  const copy = cartMessages[locale].address;
  const c = t.identity;
  const { address, pickup } = useDeliveryPlace();
  const pickedWarehouse = pickup?.warehouses.find((w) => w.id === pickup.selectedWarehouseId) ?? null;
  const [open, setOpen] = useState<'list' | 'new' | null>(null);

  return (
    <div className="flex flex-col items-start gap-0.5 px-4 pb-2.5">
      <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.eyebrow}</span>
      {pickedWarehouse ? (
        <>
          <span className="font-sans text-body font-semibold text-ink">{copy.pickupLine.replace('{name}', pickedWarehouse.name)}</span>
          <span className="font-sans text-body-sm leading-[1.6] text-muted">{copy.pickupNote}</span>
          <TextAction label={copy.change} onClick={() => setOpen('list')} />
        </>
      ) : address ? (
        <>
          <span className="font-sans text-body font-semibold text-ink">{addressLine(address)}</span>
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

/** Masaüstünde kimlik ve adres iki ayrı kart: sağ sütunun boşluğu onları ayırır, bu yüzden parça iki kart döndürür. */
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
          {/* Başlıktaki hesap girişinin yuvarlağıyla aynı baş harfler ve aynı ton. */}
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
 * Kayıtlı adresler seçim kartı olarak; seçmek varsayılan yapmaktır, bu yüzden seçili kart "· varsayılan" taşır. Alttaki teslim
 * bandında kargo süresi yazılmaz, çünkü taşıma süresi bu noktada bilinmiyor ve ekrana yalnız olgu yazılır.
 */
function AddressChoice({ t, locale }: AddressChoiceProps) {
  const c = t.identity;
  const am = addressMessages[locale];
  const { place, unresolved, pickup, selectPickup } = useDeliveryPlace();
  const pickedWarehouseId = pickup?.selectedWarehouseId ?? null;
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
  const pickPickup = async (id: string) => {
    setError(null);
    if (!(await selectPickup(id))) setError(errorText(am.errors, null));
  };

  const dialog = adding && <AddressPickerDialog locale={locale} initialMode="new" onClose={() => setAdding(false)} />;

  // Seçilecek adres yoksa kartın tamamı "+ Yeni adres" düğmesidir, çünkü köşedeki bağ bal zeminde gözden kaçar. Pencere kartın
  // dışında çizilir: düğmenin içinde etkileşimli içerik olamaz.
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

  // Seçili adres yoksa dikkat tonu; koşul "Ödemeye geç" kapısının adres şartıyla aynı (`useCheckoutGate`). Karşılanamayan adreste
  // kart düz kalır, çünkü uyarıyı kartın içindeki bant söyler.
  return (
    <div className={cardClass({ pad: 'side', gap: 'sm', tone: current ? 'plain' : 'attention' })}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-card-title-sm text-ink">{c.addressTitle}</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          // Kitin odak halkası: pencere kapanınca odak bu düğmeye döner ve halka yazılmazsa tarayıcının mavi çerçevesi çizilir.
          className={`flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
        >
          {am.add}
        </button>
      </div>

      {failed && <span className="font-sans text-note font-semibold text-terracotta">{am.failed}</span>}

      {rows.map((row) => {
        // Depo seçiliyken varsayılan adres fatura adresidir, seçili çizilmez — tek seçim, tek çerçeve.
        const selected = pickedWarehouseId === null && row.id === current?.id;
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
                {addressTitle(row)}
                {selected && ` · ${placeMessages[locale].panelDefault}`}
              </span>
              {/* Alıcı: kapıda kimin karşılayacağı kartta görünmeli. */}
              <span className="truncate font-sans text-note text-ink">{row.recipient}</span>
              <span className="font-sans text-note leading-normal text-body">
                {row.line1} · {row.postalCode} {row.city}
              </span>
            </span>
          </button>
        );
      })}

      {/* Gel-al (izinli müşteri): depo kartı adreslerin altında, aynı seçim dili. Seçilince şerit yerine depo notu. */}
      {pickup?.warehouses.map((warehouse) => {
        const selected = warehouse.id === pickedWarehouseId;
        return (
          <button
            key={warehouse.id}
            type="button"
            disabled={busy}
            aria-pressed={selected}
            onClick={() => void pickPickup(warehouse.id)}
            className={[
              'flex cursor-pointer items-start gap-2.5 rounded-soft px-3.5 py-3 text-left transition-colors disabled:cursor-progress',
              focusRingClass,
              selected ? 'border-2 border-olive bg-olive-bg' : 'border border-sand-200 bg-cream hover:border-olive',
            ].join(' ')}
            data-testid={`cart-pick-warehouse-${warehouse.id}`}
          >
            <RadioMark selected={selected} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-sans text-body-sm font-bold text-ink">{c.pickupTitle}</span>
              <span className="font-sans text-note leading-normal text-body">
                {warehouse.name} · {warehouse.addressLine}
              </span>
              {selected && <span className="font-sans text-note leading-normal text-muted">{c.pickupNote.replace('{name}', warehouse.name)}</span>}
            </span>
          </button>
        );
      })}

      {current && place && pickedWarehouseId === null && (
        <DeliveryStrip inRoute={place.inRoute} tone="deep">
          <span>{stripText(c, locale, current, place)}</span>
        </DeliveryStrip>
      )}
      {/* Adres karşılanamıyorsa bant bunu söyler, yoksa müşteri ret cümlesini ancak siparişi onaylarken görürdü. */}
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
