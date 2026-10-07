import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { maskPostalCode, POSTAL_CODE_LENGTH } from '@lezzet/address';
import { placeAnswerNote } from '@lezzet/domain-core';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
import messages from '@lezzet/i18n/customer/place';
import { usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { CountryChips } from './country-chips';
import { usePostalSuggest } from './use-postal-suggest.hook';

/*
  Teslimat bölgesi çekmecesi: vitrin başlığındaki posta kodu hapına dokununca açılır (ülke ve posta kodu → çözüm notu → Kaydet); üç çağıran aynı
  soruyu sorduğu için metin, kayıt ve kimlik buradadır ve yer çözümü onboarding'in posta kodu adımıyla aynı kapıdan gelir. Taslak yereldir,
  Kaydet beş haneden önce kapalıdır ve "Nerelere gidiyorsunuz?" bağlantısı prop'la açılır, çünkü bölgeler sayfasından açılınca ölü kapı
  olurdu.
*/

type Messages = LocalizedCopy<typeof messages>;

interface PostalCodeSheetProps {
  visible: boolean;
  /** Saklı posta kodu — çekmece her açılışta buradan başlar; `null` = kod hiç girilmemiş. */
  code: string | null;
  /** Saklı kodun ülkesi; yoksa çekmece Fransa seçili açılır. */
  country: Country | null;
  /** Kapanış: örtü, sürükleme, Android geri VE kaydetme sonrası — çağıran çekmecesini kapatır. */
  onClose: () => void;
  /** "Nerelere gidiyorsunuz?" bağlantısı çizilsin mi — teslimat bölgeleri sayfasında `false` (künye). */
  showZonesLink: boolean;
  /** Alt öğelerin test kimlikleri bundan TÜREtilir — üç çağıran aynı çekmeceyi açıyor. */
  testID?: string;
}

export function PostalCodeSheet({ visible, code, country, onClose, showZonesLink, testID }: PostalCodeSheetProps) {
  const locale = useAppLocale();
  const router = useRouter();
  const t: Messages = messages[locale];
  const copy = t.zip;
  /* Girişli mi yalnız bir cümleyi açar, davranışı değiştirmez: girişlide kayıtlı adres de vardır ve söylenmezse müşteri buraya girdiği kodu
     teslimat adresi sanırdı. */
  const meState = useMe();
  const signedIn = meState.status === 'ready' && meState.me !== null;

  const [draft, setDraft] = useState(code ?? '');
  const [selectedCountry, setSelectedCountry] = useState<Country>(country ?? 'FR');
  /* Öneri listesi yalnız yazarken ve eksik kodda görünür: beş haneden sonra soruyu yer çözümü cevaplar. Seçim kodu ülkesiyle birlikte
     doldurur, çünkü aynı kod iki ülkede de bulunabilir. */
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Açılışta saklı değere dönülür (künye: yarım kalmış düzenleme taşınmaz); liste kapalı başlar.
  useEffect(() => {
    if (visible) {
      setDraft(code ?? '');
      setSelectedCountry(country ?? 'FR');
      setSuggestOpen(false);
    }
  }, [code, country, visible]);
  const suggestions = usePostalSuggest(draft, { enabled: visible && suggestOpen });

  /** Aynı kod iki ülkede geçerli olabiliyor; satır anahtarı adres formundakiyle aynı gerekçeyle ikili. */
  const suggestionKey = (country: string, postalCode: string) => `${country}:${postalCode}`;

  const typeCode = (value: string) => {
    const masked = maskPostalCode(value);
    setDraft(masked);
    setSuggestOpen(masked.length < POSTAL_CODE_LENGTH);
  };

  const applySuggestion = (id: string) => {
    const picked = suggestions.find((option) => suggestionKey(option.country, option.postalCode) === id);
    if (picked === undefined) return;
    setSuggestOpen(false);
    setDraft(picked.postalCode);
    setSelectedCountry(picked.country);
  };

  /* Bekleyiş bayrağı hook'tan gelir, TÜRETİLMEZ: `place === null` "istek düştü" hâlini de kapsıyor
     ve türetilmiş bir bayrak orada sönmezdi — iskelet ebediyen dönerdi (künyesi hook'ta). */
  const { place, pending } = usePlaceLookup(draft, selectedCountry);
  /* İskelet çubuklarının boyu metin kademesinden okunur, sabit yazılmaz: yazı boyutu büyütülünce bekleyiş de cevapla birlikte büyür. */
  const { theme } = useUnistyles();
  const inRoute = place?.kind === 'resolved' && place.place.inRoute;
  const placeName = place?.kind === 'resolved' ? place.place.placeName : null;
  const note = place === null ? null : copy[`${placeAnswerNote(place)}Note`];

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  const save = () => {
    onClose();
    /* Kaydın ÖTEKİ alanları korunur: bu çekmece yalnız posta kodunu değiştirir. Kayıt yoksa
       (onboarding atlanmış olsa bile kapı geçilmiş demektir) `done: true` yazılır — aksi hâlde
       bir sonraki açılış kullanıcıyı akışa geri fırlatırdı. */
    /* Dil CANLI kaynaktan yazılır, kayıttaki eski değerden değil: kayıttaki dil akışın İZİdir
       (onboarding'in yapıldığı andaki dil). Kullanıcı sonradan dilini değiştirdiyse onu geri
       yazmak, ayarı sessizce eski hâline döndürürdü. */
    void saveOnboarding({ done: true, locale, postalCode: draft, country: selectedCountry });
    toastSuccess(copy.saved);
  };

  /* Bağlantı önce ÇEKMECEYİ KAPATIR: açık bir katmanın altına yeni bir ekran itmek, geri
     dönüldüğünde kimsenin beklemediği bir çekmece bırakırdı. */
  const openZones = () => {
    onClose();
    router.push('/delivery-zones');
  };

  return (
    <BottomSheet visible={visible} title={copy.title} onClose={onClose} testID={idOf('sheet')}>
      <CountryChips value={selectedCountry} onChange={setSelectedCountry} testIDPrefix={`${testID ?? 'zip'}-country`} />
      <TextField
        value={draft}
        onChangeText={typeCode}
        accessibilityLabel={copy.field}
        placeholder={copy.placeholder}
        content="postalCode"
        numeric
        testID={idOf('field')}
      />
      {/* Kod önerileri — künye satırı YOK: veri kendi referansımız (adres formundaki kod
          listesiyle aynı gerekçe), Etalab yükümlülüğü yalnız BAN listesinindir. */}
      {!suggestOpen ? null : (
        <SuggestionList
          items={suggestions.map((option) => ({
            id: suggestionKey(option.country, option.postalCode),
            title: `${option.postalCode} · ${option.country}`,
            // Ad yoksa alt satır çizilmez — uydurulacak ad yok (adres formunun künyesi).
            subtitle: option.places.length === 0 ? undefined : option.places.join(', '),
          }))}
          onSelect={applySuggestion}
          accessibilityLabel={copy.suggestLabel}
          testID={idOf('suggestions')}
        />
      )}
      {/* Cevap beklenirken iskelet çizilir, onboarding'in posta kodu adımıyla aynı; iskelet cevabın şeklini taklit eder ki cevap gelince
          çekmece yeniden düzenlenmesin. */}
      {pending ? (
        <View style={styles.skeleton} testID={idOf('skeleton')}>
          <Skeleton width={140} height={theme.text.control} radius="badge" />
          <Skeleton width="100%" height={theme.text.note} radius="badge" tone="soft" />
        </View>
      ) : null}
      {placeName === null ? null : (
        <Text style={styles.place} testID={idOf('place')}>
          {draft} · {placeName}
        </Text>
      )}
      {!signedIn ? null : (
        <Text style={styles.browsing} testID={idOf('browsing')}>
          {copy.browsingOnly}
        </Text>
      )}
      {note === null ? null : (
        <Text style={[styles.note, inRoute ? styles.noteInside : styles.noteShipping]} testID={idOf('note')}>
          {note}
        </Text>
      )}
      <PrimaryButton
        label={copy.save}
        onPress={save}
        disabled={draft.length < POSTAL_CODE_LENGTH}
        testID={idOf('save')}
      />
      {!showZonesLink ? null : (
        <View style={styles.zonesRow}>
          <TextAction label={t.placeNotice.zones} onPress={openZones} testID={idOf('zones')} />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Gezinme uyarısı — bir DURUM değil bir açıklama; yer notlarının renk ailesine girmez. */
  browsing: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  place: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  /* İskeletin iki çubuğu, yerini tuttukları iki metnin ritmini taşır — cevap gelince hiçbir şey
     oynamasın. Çekmecenin kendi dikey boşluğu zaten kapsayıcıdan geliyor, burada yalnız çubuk arası. */
  skeleton: { gap: theme.space.xs },
  /** İkinci yol düğmenin ALTINDA ve ortada: bir kapı değil, aynı sorunun öteki yüzü. */
  zonesRow: { alignItems: 'center' },
  note: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    lineHeight: theme.text['field-label'] * theme.text['lead--line-height'],
  },
  /** Rota içi: olumlu cevap zeytin tonunda. */
  noteInside: { color: theme.colors['olive-dark'] },
  /** Öteki üç hâl nötr gövde tonunda — bir kapı değil, bir bilgi. */
  noteShipping: { color: theme.colors.muted },
}));
