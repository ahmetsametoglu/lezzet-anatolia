import type { CatalogImage } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { Tag } from './tag';

/*
  Yuvarlak ürün kartı: vitrin rayı (`lg`, 146) ve benzer ürünler rayı (`sm`, 96); tükenmiş ürünün dairesi solar ama gizlenmez,
  çünkü "yok" da bir bilgidir. Yer işareti bu kartta yok (tasarım): adresin gerçeğini katalog bandı ile kart şeridi söyler.
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
  /** Miktar satırı ("4 adet" · "750 ml · 5 L", `sizesLabelOf`), katalog kartıyla aynı kural; verilmezse satır çizilmez. */
  quantityLabel?: string;
  /** Ekran okuyucu adı; verilmezse ad, miktar ve fiyattan kurulur. */
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
  quantityLabel,
  accessibilityLabel,
  testID,
}: ProductCircleCardProps) {
  const { theme } = useUnistyles();
  const diameter = { sm: theme.size.circleSm, lg: theme.size.circleLg }[size];
  const initialFontSize = { sm: theme.text['h2-sm'], lg: theme.text['h1-sm'] }[size];
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.card}
      accessibilityLabel={accessibilityLabel ?? [name, quantityLabel, priceLabel].filter((part) => part !== undefined).join(' · ')}
      testID={testID}
    >
      <View style={[styles.photoFrame, { width: diameter, height: diameter }]}>
        <CirclePhoto
          size={diameter}
          initial={initial ?? name.slice(0, 1)}
          initialFontSize={initialFontSize}
          image={image}
          style={soldOut ? styles.soldOutPhoto : undefined}
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
        {priceLabel === undefined ? null : (
          <View style={styles.priceBadge}>
            <Tag label={priceLabel} rotate={4} shadow />
          </View>
        )}
      </View>
      {/* Kartın genişliği sabit değil: ad ve boy satırı dairenin çapıyla sınırlanır ki uzun metin rayda kartı açmasın. */}
      <Text style={[styles.name, { maxWidth: diameter }]} numberOfLines={2}>
        {name}
      </Text>
      {quantityLabel === undefined ? null : (
        <Text style={[styles.quantity, { maxWidth: diameter }]} numberOfLines={1}>
          {quantityLabel}
        </Text>
      )}
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
  quantity: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
