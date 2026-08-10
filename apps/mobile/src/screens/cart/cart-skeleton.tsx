import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  SEPET SATIRLARININ SKELETON'I — sepette ürün VAR ama görünüm satırları henüz çözülmemişken
  (`unresolved`) listenin yerini tutar.

  ÖLÇÜLDÜ (10.08): bu hâlde ekran halkayla bekliyordu ve halka yanlış göstergeydi. Sepetin kendi
  koşulu şunu söylüyor:

      unresolved = cart.products.length > 0 && view.lines.length === 0

  yani "elimde ürün var, satırları henüz kuramadım". O anda liste BOŞ çiziliyor ve altında bir
  halka dönüyordu; satırlar gelince ekran bir anda doluyor, altındaki kupon daveti, özet ve
  yapışkan bar aşağı zıplıyordu. Bekleyen şey bir işlem değil, bir YERLEŞİM.

  KAÇ SATIR: sayı TAHMİN DEĞİL — cihaz sepetteki ürün sayısını zaten biliyor (`cart.products`),
  çünkü sepet yerelde yaşıyor; çözülmeyen şey satırların İÇERİĞİ (ad · fiyat · yol). Bu yüzden
  skeleton tam da gelecek satır sayısını çizer ve liste geldiğinde hiçbir şey kaymaz. Tavan var:
  çok kalemli sepette ekranı doldurmak gereksiz, ilk altısı yeter (gerisi zaten kaydırma altında).

  SATIRIN KABUĞU GERÇEK (dolgu · ara · hizalama), gri kalan içerik: fotoğraf · ad · künye · tutar
  ve sağdaki adet sütunu.
*/

/** Ekranda aynı anda görünen en fazla satır — altındakiler kaydırma altında kalıyor. */
const MAX_ROWS = 6;

interface CartSkeletonProps {
  /** Cihazdaki sepette kaç ürün var — satır sayısı buradan gelir, tahmin edilmez. */
  count: number;
  testID?: string;
}

export function CartSkeleton({ count, testID }: CartSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Adet sütunu (`cart-line-row.controls`): iki düğme + aradaki sayı, dikey dizili. */
  const stepperHeight = theme.size.stepButton * 2 + theme.space.sm + line(theme.text.control);

  return (
    <View
      style={styles.lines}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: Math.min(Math.max(count, 1), MAX_ROWS) }, (_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={theme.size.avatarLg} height={theme.size.avatarLg} tone="deep" />
          <View style={styles.text}>
            <Skeleton width="68%" height={line(theme.text.control)} tone="deep" />
            <Skeleton width="44%" height={line(theme.text.micro, theme.text['lead--line-height'])} tone="deep" />
            <Skeleton width="30%" height={line(theme.text['body-sm'])} tone="deep" />
          </View>
          <Skeleton width={theme.size.stepButton} height={stepperHeight} radius="control" tone="deep" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Satırlar arası ara sayfanın kendi `lines` gap'i. */
  lines: { gap: theme.space.lg },

  /** Satırın kabuğu (`cart-line-row.row` + `productRow`); paket satırının koyu zemini çizilmez —
      hangi satırın paket olduğu henüz bilinmiyor ve yanlış tahmin renkli bir leke bırakırdı. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xs'],
  },
  text: { flex: 1, gap: theme.space['2xs'] },
}));
