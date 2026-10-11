import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { POSTAL_CODE_LENGTH } from '@lezzet/address';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
import messages from '@lezzet/i18n/customer/place';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { PostalCodeFields } from './postal-code-fields';
import { usePostalCodeDraft } from './use-postal-code-draft.hook';

/*
  Teslimat bölgesi çekmecesi: vitrin başlığındaki posta kodu hapına dokununca açılır; üç çağıran aynı soruyu sorduğu için metin, kayıt ve
  kimlik buradadır. Kaydet beş haneden önce kapalıdır ve "Nerelere gidiyorsunuz?" bağlantısı prop'la açılır, çünkü bölgeler sayfasında ölü kapı olurdu.
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
  /** "Nerelere gidiyorsunuz?" bağlantısı çizilsin mi. */
  showZonesLink: boolean;
  /** Alt öğelerin test kimlikleri bundan türer — üç çağıran aynı çekmeceyi açıyor. */
  testID?: string;
}

export function PostalCodeSheet({ visible, code, country, onClose, showZonesLink, testID }: PostalCodeSheetProps) {
  const locale = useAppLocale();
  const router = useRouter();
  const t: Messages = messages[locale];
  const copy = t.zip;
  /* Girişli mi yalnız bir cümleyi açar: girişlide kayıtlı adres de vardır ve söylenmezse müşteri girdiği kodu teslimat adresi sanırdı. */
  const meState = useMe();
  const signedIn = meState.status === 'ready' && meState.me !== null;
  const form = usePostalCodeDraft(code, country, visible);

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  const save = () => {
    onClose();
    /* Kaydın öteki alanları korunur ve dil canlı kaynaktan yazılır: kayıttaki dil onboarding anının izidir, onu geri yazmak sonradan
       değiştirilmiş dili sessizce eskiye döndürürdü. */
    void saveOnboarding({ done: true, locale, postalCode: form.draft, country: form.country });
    toastSuccess(copy.saved);
  };

  /* Bağlantı önce çekmeceyi kapatır: açık bir katmanın altına yeni ekran itmek, geri dönülünce beklenmedik bir çekmece bırakırdı. */
  const openZones = () => {
    onClose();
    router.push('/delivery-zones');
  };

  return (
    <BottomSheet visible={visible} title={copy.title} onClose={onClose} testID={idOf('sheet')}>
      <PostalCodeFields
        form={form}
        aside={
          !signedIn ? null : (
            <Text style={styles.browsing} testID={idOf('browsing')}>
              {copy.browsingOnly}
            </Text>
          )
        }
        testID={testID}
      />
      <PrimaryButton label={copy.save} onPress={save} disabled={form.draft.length < POSTAL_CODE_LENGTH} testID={idOf('save')} />
      {!showZonesLink ? null : (
        <View style={styles.zonesRow}>
          <TextAction label={t.placeNotice.zones} onPress={openZones} testID={idOf('zones')} />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Gezinme uyarısı bir durum değil açıklama; yer notlarının renk ailesine girmez. */
  browsing: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  /** İkinci yol düğmenin altında ve ortada: bir kapı değil, aynı sorunun öteki yüzü. */
  zonesRow: { alignItems: 'center' },
}));
