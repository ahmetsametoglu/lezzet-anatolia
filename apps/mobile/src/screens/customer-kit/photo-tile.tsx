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

  SOLMA FOTOĞRAFA UYGULANIR, BİLGİYE DEĞİL (kullanıcı kararı 10.08 — `ProductPhotoCard`ın aynı
  düzeltmesi): rozetler ve alt künye fotoğraf yüzeyinin İÇİNDEYDİ, yani kart solunca solmanın
  SEBEBİNİ açıklayan cümle ("Bu adrese gönderemiyoruz") tam da gerektiği anda okunaksızlaşırdı.
  Üçü de artık yüzeyin KARDEŞİ ve tam opak; konumları birebir aynı çünkü yüzey zaten kartın
  kutusunu (`flex:1`) kaplıyor. Gradyan solan grupta KALIR — fotoğrafla birlikte solmasaydı soluk
  bir fotoğrafın üstünde tam opak bir koyu leke bırakırdı.
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
  /**
   * Fotoğrafı SOLDUR — kart bugün bir satın alma değil bir bilgi (tükendi ya da bu adrese
   * gitmiyor). Yalnız fotoğraf ve gradyanı solar; rozetler ve künye tam opak kalır (bkz. başlık).
   */
  dimmed?: boolean;
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
  dimmed = false,
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
      {/* SOLAN GRUP — yalnız fotoğraf ve skrimi; kartın kutusunu kaplar. */}
      <PhotoSurface photoUri={photoUri} initial={initial} scrim style={[styles.photo, dimmed ? styles.faded : undefined]} />
      {topBadge === undefined ? null : <View style={styles.topBadge}>{topBadge}</View>}
      {topRightBadge === undefined ? null : <View style={styles.topRightBadge}>{topRightBadge}</View>}
      <View style={styles.caption}>{children}</View>
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
  /* Solma DURAĞI tükendiden gelir (`soldOutOpacity`) ama iki sebebi var — kare ürün kartıyla
     AYNI değer: müşteri açısından sonuç aynı ve iki kart aynı şeyi söylemeli. */
  faded: { opacity: theme.soldOutOpacity },
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
