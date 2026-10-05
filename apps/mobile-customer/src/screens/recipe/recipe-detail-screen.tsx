import { formatPrice, recipeRowMetaOf } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { RecipeRow } from '@lezzet/types';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { EmptyState } from '@/components/ui/empty-state';
import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addProduct, addProducts, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
// Metin ortak pakette: web'in telefon tarif detayı aynı sözlüğü okur.
import messages from '@lezzet/i18n/customer/recipe-detail';
import { RecipeSkeleton } from './recipe-skeleton';
import { useRecipe } from './use-recipe.hook';

/*
  Tarif detayı: satır fiyat ve stok kararları katalogla aynı kapıdan gelir, ekran yalnız sözleşmeyi çizer. Toplam `Σ adet × fiyat`tır;
  fiyatsız satıra + çizilmez, hiçbir satır eklenemezse alt çubuk ve payı da çizilmez, çünkü "0,00 €" düğmesi ölü ve yanıltıcı olurdu.
*/

type Messages = LocalizedCopy<typeof messages>;

/* Ekranın ölçüleri `customerMetrics`te (`recipe*`), çünkü iskelet de aynı ölçüleri okuyor. */

/** Satır eklenebilir mi: fiyatı var ve tükenmedi. */
function isAddable(row: RecipeRow): row is RecipeRow & { priceCents: number } {
  return !row.soldOut && row.priceCents !== null;
}

/** Satırı sepet deposunun diline çevirir — kimlik ürün detayının şemasıyla AYNI (satırlar birleşir). */
function cartLineOf(row: RecipeRow & { priceCents: number }) {
  return {
    id: `${row.productSlug}-${row.variantId}`,
    /* Varyant kimliği ayrı alanda geçer; depo onu `id`den ayıklayabiliyor ama çıkarım biçime bağlıdır. */
    variantId: row.variantId,
    slug: row.productSlug,
    name: row.name,
    variantLabel: row.variantLabel,
    unitCents: row.priceCents,
    image: row.image,
    discounted: row.wasCents !== undefined,
    soldOut: false,
  };
}

interface RecipeDetailScreenProps {
  slug: string;
}

export function RecipeDetailScreen({ slug }: RecipeDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { status, detail, retry } = useRecipe(slug, locale);
  /* Abonelik erken çıkışların üstünde, çünkü dallarda atlamak React'in çağrı sırası kuralını kırar. */
  const fabCount = cartCount(useCart());

  /* İlk yükte sayfanın yerini iskelet tutar; neyin çizildiği iskelet dosyasında. */
  if (status === 'loading') return <RecipeSkeleton testID="recipe-loading" />;

  if (status === 'missing' || status === 'error' || detail === null) {
    const missing = status === 'missing';
    return (
      <View style={styles.errorScreen} testID={missing ? 'recipe-missing' : 'recipe-error'}>
        <EmptyState
          icon={missing ? undefined : <Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={missing ? t.notFound.title : t.error.title}
          description={missing ? t.notFound.body : t.error.body}
          action={
            <PrimaryButton
              label={missing ? t.notFound.back : t.error.retry}
              shape="pill"
              onPress={missing ? () => router.back() : retry}
              testID="recipe-error-action"
            />
          }
        />
      </View>
    );
  }

  /* Rozet parçaları eksik veride düşer; ikisi de boşsa rozet hiç çizilmez. */
  const badge = [detail.duration, detail.serves].filter((part): part is string => part !== null).join(' · ');
  const addable = detail.rows.filter(isAddable);
  /* Toplam veri modelinin tanımı: Σ adet × fiyat. */
  const totalCents = addable.reduce((sum, row) => sum + row.priceCents * row.qty, 0);

  const addAll = () => {
    /* Tek çağrı, döngü değil: sepet tek satırda yaşıyor ve eşzamanlı istekler birbirini ezip malzemelerin çoğunu düşürüyordu. */
    addProducts(addable.map((row) => ({ ...cartLineOf(row), quantity: row.qty })));
    toastSuccess(t.addAllToast.replace('{n}', String(addable.length)));
  };

  return (
    <View style={styles.screen} testID="recipe-detail">
      <ScrollView contentContainerStyle={styles.content} testID="recipe-scroll">
        {/* Kahraman: fotoğraf, üst degrade, geri düğmesi ve süre·porsiyon rozeti. */}
        <View style={styles.hero}>
          {detail.image.url === null ? (
            <View style={styles.heroFallback}>
              <Text style={styles.heroInitial}>{detail.name.slice(0, 1)}</Text>
            </View>
          ) : (
            <FrameImage image={detail.image} style={styles.heroImage} />
          )}
          {/* Skrim token gradyanının kendisi. */}
          <LinearGradient {...theme.gradient.photoTop} style={styles.heroScrim} pointerEvents="none" />
          <View style={styles.heroButtons}>
            <BackButton onPress={() => router.back()} accessibilityLabel={t.back} variant="photo" testID="recipe-back" />
          </View>
          {badge.length === 0 ? null : (
            <View style={styles.timeBadge} testID="recipe-badge">
              <Text style={styles.timeBadgeText}>{badge}</Text>
            </View>
          )}
        </View>

        {/* Künye ve üç bölüm: bizden, evinizden, adımlar. */}
        <View style={styles.head}>
          <Text style={styles.eyebrow}>{t.eyebrow}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {detail.name}
          </Text>
          {detail.description === null ? null : <Text style={styles.description}>{detail.description}</Text>}

          {detail.rows.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.oursEyebrow]}>{t.sections.ours}</Text>
              <View>
                {detail.rows.map((row) => (
                  <View key={row.variantId} style={styles.row}>
                    {/* Esneme payı sarmalayıcıda, çünkü kitin `Pressable`ı stili içteki yüzeye verir ve pay orada kalınca satır çöküyordu. */}
                    <View style={styles.rowMainWrap}>
                      <PressableSurface
                        onPress={() => router.push(`/product/${row.productSlug}`)}
                        feedback="opacity"
                        compact
                        style={styles.rowMain}
                        accessibilityLabel={t.row.open.replace('{name}', row.name)}
                        testID={`recipe-row-${row.variantId}`}
                      >
                        <CirclePhoto
                          size={customerMetrics.recipeRowPhoto}
                          initial={row.name.slice(0, 1)}
                          initialFontSize={theme.text['screen-title']}
                          image={row.image}
                        />
                        <View style={styles.rowText}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {/* "{adet} × {boy} · {fiyat}": web'in telefon görünümüyle ortak kurucu. */}
                            {recipeRowMetaOf({ qty: row.qty, label: row.variantLabel, priceCents: row.priceCents }, locale)}
                          </Text>
                        </View>
                      </PressableSurface>
                    </View>
                    {row.soldOut ? (
                      <Text style={styles.soldOut} testID={`recipe-soldout-${row.variantId}`}>
                        {t.row.soldOut}
                      </Text>
                    ) : row.priceCents === null ? null : (
                      <PressableSurface
                        onPress={() => {
                          if (!isAddable(row)) return;
                          addProduct(cartLineOf(row), row.qty);
                          toastSuccess(t.addedToast);
                        }}
                        feedback="shadow"
                        compact
                        style={styles.addBox}
                        accessibilityLabel={t.row.add.replace('{name}', row.name)}
                        testID={`recipe-add-${row.variantId}`}
                      >
                        <Text style={styles.addGlyph}>+</Text>
                      </PressableSurface>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {detail.pantry.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.pantryEyebrow]}>{t.sections.pantry}</Text>
              <View style={styles.pantryList}>
                {detail.pantry.map((entry, index) => (
                  <Text key={index} style={styles.pantryItem}>
                    • {entry}
                  </Text>
                ))}
              </View>
            </>
          )}

          {detail.steps.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.stepsEyebrow]}>{t.sections.steps}</Text>
              <View style={styles.stepList}>
                {detail.steps.map((step, index) => (
                  <View key={index} style={styles.stepRow}>
                    {/* Numarayı ekran verir, metin taşımaz. */}
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Alt çubuğun payı; çubuk yoksa pay da yok. */}
        {addable.length === 0 ? null : <View style={styles.barSpace} />}
      </ScrollView>

      {/* Yapışkan alt çubuk: krem cam, düğme kitin birincil bloğu. */}
      {addable.length === 0 ? null : (
        <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="recipe-bar">
          <View style={styles.barGlass} pointerEvents="none" />
          <PrimaryButton label={`${t.addAll} · ${formatPrice(totalCents, locale)}`} onPress={addAll} singleLine testID="recipe-add-all" />
        </BlurView>
      )}

      {/* Sepet düğmesi ürün ve paket sayfalarıyla aynı yuvada durur ki sepet doluyken yeri sayfadan sayfaya oynamasın; boş sepette çizilmez. */}
      <View style={styles.fabSlot} pointerEvents="box-none">
        <CartFab
          count={fabCount}
          onPress={() => router.push('/cart')}
          accessibilityLabel={t.cart.open.replace('{n}', String(fabCount))}
          testID="recipe-cart-fab"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },
  content: {
    paddingBottom: theme.space['3xl'],
  },
  errorScreen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
    justifyContent: 'center',
    padding: theme.space['3xl'],
  },

  /* Kahraman içeriğin üstüne çizilir, çünkü süre·porsiyon rozeti alt komşuya taşıyor. */
  hero: {
    height: customerMetrics.recipeHero,
    zIndex: 2,
  },
  heroImage: {
    width: '100%',
    height: '100%',
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
  heroButtons: {
    /* Fotoğraf saatin altına taşar, düğme taşmaz: ürün sayfasıyla aynı karar, iki ekranın geri düğmesi hizalı. */
    position: 'absolute',
    top: rt.insets.top + theme.space.md,
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** Süre·porsiyon rozeti alt kenardan sarkar; taşma tasarımın imzası. */
  timeBadge: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: -customerMetrics.recipeBadgeDrop,
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.badge,
    transform: [{ rotate: '3deg' }],
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  timeBadgeText: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text.badge),
    color: theme.colors['sand-50'],
  },

  head: {
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
    gap: theme.space.lg,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  /* Bölüm üstbaşlıkları tek stil; aralar yalnız üst boşlukla ayrışır. */
  sectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  oursEyebrow: { marginTop: theme.space.md },
  pantryEyebrow: { marginTop: theme.space.sm },
  stepsEyebrow: { marginTop: theme.space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
  },
  /** Esneme payı burada; gerekçesi JSX'te. */
  rowMainWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space['2xs'],
  },
  /* Ölçü ve ağırlık tek kademeden (`control`); iki kademeden devşirmek ayrışan bir yazı üretirdi. */
  rowName: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  rowMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  soldOut: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  /** + kutusu: mürekkep çerçeve, krem zemin, 2'lik sert gölge; kitte bu boyda gölge durağı yok, token renginden kurulur. */
  addBox: {
    width: customerMetrics.recipeAddBox,
    height: customerMetrics.recipeAddBox,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.badge,
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors['sand-50'],
    boxShadow: `${theme.press.translate}px ${theme.press.translate}px 0 ${theme.colors.ink}`,
  },
  /* "+" bir imdir, başlık değil: başlık ölçeği değişince oynamamalı. */
  addGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    color: theme.colors.ink,
  },

  pantryList: {
    gap: theme.space.sm,
  },
  pantryItem: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * 1.4,
    color: theme.colors.body,
  },

  stepList: {
    gap: theme.space.xl,
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.space.xl,
  },
  stepBadge: {
    width: customerMetrics.recipeStepBadge,
    height: customerMetrics.recipeStepBadge,
    borderRadius: customerMetrics.recipeStepBadge / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-150'],
  },
  stepBadgeText: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  stepText: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },

  barSpace: {
    height: customerMetrics.recipeBarSpace,
  },
  /* Sepet düğmesinin yuvası ürün ve paket sayfalarıyla aynı hesap: müşteri düğmeyi hep aynı yerde bulsun. */
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: customerMetrics.productFabBottom + Math.max(rt.insets.bottom - theme.space['2xl'], 0),
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    paddingTop: theme.space.xl,
    paddingHorizontal: theme.space['4xl'],
    /* Alt güvenli alan çubuğun içinde ve dolguyla toplanmaz, ikisinin büyüğü alınır. */
    paddingBottom: Math.max(rt.insets.bottom, theme.space['7xl']),
  },
  barGlass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
}));
