import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  TARİFLER LİSTESİ SKELETON'I — ilk yükte kartların yerini tutar.

  ÖLÇÜSÜ ZATEN DOĞRUYDU (`recipeListCardHeight`); eksik olan iki şeydi: ekranın içine gömülüydü
  (kalıp: her ekranın kendi `-skeleton` dosyası) ve ekran okuyucuya hiçbir şey söylemiyordu —
  kök `progressbar` + `busy` yoktu, yani bekleyen kullanıcı sessizlik duyuyordu.

  SAYFA BAŞLIĞI BURADA DEĞİL, EKRANDA: başlık her dalda GERÇEK çiziliyor ve içinde ÇALIŞAN bir
  geri düğmesi var (ekranın kendi kuralı — "geri düğmesi olmayan bir yığın ekranı, kullanıcıyı
  cihazın kendi hareketine mahkûm eder"). Çalışan bir düğmeyi gri bloğa çevirmek, bekleme süresi
  boyunca çıkışı kapatmak olurdu.

  KART SAYISI tasarımın kendi yer tutucu sayısıdır (v3:911 — 4), uydurma değil. Kart TEK PARÇA
  yüzeydir (fotoğraf üstünde künye): skeleton dilinde tek gri blok — vitrin skeleton'ının aynı
  kuralı ("sayfada tek parça renkli yüzey olan öğe tek blok olur").
*/

const CARD_SLOTS = [0, 1, 2, 3];

interface RecipesListSkeletonProps {
  testID?: string;
}

export function RecipesListSkeleton({ testID }: RecipesListSkeletonProps) {
  return (
    <View
      style={styles.list}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {CARD_SLOTS.map((slot) => (
        <Skeleton key={slot} width="100%" height={customerMetrics.recipeListCardHeight} radius="card" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Kartlar arası ara sayfanın kendi `content` gap'i. */
  list: { gap: theme.space.xl },
}));
