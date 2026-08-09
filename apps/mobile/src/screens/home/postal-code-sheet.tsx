import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { maskPostalCode, POSTAL_CODE_LENGTH, usePlaceResolution } from '@/lib/places/use-place-resolution.hook';

/*
  TESLİMAT BÖLGESİ ÇEKMECESİ (v3 `shZip`, açan `pillTap`) — vitrin başlığındaki "67000 STRASBOURG ▾"
  hapına dokununca aşağıdan açılır: posta kodu alanı → çözüm notu → Kaydet.

  ÇEKMECENİN KENDİSİ KİTİN (`BottomSheet`): örtü, tutamak, sürükleyip kapatma ve açılış/kapanış
  eğrileri orada tek kopya durur (09.08'de gerçek animasyona kavuştu). Burada yalnız İÇERİK var.

  YER ÇÖZÜMÜ ORTAK KAPIDAN (`lib/places`): onboarding'in posta kodu adımıyla AYNI soru, aynı
  davranış — kod beş haneye ulaşınca sorulur, kod değişince eski cevap anında düşer.

  TASLAK YERELDİR: yazılan kod ancak KAYDET ile saklanır. Çekmece her açılışta saklı koddan
  başlar — yarım bırakılmış bir düzenleme, bir sonraki açılışta "kayıtlı değer" gibi görünmemeli.

  KAYDET BEŞ HANEDEN ÖNCE KAPALI: eksik kod bir yer anahtarı değildir (`place-api.schema` künyesi:
  saklanan şey `country` + normalize `postalCode` ikilisidir) ve kaydedilirse vitrin başlığı
  çözülemeyecek bir kodu gösterirdi. Tasarım düğmeyi hep açık çiziyor; fark bir görsel karar değil,
  veri bütünlüğü.
*/

/** Çekmecenin metinleri — i18n üstte çözülür (komponent metin gömmez). */
interface PostalCodeSheetCopy {
  title: string;
  field: string;
  placeholder: string;
  save: string;
  insideNote: string;
  shippingNote: string;
  ambiguousNote: string;
  unknownNote: string;
  unresolvedNote: string;
  /** Girişli müşteriye: bu kod yalnız gezinme içindir, siparişte kayıtlı adres kullanılır. */
  browsingOnly: string;
}

interface PostalCodeSheetProps {
  visible: boolean;
  /** Saklı posta kodu — çekmece her açılışta buradan başlar. */
  code: string | null;
  /**
   * Müşteri girişli mi. YALNIZ bir cümleyi açar (`browsingOnly`), davranışı DEĞİŞTİRMEZ: çekmece
   * her hâlde açılır ve her hâlde kaydeder (kullanıcı kararı 09.08 — `home-screen` künyesi).
   * Girişlide kayıtlı bir adres de var, o yüzden iki bilginin hangisinin ne zaman kullanıldığı
   * söylenir; söylenmezse müşteri buradan girdiği kodu teslimat adresi sanır.
   */
  signedIn: boolean;
  copy: PostalCodeSheetCopy;
  onSave: (code: string) => void;
  onClose: () => void;
}

export function PostalCodeSheet({ visible, code, signedIn, copy, onSave, onClose }: PostalCodeSheetProps) {
  const [draft, setDraft] = useState(code ?? '');
  // Açılışta saklı değere dönülür (künye: yarım kalmış düzenleme taşınmaz).
  useEffect(() => {
    if (visible) setDraft(code ?? '');
  }, [code, visible]);

  const place = usePlaceResolution(draft);
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

  return (
    <BottomSheet visible={visible} title={copy.title} onClose={onClose} testID="home-zip-sheet">
      <TextField
        value={draft}
        onChangeText={(value) => setDraft(maskPostalCode(value))}
        accessibilityLabel={copy.field}
        placeholder={copy.placeholder}
        content="postalCode"
        numeric
        testID="home-zip-field"
      />
      {placeName === null ? null : (
        <Text style={styles.place} testID="home-zip-place">
          {draft} · {placeName}
        </Text>
      )}
      {!signedIn ? null : (
        <Text style={styles.browsing} testID="home-zip-browsing">
          {copy.browsingOnly}
        </Text>
      )}
      {note === null ? null : (
        <Text style={[styles.note, inRoute ? styles.noteInside : styles.noteShipping]} testID="home-zip-note">
          {note}
        </Text>
      )}
      <PrimaryButton
        label={copy.save}
        onPress={() => onSave(draft)}
        disabled={draft.length < POSTAL_CODE_LENGTH}
        testID="home-zip-save"
      />
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
