import type { ReactNode } from 'react';
import { type DimensionValue, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { PhotoSurface } from './photo-surface';

/*
  FOTOĞRAF KARTI — "büyük görsel + altında koyulaşan skrim + üstünde yazı" kalıbı. v3'te dört
  yerde aynı kurgu: tarif kartı (v3:136), hazır paket kartı (v3:150), paket detayının kahramanı
  ve tarifler listesinin tam genişlik kartı (v3:912).

  KİTTEKİ `ProductPhotoCard`IN İKİZİ DEĞİL: o KARE bir ÜRÜN kartıdır (fiyat çipi zorunlu, tükendi
  ve indirim rozetleri, ad iki satıra kırpılı) — yani ürün sözleşmesine bağlı. Bu ise boş bir
  YÜZEY: altına ne yazılacağını çağıran söyler. İkisini birleştirmek, ürün kartına "ama bazen
  fiyat yok, bazen ad yok" diye üç bayrak eklemek olurdu.

  FOTOĞRAFIN KENDİSİ `PhotoSurface`TA (kitin iç ilkeli): "foto varsa foto, yoksa baş harf" +
  skrim + kırpma orada tek kopya duruyor; bu komponent onun BASILABİLİR KART biçimidir. İkinci
  biçim paket listesi kartıdır (fotoğraf bölgesi + altında beyaz gövde) ve o da aynı yüzeyi kullanır.

  ROZET İKİ KÖŞEDE: sol üst DURUM (tarifin süresi, "Tükendi"), sağ üst FİYAT — tasarımın kendi
  ayrımı (v3:878 paket fiyatı sağ üstte, v3:915 tarif süresi sol üstte). İkisi de yuvadır; hangi
  rozetin hangi köşeye gideceğini kart değil çağıran bilir.
*/

interface PhotoTileProps {
  height: number;
  /** Sabit genişlik (yatay ray); verilmezse kart bulunduğu sütunu doldurur. */
  width?: DimensionValue;
  photoUri: string | null;
  /** Fotoğraf yokken çizilen baş harf. */
  initial: string;
  /** Sol üst köşedeki rozet yuvası (tarif kartının süresi). */
  topBadge?: ReactNode;
  /** Sağ üst köşedeki rozet yuvası (paket kartının fiyatı). */
  topRightBadge?: ReactNode;
  /** Alt kenardaki içerik — skrimin üstünde durur. */
  children: ReactNode;
  onPress: () => void;
  /** Ekran okuyucu adı — ZORUNLU: kartın içindeki metin görsel katmandadır. */
  accessibilityLabel: string;
  testID?: string;
}

export function PhotoTile({
  height,
  width,
  photoUri,
  initial,
  topBadge,
  topRightBadge,
  children,
  onPress,
  accessibilityLabel,
  testID,
}: PhotoTileProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.tile, { height }, width === undefined ? undefined : { width }]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <PhotoSurface photoUri={photoUri} initial={initial} scrim style={styles.photo}>
        {topBadge === undefined ? null : <View style={styles.topBadge}>{topBadge}</View>}
        {topRightBadge === undefined ? null : <View style={styles.topRightBadge}>{topRightBadge}</View>}
        <View style={styles.caption}>{children}</View>
      </PhotoSurface>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  /** Yüzey kartın tamamını doldurur; köşe yarıçapı dıştaki kırpmadan gelir. */
  photo: { flex: 1 },
  topBadge: {
    position: 'absolute',
    top: theme.space.lg,
    left: theme.space.lg,
  },
  topRightBadge: {
    position: 'absolute',
    top: theme.space.xl,
    right: theme.space.xl,
  },
  caption: {
    position: 'absolute',
    left: theme.space['2xl'],
    right: theme.space['2xl'],
    bottom: theme.space.xl,
  },
}));
