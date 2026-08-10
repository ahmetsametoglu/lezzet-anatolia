import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  TALEPLER LİSTESİ SKELETON'I — ilk yükte kartların yerini tutar. Sipariş listesinin
  (`orders-skeleton`) aynı kalıbı.

  ÖNCEKİ HÂLİ üç boş dikdörtgendi (`SKELETON_HEIGHT = 64`): kartın içi hiç tanınmıyordu ve
  yükseklik tek ham sayı olarak duruyordu — kartın dolgusu ya da satırları değiştiğinde 64
  sessizce yanlışa düşerdi. Artık yükseklik YAZILMIYOR: kartın kendi yapısı kuruluyor ve
  yükseklik kendiliğinden çıkıyor.

  BAŞLIK ÇUBUĞU BURADA DEĞİL, EKRANDA: sayfa `AppBar`ı her dalda GERÇEK basıyor ve içinde çalışan
  bir geri düğmesi ile "Yeni talep" bağlantısı var — griye çevirmek, bekleme boyunca iki çıkışı
  birden kapatırdı.

  KART SAYISI şablonun kendi ölçüsüdür (v3:920), uydurma değil.
*/

const CARD_SLOTS = [0, 1, 2];

interface TicketsSkeletonProps {
  testID?: string;
}

export function TicketsSkeleton({ testID }: TicketsSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Durum etiketi (`TicketStatusTag`) bir rozettir: dikey dolgu + rozet yazısı. */
  const statusHeight = theme.space.xs * 2 + line(theme.text.badge);

  return (
    <View
      style={styles.list}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {CARD_SLOTS.map((slot) => (
        <View key={slot} style={styles.card}>
          <View style={styles.cardText}>
            {/* "tür · konu" satırı, altında kapsam + son mesaj künyesi. */}
            <Skeleton width="64%" height={line(theme.text.note)} tone="deep" />
            <Skeleton width="86%" height={line(theme.text.helper)} tone="deep" />
          </View>
          <Skeleton width="22%" height={statusHeight} radius="badge" tone="deep" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Kartlar arası ara sayfanın kendi `content` gap'i. */
  list: { gap: theme.space.lg },

  /** Kartın kabuğu sayfadakiyle birebir (`tickets-screen.card`). */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  cardText: { flex: 1, gap: theme.space['2xs'] },
}));
