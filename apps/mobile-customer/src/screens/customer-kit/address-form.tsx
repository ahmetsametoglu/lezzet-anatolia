import {
  addressLabelKind,
  addressTitle,
  hasHouseNumber,
  MIN_QUERY_LENGTH,
  POSTAL_CODE_PATTERN,
  type AddressLabelKind,
} from '@lezzet/address';
import { DIAL_CODE, nationalPhone, normalizePhone } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import addressCopy from '@lezzet/i18n/customer/address';
import placeCopy from '@lezzet/i18n/customer/place';
import { CountryEnum, type Country } from '@lezzet/types';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { SuggestionList } from '@/components/ui/suggestion-list';
import {
  createAddress,
  deleteAddress,
  locateAddress,
  resolveAddressOption,
  updateAddress,
  type AddressWrite,
  type CheckedPoint,
  type LookupAddress,
  type MeAddress,
} from '@/lib/api/addresses';
import { randomKey } from '@/lib/random-key';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { ChannelBadge } from './channel-badge';
import { selectDeliveryAddress } from './delivery-address-store';
import { useAddressLookup } from './use-address-lookup.hook';
import { useDoorCodes } from './use-door-codes.hook';

/*
  Web adres penceresiyle aynı akış ve metin; öneri ve seçim ülkeden bağımsız tek kapıdan gelir, sağlayıcıyı sunucu seçer. Elle
  girilen adres kaydetmeden önce doğrulanır, bulunamazsa yine kaydedilir ve noktasını tarama arar, çünkü defter hiçbir adresi reddetmez.
*/

/** Kural ortak adres paketinde; dört çağıran onu buradan okumaya devam eder. */
export { addressDefaultsOf } from '@lezzet/address';

type AddressCopy = LocalizedCopy<typeof addressCopy>;
type PlaceCopy = LocalizedCopy<typeof placeCopy>;

/** Google künye görselinin kendi oranı (98×18'lik logonun 3 katı: 294×54 piksel). */
const GOOGLE_LOGO_RATIO = 294 / 54;

interface AddressFormProps {
  /** Düzenlenen adres; `null` = yeni adres (silme bağlantısı da yalnız düzenlemede çıkar). */
  editing: MeAddress | null;
  /** Yeni adresin kimliği bu listeyle farktan çözülür: uçlar tek adres değil güncel listeyi döndürür. */
  addresses: MeAddress[];
  /** `addresses` uçtan dönen güncel liste; `savedId` silmede `null`. */
  onSaved: (addresses: MeAddress[], savedId: string | null) => void;
  /** Kaydet düğmesinin metni; verilmezse "Adresi kaydet ve seç" (düzenlemede "Adresi kaydet"). */
  saveLabel?: string;
  /** Kapanma animasyonu boyunca ayakta duran çekmece `false` geçer; görünmeyen formun sorgusu ağa çıkmaz. */
  active?: boolean;
  /** Prop, çünkü dört çağıran profili zaten okuyor ve formu oturuma bağlamak onu test edilemez kılardı. */
  defaults?: { recipient: string; phone: string };
}

/** Seçilen, doğrulanmış adres — kodu ve şehri kesin, noktası kaynağıyla. */
interface Picked {
  line1: string;
  postalCode: string;
  city: string;
  point: CheckedPoint;
}

interface ManualDraft {
  line1: string;
  postalCode: string;
  city: string;
}

export function AddressForm({ editing, addresses, onSaved, saveLabel, active = true, defaults }: AddressFormProps) {
  const locale = useAppLocale();
  const { theme } = useUnistyles();
  const copy: AddressCopy = addressCopy[locale];
  const t = copy.form;
  const place: PlaceCopy = placeCopy[locale];
  // Yeni adres "Ev" seçili açılır (tasarım); düzenlemede kayıtlı başlıktan çıkarılır.
  const start = editing === null ? { kind: 'home' as const, custom: '' } : addressLabelKind(editing.label, t);

  const [country, setCountry] = useState<Country>(editing?.country ?? 'FR');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [manual, setManual] = useState<ManualDraft | null>(
    editing === null ? null : { line1: editing.line1, postalCode: editing.postalCode, city: editing.city },
  );
  const [kind, setKind] = useState<AddressLabelKind>(start.kind);
  const [custom, setCustom] = useState(start.custom);
  const [line2, setLine2] = useState(editing?.line2 ?? '');
  /* `null` "müşteri dokunmadı" demektir ve görünen değer hesabınkine düşer. Efektle doldurulmaz: çekmece `/me` cevabından önce
     açılabilir ve efekt müşterinin o arada yazdığını ezerdi. */
  const [recipientDraft, setRecipient] = useState<string | null>(editing?.recipient ?? null);
  // Numara ülke içi yazımla gösterilir; ülke kodu seçili ülkeden gelir ve kayıtta birleştirilir.
  const [phoneDraft, setPhone] = useState<string | null>(editing === null ? null : nationalPhone(editing.phone, editing.country));
  /** Google'ın ücret oturumu: yazma boyunca aynı, seçimle biter. BAN kullanmaz. */
  const [sessionToken, setSessionToken] = useState(randomKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = query.trim();
  const searchOn = active && picked === null;
  const found = useAddressLookup(query, { country, enabled: searchOn, sessionToken, locale });
  const doorOf = useDoorCodes(active);
  // "Bulamadık" yalnız cevap BU sorgu için geldiyse — yoksa yazarken kutu yanıp sönerdi.
  const notFound =
    searchOn && manual === null && term.length >= MIN_QUERY_LENGTH && found.term === term && found.options.length === 0 && !found.busy;
  /* Öneriler yalnız kapı düzeyinde olduğundan numarasız sokak sonuç vermez; "bulamadık" demek var olan sokağı yok saymak olurdu. */
  const lacksDoor = !hasHouseNumber(term);

  const recipient = recipientDraft ?? defaults?.recipient ?? '';
  const phone = phoneDraft ?? defaults?.phone ?? '';
  const label = kind === 'home' ? t.kindHome : kind === 'work' ? t.kindWork : custom.trim() || null;
  const manualReady =
    manual !== null && manual.line1.trim() !== '' && POSTAL_CODE_PATTERN.test(manual.postalCode) && manual.city.trim() !== '';
  // Alıcı ve telefon olmadan kurye kapıya gidemez; sokak ve kod olmadan adres adres değildir.
  const complete = (picked !== null || manualReady) && recipient.trim() !== '' && phone.trim() !== '';

  const choose = (address: LookupAddress): void => {
    /* Kod ya da şehir gelmediyse (Google bazı sonuçlarda vermiyor) seçim yarımdır: bilinenle elle giriş
       kartı açılır, müşteri tamamlar; kaydederken yine doğrulanır. */
    if (address.postalCode === null || address.city === null) {
      setManual({ line1: address.line1, postalCode: address.postalCode ?? '', city: address.city ?? '' });
      return;
    }
    setPicked({ line1: address.line1, postalCode: address.postalCode, city: address.city, point: address.point });
    setManual(null);
    setQuery(address.line1);
  };

  const pick = (id: string): void => {
    const option = found.options.find((row) => row.id === id);
    if (option === undefined) return;
    setError(null);
    // Öneride tam adresi veren sağlayıcıda (BAN) ikinci adım yok.
    if (option.address !== null) {
      choose(option.address);
      return;
    }
    setBusy(true);
    void resolveAddressOption({ country, id, sessionToken, locale }).then((result) => {
      // Oturum seçimle biter; sonraki yazma yeni bir oturumdur (ücret oturum kademesinden).
      setSessionToken(randomKey());
      setBusy(false);
      if (result.error !== null || result.data === null) {
        setManual({ line1: option.title, postalCode: '', city: '' });
        return;
      }
      choose(result.data);
    });
  };

  // Ülke değişince arama ve seçim düşer: öneri ve doğrulama o ülkede yapılır.
  const changeCountry = (next: Country): void => {
    if (next === country) return;
    setCountry(next);
    setQuery('');
    setPicked(null);
  };

  const save = async (): Promise<void> => {
    const base =
      picked ??
      (manual !== null && manualReady
        ? { line1: manual.line1.trim(), postalCode: manual.postalCode, city: manual.city.trim(), point: null }
        : null);
    if (base === null || !complete) return;
    setBusy(true);
    setError(null);
    /* Düğme HER HÂLDE geri açılır: bir çağrı beklenmedik biçimde düşerse çekmece kilitli kalmasın. */
    try {
      const checked =
        base.point === null
          ? await locateAddress({ line1: base.line1, postalCode: base.postalCode, city: base.city, country })
          : null;
      const point = base.point ?? (checked !== null && checked.error === null ? checked.data : null);
      const body: AddressWrite = {
        label,
        recipient: recipient.trim(),
        /* E.164'e İSTEMCİDE indirgenir, web ile AYNI kapıdan; çözülemezse yazılan metin OLDUĞU GİBİ
           gider — defter reddetmez ve elde bir numara olması, hiç olmamasından iyidir. */
        phone: normalizePhone(phone, country) ?? phone.trim(),
        line1: base.line1,
        line2: line2.trim() === '' ? null : line2.trim(),
        postalCode: base.postalCode,
        city: base.city,
        country,
        ...(point === null ? {} : { point }),
      };
      const knownIds = new Set(addresses.map((address) => address.id));
      const result = editing === null ? await createAddress(body) : await updateAddress(editing.id, body);
      if (result.error !== null) {
        setError(result.status === 401 ? copy.errors.session_expired : copy.errors.unexpected);
        return;
      }
      const savedId = editing?.id ?? result.data.find((address) => !knownIds.has(address.id))?.id ?? null;
      if (editing === null && savedId !== null) {
        selectDeliveryAddress(savedId);
        toastSuccess(copy.savedToast.replace('{name}', addressTitle({ label, city: base.city })));
      }
      onSaved(result.data, savedId);
    } finally {
      setBusy(false);
    }
  };

  const remove = (): void => {
    if (editing === null) return;
    setBusy(true);
    void deleteAddress(editing.id).then((result) => {
      setBusy(false);
      if (result.error !== null) {
        setError(copy.errors.unexpected);
        return;
      }
      onSaved(result.data, null);
      toastSuccess(t.deleted);
    });
  };

  /** Kodun bize göre cevabı — bölge listesi yoksa (okunamadı) rozet ÇİZİLMEZ; bilinmeyen söylenmez. */
  const badgeOf = (postalCode: string | null) => {
    if (postalCode === null || doorOf === null) return undefined;
    const door = doorOf(country, postalCode);
    return <ChannelBadge door={door} label={door ? place.channelDoor : place.channelShip} />;
  };
  const pickedDoor = picked !== null && doorOf !== null ? doorOf(country, picked.postalCode) : null;

  return (
    <View style={styles.form}>
      {/* ÖNCE ÜLKE: öneri ve doğrulama seçilen ülkede yapılır. */}
      <View style={styles.group}>
        <Text style={styles.eyebrow}>{t.countryLabel}</Text>
        <View style={styles.chipRow}>
          {CountryEnum.options.map((code) => (
            <Chip
              key={code}
              grow
              label={code === 'DE' ? place.countryDE : place.countryFR}
              selected={country === code}
              onPress={() => changeCountry(code)}
              testID={`address-country-${code}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <TextField
          value={query}
          onChangeText={(next) => {
            setQuery(next);
            setPicked(null);
            setError(null);
          }}
          label={t.searchLabel}
          accessibilityLabel={t.searchLabel}
          placeholder={country === 'DE' ? t.searchPlaceholderDE : t.searchPlaceholderFR}
          icon="search"
          accent
          content="streetAddress"
          testID="address-search"
        />
        {searchOn && term.length > 0 && term.length < MIN_QUERY_LENGTH ? (
          <Text style={styles.hint}>{t.searchHint.replace('{n}', String(MIN_QUERY_LENGTH))}</Text>
        ) : null}
      </View>

      {searchOn ? (
        <SuggestionList
          items={found.options.map((option) => ({
            id: option.id,
            title: option.title,
            subtitle: option.subtitle ?? undefined,
            badge: badgeOf(option.address?.postalCode ?? null),
          }))}
          onSelect={pick}
          icon="pin"
          /* Künye kaynağın şartı: BAN'da lisans cümlesi, Google'da haritasız gösterimin zorunlu logosu. */
          footnote={
            country === 'DE' ? (
              <Image
                // Statik varlık Metro'da `require` ile yüklenir (onboarding ve login ekranındaki hükümle aynı):
                // kural TS import disiplinine bakıyor, varlık yolunu bilmiyor.
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                source={require('../../../assets/images/google-maps-attribution.png')}
                style={styles.googleLogo}
                accessibilityLabel="Google Maps"
              />
            ) : (
              t.suggestCredit
            )
          }
          accessibilityLabel={t.suggestLabel}
          testID="address-suggestions"
        />
      ) : null}
      {/* Kota doldu: tek satır söylenir ve BİTER — elle giriş açık; bir hata değil, kırmızı değil. */}
      {searchOn && found.busy ? <Note tone="warm" description={t.suggestBusy} testID="address-suggest-busy" /> : null}

      {notFound ? (
        <Note
          tone="warm"
          title={lacksDoor ? t.needDoorTitle : t.notFoundTitle}
          description={lacksDoor ? t.needDoorBody : t.notFoundBody}
          action={
            <TextAction
              label={t.manualOpen}
              onPress={() => setManual({ line1: term, postalCode: '', city: '' })}
              testID="address-manual-open"
            />
          }
          testID="address-not-found"
        />
      ) : null}

      {manual === null ? null : (
        <View style={styles.card} testID="address-manual">
          <Text style={styles.fieldLabel}>{t.manualTitle}</Text>
          <TextField
            value={manual.line1}
            onChangeText={(next) => setManual((current) => current && { ...current, line1: next })}
            accessibilityLabel={t.line1}
            placeholder={t.line1}
            content="streetAddress"
            testID="address-line"
          />
          <View style={styles.zipRow}>
            <View style={styles.zipField}>
              <TextField
                value={manual.postalCode}
                onChangeText={(next) =>
                  setManual((current) => current && { ...current, postalCode: next.replace(/\D/g, '').slice(0, 5) })
                }
                accessibilityLabel={t.postalCode}
                placeholder={t.postalCode}
                content="postalCode"
                testID="address-zip"
              />
            </View>
            <View style={styles.cityField}>
              <TextField
                value={manual.city}
                onChangeText={(next) => setManual((current) => current && { ...current, city: next })}
                accessibilityLabel={t.city}
                placeholder={t.city}
                content="city"
                testID="address-city"
              />
            </View>
          </View>
        </View>
      )}

      {picked === null ? null : (
        <View style={styles.verified} testID="address-verified">
          <View style={styles.verifiedHead}>
            <Icon name="check" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            <Text style={styles.verifiedTitle}>{t.verified}</Text>
          </View>
          <Text style={styles.verifiedLine}>{picked.line1}</Text>
          <Text style={styles.verifiedPlace}>{`${picked.postalCode} ${picked.city}`}</Text>
          {pickedDoor === null ? null : (
            <Text style={styles.delivery} testID="address-delivery">
              {pickedDoor ? t.verifiedInRouteNoDate : t.verifiedShipping}
            </Text>
          )}
        </View>
      )}

      <View style={styles.group}>
        <Text style={styles.fieldLabel}>{t.kindLabel}</Text>
        <View style={styles.chipRow}>
          {(['home', 'work', 'other'] as const).map((option) => (
            <Chip
              key={option}
              grow
              label={option === 'home' ? t.kindHome : option === 'work' ? t.kindWork : t.kindOther}
              selected={kind === option}
              onPress={() => setKind(option)}
              testID={`address-kind-${option}`}
            />
          ))}
        </View>
        {kind === 'other' ? (
          <TextField
            value={custom}
            onChangeText={setCustom}
            accessibilityLabel={t.otherPlaceholder}
            placeholder={t.otherPlaceholder}
            accent
            helperText={t.otherHint}
            testID="address-label"
          />
        ) : null}
      </View>

      <TextField
        value={line2}
        onChangeText={setLine2}
        accessibilityLabel={t.line2}
        placeholder={t.line2}
        content="addressLine2"
        testID="address-line2"
      />
      {/* Kurye notu için kolon yok; o yuvada alıcı ve telefon durur. */}
      <TextField
        value={recipient}
        onChangeText={setRecipient}
        accessibilityLabel={t.recipient}
        placeholder={t.recipient}
        content="name"
        testID="address-recipient"
      />
      <TextField
        value={phone}
        onChangeText={setPhone}
        accessibilityLabel={t.phone}
        placeholder={`${t.phone} (${DIAL_CODE[country]})`}
        content="tel"
        testID="address-phone"
      />

      {error === null ? null : <Note description={error} tone="terracotta" testID="address-error" />}
      <PrimaryButton
        label={busy ? t.saving : (saveLabel ?? (editing === null ? t.saveAndSelect : t.save))}
        onPress={() => void save()}
        disabled={!complete || busy}
        testID="address-save"
      />
      {editing === null ? null : (
        <View style={styles.deleteRow}>
          <TextAction label={t.delete} onPress={remove} tone="terracotta" disabled={busy} testID="address-delete" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space['3xl'],
  },
  group: {
    gap: theme.space.md,
  },
  /* "ÜLKE" — tasarımın üst başlık dili (terracotta, açık harf aralığı), sepetin adres künyesiyle aynı kalıp. */
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow-xs--font-weight']],
    fontSize: theme.text['eyebrow-xs'],
    letterSpacing: theme.text['eyebrow-xs'] * 0.18,
    textTransform: 'uppercase',
    color: theme.colors.terracotta,
  },
  /** Satırı paylaşan seçim çipleri — ülke ikisi, etiket üçü eşit paylı (tasarım `flex:1`). */
  chipRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  fieldLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.ink,
  },
  hint: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /** Elle giriş kartı — kart zemini, kitin ince kenarı. */
  card: {
    gap: theme.space.lg,
    padding: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-200'],
    backgroundColor: theme.colors.card,
  },
  /* Posta kodu dar sabit sütun, şehir kalan genişlik. */
  zipRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  zipField: { width: 120 },
  cityField: { flex: 1 },
  /** "Adres doğrulandı" kartı — zeytin zemin ve kenar (tasarımın onay dili). */
  verified: {
    gap: theme.space.xs,
    padding: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['olive-edge'],
    backgroundColor: theme.colors['olive-bg'],
  },
  verifiedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  verifiedTitle: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  verifiedLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  verifiedPlace: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.body,
  },
  /** Teslim satırı: kartın içinde kum zeminli bant (tasarım `teslimYazi`). */
  delivery: {
    marginTop: theme.space['2xs'],
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['sand-50'],
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.body,
  },
  googleLogo: {
    height: theme.space['2xl'],
    aspectRatio: GOOGLE_LOGO_RATIO,
  },
  deleteRow: { alignItems: 'center' },
}));
