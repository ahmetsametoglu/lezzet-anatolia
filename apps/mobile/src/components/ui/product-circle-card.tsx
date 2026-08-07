import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from './circle-photo';
import { PressableSurface } from './pressable-surface';
import { Tag } from './tag';

/*
  YUVARLAK ÜRÜN KARTI — vitrin rayı, katalog ızgarası ve "bunları da sevebilirsiniz" rayı
  (ekran 1 · 2 · 3). Üç boyut: 146 (vitrin) · 138 (ızgara) · 96 (benzerler).

  FİYAT ÇİPİ ZORUNLUDUR: tasarımda fiyatsız bir ürün dairesi YOK — fiyat dairenin sağ alt
  köşesine taşan eğik bir rozettir (Tag) ve kartın kimliğidir. Zorunlu prop olması bilinçli;
  isteğe bağlı olsaydı bir gün fiyatsız bir kart doğardı.

  TÜKENDİ: daire `opacity .45` ile solar ve üstüne rozet biner (tasarımın kendi çözümü) —
  ürün gizlenmez, "yok" bilgisi de bir bilgidir. Tükendi/indirim rozetlerinin METNİ prop'tan
  gelir (i18n üstte).
*/

interface ProductCircleCardProps {
  /** Ürün adı — i18n gerektirmez, veriden gelir. */
  name: string;
  /** Biçimlenmiş fiyat ("12,90 €") — biçimleme çağıranın (`@lezzet/helper`) işi. */
  priceLabel: string;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg';
  photoUri?: string | null;
  /** Fotoğraf yoksa dairede görünecek baş harf. */
  initial?: string;
  soldOut?: boolean;
  /** "Tükendi" etiketi — tükendiyse ZORUNLU (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "İndirim" etiketi; verilirse indirim rozeti çıkar. */
  discountLabel?: string;
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
  size = 'md',
  photoUri,
  initial,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  optionsLabel,
  accessibilityLabel,
  testID,
}: ProductCircleCardProps) {
  const { theme } = useUnistyles();
  const diameter = { sm: theme.size.circleSm, md: theme.size.circleMd, lg: theme.size.circleLg }[size];
  const initialFontSize = { sm: theme.text['h2-sm'], md: theme.text['h1-sm'], lg: theme.text['h1-sm'] }[size];

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.card}
      accessibilityLabel={accessibilityLabel ?? `${name} · ${priceLabel}`}
      testID={testID}
    >
      <View style={[styles.photoFrame, { width: diameter, height: diameter }]}>
        <CirclePhoto
          size={diameter}
          initial={initial ?? name.slice(0, 1)}
          initialFontSize={initialFontSize}
          photoUri={photoUri}
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
            <Tag label={discountLabel} tone="cream" rotate={-7} shadow />
          </View>
        ) : null}
        <View style={styles.priceBadge}>
          <Tag label={priceLabel} rotate={4} shadow />
        </View>
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
  // Fiyat çipi dairenin SAĞ ALT köşesinden taşar (tasarım: `bottom:-2px;right:-2px`).
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
    fontFamily: theme.font.display,
    fontSize: theme.text['body-sm'],
    fontWeight: theme.text['card-title-sm--font-weight'],
    // Sıkı başlık satır aralığı — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text['body-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  options: {
    fontFamily: theme.font.body,
    fontSize: theme.text.helper,
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
