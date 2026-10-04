'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { Link } from '@/i18n/navigation';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { DashedInvite } from '@/components/customer/phone-kit/dashed-invite';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { cardClass } from '@/components/customer/ui/card';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { RadioMark } from '@/components/customer/form/radio-mark';
import { OtpCodeInput } from '@/components/customer/auth/otp-code-input';
import { GoogleIcon } from '@/components/customer/auth/provider-icons';
import { useAccount } from '@/components/customer/account/account-context';
import accountMessages from '@/components/customer/account/account-messages.json';
import { AddressPickerDialog } from '@/components/customer/delivery/address-picker';
import { DeliveryStrip } from '@/components/customer/delivery/delivery-strip';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { useMyAddresses } from '@/components/customer/delivery/use-my-addresses.hook';
import addressMessages from '@lezzet/i18n/customer/address';
import placeMessages from '@/components/customer/delivery/place-messages.json';
import { addressContact, addressLine, addressTitle } from '@lezzet/address';
import { errorText } from '@/lib/customer-error-text';
import type { DeliveryPlace, PlaceAddress } from '@/lib/delivery/place-types';
import type { CustomerIdentity } from '@/lib/guard';
import { formatDeliveryDate } from '@/lib/storefront/format';
import type { Messages } from '../cart-types';
import { useCartLogin } from '../use-cart-login.hook';
import { AccountIdentity, PhoneAccountCard } from './cart-account';
import { PhoneCartLogin } from './phone-cart-login';

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
  if (!account) return compact ? <PhoneCartLogin locale={locale} /> : <CartLogin t={t} locale={locale} />;
  if (!compact) return <CartAccountDesktop t={t} locale={locale} account={account} />;
  return (
    <>
      <PhoneAccountCard locale={locale} account={account} />
      <CartAddress locale={locale} />
    </>
  );
}

function CartLogin({ t, locale }: Pick<CartIdentityProps, 't' | 'locale'>) {
  const c = t.identity;
  const login = useCartLogin(locale, c.googleUnavailable);

  // Masaüstünde dikkat tonu: ödemeye geçmenin ilk şartı bu kart ve eksik adım sepetin geri kalanından ayrışmalı.
  return (
    <div className={cardClass({ pad: 'snug', gap: 'md', tone: 'attention' })}>
      <span className="font-serif text-h2-sm text-ink">{c.loginTitle}</span>
      <p className="font-sans text-note leading-relaxed text-body">{c.loginBody}</p>

      {login.sent ? (
        // Kod gönderildi → odaklı görünüm: seçim kalkar, tek iş var. Kutu GİRİŞ SAYFASININ bileşeni.
        <div className="flex flex-col gap-3">
          <OtpCodeInput email={login.trimmed} locale={locale} onVerify={login.verify} onResend={login.resend} onSuccess={login.verified} />
          {/* Kilitlenmez: yanlış adres yazan ya da Google'a geçmek isteyen geri döner. */}
          <Button variant="ghost" size="sm" onClick={() => login.setSent(false)}>
            {c.otherMethod}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="secondary" fullWidth onClick={() => void login.google()}>
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
              value={login.email}
              onChange={(e) => login.setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void login.send()}
              placeholder={c.email}
            />
            <Button fullWidth disabled={!login.validEmail || login.busy} onClick={() => void login.send()}>
              {login.busy ? c.sending : c.send}
            </Button>
          </div>
        </div>
      )}

      {login.error && <span className="font-sans text-note font-semibold text-terracotta">{login.error}</span>}
    </div>
  );
}

/**
 * Telefon görünümünün adres künyesi, native sepetinkinin ikizi: sepetin neye göre değerlendirildiğini söyler ve adresi
 * değiştirmek sepeti terk ettirmez.
 */
function CartAddress({ locale }: Pick<CartIdentityProps, 'locale'>) {
  const copy = cartMessages[locale].address;
  const { address, pickup } = useDeliveryPlace();
  const pickedWarehouse = pickup?.warehouses.find((w) => w.id === pickup.selectedWarehouseId) ?? null;
  const [open, setOpen] = useState<'list' | 'new' | null>(null);
  const dialog = open && <AddressPickerDialog locale={locale} compact initialMode={open} onClose={() => setOpen(null)} />;

  // Adres yokken ödemeye geçilemez; native'in kartı davet eder ve adres sepetten ayrılmadan yazılır.
  if (!pickedWarehouse && !address) {
    const empty = cartMessages[locale].addressEmpty;
    return (
      <>
        <DashedInvite
          title={empty.title}
          description={empty.body}
          action={<PrimaryButton label={empty.cta} shape="pill" onClick={() => setOpen('new')} />}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5 px-4 pb-2.5">
      <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.eyebrow}</span>
      {pickedWarehouse ? (
        <>
          <span className="font-sans text-copy font-semibold text-ink">{copy.pickupLine.replace('{name}', pickedWarehouse.name)}</span>
          <span className="font-sans text-body-sm leading-[1.6] text-muted">{copy.pickupNote}</span>
          <TextAction label={copy.change} onClick={() => setOpen('list')} />
        </>
      ) : (
        address && (
          <>
            <span className="font-sans text-copy font-semibold text-ink">{addressLine(address)}</span>
            {addressContact(address) && <span className="font-sans text-body-sm leading-[1.6] text-muted">{addressContact(address)}</span>}
            <span className="font-sans text-body-sm leading-[1.6] text-muted">{copy.note}</span>
            <TextAction label={copy.change} onClick={() => setOpen('list')} />
          </>
        )
      )}

      {dialog}
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
          <AccountIdentity locale={locale} account={account} />
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
              {/* Alıcı ve telefonu: kapıda kimin karşılayacağı ve kuryenin kimi arayacağı kartta görünmeli. */}
              {addressContact(row) && <span className="truncate font-sans text-note text-ink">{addressContact(row)}</span>}
              <span className="font-sans text-note leading-normal text-body">
                {row.line1} · {row.postalCode} {row.city}
              </span>
            </span>
          </button>
        );
      })}

      {/* Gel-al (izinli müşteri): depo kartı adreslerin altında, aynı seçim dili. Seçilince bant yerine depo notu. */}
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
