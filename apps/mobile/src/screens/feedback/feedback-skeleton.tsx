import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  GERİ BİLDİRİM SKELETON'I — davet uçtan gelirken OY AŞAMASININ yerini tutar (tarif ve paket
  skeleton'larının aynı iki kuralı: ölçüler sayfanın kendi stillerinden türer, metin yazılmaz).

  NEDEN OY AŞAMASI: davet en az BİR kartla gelir (sözleşmenin `min(1)` kilidi) ve akış her zaman
  oyla başlar — yorum ve teşekkür aşamaları müşterinin ilerlemesiyle doğar. Yani beklenirken
  gelecek olan yerleşim tektir ve bilinir.

  NEYİ ÇİZERİZ — ölçüt "bu bölüm olmadan sayfa var olabilir mi" (§4b):
  · ÇİZİLİR — fotoğraf bloğu + üstündeki künye (üstbaşlık + ürün adı) · iki oy düğmesi · alt not.
    Dördü de koşulsuz: oy aşaması bunlarsız yoktur.
  · ÇİZİLMEZ — sipariş rozeti (`orderReferenceNo` nullable; kargosuz senaryoda hiç gelmez).

  BAŞLIK ÇUBUĞU SKELETON'A GİRMEDİ: sayfa onu yüklenirken de GERÇEK basıyor ve içinde çalışan bir
  geri düğmesi var — çalışan bir düğmeyi griye çevirmek müşteriyi bekleme boyunca sayfaya kilitler
  (§4b, paket detayının kararı). Sayaç ise o an gerçekten YOK: kaç kart geleceğini bilmiyoruz.

  KÜNYE ÇUBUKLARI KOYU TONDA: fotoğrafın üstünde duruyorlar ve iki blok BİRBİRİNE DEĞİYOR — ton
  farkı burada bir şey söyler (vitrin bantlarının kuralı: ayrı duran bloklarda gürültü olurdu).
*/

interface FeedbackSkeletonProps {
  testID?: string;
}

export function FeedbackSkeleton({ testID }: FeedbackSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Fotoğraf bloğu: tam genişlik + alt köşesinde künye ─────────────── */}
      <View style={styles.photo}>
        <Skeleton width="100%" height={customerMetrics.feedbackPhoto} radius="none" />
        <View style={styles.photoCaption}>
          <Skeleton width="44%" height={line(theme.text.eyebrow)} tone="deep" />
          <Skeleton
            width="72%"
            height={line(theme.text['page-title-sm'], theme.text['h1-sm--line-height'])}
            tone="deep"
          />
        </View>
      </View>

      {/* ── İki oy düğmesi: genişliği yuvalar eşit dağıtır (sayfanın kalıbı) ── */}
      <View style={styles.voteRow}>
        <View style={styles.voteSlot}>
          <Skeleton width="100%" height={customerMetrics.feedbackVoteButton} radius="control" />
        </View>
        <View style={styles.voteSlot}>
          <Skeleton width="100%" height={customerMetrics.feedbackVoteButton} radius="control" />
        </View>
      </View>

      {/* Alt not TEK SATIR — cihazda çoğu zaman ikiye sarar ama kaç satır olacağı ekran
          genişliğine bağlı; az çizmek yalnız aşağı doğru ekler (§4b "en az makul"). */}
      <View style={styles.hint}>
        <Skeleton width="78%" height={line(theme.text.helper, theme.text['lead--line-height'])} />
      </View>
    </View>
  );
}

/* STİLLER — sayfanın kendi kap stillerinin AYNISI (dolgu · ara · konum): yalnız blok
   yüksekliklerini eşitlemek yetmez, bölümler arası boşluk da yerleşimin parçası. */
const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },

  photo: { height: customerMetrics.feedbackPhoto },
  photoCaption: {
    position: 'absolute',
    left: theme.space['6xl'],
    right: theme.space['6xl'],
    bottom: theme.space['4xl'],
    gap: theme.space.xs,
  },

  voteRow: {
    flexDirection: 'row',
    gap: theme.space['3xl'],
    paddingVertical: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
  },
  voteSlot: { flex: 1 },

  hint: {
    alignItems: 'center',
    paddingHorizontal: theme.space['8xl'],
  },
}));
