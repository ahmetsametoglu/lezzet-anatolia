import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
import messages from '@/lib/places/messages.json';
import { maskPostalCode, POSTAL_CODE_LENGTH, usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { toastSuccess } from '@/lib/toast/toast-store';
import { useMe } from './use-me.hook';
import { usePostalSuggest } from './use-postal-suggest.hook';

/*
  TESLİMAT BÖLGESİ ÇEKMECESİ (v3 `shZip`, açan `pillTap`) — vitrin başlığındaki "67000 STRASBOURG ▾"
  hapına dokununca aşağıdan açılır: posta kodu alanı → çözüm notu → Kaydet.

  ÇEKMECENİN KENDİSİ KİTİN (`BottomSheet`): örtü, tutamak, sürükleyip kapatma ve açılış/kapanış
  eğrileri orada tek kopya durur (09.08'de gerçek animasyona kavuştu). Burada yalnız İÇERİK var.

  VİTRİNDEN KİTE TAŞINDI (10.08): çağıranı üçe çıktı — vitrin başlığı, bölge dışı bilgi bandı
  (katalog · paketler) ve teslimat bölgeleri sayfası. Aynı soruyu soran ikinci bir çekmece
  YAZILMADI (CLAUDE §1); taşınırken üç şey içeri alındı ki çağıranlar aynı davranışı üç kez
  kurmasın:
    · METİN — sözlük yer ailesinin yanında (`lib/places/messages.json`), `copy` prop'u kalktı.
      Prop kalsaydı her çağıran kendi kopyasını taşırdı ve cümleler bir gün ayrışırdı.
    · KAYIT — kaydeden de burasıdır (`saveOnboarding` + onay toast'ı). Kaydı çağırana bırakmak,
      "kaydettikten sonra ne olur" sorusunu üç ekranda üç kez cevaplatırdı.
    · KİMLİK — girişli mi sorusunun cevabı kitin ORTAK durumundan (`useMe`), prop'tan değil.
  Geriye çağıranın gerçekten bildiği tek şey kaldı: çekmece açık mı, kapanınca ne olsun.

  YER ÇÖZÜMÜ ORTAK KAPIDAN (`lib/places`): onboarding'in posta kodu adımıyla AYNI soru, aynı
  davranış — kod beş haneye ulaşınca sorulur, kod değişince eski cevap anında düşer.

  TASLAK YERELDİR: yazılan kod ancak KAYDET ile saklanır. Çekmece her açılışta saklı koddan
  başlar — yarım bırakılmış bir düzenleme, bir sonraki açılışta "kayıtlı değer" gibi görünmemeli.

  KAYDET BEŞ HANEDEN ÖNCE KAPALI: eksik kod bir yer anahtarı değildir (`place-api.schema` künyesi:
  saklanan şey `country` + normalize `postalCode` ikilisidir) ve kaydedilirse vitrin başlığı
  çözülemeyecek bir kodu gösterirdi. Tasarım düğmeyi hep açık çiziyor; fark bir görsel karar değil,
  veri bütünlüğü.

  ── "NERELERE GİDİYORSUNUZ?" BURAYA TAŞINDI (kullanıcı kararı 10.08) ────────
  Bağlantı önce bilgi bandındaydı; kullanıcının gerekçesiyle çekmeceye alındı: kendi kodunu
  denemekle "siz nereye gidiyorsunuz" sorusu aynı sorunun iki yüzüdür, ikisi aynı yerde durmalı.
  ~~Panel bu yüzden `tall`.~~ Bir tur denendi ve kullanıcı cihazda görüp geri aldı (10.08): tek
  bağlantı için paneli tavana dayamak, altında kocaman boş bir alan bırakıyordu. Panel yeniden
  İÇERİK yüksekliğinde — çekmece taşıdığı kadar yer kaplar, kitin varsayılanı da budur.

  BAĞLANTI PROP'LA AÇILIR (`showZonesLink`), varsayılanı YOK — üç çağıranın üçü de niyetini
  yazmak zorunda. Sebebi teslimat bölgeleri sayfasıdır: çekmece ORADAN açıldığında bağlantı
  müşteriyi zaten durduğu sayfaya yollardı, yani ölü bir kapı olurdu. Sessizce her yerde
  göstermek bu ölü kapıyı kimsenin fark etmeyeceği bir yere saklamak olurdu.
*/

type Messages = LocalizedCopy<typeof messages>;

interface PostalCodeSheetProps {
  visible: boolean;
  /** Saklı posta kodu — çekmece her açılışta buradan başlar; `null` = kod hiç girilmemiş. */
  code: string | null;
  /** Kapanış: örtü, sürükleme, Android geri VE kaydetme sonrası — çağıran çekmecesini kapatır. */
  onClose: () => void;
  /** "Nerelere gidiyorsunuz?" bağlantısı çizilsin mi — teslimat bölgeleri sayfasında `false` (künye). */
  showZonesLink: boolean;
  /** Alt öğelerin test kimlikleri bundan TÜREtilir — üç çağıran aynı çekmeceyi açıyor. */
  testID?: string;
}

export function PostalCodeSheet({ visible, code, onClose, showZonesLink, testID }: PostalCodeSheetProps) {
  const locale = useAppLocale();
  const router = useRouter();
  const t: Messages = messages[locale];
  const copy = t.zip;
  /* GİRİŞLİ Mİ — YALNIZ bir cümleyi açar (`browsingOnly`), davranışı DEĞİŞTİRMEZ: çekmece her
     hâlde açılır ve her hâlde kaydeder (kullanıcı kararı 09.08 — `home-screen` künyesi).
     Girişlide kayıtlı bir adres de var, o yüzden hangi bilginin ne zaman kullanıldığı söylenir;
     söylenmezse müşteri buradan girdiği kodu teslimat adresi sanır. */
  const meState = useMe();
  const signedIn = meState.status === 'ready' && meState.me !== null;

  const [draft, setDraft] = useState(code ?? '');
  /* ÖNERİ LİSTESİ YALNIZ YAZARKEN VE YALNIZ EKSİK KODDA (kullanıcı kararı 26.08 — web
     `place-dialog` ile aynı davranış; ayrışma denetimin 25.08 kaydıydı). Beş haneye ulaşınca
     liste kapanır: o andan sonra soruyu yer ÇÖZÜMÜ cevaplıyor, aynı kodu bir de listede
     göstermek cevabın yanına kopyasını koymak olurdu. Seçim yalnız KODU doldurur — ülke burada
     saklanmıyor (kayıt `postalCode`tan ibaret) ve iki ülkede geçerli kodun ülkesi, adres
     girilirken netleşir (`ambiguousNote` zaten bunu söylüyor). */
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Açılışta saklı değere dönülür (künye: yarım kalmış düzenleme taşınmaz); liste kapalı başlar.
  useEffect(() => {
    if (visible) {
      setDraft(code ?? '');
      setSuggestOpen(false);
    }
  }, [code, visible]);
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
  };

  /* Bekleyiş bayrağı hook'tan gelir, TÜRETİLMEZ: `place === null` "istek düştü" hâlini de kapsıyor
     ve türetilmiş bir bayrak orada sönmezdi — iskelet ebediyen dönerdi (künyesi hook'ta). */
  const { place, pending } = usePlaceLookup(draft);
  /* İskelet çubuklarının boyu METİN KADEMESİNDEN okunur, sabit yazılmaz: yazı boyutu "Büyük"
     seçildiğinde bekleyiş de cevapla birlikte büyür (görev 21.38'in ölçtüğü merdivenin gereği). */
  const { theme } = useUnistyles();
  const inRoute = place?.kind === 'resolved' && place.place.inRoute;
  const placeName = place?.kind === 'resolved' ? place.place.placeName : null;
  const note =
    place === null
      ? null
      : place.kind === 'resolved'
        ? place.place.inRoute
          ? copy.insideNote
          : copy.shippingNote
        : place.kind === 'ambiguous'
          ? copy.ambiguousNote
          : place.kind === 'unknown'
            ? copy.unknownNote
            : copy.unresolvedNote;

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  const save = () => {
    onClose();
    /* Kaydın ÖTEKİ alanları korunur: bu çekmece yalnız posta kodunu değiştirir. Kayıt yoksa
       (onboarding atlanmış olsa bile kapı geçilmiş demektir) `done: true` yazılır — aksi hâlde
       bir sonraki açılış kullanıcıyı akışa geri fırlatırdı. */
    /* Dil CANLI kaynaktan yazılır, kayıttaki eski değerden değil: kayıttaki dil akışın İZİdir
       (onboarding'in yapıldığı andaki dil). Kullanıcı sonradan dilini değiştirdiyse onu geri
       yazmak, ayarı sessizce eski hâline döndürürdü. */
    void saveOnboarding({ done: true, locale, postalCode: draft });
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
      {/* CEVAP BEKLENİRKEN İSKELET (kullanıcı isteği 13.08) — onboarding'in posta kodu adımıyla
          AYNI davranış. İki yüzey aynı soruyu soruyor ve aynı kapıdan cevap alıyor; birinde bekleyiş
          görünür öteki sessiz kalsaydı, aynı sistemin iki farklı hâli olurdu. İskelet cevabın
          ŞEKLİNİ taklit eder (kısa satır = yer adı, uzun satır = teslimat cümlesi), böylece cevap
          geldiğinde çekmece yeniden düzenlenmez. */}
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
  /** Rota içi: olumlu cevap zeytin tonunda (v3:1527 `sz.col`). */
  noteInside: { color: theme.colors['olive-dark'] },
  /** Öteki üç hâl nötr gövde tonunda — bir kapı değil, bir bilgi. */
  noteShipping: { color: theme.colors.muted },
}));
