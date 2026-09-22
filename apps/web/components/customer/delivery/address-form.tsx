'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
  addressLabelKind,
  addressLineOf,
  hasHouseNumber,
  isValidPostalCode,
  MIN_QUERY_LENGTH,
  type AddressLabelKind,
} from '@lezzet/address';
import { CountryEnum, type Address, type Country } from '@lezzet/types';
import { DIAL_CODE, nationalPhone, normalizePhone } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
import { ChoiceChip } from '@/components/customer/ui/choice-chip';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Dialog } from '@/components/customer/ui/dialog';
import { Icon } from '@/components/customer/ui/icons';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { useDismiss } from '@/components/customer/ui/use-dismiss.hook';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { checkAddressAction, resolveGermanAddressAction, type CheckedPoint } from '@/lib/address/lookup-actions';
import { useAddressSearch } from '@/lib/address/use-address-search.hook';
import { useGermanAddressSearch } from '@/lib/address/use-german-address-search.hook';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import type { DeliveryPlace } from '@/lib/delivery/place-types';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { ChannelBadge } from './channel-badge';
import { DeliveryStrip } from './delivery-strip';
import { useDeliveryPlace } from './place-context';
import messages from '@lezzet/i18n/customer/address';
// Ülke adları yer hapıyla ortak sözlükten.
import placeCopy from './place-messages.json';

/*
  Adres penceresi ile hesap sayfasının ortak formu. Öneriden seçilen adres kaynağında doğrulanmış ve noktasıyla gelir; elle girilen
  adres kaydetmeden önce doğrulanır, bulunamazsa yine kaydedilir ve noktasını tarama arar, çünkü defter hiçbir adresi reddetmez.
*/

export interface NewAddressInput {
  /** Kart başlığı olur; boşsa başlık şehirdir. */
  label?: string;
  /** Adrese giden kişi, hesap sahibi olmayabilir; kurye kapıda onu sorduğu için zorunlu. */
  recipient: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  /** Kurye kapıda bu numarayı arar; bu yüzden zorunlu. */
  phone: string;
  /** Önce sorulur: öneri ve doğrulama o ülkede yapılır, telefonun ülke kodu da buradan gelir. */
  country?: Country;
  /** Beyan değil adaydır: sunucu makullük süzgecinden geçirir, düşerse satır tarama kuyruğuna girer. */
  point?: CheckedPoint;
  makeDefault?: boolean;
  /** Yalnız niyet: `is_billing`i ayrı bir eylem yönetir, çünkü hesapta tek işaretli satır olabilir. */
  makeBilling?: boolean;
}

/**
 * Dönüşüm açık yazılır, yayma ile değil: formun `makeDefault` gibi tabloda karşılığı olmayan alanları var. Formun yanında durur ki
 * iki çağıran aynı dönüşümü kullansın.
 */
export function toAddressFields(input: NewAddressInput) {
  return {
    label: input.label ?? null,
    recipient: input.recipient.trim(),
    line1: input.line1,
    line2: input.line2 ?? null,
    postalCode: input.postalCode,
    city: input.city,
    /** Telefon kimlik anahtarıdır ve biçimi tutmayan anahtar eşleşmez; çözülemeyen numara boşaltılmaz, ham hâliyle korunur. */
    phone: normalizePhone(input.phone, input.country ?? 'FR') ?? input.phone.trim(),
    /* Kolon `not null`; geri düşüş ülkesiz çağıran için. */
    country: input.country ?? ('FR' as const),
  };
}

/** Yeni adresin ön-dolu açılacağı iki alan. */
export interface AddressDefaults {
  recipient: string;
  phone: string;
}

/** Hesabın künyesinden adres varsayılanı; kural iki yüzeyin ortak adres paketinde, çağıranlar buradan okur. */
export { addressDefaultsOf } from '@lezzet/address';

/** Düzenlemede alanlar dolu açılır, müşteri adresi yeniden yazmak zorunda kalmaz. */
export function toFormInput(address: Address): NewAddressInput {
  return {
    label: address.label ?? undefined,
    recipient: address.recipient,
    line1: address.line1,
    line2: address.line2 ?? undefined,
    postalCode: address.postalCode,
    city: address.city,
    /** Kayıtlı numara E.164; form ülke içi yazımı gösterir, gidiş-dönüş kayıpsızdır. */
    phone: nationalPhone(address.phone, address.country),
    country: address.country,
    makeDefault: address.isDefault,
    makeBilling: address.isBilling,
  };
}

interface AddressFormProps {
  locale: Locale;
  initial?: NewAddressInput;
  /** Düzenlemede bakılmaz: kayıtlı alıcının üstüne hesabın adını yazmak hediye adresindeki adı sessizce silerdi. */
  defaults?: AddressDefaults;
  /** Yalnız kurumsal hesabın kartı açar; varsayılan kapalı ki her çağıran bilerek açsın. */
  billingChoice?: boolean;
  onSave: (input: NewAddressInput) => Promise<void>;
  onCancel: () => void;
  /** Pencerenin içindeki form çerçeve çizmez: pencere zaten bir kap. */
  frame?: boolean;
  /** Pencereden eklenen adres zaten seçili adres olur; orada kutu cevapsız bir soru olurdu. */
  defaultChoice?: boolean;
  /** Mobil webde form çekmecede çizilir ve ikili satırlar tek sütuna iner. */
  compact?: boolean;
  /** Cümleyi çağıran kurar; kaydet düğmesinin üstünde çizilir ki pencere ve çekmece aynı yerde göstersin. */
  error?: string | null;
  /** Verilirse mobil web çekmecesi düzenlemede kaydetmenin altında "Adresi sil" sunar, native adres çekmecesi gibi. */
  onDelete?: () => Promise<void>;
  /**
   * Rol eylemleri — çekmecenin en üstünde tek şerit (native adres çekmecesiyle aynı). Satırdan kalktılar, çünkü üç eylem adres
   * satırını eziyordu; kutu ya da başlık açılmaz, çekmece yükselmemeli.
   */
  roleActions?: ReactNode;
}

type Kind = AddressLabelKind;

/** Kaynağında doğrulanmış adres; noktasıyla gelir. */
interface Picked {
  line1: string;
  postalCode: string;
  city: string;
  country: Country;
  point: CheckedPoint;
}

interface ManualDraft {
  line1: string;
  postalCode: string;
  city: string;
}


export function AddressForm({
  locale,
  initial,
  defaults,
  billingChoice = false,
  frame = true,
  defaultChoice = true,
  onSave,
  onCancel,
  compact = false,
  error = null,
  onDelete,
  roleActions,
}: AddressFormProps) {
  const copy = messages[locale];
  const t = copy.form;
  const places = placeCopy[locale];
  const { place } = useDeliveryPlace();
  // Yeni adres "Ev" seçili açılır; düzenlemede çip kayıtlı başlıktan çıkarılır.
  const start = initial ? addressLabelKind(initial.label, t) : { kind: 'home' as const, custom: '' };

  const [country, setCountry] = useState<Country>(initial?.country ?? place?.country ?? 'FR');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  // Düzenlemede kayıtlı satır elle giriş kartında açılır: doğrulanıp doğrulanmadığını bilmiyoruz, "doğrulandı" demek uydurma olurdu.
  const [manual, setManual] = useState<ManualDraft | null>(initial ? { line1: initial.line1, postalCode: initial.postalCode, city: initial.city } : null);
  const [answer, setAnswer] = useState<DeliveryPlace | null>(null);
  const [kind, setKind] = useState<Kind>(start.kind);
  const [custom, setCustom] = useState(start.custom);
  const [line2, setLine2] = useState(initial?.line2 ?? '');
  const [recipient, setRecipient] = useState(initial?.recipient ?? defaults?.recipient ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? defaults?.phone ?? '');
  const [makeDefault, setMakeDefault] = useState(initial?.makeDefault ?? false);
  const [makeBilling, setMakeBilling] = useState(initial?.makeBilling ?? false);
  const [busy, setBusy] = useState(false);
  /** Google ücreti oturumdan keser: jeton yazma boyunca aynı, seçimle biter. */
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());

  const term = query.trim();
  const searchOn = picked === null;
  const ban = useAddressSearch(query, { enabled: searchOn && country === 'FR', near: place?.point ?? undefined });
  const google = useGermanAddressSearch(query, { enabled: searchOn && country === 'DE', sessionToken });
  const found = country === 'FR' ? ban : google;
  const throttled = country === 'FR' && ban.throttled;
  // "Bulamadık" yalnız cevap bu sorgu için geldiyse; yoksa yazarken kutu yanıp sönerdi.
  const notFound = searchOn && manual === null && term.length >= MIN_QUERY_LENGTH && found.term === term && found.suggestions.length === 0 && !throttled;
  /** Öneriler yalnız kapı düzeyinde olduğundan numarasız sokak sonuç vermez; "bulamadık" yerine "kapı numarasını da yazın" denir. */
  const lacksDoor = !hasHouseNumber(term);

  /**
   * Masaüstünde öneriler menü olarak açılır, yoksa pencere her harfte uzayıp kısalırdı; odak kutudan çıkınca kapanır ki Tab'la
   * geçenin önünde kalmasın. Mobil webde liste akışta kalır.
   */
  const floating = !compact;
  const [menuOpen, setMenuOpen] = useState(true);
  const searchBox = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listShown = searchOn && (!floating || menuOpen);
  const menuVisible = floating && listShown && found.suggestions.length > 0;
  useDismiss(searchBox, menuVisible, () => setMenuOpen(false));

  /**
   * Teslimat cevabı yalnız sorulur, sitenin yeri değişmez: yer adres kaydedilince değişir, yoksa sepette açılan bu pencere yer
   * değişince kapanırdı.
   */
  const answerFor = async (code: string, where: Country) => {
    const { data } = await resolvePlaceAction(code, where).catch(() => ({ data: null }));
    setAnswer(data?.kind === 'resolved' ? data.place : null);
  };

  const choose = (next: Picked) => {
    setPicked(next);
    setManual(null);
    setQuery(next.line1);
    setAnswer(null);
    void answerFor(next.postalCode, next.country);
  };

  const pickFrench = (id: string) => {
    const row = ban.suggestions.find((suggestion) => suggestion.id === id);
    if (!row) return;
    // Nokta seçilen satırdan: müşterinin onayladığı kapı, ikinci çağrı gerekmez.
    choose({ line1: addressLineOf(row), postalCode: row.postalCode, city: row.city, country: 'FR', point: { lat: row.latitude, lng: row.longitude, precision: row.kind, source: 'ban' } });
  };

  const pickGerman = async (placeId: string) => {
    setBusy(true);
    const resolved = await resolveGermanAddressAction({ placeId, sessionToken }).catch(() => null);
    // Oturum seçimle biter; sonraki yazma yeni bir oturumdur.
    setSessionToken(crypto.randomUUID());
    setBusy(false);
    // Google kodu ya da şehri vermediyse seçim yarımdır: bilinenle elle giriş kartı açılır, kayıtta yine doğrulanır.
    if (!resolved || !resolved.postalCode || !resolved.city) {
      setManual({ line1: resolved?.line1 ?? term, postalCode: resolved?.postalCode ?? '', city: resolved?.city ?? '' });
      return;
    }
    choose({
      line1: resolved.line1,
      postalCode: resolved.postalCode,
      city: resolved.city,
      country: 'DE',
      // Kaynak `google`: 30 gün saklama kuralı bu etikete bakar.
      point: { lat: resolved.latitude, lng: resolved.longitude, precision: resolved.precision, source: 'google' },
    });
  };

  // Ülke değişince arama ve seçim düşer: öneri ve doğrulama o ülkede yapılır.
  const changeCountry = (next: Country) => {
    if (next === country) return;
    setCountry(next);
    setQuery('');
    setPicked(null);
    setAnswer(null);
  };

  const label = kind === 'home' ? t.kindHome : kind === 'work' ? t.kindWork : custom.trim() || undefined;
  const manualReady = manual !== null && manual.line1.trim() !== '' && isValidPostalCode(manual.postalCode) && manual.city.trim() !== '';
  // Alıcı ve telefon olmadan kurye kapıya gidemez; sokak ve kod olmadan adres adres değildir.
  const complete = (picked !== null || manualReady) && recipient.trim() !== '' && phone.trim() !== '';

  const save = async () => {
    const base = picked ?? (manual && manualReady ? { line1: manual.line1.trim(), postalCode: manual.postalCode, city: manual.city.trim(), country } : null);
    if (!base || !complete) return;
    setBusy(true);
    /* Düğme her hâlde geri açılır; cümleyi ve reddi çağıran yönetir, form yalnız kilidi bırakır. */
    try {
      // Elle girilen adres kaydetmeden önce doğrulanır; seçilen öneri noktasını zaten taşıyor.
      const point = picked?.point ?? (await checkAddressAction({ line1: base.line1, postalCode: base.postalCode, city: base.city, country: base.country }).catch(() => null)) ?? undefined;
      await onSave({
        label,
        recipient: recipient.trim(),
        line1: base.line1,
        line2: line2.trim() || undefined,
        postalCode: base.postalCode,
        city: base.city,
        phone: phone.trim(),
        country: base.country,
        point,
        makeDefault,
        makeBilling,
      });
    } finally {
      setBusy(false);
    }
  };

  const pin = <Icon name="pin" size={16} />;

  const suggestionLists = (
    <>
      {listShown && country === 'FR' && (
        <SuggestionList
          items={ban.suggestions.map((row) => ({
            id: row.id,
            title: addressLineOf(row),
            subtitle: `${row.postalCode} ${row.city}`,
            badge: <ChannelBadge postalCode={row.postalCode} locale={locale} />,
          }))}
          onSelect={pickFrench}
          label={t.suggestLabel}
          icon={pin}
          footnote={t.suggestCredit}
          anchorRef={floating ? searchBox : undefined}
        />
      )}
      {listShown && country === 'DE' && (
        <SuggestionList
          items={google.suggestions.map((row) => ({ id: row.placeId, title: row.main, subtitle: row.secondary ?? undefined }))}
          onSelect={(id) => void pickGerman(id)}
          label={t.suggestLabel}
          icon={pin}
          // Google önerisi haritasız gösterildiğinde logo zorunlu (Places kullanım koşulları).
          footnote={<img src="/attribution/google-maps.svg" alt="Google Maps" width={78} height={14} className="block" />}
          anchorRef={floating ? searchBox : undefined}
        />
      )}
    </>
  );

  const remove = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  const saveButton = (
    <Button disabled={!complete || busy} fullWidth={compact} onClick={() => void save()}>
      {defaultChoice ? t.save : t.saveAndSelect}
    </Button>
  );

  /** Çekmecede "Vazgeç" yok, çünkü çekmecenin üç kapanış yolu var; silme kaydetmenin altında dolgusuz durur ki silmeye davet etmesin. */
  const actions = compact ? (
    <div className="flex flex-col items-center gap-3">
      {saveButton}
      {initial && onDelete && (
        <TextAction label={t.delete} tone="terracotta" onClick={() => void remove(onDelete)} />
      )}
    </div>
  ) : (
    <div className="flex items-center gap-3 border-t border-sand-200 pt-4">
      <button type="button" onClick={onCancel} className={`cursor-pointer font-sans text-body-sm font-bold text-muted transition-colors hover:text-ink ${focusRingClass}`}>
        {t.cancel}
      </button>
      <div className="ml-auto">{saveButton}</div>
    </div>
  );

  const body = (
    <div className={frame && !compact ? cardClass({ className: 'w-full' }) : 'w-full'}>
      <div className="flex flex-col gap-4">
        {roleActions && <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{roleActions}</div>}
        {/* Önce ülke: öneri ve doğrulama seçilen ülkede yapılır. */}
        {compact && <span className="-mb-2 font-sans text-eyebrow-xs text-terracotta uppercase">{t.countryLabel}</span>}
        <div className="flex gap-2">
          {CountryEnum.options.map((code) => (
            <ChoiceChip
              key={code}
              size="segment"
              label={code === 'DE' ? places.countryDE : places.countryFR}
              active={country === code}
              onSelect={() => changeCountry(code)}
            />
          ))}
        </div>

        {/* Menü DOM'da kutunun içinde: Tab alandan satırlara geçer ve "dışarı basınca kapan" kutuyu kapsar. */}
        <div
          ref={searchBox}
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            // Menü açıkken Escape yalnız menüyü kapatır. Pencere Escape'i belgede dinliyor ve `stopPropagation` aynı düğümdeki
            // dinleyiciyi durdurmaz, bütün pencere kapanırdı.
            if (!menuVisible || e.key !== 'Escape') return;
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setMenuOpen(false);
            searchInput.current?.focus();
          }}
          onBlur={(e) => {
            if (floating && !e.currentTarget.contains(e.relatedTarget as Node | null)) setMenuOpen(false);
          }}
        >
          <FormInputField
            label={t.searchLabel}
            value={query}
            inputRef={searchInput}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setAnswer(null);
              setMenuOpen(true);
            }}
            // Kapanan menü alana basınca geri gelir; odağın alana dönmesi açmaz, Escape odağı buraya getirir.
            onClick={() => setMenuOpen(true)}
            placeholder={country === 'DE' ? t.searchPlaceholderDE : t.searchPlaceholderFR}
            icon={<Icon name="search" size={18} />}
            /* Chrome adres alanında `off`u yok sayıp etiketteki "posta kodu" yüzünden kod öneriyordu; açık jeton bu sezgiyi ezer. */
            autoComplete="address-line1"
          />
          {searchOn && term.length > 0 && term.length < MIN_QUERY_LENGTH && (
            <span className="font-sans text-field-label font-normal text-muted">{t.searchHint.replace('{n}', String(MIN_QUERY_LENGTH))}</span>
          )}
          {floating && suggestionLists}
        </div>

        {/* Mobil webde liste akışta, kutunun altında. */}
        {!floating && suggestionLists}
        {/* Kota doluluğu hata değildir: tek satır söylenir, elle giriş açık kalır. */}
        {searchOn && throttled && <span className="font-sans text-note leading-relaxed text-body">{t.suggestBusy}</span>}

        {notFound && (
          <div className="flex flex-col gap-2.25 rounded-2xl border border-honey-line bg-honey-bg px-4.5 py-4">
            <span className="flex items-center gap-2 font-sans text-control text-honey">
              <Icon name="warning" size={15} className="flex-none" />
              {lacksDoor ? t.needDoorTitle : t.notFoundTitle}
            </span>
            <span className="font-sans text-note leading-[1.6] text-body">{lacksDoor ? t.needDoorBody : t.notFoundBody}</span>
            <button
              type="button"
              onClick={() => setManual({ line1: term, postalCode: '', city: '' })}
              className={`w-max cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
            >
              {t.manualOpen}
            </button>
          </div>
        )}

        {manual && (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-sand-200 bg-card px-5 py-4.5">
            <span className="font-sans text-note font-bold text-ink">{t.manualTitle}</span>
            <FormInputField
              variant="inline"
              hideLabel
              label={t.line1}
              placeholder={t.line1}
              value={manual.line1}
              onChange={(e) => {
                const value = e.target.value;
                setManual((prev) => prev && { ...prev, line1: value });
              }}
              autoComplete="address-line1"
              name="address-line1"
            />
            <div className={['grid gap-2.5', compact ? 'grid-cols-[35%_1fr]' : 'grid-cols-[130px_1fr]'].join(' ')}>
              <FormInputField
                variant="inline"
                hideLabel
                label={t.postalCode}
                placeholder={t.postalCode}
                value={manual.postalCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setManual((prev) => prev && { ...prev, postalCode: value });
                }}
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
                name="postal-code"
              />
              <FormInputField
                variant="inline"
                hideLabel
                label={t.city}
                placeholder={t.city}
                value={manual.city}
                onChange={(e) => {
                  const value = e.target.value;
                  setManual((prev) => prev && { ...prev, city: value });
                }}
                autoComplete="address-level2"
                name="city"
              />
            </div>
          </div>
        )}

        {picked && (
          <div className="flex flex-col gap-1.75 rounded-2xl border border-olive-edge bg-olive-bg px-4.5 py-4">
            <span className="flex items-center gap-2 font-sans text-control text-olive-dark">
              <Icon name="check" size={15} className="flex-none" />
              {t.verified}
            </span>
            <span className="font-sans text-body font-bold text-ink">{picked.line1}</span>
            <span className="font-sans text-note text-body">
              {picked.postalCode} {picked.city}
            </span>
            {answer && (
              <DeliveryStrip inRoute={answer.inRoute}>
                <span>
                  {answer.inRoute
                    ? answer.nextDate
                      ? t.verifiedInRoute.replace('{date}', formatDeliveryDate(answer.nextDate, locale))
                      : t.verifiedInRouteNoDate
                    : t.verifiedShipping}
                </span>
              </DeliveryStrip>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.25">
          <span className="font-sans text-note font-bold text-ink">{t.kindLabel}</span>
          <div className={compact ? 'flex gap-2' : 'flex flex-wrap gap-2'}>
            <ChoiceChip size={compact ? 'segment' : 'choice'} label={t.kindHome} active={kind === 'home'} onSelect={() => setKind('home')} />
            <ChoiceChip size={compact ? 'segment' : 'choice'} label={t.kindWork} active={kind === 'work'} onSelect={() => setKind('work')} />
            <ChoiceChip size={compact ? 'segment' : 'choice'} label={t.kindOther} active={kind === 'other'} onSelect={() => setKind('other')} />
          </div>
          {kind === 'other' && (
            <div className="flex animate-fade-in flex-col gap-1.5 motion-reduce:animate-none">
              <FormInputField
                hideLabel
                label={t.otherPlaceholder}
                placeholder={t.otherPlaceholder}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                autoComplete="off"
                name="address-label"
              />
              <span className="font-sans text-micro text-muted">{t.otherHint}</span>
            </div>
          )}
        </div>

        {/* Kurye notu için kolon yok; o yerde alıcı adı durur. */}
        <div className={compact ? 'flex flex-col gap-2.5' : 'grid grid-cols-[180px_1fr] gap-2.5'}>
          <FormInputField
            hideLabel
            label={t.line2}
            placeholder={t.line2}
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            autoComplete="address-line2"
            name="address-line2"
          />
          <FormInputField
            hideLabel
            label={t.recipient}
            placeholder={t.recipient}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoComplete="name"
            name="recipient"
          />
        </div>
        {/* Numara ülke içi yazılır; kod seçili ülkeden gelir ve kayıtta birleştirilir. */}
        <FormInputField
          hideLabel
          label={t.phone}
          placeholder={`${t.phone} (${DIAL_CODE[country]})`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel-national"
          name="phone"
        />

        {/* Mobil webde iki rol satırın kendi eylemleriyle verilir, native adres çekmecesi gibi. */}
        {defaultChoice && !compact && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              className="size-[22px] flex-none cursor-pointer rounded-[6px] accent-olive"
            />
            <span className="font-sans text-body-sm text-ink">{t.makeDefault}</span>
          </label>
        )}

        {/* Ayrı kutu: "mal nereye" ile "fatura nereye" iki ayrı soru. */}
        {billingChoice && !compact && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={makeBilling}
              onChange={(e) => setMakeBilling(e.target.checked)}
              className="size-[22px] flex-none cursor-pointer rounded-[6px] accent-olive"
            />
            <span className="font-sans text-body-sm text-ink">{t.makeBilling}</span>
          </label>
        )}

        {error && (
          <p role="alert" className="font-sans text-note font-semibold text-terracotta">
            {error}
          </p>
        )}

        {actions}
      </div>
    </div>
  );

  /** Çekmece kararı formda, çağıranda değil: yoksa aynı `Dialog` kurulumu her çağıranda yazılırdı. `onCancel` çekmecenin de kapanışıdır. */
  if (!compact) return body;
  return (
    <Dialog
      title={initial ? copy.editTitle : copy.newTitle}
      description={initial ? undefined : copy.newBody}
      closeLabel={places.close}
      onClose={onCancel}
      placement="sheet"
    >
      {body}
    </Dialog>
  );
}
