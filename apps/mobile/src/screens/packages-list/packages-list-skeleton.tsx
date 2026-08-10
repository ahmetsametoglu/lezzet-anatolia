import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  HAZIR PAKETLER LİSTESİ SKELETON'I — ilk yükte kartların yerini tutar. Ürün/tarif/paket
  detaylarının aynı kalıbı: ölçüler sayfanın kendi stillerinden, metin yok, tek ses kökten.

  ÖNCEKİ HÂLİNİN KUSURU (ölçüldü 10.08): fotoğraf bloğunun yüksekliği doğruydu ama gövde satırı
  `width={theme.size.circleSm} height={theme.text.note}` ile çiziliyordu — DAİRE ÇAPI genişlik
  olarak, YAZI BOYU satır yüksekliği olarak kullanılmıştı. İkisi de o rol için ölçülmemiş
  değerler; sayfadaki karşılığı ("Paketi incele ›" bağlantısı) bambaşka bir genişlikte duruyor.

  SAYFA BAŞLIĞI BURADA DEĞİL, EKRANDA: başlık her dalda GERÇEK çiziliyor (ekranın kendi kuralı —
  "yüklenirken, hata anında ve boş listede de kullanıcı hangi sayfada olduğunu görür"). Skeleton
  onun kardeşi olarak, aynı kabın içinde çizilir.

  KARTIN ÇERÇEVESİ GERÇEK: zemin, kenarlık, köşe ve gölge veriye bağlı değil — griye çevirmek
  sayfanın değişmeyen iskeletini bilinmiyormuş gibi gösterirdi. Gri kalan yalnız fotoğraf bloğu
  ve gövdedeki bağlantı satırı.

  KART SAYISI tasarımın kendi yer tutucu sayısıdır (v3:873 — 3), uydurma değil.
*/

const CARD_SLOTS = [0, 1, 2];

interface PackagesListSkeletonProps {
  testID?: string;
}

export function PackagesListSkeleton({ testID }: PackagesListSkeletonProps) {
  const { theme } = useUnistyles();

  /* Bağlantı satırının kapladığı yer — sayfada `note` kademesi, kendi satır aralığı verilmemiş,
     o yüzden skeleton ailesinin ortak çarpanı (`h1--line-height`). */
  const ctaHeight = theme.text.note * theme.text['h1--line-height'];

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
          {/* Fotoğraf bloğu köşesiz: kart zaten `overflow: hidden` ile köşeyi kendisi kırpıyor. */}
          <Skeleton width="100%" height={customerMetrics.packageListPhotoHeight} radius="none" />
          <View style={styles.cardBody}>
            {/* Gövde sağa yaslı (sayfanın `alignItems: flex-end`i) — "Paketi incele ›" oradadır. */}
            <Skeleton width="42%" height={ctaHeight} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Kartlar arası ara sayfanın kendi `content` gap'i (v3:872 — 16). */
  list: { gap: theme.space['3xl'] },

  /** Kartın kabuğu sayfadakiyle birebir: zemin · kenarlık · köşe · gölge. */
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-200'],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    boxShadow: theme.shadow.soft,
  },
  cardBody: {
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    alignItems: 'flex-end',
  },
}));
