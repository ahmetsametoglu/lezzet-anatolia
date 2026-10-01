import { formatPrice } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { CatalogImage, CatalogSelling } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { Skeleton } from '@/components/ui/skeleton';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import type { stockMarkOf } from '@/lib/places/place-view';
import { fill, type Messages } from './product-copy';

/*
  Ürün detayının üst bölümü (kahraman ve künye satırları) hem kartın bildiğiyle hem gelen detayla aynı bileşenden çizilir. Ekran
  ikisini ağacın aynı yerinde tuttuğu için veri gelince görsel yeniden kurulmaz ve satırlar yerinden oynamaz.
*/

interface ProductHeroProps {
  images: readonly CatalogImage[];
  name: string;
  /** Açılış boyunun satış alanları; boy yoksa fiyat çizilmez ve ürün alınamaz sayılır. */
  selling: CatalogSelling | undefined;
  placeMark: ReturnType<typeof stockMarkOf>;
  onBack: () => void;
  /** `null`: paylaşım adresi sunucudan henüz gelmedi; düğmenin yeri aynı ölçüde tutulur. */
  onShare: (() => void) | null;
  locale: Locale;
  t: Messages;
}

export function ProductHero({ images, name, selling, placeMark, onBack, onShare, locale, t }: ProductHeroProps) {
  const { theme } = useUnistyles();
  const price = selling?.priceCents ?? null;
  const soldOut = selling?.soldOut ?? true;
  const discounted = selling?.wasCents !== undefined;

  return (
    <View style={styles.hero}>
      {/* Galeri kahramanın yerine geçer, yerleşimini değiştirmez: degrade, düğmeler ve rozetler onun üstünde çizilir. */}
      <PhotoGallery
        images={images}
        photoLabel={t.gallery.photo}
        fallback={
          <View style={styles.heroFallback}>
            <Text style={styles.heroInitial}>{name.slice(0, 1)}</Text>
          </View>
        }
        testID="product-gallery"
      />
      <LinearGradient
        colors={[theme.colors['scrim-soft'], 'transparent']}
        locations={[0, 0.3]}
        style={styles.heroScrim}
        pointerEvents="none"
      />
      {/* Yer filigranı galerinin kardeşi, çocuğu değil: içeride kaydırmayla kayar ve solmaya ortak olurdu. */}
      {placeMark === null ? null : (
        <View style={styles.placeVeil} pointerEvents="none" testID="product-place-veil">
          <Text style={styles.placeVeilText} numberOfLines={3}>
            {placeMark.label}
          </Text>
        </View>
      )}
      <View style={styles.heroButtons}>
        <BackButton onPress={onBack} accessibilityLabel={t.back} variant="photo" testID="product-back" />
        {onShare === null ? (
          <Skeleton width={theme.size.iconButtonOnPhoto} height={theme.size.iconButtonOnPhoto} />
        ) : (
          <PressableSurface
            onPress={onShare}
            feedback="scale-small"
            compact
            style={styles.shareButton}
            accessibilityLabel={t.share}
            testID="product-share"
          >
            <Icon name="share" size={theme.size.inlineIcon} color={theme.colors.ink} />
          </PressableSurface>
        )}
      </View>
      {soldOut ? (
        <View style={[styles.heroBadge, styles.soldOutBadge]}>
          <Text style={styles.soldOutBadgeText}>{t.badge.soldOut}</Text>
        </View>
      ) : discounted ? (
        <View style={[styles.heroBadge, styles.discountBadge]}>
          <Text style={styles.discountBadgeText}>{t.badge.discount}</Text>
        </View>
      ) : null}
      {price !== null ? (
        <View style={styles.priceBadge} testID="product-price">
          <Text style={styles.priceBadgeText}>{formatPrice(price, locale)}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface ProductHeadLinesProps {
  /** `undefined`: ürünün kategorisi var ama adı henüz gelmedi; satırın yeri aynı stille boş tutulur. `null`: kategorisi yok. */
  categoryName: string | null | undefined;
  name: string;
  selling: CatalogSelling | undefined;
  locale: Locale;
  t: Messages;
}

/** Künyenin ilk satırları (kategori · ad · birim satırı · adet sınırı); çağıranın künye kabının içinde, `gap` düzeninde durur. */
export function ProductHeadLines({ categoryName, name, selling, locale, t }: ProductHeadLinesProps) {
  const was = selling?.wasCents;
  return (
    <>
      {categoryName === null ? null : categoryName === undefined ? (
        <Text style={[styles.eyebrow, styles.reserved]} accessibilityElementsHidden importantForAccessibility="no">
          {' '}
        </Text>
      ) : (
        <Text style={styles.eyebrow}>{upperIn(categoryName, locale)}</Text>
      )}
      <Text style={styles.title} accessibilityRole="header">
        {name}
      </Text>
      <Text style={styles.meta}>
        {selling?.comparisonCents == null
          ? t.meta.vat
          : `${fill(t.meta.perKg, 'price', formatPrice(selling.comparisonCents, locale))} · ${t.meta.vat}`}
        {was === undefined ? '' : ` · ${fill(t.meta.was, 'price', formatPrice(was, locale))}`}
      </Text>
      {selling?.limitLabel == null ? null : <Text style={styles.limitChip}>{fill(t.limit, 'n', selling.limitLabel)}</Text>}
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  /* Kahraman kapsayıcısı içeriğin üstüne çizilir (zIndex), çünkü fiyat rozeti alt komşuya taşar. */
  hero: {
    height: customerMetrics.productHero,
    zIndex: 2,
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  heroInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors['on-image-soft'],
  },
  heroScrim: {
    position: 'absolute',
    inset: 0,
  },
  /** Yer filigranı: cümle sayfanın o müşteriye cevabı olduğu için ortalı ve `body` kademesinde; okunurluğu örtünün kendisi verir. */
  placeVeil: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space['3xl'],
    backgroundColor: theme.colors.scrim,
  },
  placeVeilText: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
    color: theme.colors['on-image'],
    textAlign: 'center',
  },
  heroButtons: {
    position: 'absolute',
    /* Fotoğraf saatin altına taşar, düğmeler taşmaz: üst güvenli alanın üstüne 8 eklenir, çentiksiz cihazda inset 0. */
    top: rt.insets.top + theme.space.md,
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** Paylaş dairesi geri düğmesinin `photo` varyantıyla aynı yüzey. */
  shareButton: {
    width: theme.size.iconButtonOnPhoto,
    height: theme.size.iconButtonOnPhoto,
    borderRadius: theme.size.iconButtonOnPhoto / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['cream-glass'],
  },
  heroBadge: {
    position: 'absolute',
    left: theme.space.lg,
    bottom: theme.space.xl,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.badge,
    transform: [{ rotate: '-4deg' }],
  },
  soldOutBadge: { backgroundColor: theme.colors.ink },
  soldOutBadgeText: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['sand-50'],
  },
  discountBadge: { backgroundColor: theme.colors['sand-50'] },
  discountBadgeText: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  /** Fiyat alt kenardan sarkar; taşma tasarımın imzası. */
  priceBadge: {
    position: 'absolute',
    right: theme.space.xl,
    bottom: -customerMetrics.productPriceDrop,
    backgroundColor: theme.colors.terracotta,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.control,
    transform: [{ rotate: '3deg' }],
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  priceBadgeText: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.card,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  /** Gelecek kategori satırının yeri: aynı stilde görünmez bir satır, yüksekliği gerçek etiketle birebir aynı. */
  reserved: { opacity: 0 },
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  limitChip: {
    alignSelf: 'flex-start',
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
  },
}));
