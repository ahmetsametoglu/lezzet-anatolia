'use client';

import { useRef, useState } from 'react';
import { addressLabelKind, addressLineOf, hasHouseNumber, MIN_QUERY_LENGTH, type AddressLabelKind } from '@lezzet/address';
import { CountryEnum, type Address, type Country } from '@lezzet/types';
import { DIAL_CODE, nationalPhone, normalizePhone } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
import { ChoiceChip } from '@/components/customer/ui/choice-chip';
import { Dialog } from '@/components/customer/ui/dialog';
import { Icon } from '@/components/customer/ui/icons';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { useDismiss } from '@/components/customer/ui/use-dismiss.hook';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { checkAddressAction, resolveGermanAddressAction, type CheckedPoint } from '@/lib/address/lookup-actions';
import { useAddressSearch } from '@/lib/address/use-address-search.hook';
import { useGermanAddressSearch } from '@/lib/address/use-german-address-search.hook';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import { isValidPostalCode, type DeliveryPlace } from '@/lib/delivery/place-types';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { ChannelBadge } from './channel-badge';
import { DeliveryStrip } from './delivery-strip';
import { useDeliveryPlace } from './place-context';
import messages from '@lezzet/i18n/customer/address';
// Ülke adları: yer hapıyla ORTAK kaynak — iki sözlüğe kopyalamak bir gün iki ayrı ad demekti.
import placeCopy from './place-messages.json';

/**
 * K35 · Adres formu — **v1 adres penceresinin gövdesi** (13.09, kullanıcı kararı: görünümde birebir,
 * parçalar kitten) ve adres penceresi ile hesap sayfasının ORTAK parçası.
 *
 * Akış v1'in sırasıyla: ülke (Fransa | Almanya — önce ülke) → tek arama alanı → öneri listesi (FR BAN,
 * tarayıcıdan · DE Google Places, sunucudan) → seçilince "Adres doğrulandı" kutusu ve teslim şeridi;
 * öneri çıkmazsa "Bu adresi kayıtlarda bulamadık" → "Adresi elle gireyim" → elle giriş kartı → "Bu
 * adres ne?" (Ev · İş · Diğer + ad) → kapı / daire no → kaydet.
 *
 * ── ADRES DOĞRULAMA İKİ YOLDAN (13.09) ──────────────────────────────────────
 * Öneriden seçilen adres kaynağında doğrulanmıştır (BAN satırı · Google yer detayı) ve noktasıyla
 * gelir. Elle girilen adres KAYDETMEDEN önce doğrulanır — tarama işinin aynı kapısı
 * (`checkAddressAction` → `geocoder().locate`: FR BAN, DE Google Address Validation); bulunursa nokta
 * ve incelik kayda aday olarak gider, bulunamazsa adres yine kaydedilir ve noktasını tarama arar
 * (defter hiçbir hâlde reddetmez — kullanıcı kararı 10.08).
 *
 * ── v1'DEN VERİ FARKLARI ─────────────────────────────────────────────────
 *   · Alıcı adı ve telefon VAR (v1'de yok): ikisi de adresin zorunlu alanı (kullanıcı kararı 22.08);
 *     yeni adreste hesabın künyesiyle dolu açılır (`defaults`).
 *   · "Kuryeye not" YOK: adres tablosunda kolonu yok.
 *   · Almanya önerisinde teslim şekli rozeti YOK: Google satırı posta kodunu ayrı alan olarak vermiyor;
 *     kod seçimle gelir ve cevap doğrulama kutusunda yazılır.
 *   · "Varsayılan yap" ve "fatura adresim" kutuları hesap sayfasının kendi soruları.
 *
 * **Metin kendi sözlüğünden** (`@lezzet/i18n/customer/address` — native adres çekmecesiyle ORTAK, 21.313): form
 * bir sayfaya değil teslimat kitine ait.
 * Hesap sayfası ile adres penceresi aynı metni iki ayrı sözlükte taşıyordu (13.09 kopya bulgusu).
 */

export interface NewAddressInput {
  /** "Ev", "İş" — kart başlığı olur; boş bırakılabilir, o zaman şehir başlık olur. */
  label?: string;
  /**
   * Alıcı: adrese GİDEN kişi, hesabın sahibi olmak zorunda değil (hediye, iş adresi).
   *
   * **ZORUNLU oldu** (kullanıcı kararı 22.08 — *"her hâlükârda net bir şekilde bir teslimat kişisi
   * ve teslimat numarasına ihtiyacımız var"*). Kolaylık ön-doldurmada (`defaults`).
   */
  recipient: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  /** Teslimat telefonu — `recipient` ile aynı gerekçeyle ZORUNLU (22.08). */
  phone: string;
  /**
   * Adresin ülkesi — v1'de ÖNCE sorulur (13.09, kullanıcı kararı "önce ülke"): pencerenin ilk satırı
   * Fransa | Almanya, öneri ve doğrulama o ülkede yapılır. 19.8'in "ülke posta kodundan türer" kuralı
   * bu formda kalktı; telefonun ülke kodu da buradan gelir.
   */
  country?: Country;
  /**
   * Seçilen önerinin ya da doğrulamanın KOORDİNATI (11.9 · 13.09) — bir BEYAN değil bir ADAYDIR:
   * sunucu onu makullük süzgecinden geçirir (`resolveAddressPoint`) ve posta kodu merkezinden çok
   * uzaksa yazmaz. Süzgeçten düşerse satır tarama kuyruğuna girer. Kaynağıyla gelir (BAN / Google —
   * `CheckedPoint` künyesi): kaynaksız nokta `ban` sayılıyordu.
   */
  point?: CheckedPoint;
  makeDefault?: boolean;
  /**
   * "Fatura adresim yap" (kullanıcı kararı 08.09) — `makeDefault`ın ikizi, ayrı rol. Yalnız
   * kurumsal hesabın formunda sorulur (`billingChoice`); tabloda kolonu `is_billing` ve onu da
   * ayrı bir eylem yönetir (tek işaretli satır kuralı), form yalnız NİYETİ taşır.
   */
  makeBilling?: boolean;
}

/**
 * Formun çıktısı → adres alanları. Dönüşüm AÇIK yazılır (yayma ile değil): `NewAddressInput` formun
 * kendi sözleşmesi ve içinde `makeDefault` var — adres tablosunda öyle bir kolon yok, `is_default`
 * var ve onu ayrı bir eylem yönetiyor. Yayarak geçmek, kapının ayıklamasına güvenmek demekti.
 *
 * **Formun yanında durur, çağıranın içinde değil:** hesap sayfası ile adres penceresi aynı formu
 * kullanıyor ve aynı dönüşüme ihtiyaç duyuyor. İki kopya olsaydı biri yeni bir alan öğrenip öteki
 * öğrenmezdi — `recipient` ile `phone`ın bir kez sessizce düşmesi (28.07) tam olarak bu sınıftandı.
 */
export function toAddressFields(input: NewAddressInput) {
  return {
    label: input.label ?? null,
    recipient: input.recipient.trim(),
    line1: input.line1,
    line2: input.line2 ?? null,
    postalCode: input.postalCode,
    city: input.city,
    /**
     * ── TELEFON TEK BİÇİME İNDİRİLİYOR (kullanıcı kararı 21.08) ────────────────────────────
     * Telefon KİMLİK ANAHTARIDIR (`CHANNELS §3`) ve biçimi tutmayan anahtar eşleşmez: WhatsApp
     * konuşması, kurye araması ve bul-veya-oluştur hep bu numaradan gidiyor. Form ülke kodunu
     * SORMUYOR (ülke seçili, kod ondan), birleştirme burada yapılır.
     *
     * **Çözemezse HAM değeri korur, boşaltmaz:** anlaşılmayan bir numarayı silmek, "yazamadım"ı
     * "numara yok"a çevirmek olurdu (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
     */
    phone: normalizePhone(input.phone, input.country ?? 'FR') ?? input.phone.trim(),
    /* Kolon `not null`: form ülkeyi her zaman taşır (v1 — önce ülke); geri düşüş eski çağıranlar için. */
    country: input.country ?? ('FR' as const),
  };
}

/** Yeni adresin ön-dolu açılacağı iki alan — `AddressForm.defaults`in şekli. */
export interface AddressDefaults {
  recipient: string;
  phone: string;
}

/** Hesabın künyesinden adres varsayılanı; kural iki yüzeyin ortak adres paketinde, çağıranlar buradan okur. */
export { addressDefaultsOf } from '@lezzet/address';

/** DB satırı → formun beklediği şekil. Düzenlemede alanlar DOLU açılır; boş form yeniden yazdırırdı. */
export function toFormInput(address: Address): NewAddressInput {
  return {
    label: address.label ?? undefined,
    recipient: address.recipient,
    line1: address.line1,
    line2: address.line2 ?? undefined,
    postalCode: address.postalCode,
    city: address.city,
    /** Kayıtlı numara E.164; form ülke içi yazımı gösterir (kod ülkeden). Gidiş-dönüş kayıpsız. */
    phone: nationalPhone(address.phone, address.country),
    country: address.country,
    makeDefault: address.isDefault,
    makeBilling: address.isBilling,
  };
}

interface AddressFormProps {
  locale: Locale;
  /** Düzenlemede mevcut değerler; yeni adreste boş. */
  initial?: NewAddressInput;
  /**
   * YENİ adresin ön-dolu açılacağı künye — hesabın adı ve numarası (kullanıcı kararı 22.08).
   * `initial` varsa (düzenleme) BAKILMAZ: kayıtlı alıcının üstüne hesabın adını yazmak, hediye
   * adresine konmuş bir adı sessizce silmek olurdu.
   */
  defaults?: AddressDefaults;
  /**
   * "Fatura adresim yap" kutusu çizilsin mi — yalnız KURUMSAL hesabın adres kartı `true` geçer
   * (kullanıcı kararı 08.09). Varsayılan kapalı: formu çağıran her yer bilerek açar.
   */
  billingChoice?: boolean;
  onSave: (input: NewAddressInput) => Promise<void>;
  onCancel: () => void;
  /**
   * Kart çerçevesi çizilsin mi (yalnız masaüstü). Satır içi açılan form (hesap sayfası) kendi kartını
   * çizer; bir PENCERENİN içinde açılan form çizmez: pencere zaten bir kap.
   */
  frame?: boolean;
  /**
   * "Bu adresi varsayılan yap" kutusu sorulsun mu. Pencereden eklenen adres ZATEN seçili adres olur
   * (kaydetmek = seçmek — düğme de "Adresi kaydet ve seç" der); orada kutu cevapsız bir soru olurdu.
   */
  defaultChoice?: boolean;
  /** Mobil web forku — form bir ÇEKMECENİN içinde çizilir ve ikili satırlar tek sütuna iner (21.08). */
  compact?: boolean;
  /**
   * Kaydın hata cümlesi — ÇAĞIRANIN (sözlüğü onda). Formun içinde, kaydet düğmesinin hemen üstünde
   * çizilir: pencere de çekmece de aynı yerde gösterir. Önce pencere cümleyi formun ALTINA kendisi
   * basıyordu ve çekmecede (mobil web) hiç çizilmiyordu (14.09).
   */
  error?: string | null;
}

type Kind = AddressLabelKind;

/** Seçilen (doğrulanmış) adres — BAN satırından ya da Google yer detayından; noktasıyla gelir. */
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


export function AddressForm({ locale, initial, defaults, billingChoice = false, frame = true, defaultChoice = true, onSave, onCancel, compact = false, error = null }: AddressFormProps) {
  const copy = messages[locale];
  const t = copy.form;
  const places = placeCopy[locale];
  const { place } = useDeliveryPlace();
  // Yeni adreste v1 "Ev" seçili açılır; düzenlemede kayıtlı başlıktan çıkarılır.
  // Kayıtlı başlık → çip: ortak kural (`addressLabelKind`, native çekmeceyle aynı — 21.313).
  const start = initial ? addressLabelKind(initial.label, t) : { kind: 'home' as const, custom: '' };

  const [country, setCountry] = useState<Country>(initial?.country ?? place?.country ?? 'FR');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  // Düzenlemede kayıtlı satır ELLE GİRİŞ kartında açılır: kaynağında doğrulanıp doğrulanmadığını
  // bu an bilmiyoruz; "Adres doğrulandı" demek bilmediğimizi söylemek olurdu. Değiştirmek için arama açık.
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
  /** Google oturumu: yazma boyunca aynı jeton, seçimle biter (oturum kademesinden ücret — paket künyesi). */
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());

  const term = query.trim();
  const searchOn = picked === null;
  const ban = useAddressSearch(query, { enabled: searchOn && country === 'FR', near: place?.point ?? undefined });
  const google = useGermanAddressSearch(query, { enabled: searchOn && country === 'DE', sessionToken });
  const found = country === 'FR' ? ban : google;
  const throttled = country === 'FR' && ban.throttled;
  // "Bulamadık" yalnız cevap BU sorgu için geldiyse — yoksa yazarken kutu yanıp sönerdi.
  const notFound = searchOn && manual === null && term.length >= MIN_QUERY_LENGTH && found.term === term && found.suggestions.length === 0 && !throttled;
  /**
   * Yazılanda KAPI NUMARASI yok (posta kodu çıkarılınca rakam kalmıyor). Öneriler yalnız kapı düzeyinde
   * (kullanıcı kararı 14.09) ve numarasız sokak 0 sonuç veriyor: "bulamadık" demek var olan bir sokağı
   * yok saymak olurdu — kutu "kapı numarasını da yazın" der. Elle giriş yolu ikisinde de açık.
   */
  const lacksDoor = !hasHouseNumber(term);

  /**
   * ── ÖNERİLER MENÜ OLARAK AÇILIR (masaüstü · kullanıcı isteği 14.09) ──────────────────────────
   * Liste akışta dururken pencere her harfte uzayıp kısalıyordu; artık arama kutusunun altında formun
   * ÜSTÜNE açılıyor (`SuggestionList floating`). Yazınca ve alana basınca açılır; dışarı basınca,
   * Escape'le ya da odak kutudan çıkınca kapanır — Tab'la örtülen alana geçen müşterinin önünde menü
   * kalmasın. Mobil web çekmecesinde liste akışta kalır (tasarım kaynağı native uygulama, 08.58).
   */
  const floating = !compact;
  const [menuOpen, setMenuOpen] = useState(true);
  const searchBox = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listShown = searchOn && (!floating || menuOpen);
  const menuVisible = floating && listShown && found.suggestions.length > 0;
  useDismiss(searchBox, menuVisible, () => setMenuOpen(false));

  /**
   * Teslimat cevabı yerin ORTAK çözümünden (`resolvePlaceAction` — hapın da sorduğu motor), ama YALNIZ
   * SORULUR: seçim sitenin yerini değiştirmez. Yer adres KAYDEDİLİNCE değişir ("Adresi kaydet ve seç");
   * vazgeçen müşterinin yeri yerinde kalır.
   *
   * `setPostalCode` burada kullanılmaz: o kapı cevabı sitenin yeri olarak da yazar (çerez + tazeleme).
   * Adressiz müşteride ("+ Adres ekle") öneri seçmek yeri kayıttan önce değiştiriyordu; sepet yer
   * değişince yeniden okunuyor ve sepette açılan bu pencere kapanıyordu (yaşandı 14.09).
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
    // Nokta SEÇİLEN satırdan: müşterinin gözüyle onayladığı kapı, ikinci bir çağrı gerekmez.
    choose({ line1: addressLineOf(row), postalCode: row.postalCode, city: row.city, country: 'FR', point: { lat: row.latitude, lng: row.longitude, precision: row.kind, source: 'ban' } });
  };

  const pickGerman = async (placeId: string) => {
    setBusy(true);
    const resolved = await resolveGermanAddressAction({ placeId, sessionToken }).catch(() => null);
    // Oturum seçimle biter; sonraki yazma yeni bir oturumdur.
    setSessionToken(crypto.randomUUID());
    setBusy(false);
    // Kod ya da şehir gelmediyse (Google bazı sonuçlarda vermiyor — paket künyesi) seçim yarımdır:
    // bilinenle elle giriş kartı açılır, müşteri tamamlar; kaydederken yine doğrulanır.
    if (!resolved || !resolved.postalCode || !resolved.city) {
      setManual({ line1: resolved?.line1 ?? term, postalCode: resolved?.postalCode ?? '', city: resolved?.city ?? '' });
      return;
    }
    choose({
      line1: resolved.line1,
      postalCode: resolved.postalCode,
      city: resolved.city,
      country: 'DE',
      // Nokta Google'ın yer detayından: kaynak `google` — 30 gün kuralı bu etikete bakıyor.
      point: { lat: resolved.latitude, lng: resolved.longitude, precision: resolved.precision, source: 'google' },
    });
  };

  // Ülke değişince arama ve seçim düşer (v1): öneri ve doğrulama o ülkede yapılır.
  const changeCountry = (next: Country) => {
    if (next === country) return;
    setCountry(next);
    setQuery('');
    setPicked(null);
    setAnswer(null);
  };

  const label = kind === 'home' ? t.kindHome : kind === 'work' ? t.kindWork : custom.trim() || undefined;
  const manualReady = manual !== null && manual.line1.trim() !== '' && isValidPostalCode(manual.postalCode) && manual.city.trim() !== '';
  // Alıcı ve telefon olmadan kurye kapıya gidemez; sokak ve kod olmadan adres adres değildir (22.08).
  const complete = (picked !== null || manualReady) && recipient.trim() !== '' && phone.trim() !== '';

  const save = async () => {
    const base = picked ?? (manual && manualReady ? { line1: manual.line1.trim(), postalCode: manual.postalCode, city: manual.city.trim(), country } : null);
    if (!base || !complete) return;
    setBusy(true);
    /* Düğme HER HÂLDE geri açılır (`finally`). Kayıt çağrısı dönmediğinde — sunucuya ulaşılamadı,
       bağlantı koptu — düğme kilitli, pencere açık ve ekranda tek cümle olmadan kalıyordu (yaşandı
       14.09: dev sunucusu yeniden başlarken; kayıt sunucuya hiç ulaşmadı). Cümleyi çağıran kurar
       (`error`); reddi yakalamak da onun işi — form yalnız kilidi bırakır. */
    try {
      // Elle girilen adres kaydetmeden önce doğrulanır (künye); seçilen öneri noktasını zaten taşıyor.
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
          // Google önerisi haritasız gösterildiğinde logo ZORUNLU (Places kullanım koşulları).
          footnote={<img src="/attribution/google-maps.svg" alt="Google Maps" width={78} height={14} className="block" />}
          anchorRef={floating ? searchBox : undefined}
        />
      )}
    </>
  );

  const saveButton = (
    <Button disabled={!complete || busy} fullWidth={compact} onClick={() => void save()}>
      {defaultChoice ? t.save : t.saveAndSelect}
    </Button>
  );

  /**
   * Eylem satırı — v1: ince ayraç, solda "Vazgeç" (sessiz metin), sağda kaydet. **Çekmecede "Vazgeç"
   * YOK** (kullanıcı kararı 21.08): çekmece zaten üç kapanış yolu sunuyor (✕, örtü, Escape).
   */
  const actions = compact ? (
    saveButton
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
        {/* Önce ülke (v1): öneri ve doğrulama seçilen ülkede yapılır. */}
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

        {/* Arama kutusu — menü bu kutunun altına açılır (ekrana sabit, yeri kutudan ölçülür). Menü DOM'da kutunun
            İÇİNDE: Tab alandan satırlara geçer ve "dışarı basınca kapan" kutuyu kapsar. */}
        <div
          ref={searchBox}
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            // Menü açıkken Escape YALNIZ menüyü kapatır. Pencere Escape'i belgede dinliyor ve React'in kökü de
            // belgede: `stopPropagation` aynı düğümdeki pencere dinleyicisini durdurmaz, bütün pencere kapanırdı.
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
            // Kapanan menü alana basınca geri gelir; odağın alana dönmesi açmaz (Escape odağı buraya getirir).
            onClick={() => setMenuOpen(true)}
            placeholder={country === 'DE' ? t.searchPlaceholderDE : t.searchPlaceholderFR}
            icon={<Icon name="search" size={18} />}
            /* Tarayıcının kayıtlı adres önerisi SOKAK satırını doldursun (kullanıcı bulgusu 14.09): `off`u
               Chrome adres alanlarında yok sayıyor, etiketteki "posta kodu" yüzünden alanı posta kodu
               sanıp kod öneriyordu. Açık jeton sezgiyi ezer; doldurulan satır öneri aramasını da başlatır. */
            autoComplete="address-line1"
          />
          {searchOn && term.length > 0 && term.length < MIN_QUERY_LENGTH && (
            <span className="font-sans text-field-label font-normal text-muted">{t.searchHint.replace('{n}', String(MIN_QUERY_LENGTH))}</span>
          )}
          {floating && suggestionLists}
        </div>

        {/* Mobil webde liste akışta, kutunun ALTINDA — önceki yerleşimin aynısı. */}
        {!floating && suggestionLists}
        {/* Kota doldu (429): tek satır söylenir ve BİTER — elle giriş açık; bir hata değil, kırmızı değil. */}
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
          <div className="flex flex-wrap gap-2">
            <ChoiceChip label={t.kindHome} active={kind === 'home'} onSelect={() => setKind('home')} />
            <ChoiceChip label={t.kindWork} active={kind === 'work'} onSelect={() => setKind('work')} />
            <ChoiceChip label={t.kindOther} active={kind === 'other'} onSelect={() => setKind('other')} />
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

        {/* v1'in kapı satırı; kurye notunun yerinde alıcı adı (kolon zorunlu, not kolonu yok — künye). */}
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
        {/* Numara ülke içi yazılır; kod seçili ülkeden gelir ve kayıtta birleştirilir (`toAddressFields`). */}
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

        {defaultChoice && (
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

        {/* İkinci rol AYRI kutu (08.09): "malı nereye götürelim" ile "fatura nereye kesilecek" iki soru. */}
        {billingChoice && (
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

        {!compact && actions}
      </div>
    </div>
  );

  /**
   * ── ÇEKMECE KARARI FORMUN KENDİSİNDE, ÇAĞIRANLARDA DEĞİL (kullanıcı kararı 21.08) ────────────
   * Sarmalamayı çağıranlara bıraksaydık aynı `Dialog` kurulumu her çağıranda yazılırdı. Çağıran tek
   * bir şey söyler: `compact`. **`onCancel` çekmecenin de kapanışıdır** — ✕, örtü ve Escape oraya bağlı.
   */
  if (!compact) return body;
  return (
    <Dialog
      title={initial ? copy.editTitle : copy.newTitle}
      description={initial ? undefined : copy.newBody}
      closeLabel={places.close}
      onClose={onCancel}
      placement="sheet"
      footer={actions}
    >
      {body}
    </Dialog>
  );
}
