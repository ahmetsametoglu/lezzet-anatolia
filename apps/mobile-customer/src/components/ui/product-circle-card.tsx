import type { CatalogImage } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import type { StockMarkView } from './stock-mark';
import { Tag } from './tag';

/*
  Yuvarlak ürün kartı: vitrin rayı (`lg`, 146) ve benzer ürünler rayı (`sm`, 96). Tükenmiş ya da bu adrese gitmeyen ürünün
  dairesi solar ama gizlenmez, çünkü "yok" bilgisi de bir bilgidir.
*/

interface ProductCircleCardProps {
  /** Ürün adı — i18n gerektirmez, veriden gelir. */
  name: string;
  /** Biçimlenmiş fiyat (`productPriceLabel`); verilmezse çip çizilmez, fiyatı bilinmeyen ürüne "0,00 €" yazılmaz. */
  priceLabel?: string;
  onPress: () => void;
  /** `lg` vitrin rayı (146) · `sm` benzer ürünler rayı (96). */
  size?: 'sm' | 'lg';
  /** Ürün görseli — dairenin çapına yeten kare CDN türevi (`CirclePhoto`). */
  image?: CatalogImage | null;
  /** Fotoğraf yoksa dairede görünecek baş harf. */
  initial?: string;
  soldOut?: boolean;
  /** "Tükendi" etiketi — tükendiyse ZORUNLU (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "İndirim" etiketi; verilirse indirim rozeti çıkar. */
  discountLabel?: string;
  /** Yer işareti; kare katalog kartıyla aynı cümle ve ton, çünkü vitrin ve katalog aynı ürüne bakar. */
  stockMark?: StockMarkView | null;
  /** Bu adrese hiç gitmeyen ürün — daire tükendiyle aynı değerde solar (gerekçe: kare kart künyesi). */
  dimmed?: boolean;
  /** "3 seçenek" gibi çeşit satırı. */
  optionsLabel?: string;
  /** Ekran okuyucu adı; verilmezse ad + fiyattan kurulur. */
  accessibilityLabel?: string;
  testID?: string;
}

export function ProductCircleCard({
  name,
  priceLabel,
  onPress,
  size = 'lg',
  image,
  initial,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  stockMark,
  dimmed = false,
  optionsLabel,
  accessibilityLabel,
  testID,
}: ProductCircleCardProps) {
  const { theme } = useUnistyles();
  const diameter = { sm: theme.size.circleSm, lg: theme.size.circleLg }[size];
  const initialFontSize = { sm: theme.text['h2-sm'], lg: theme.text['h1-sm'] }[size];
  // Tükendide yer işareti basılmaz (gerekçe: kare kart künyesi — cevabı olmayan soru sorulmaz).
  const mark = soldOut ? null : (stockMark ?? null);
  const faded = soldOut || dimmed;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.card}
      // Yer işareti erişilebilir ada da girer: gören ve duyan müşteri aynı bilgiyi almalı.
      accessibilityLabel={accessibilityLabel ?? [name, priceLabel, mark?.label].filter((part) => part !== undefined).join(' · ')}
      testID={testID}
    >
      <View style={[styles.photoFrame, { width: diameter, height: diameter }]}>
        <CirclePhoto
          size={diameter}
          initial={initial ?? name.slice(0, 1)}
          initialFontSize={initialFontSize}
          image={image}
          style={faded ? styles.soldOutPhoto : undefined}
        />
        {/* Durum rozeti TEK yuvadadır: tasarımda tükendi ve indirim aynı köşede duruyor ve bir
            ürün ikisini birden taşıyamaz — tükendiyse indirim bilgisi anlamsızdır. */}
        {soldOut && soldOutLabel !== undefined ? (
          <View style={styles.statusBadge}>
            <Tag label={soldOutLabel} tone="ink" rotate={-4} />
          </View>
        ) : !soldOut && discountLabel !== undefined ? (
          <View style={styles.statusBadge}>
            {/* Hap köşe, krem ton: terracotta bu kartta fiyat çipinin, indirimi de ona boyamak satın alma vurgusunu ikiye
                bölerdi. */}
            <Tag label={discountLabel} tone="cream" rotate={-7} shadow shape="pill" />
          </View>
        ) : null}
        {/* Yer işareti dairenin içinde, solmuş görselin üstünde: kartın altına satır eklemek şeridin boyunu uzatırdı.
            `pointerEvents="none"`: örtü dokunuşu yutmaz, kart yine açılır. */}
        {mark === null ? null : (
          <View
            style={[styles.markVeil, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}
            pointerEvents="none"
            testID={testID === undefined ? undefined : `${testID}-stock-mark`}
          >
            <Text style={styles.markLabel} numberOfLines={3}>
              {mark.label}
            </Text>
          </View>
        )}
        {priceLabel === undefined ? null : (
          <View style={styles.priceBadge}>
            <Tag label={priceLabel} rotate={4} shadow />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {optionsLabel === undefined ? null : <Text style={styles.options}>{optionsLabel}</Text>}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  photoFrame: {
    position: 'relative',
  },
  soldOutPhoto: {
    opacity: theme.soldOutOpacity,
  },
  /**
   * Yer işaretinin filigranı: solma tek başına sebebi söylemez, filigran onu yazacak zemini verir. Örtü fotoğrafın kardeşi, çünkü
   * yazı fotoğrafla birlikte solsaydı okunması gereken cümle okunaksızlaşırdı.
   */
  markVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
    backgroundColor: theme.colors.scrim,
  },
  markLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    // Daire dar: kademe `badge-sm`, satır yüksekliği ölçünün kendi durağından (`space.xl`) —
    // token sözlüğünde bu kademenin ayrı bir satır yüksekliği yok, uydurulmuş bir sayı yazılmadı.
    fontSize: theme.text['badge-sm'],
    lineHeight: theme.space.xl,
    color: theme.colors.cream,
    textAlign: 'center',
  },
  // Fiyat çipi dairenin sağ alt köşesinden taşar.
  priceBadge: {
    position: 'absolute',
    right: -theme.space['2xs'],
    bottom: -theme.space['2xs'],
  },
  statusBadge: {
    position: 'absolute',
    left: 0,
    top: theme.space.lg,
  },
  name: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['body-sm'],
    // Sıkı başlık satır aralığı — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text['body-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  options: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
