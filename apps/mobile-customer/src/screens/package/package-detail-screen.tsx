import { formatPrice, PACKAGE_QUANTITY_MAX, showsNoShipChip } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PackageItem } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { BlurView } from 'expo-blur';
import { EmptyState } from '@/components/ui/empty-state';
import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { usePurchasePlace } from '@/screens/customer-kit/purchase-place';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { StockMark } from '@/components/ui/stock-mark';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addBundle, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { useSelectedPickupWarehouse } from '@/screens/customer-kit/delivery-address-store';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
// Metin ortak pakette: web'in telefon paket detayı aynı sözlüğü okur.
import messages from '@lezzet/i18n/customer/package-detail';
import { PackageSkeleton } from './package-skeleton';
import { usePackage } from './use-package.hook';

/*
  Paket detayı gerçek uçtan okur (`GET /api/v1/packages/:slug`); fixture göstermek müşteriye başka bir paketi satmak olurdu.
  "Tükendi" sepete eklemeyi kapatır, "bu adrese gelemez" kapatmaz: yer bir söz, filtre değil — kararı sepet ve ödeme adımı verir.
*/

type Messages = LocalizedCopy<typeof messages>;

/* İçerik satırının küçük karesi kitte (`customerMetrics.packageItemPhoto`): iskelet de aynı ölçüyü kullanıyor ve ekran
   dosyasından almak dairesel bağımlılık olurdu. */

/** `{name}` gibi tekil yer tutucuları doldurur — sayfanın tüm şablonları tek anahtarlı. */
function fill(template: string, key: string, value: string): string {
  return template.replace(`{${key}}`, value);
}

/** Satır etiketi ad ve boydan kurulur, çünkü gerçek veride ikisi ayrı alandır; tek boylu üründe ayraç uydurulmaz. */
function itemLabel(item: PackageItem): string {
  return item.unitLabel.length > 0 ? `${item.name} · ${item.unitLabel}` : item.name;
}

interface PackageDetailScreenProps {
  slug: string;
}

export function PackageDetailScreen({ slug }: PackageDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  /* Yer katalog ve vitrinle aynı kaynaktan (`usePurchasePlace`); ikinci çözüm yalnız "rota içinde miyim" sorusunu cevaplar ve
     cümlenin geçici mi kalıcı mı olduğu ondan çıkar. */
  const { postalCode } = usePurchasePlace();
  const place = usePlaceResolution(postalCode ?? '');
  const pickupWarehouseId = useSelectedPickupWarehouse();
  const { status, detail, retry } = usePackage(slug, locale, postalCode, pickupWarehouseId);

  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const fabCount = cartCount(cart);

  /* Başlık her hâlde durur (şablonda da yüklenen sayfanın üstünde): geri yolu ekran boşken de açık. */
  const header = (
    <View style={styles.header}>
      <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="package-back" />
      <Text style={styles.headerTitle} accessibilityRole="header">
        {t.header}
      </Text>
      <PressableSurface
        onPress={() => {
          // Ad ve adres birlikte gider; gerekçe ürün detayının `share` künyesinde.
          if (detail !== null) void Share.share({ message: `${detail.name}\n${detail.shareUrl}` });
        }}
        feedback="tint"
        compact
        style={styles.shareButton}
        accessibilityLabel={t.share}
        testID="package-share"
      >
        <Icon name="share" size={theme.size.inlineIcon} color={theme.colors.ink} />
      </PressableSurface>
    </View>
  );

  /* İlk yükte başlık gerçek kalır ki geri yolu açık olsun; sayfanın geri kalanının yerini iskelet tutar (`package-skeleton`). */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {header}
        <PackageSkeleton testID="package-loading" />
      </View>
    );
  }

  if (status === 'missing' || status === 'error' || detail === null) {
    const missing = status === 'missing';
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.errorBody} testID={missing ? 'package-missing' : 'package-error'}>
          <EmptyState
            icon={missing ? undefined : <Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
            title={missing ? t.notFound.title : t.error.title}
            description={missing ? t.notFound.body : t.error.body}
            action={
              <PrimaryButton
                label={missing ? t.notFound.back : t.error.retry}
                shape="pill"
                onPress={missing ? () => router.back() : retry}
                testID="package-error-action"
              />
            }
          />
        </View>
      </View>
    );
  }

  const totalCents = detail.priceCents * quantity;

  /* YER İŞARETİ — cümleyi ekran kurmaz, `stockMarkOf` kurar; paketin kendi gerçeği ona
     `packageStockStatus` ile çevrilir (liste kartıyla TEK sözlük). Tükendide işaret basılmaz:
     hiçbir yerde yokken "bu adrese gelmez" demek cevabı olmayan bir soruya cevap vermektir. */
  const stockMark = detail.soldOut ? null : stockMarkOf(packageStockStatus(detail), place, locale);
  /* "Kargoyla gelir" (`info`) detayda da yazılmaz: kargo kısıtı zaten kendi çipiyle (`noShip`)
     konuşuyor ve rota dışındaki müşteri için bu cümle listelerin başındaki bantta duruyor. */
  const placeMark = stockMark !== null && stockMark.tone !== 'info' ? stockMark : null;
  /* Solma yalnız KAHRAMANA: kart listesindeki kararla aynı — bilgi katmanı tam opak kalır. */
  const heroFaded = detail.soldOut || placeMark?.tone === 'blocked';

  /* Kahraman şeridi önce paketin kapağı, sonra kalemlerin görselleri: satılan şey pakettir, kapağı araya karıştırmak paketi
     kalemlerinden biri gibi gösterirdi. Sözleşmede ayrı `gallery` alanı yok; adressiz ve tekrarlanan görseli galeri eler. */
  const heroPhotos = [detail.image, ...detail.items.map((item) => item.image)];

  const addToCart = () => {
    addBundle(
      {
        /* Satırın kimliği paketin UUID'sidir: sunucu sepetinde paket satırının adresi `bundleId`dir. Slug bir görüntü kimliği;
           yeniden adlandırılabilir ve sepetteki satırı sessizce ikizlerdi. */
        id: detail.id,
        name: detail.name,
        // Sepet satırının içerik özeti — kalem adları orta noktayla (sepet fixture'ının dili).
        contentLabel: detail.items.map((item) => item.name).join(' · '),
        unitCents: detail.priceCents,
        image: detail.image,
      },
      quantity,
    );
    toastSuccess(t.addedToast);
  };

  return (
    <View style={styles.screen} testID="package-detail">
      {header}
      <ScrollView contentContainerStyle={styles.content} testID="package-scroll">
        {/* ── Galeri ve tükendi rozeti ── */}
        <View style={styles.hero}>
          {/* Solan grup yalnız galeri; rozet onun kardeşi ve tam opak kalır, yoksa solmanın sebebi okunaksızlaşırdı. */}
          <View style={[styles.heroPhotos, heroFaded ? styles.heroFaded : undefined]}>
            <PhotoGallery
              images={heroPhotos}
              photoLabel={t.gallery.photo}
              fallback={
                <View style={styles.heroFallback}>
                  <Text style={styles.heroInitial}>{detail.name.slice(0, 1)}</Text>
                </View>
              }
              testID="package-gallery"
            />
          </View>
          {detail.soldOut ? (
            <View style={styles.heroBadge} testID="package-soldout-badge">
              {/* Büyük harf dilin kuralıyla: stilin `textTransform`u Android'de cihazın dilini kullanır. */}
              <Text style={styles.heroBadgeLabel}>{upperIn(t.badge.soldOut, locale)}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Künye: ad · fiyat + ek · kargo kısıtı · açıklama ── */}
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {detail.name}
          </Text>
          <Text style={styles.price} testID="package-price">
            {formatPrice(detail.priceCents, locale)} <Text style={styles.priceSuffix}>{t.priceSuffix}</Text>
          </Text>
          {showsNoShipChip(detail.shippable, placeMark?.tone ?? null) ? (
            <Text style={styles.noShipChip} testID="package-noship">
              {t.noShip}
            </Text>
          ) : null}
          {/* YER İŞARETİ — kitin ortak rozeti (`StockMark`), cümlesi katalogla AYNI. Sarmalayıcı
              onu SOLA yaslar: rozetin kendi hizası daire kartın ortalı ekseni içindir, bu sayfa
              ise sola hizalı bir gövde (kısıt çipiyle aynı sütun). */}
          {placeMark === null ? null : (
            <View style={styles.placeMarkSlot}>
              <StockMark label={placeMark.label} tone={placeMark.tone} testID="package-place-mark" />
            </View>
          )}
          {detail.description === null ? null : <Text style={styles.description}>{detail.description}</Text>}

          {/* ── İçerik listesi: satıra basınca ürün detayı ── */}
          <Text style={styles.sectionTitle}>{t.contents.title}</Text>
          <View style={styles.items}>
            {detail.items.map((item, index) => (
              <PressableSurface
                /* Aynı ürünün iki boyu iki satır olabilir — slug tek başına anahtar olamaz. */
                key={`${item.slug}-${index}`}
                // Boy da taşınır: paketteki boy ürünün en ucuz boyu olmayabilir.
                onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug, variant: item.variantId } })}
                feedback="opacity"
                style={styles.itemRow}
                accessibilityLabel={fill(t.contents.open, 'name', item.name)}
                testID={`package-item-${item.slug}`}
              >
                {item.image.url === null ? (
                  <View style={[styles.itemPhoto, styles.itemPhotoFallback]}>
                    <Text style={styles.itemInitial}>{item.name.slice(0, 1)}</Text>
                  </View>
                ) : (
                  <FrameImage
                    image={item.image}
                    box={{ width: customerMetrics.packageItemPhoto, height: customerMetrics.packageItemPhoto }}
                    style={styles.itemPhoto}
                  />
                )}
                <Text style={styles.itemLabel}>{itemLabel(item)}</Text>
                <Text style={styles.itemQty}>{`×${item.qty}`}</Text>
                <Text style={styles.itemChevron}>›</Text>
              </PressableSurface>
            ))}
          </View>
          <Text style={styles.note}>{t.contents.note}</Text>
        </View>

        {/* Yapışkan barın payı, ürün detayıyla aynı durak. */}
        <View style={styles.barSpace} />
      </ScrollView>

      {/* ── Yapışkan alt bar: krem cam, ürün barıyla aynı yüzey ── */}
      <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="package-bar">
        <View style={styles.barGlass} pointerEvents="none" />
        {/* Tükendi barında sayaç ve ekleme düğmesi hiç çizilmez: karşılayamayacağımız bir teklif müşteriyi sepette ya da
            ödemede duvara götürürdü. "Bu adrese gönderemiyoruz" burayı değiştirmez, kararı sepet ve ödeme adımı verir. */}
        {detail.soldOut ? (
          <Text style={styles.barSoldOut} testID="package-soldout">
            {t.soldOutBar.text}
          </Text>
        ) : (
        <View style={styles.barRow}>
          <View style={styles.stepper}>
            <PressableSurface
              onPress={() => setQuantity((current) => Math.max(1, current - 1))}
              feedback="opacity"
              compact
              style={styles.stepButton}
              accessibilityLabel={fill(t.stepper.decrease, 'name', detail.name)}
              testID="package-qty-decrease"
            >
              <Text style={styles.stepGlyph}>−</Text>
            </PressableSurface>
            <Text style={styles.stepValue} testID="package-qty">
              {quantity}
            </Text>
            <PressableSurface
              onPress={() => setQuantity((current) => Math.min(PACKAGE_QUANTITY_MAX, current + 1))}
              feedback="opacity"
              compact
              style={styles.stepButton}
              accessibilityLabel={fill(t.stepper.increase, 'name', detail.name)}
              testID="package-qty-increase"
            >
              <Text style={styles.stepGlyph}>+</Text>
            </PressableSurface>
          </View>
          <View style={styles.ctaSlot}>
            <PrimaryButton label={`${t.cta.add} · ${formatPrice(totalCents, locale)}`} onPress={addToCart} testID="package-add" />
          </View>
        </View>
        )}
      </BlurView>

      {/* Sepet FAB'ı barın üstünde durur, ürün detayının yerleşimiyle aynı; boş sepette komponent kendini çizmez. */}
      <View style={styles.fabSlot} pointerEvents="box-none">
        <CartFab
          count={fabCount}
          onPress={() => router.push('/cart')}
          accessibilityLabel={t.cart.open.replace('{n}', String(fabCount))}
          testID="package-cart-fab"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
    // Üst güvenli alan ekranın kendisinde: başlık durum çubuğunun altında başlar (katalog kalıbı).
    paddingTop: rt.insets.top,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors.ink,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
  /** Paylaş dairesi geri düğmesinin `bar` varyantıyla aynı ölçüde; tasarım ikisini tek stille çiziyor. */
  shareButton: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    paddingBottom: theme.space['3xl'],
  },
  errorBody: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space['3xl'],
  },

  hero: {
    aspectRatio: 16 / 10,
  },
  /** Galeri kutuyu doldurur; rozet onun kardeşi olduğu için ayrı bir katman gerekiyor. */
  heroPhotos: { flex: 1 },
  /* Solma durağı kart listesiyle AYNI (`soldOutOpacity`): iki yüzey aynı şeyi söylemeli. */
  heroFaded: { opacity: theme.soldOutOpacity },
  /* Tükendi rozeti ürün detayının kahraman rozetiyle aynı yuvada ve aynı mürekkep zeminde. */
  heroBadge: {
    position: 'absolute',
    top: theme.space.xl,
    left: theme.space.xl,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.ink,
  },
  heroBadgeLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
    textTransform: 'uppercase',
    color: theme.colors['sand-50'],
  },
  /** Yer işaretini SOLA yaslayan yuva (rozetin kendi hizası daire kartın ortalı ekseni içindir). */
  placeMarkSlot: { alignSelf: 'flex-start' },
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

  body: {
    paddingVertical: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  /* Tasarımın 28px'inin token durağı yok; ürün başlığının kademesi (`h1-sm`) alındı. */
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  price: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text['card-title'],
    color: theme.colors.ink,
  },
  /* "tek paket fiyatı · KDV dahil" — yardımcı satır kademesi (`helper` token'ının kendi rolü). */
  priceSuffix: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /* Ürün detayının kısıt çipiyle tek stil: iki ekranda iki farklı kısıt çipi olmasın. */
  noShipChip: {
    alignSelf: 'flex-start',
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.md,
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Tasarımın 16px'ine en yakın durak `screen-title` (17, ±1 yuvarlama kuralı). */
  sectionTitle: {
    marginTop: theme.space.sm,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },

  items: {
    gap: theme.space.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.xl,
  },
  itemPhoto: {
    width: customerMetrics.packageItemPhoto,
    height: customerMetrics.packageItemPhoto,
    borderRadius: theme.radius.badge,
  },
  itemPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  itemInitial: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  itemLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  itemQty: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /* Aile açık yazılır: bu stil tek başına kullanılıyor ve verilmezse "›" işareti cihazın sistem fontuyla çizilirdi. */
  itemChevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.body,
    color: theme.colors['sand-600'],
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * 1.5,
    color: theme.colors.muted,
  },
  barSpace: {
    height: customerMetrics.productBarSpace,
  },

  /* Bar ve FAB yerleşimi ürün detayınınkiyle aynı karar. */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    paddingBottom: Math.max(rt.insets.bottom, theme.space['2xl']),
  },
  barGlass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  /** Tükendi barının tek satırı, ürün detayının aynı kademesi ve rengiyle. */
  barSoldOut: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
    paddingVertical: theme.space.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.control,
  },
  stepButton: {
    width: customerMetrics.productStepButtonWidth,
    height: customerMetrics.productStepButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* İm, başlık değil: ürün detayındaki adet seçicinin aynı kararı, gerekçesi orada (`product-detail-screen`, `stepGlyph`). */
  stepGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    color: theme.colors.olive,
  },
  stepValue: {
    width: customerMetrics.productStepValueWidth,
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  ctaSlot: {
    flex: 1,
  },
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: customerMetrics.productFabBottom + Math.max(rt.insets.bottom - theme.space['2xl'], 0),
  },
}));
