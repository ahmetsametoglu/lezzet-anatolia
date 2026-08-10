import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  SİPARİŞLER LİSTESİ SKELETON'I — ilk yükte kartların yerini tutar.

  ÖNCEKİ HÂLİ üç boş dikdörtgendi (`SKELETON_HEIGHT = 110`): yükseklik şablondan alınmıştı ama
  KARTIN İÇİ hiç tanınmıyordu ve tek ham sayı olarak duruyordu — kartın dolgusu ya da satırları
  değiştiğinde 110 sessizce yanlışa düşerdi. Artık yükseklik YAZILMIYOR, kartın kendi yapısı
  kuruluyor (kabuk stilleri + üç satır) ve yükseklik kendiliğinden çıkıyor.

  SAYFA BAŞLIĞI BURADA DEĞİL, EKRANDA: başlık her dalda GERÇEK basılıyor ve içinde çalışan bir
  geri düğmesi var (ekranın kendi kuralı — bu ekran yığında açılıyor, geri dönüşün tek yolu o).

  KART SAYISI şablonun kendi ölçüsüdür (v3:27-31 — üç kart), uydurma değil.

  KARTIN KABUĞU GERÇEK (zemin · köşe · dolgu · kesikli ayraç): sabit yapı veriye bağlı değil.
  Gri kalan yalnız numara, künye, durum etiketi, küçük resimler ve tutar.
*/

const CARD_SLOTS = [0, 1, 2];
/** Küçük resim yığını — kartların çoğunda üç halka görünür (sunucu kümeyi zaten sınırlıyor). */
const THUMB_SLOTS = [0, 1, 2];

interface OrdersSkeletonProps {
  testID?: string;
}

export function OrdersSkeleton({ testID }: OrdersSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Durum etiketi (`OrderStatusTag`) bir rozettir: dikey dolgu + rozet yazısı. */
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
          {/* Üst satır: sipariş numarası + künye solda, durum etiketi sağda. */}
          <View style={styles.cardTop}>
            <View style={styles.cardTopText}>
              <Skeleton width="52%" height={line(theme.text['body-sm'])} tone="deep" />
              <Skeleton width="70%" height={line(theme.text.helper)} tone="deep" />
            </View>
            <Skeleton width="26%" height={statusHeight} radius="badge" tone="deep" />
          </View>

          {/* Küçük resim yığını: halkalar soldaki komşunun üstüne biner (kitin `stacked` varyantı). */}
          <View style={styles.thumbs}>
            {THUMB_SLOTS.map((thumb) => (
              <View key={thumb} style={styles.thumb}>
                <Skeleton width={theme.size.avatarSm} height={theme.size.avatarSm} tone="deep" />
              </View>
            ))}
          </View>

          {/* Alt satır: tutar solda, "Detay" işareti sağda; aralarında kesikli ayraç. */}
          <View style={styles.cardBottom}>
            <Skeleton width="30%" height={line(theme.text['step-sm'])} tone="deep" />
            <Skeleton width="22%" height={line(theme.text.control)} tone="deep" />
          </View>
        </View>
      ))}
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kart stilleri (zemin · köşe · dolgu · ara · ayraç). Yalnız blok
  yüksekliklerini eşitlemek yetmezdi: kartın iç boşlukları da yerleşimin parçası.
*/
const styles = StyleSheet.create((theme) => ({
  /** Kartlar arası ara sayfanın kendi `content` gap'i. */
  list: { gap: theme.space.xl },

  card: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  cardTopText: { flex: 1, gap: theme.space['2xs'] },

  thumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    // İlk halkanın negatif kenar boşluğunu telafi eder (sayfanın aynı hesabı).
    paddingLeft: theme.space.lg,
  },
  /** Yığın halkasının binişmesi — kitin `AvatarThumb` `stacked` varyantının kendisi. */
  thumb: { marginLeft: -theme.space.lg },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
  },
}));
