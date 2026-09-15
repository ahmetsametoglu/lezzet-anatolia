import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  ÖDEME ADIMININ SKELETON'I — seçenekler sunucudan gelirken üç bölümün yerini tutar.

  ÖNCEKİ HÂLİ tek bir halkaydı ve yanlış göstergeydi: burada bekleyen şey bir işlem değil, gelecek
  olan ÜÇ BÖLÜM — teslim adresi · teslimat yolu · ödeme yöntemi. Halka hiçbirinin yerini tutmuyor,
  cevap gelince üçü birden ekrana giriyor ve altındaki tutar özeti ile onay barı aşağı zıplıyordu.

  TUTAR ÖZETİ BURADA DEĞİL: sayfa onu `ready` bloğunun DIŞINDA, koşulsuz çiziyor — yani beklerken
  de ekranda. Skeleton'a almak, zaten duran bir paneli griye çevirmek olurdu.

  HER BÖLÜM: üstbaşlık + iki seçenek satırı. İkisi "en az makul" — teslimatta iki yol (kapıya /
  rota), ödemede en az iki yöntem var; fazlasını çizmek cevap gelince satır kaybettirirdi.
  Adres bölümünde de iki kart: kayıtlı adresi olmayan müşteride yerine bir DAVET kutusu gelir ve
  o daha kısadır — eksik çizmek, fazla çizmekten iyidir (kayma yalnız aşağı doğru olur).

  SATIRIN ÇERÇEVESİ GERÇEK (dolgu · köşe · kenarlık): seçenek satırının kabuğu veriye bağlı değil.
*/

const SECTION_SLOTS = [0, 1, 2];
const OPTION_SLOTS = [0, 1];

interface CheckoutSkeletonProps {
  testID?: string;
}

export function CheckoutSkeleton({ testID }: CheckoutSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Satır yüksekliği HESAPLANMIYOR: seçenek satırının kabuğu (`option-row.row`) aşağıda gerçek
     stilleriyle kuruluyor ve iki çubuk içine giriyor — yükseklik kendiliğinden çıkıyor. */

  return (
    <View
      style={styles.sections}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {SECTION_SLOTS.map((section) => (
        <View key={section} style={styles.section}>
          <Skeleton width="34%" height={line(theme.text.eyebrow)} />
          {OPTION_SLOTS.map((option) => (
            <View key={option} style={styles.option}>
              <Skeleton width="62%" height={line(theme.text.control)} tone="deep" />
              <Skeleton width="86%" height={line(theme.text.helper)} tone="deep" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Bölümler arası ara sayfanın kendi `content` gap'i. */
  sections: { gap: theme.space['3xl'] },
  /** Bölümün iç arası (`checkout-screen.section`). */
  section: { gap: theme.space.md },
  /** Seçenek satırının kabuğu (`option-row.row`) — boştaki çerçeve tonuyla. */
  option: {
    gap: theme.space['2xs'],
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
}));
