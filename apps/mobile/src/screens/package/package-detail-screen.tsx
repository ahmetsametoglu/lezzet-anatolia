import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PackageItem } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { BlurView } from 'expo-blur';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { deviceLocale } from '@/lib/i18n/locale';
import { publishToast } from '@/lib/toast/toast-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addBundle, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import messages from './messages.json';
import { usePackage } from './use-package.hook';

/*
  PAKET DETAY (v3 `vPackage`, v3:318-349 + yapışkan bar v3:1254-1270) — GERÇEK UÇTAN okur
  (`GET /api/v1/packages/:slug`): vitrinin "Hazır paketler" kartı gerçek slug'la geliyor ve
  fixture göstermek müşteriye başka bir paketi satmak olurdu (ürün detayının aynı gerekçesi).

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **"Tükendi" hâli ÇİZİLMEDİ** (foto rozeti v3:16 + barın tükendi kutusu v3:53-55): sözleşme
     `soldOut` bilerek taşımıyor — web'in stok-zinciri kararı (`packages.ts`) application'a terfi
     etmedi ve kopyası yasak; alanı hep-false basmak "tükendi yok" ile "bilinmiyor"u ayırt
     edilemez yapardı (`package-api.schema.ts` künyesi). Karar terfi edince bar iki hâlini
     şablondaki sırayla kazanır. Bar bu yüzden hep `pk.ok` dalını çizer.
  2. **Yapışkan başlık kaydırma alanının DIŞINDA** (katalog sapma 1'in aynısı): RN'de `position:
     sticky` yok; başlık üstte sabit durur, içerik altından akar — görsel sonuç aynı.
  3. **Kargo kısıtı çipinin kamyon ikonu ÇİZİLMEDİ** (v3:21'deki svg): ürün detayının aynı çipi
     ikonsuz kurulmuştu ve kitte kamyon ikonu yok — iki ekranda iki farklı çip olmasın diye
     ürününki birebir alındı (ikon ihtiyacı raporlu).
  4. **Satır etiketi addan + boy etiketinden KURULUR** ("Fıstıklı Baklava · 500 g"): şablonun el
     yazısı etiketi boyu ada gömüyor ("500 g fıstıklı baklava") ama gerçek veride ikisi ayrı
     alandır (`PackageItemSchema` künyesi); tek boylu üründe ayraç uydurulmaz, yalnız ad kalır.
  5. **Paylaş, sistem paylaşım kağıdını açar** (ürün detayı sapma 5'in aynısı): RN'de doğal
     karşılık `Share.share`; bugün paket adı paylaşılıyor.
  6. **Sepete ekleme onayı sessiz** (şablon `addPkg` toast basıyor): küresel toast katmanı
     bilinen borç (21.14a raporu) — katman gelince buradaki `add` da onu çağırır.
  7. **İskelet şablonda tanımlı değil**; ürün detayının bekleme diliyle asgari bloklar çizildi
     (foto + başlık + satırlar). Foto iskeleti 16:10 oranını ekran gerçek genişliğinden hesaplar.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * İçerik satırının küçük karesi (v3:27 — 46 dp, köşe 10). Ölçü `customerMetrics`e AİT ama o dosya
 * kit kapsamında ve bu etapta yazıya kapalı — terfi ihtiyacı raporlandı; ham değer tek yerde durur.
 */
const PACKAGE_ITEM_PHOTO = 46;

/** Adet tavanı — şablonun kendi kuralı (v3:1887 `Math.min(20, …)`); parametrik sabit. */
const MAX_QUANTITY = 20;

/** `{name}` gibi tekil yer tutucuları doldurur — sayfanın tüm şablonları tek anahtarlı. */
function fill(template: string, key: string, value: string): string {
  return template.replace(`{${key}}`, value);
}

/** Satır etiketi: ad + boy (sapma 4). Tek boylu üründe etiket boş gelir, ayraç uydurulmaz. */
function itemLabel(item: PackageItem): string {
  return item.unitLabel.length > 0 ? `${item.name} · ${item.unitLabel}` : item.name;
}

interface PackageDetailScreenProps {
  slug: string;
}

export function PackageDetailScreen({ slug }: PackageDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { status, detail, retry } = usePackage(slug, locale);

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
          if (detail !== null) void Share.share({ message: detail.name });
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

  if (status === 'loading') {
    return (
      <View style={styles.screen} testID="package-loading">
        {header}
        {/* Foto 16:10 (v3:14) — iskelet yüksekliği orandan, ekranın gerçek genişliğiyle. */}
        <Skeleton width="100%" height={Math.round((width * 10) / 16)} radius="badge" />
        <View style={styles.skeletonBody}>
          <Skeleton width="70%" height={26} radius="full" />
          <Skeleton width="45%" height={18} radius="full" />
          <Skeleton width="100%" height={66} radius="card" />
          <Skeleton width="100%" height={66} radius="card" />
        </View>
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

  const addToCart = () => {
    addBundle(
      {
        id: detail.slug,
        name: detail.name,
        // Sepet satırının içerik özeti — kalem adları orta noktayla (sepet fixture'ının dili).
        contentLabel: detail.items.map((item) => item.name).join(' · '),
        unitCents: detail.priceCents,
        photoUri: detail.image.url,
      },
      quantity,
    );
    publishToast(t.addedToast);
  };

  return (
    <View style={styles.screen} testID="package-detail">
      {header}
      <ScrollView contentContainerStyle={styles.content} testID="package-scroll">
        {/* ── Foto 16:10 (v3:14-17); rozet çizilmez — sapma 1 ── */}
        <View style={styles.hero}>
          {detail.image.url === null ? (
            <View style={styles.heroFallback}>
              <Text style={styles.heroInitial}>{detail.name.slice(0, 1)}</Text>
            </View>
          ) : (
            <Image source={{ uri: detail.image.url }} style={styles.heroImage} accessibilityIgnoresInvertColors />
          )}
        </View>

        {/* ── Künye: ad · fiyat + ek · kargo kısıtı · açıklama (v3:18-22) ── */}
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {detail.name}
          </Text>
          <Text style={styles.price} testID="package-price">
            {formatPrice(detail.priceCents, locale)} <Text style={styles.priceSuffix}>{t.priceSuffix}</Text>
          </Text>
          {detail.shippable ? null : (
            <Text style={styles.noShipChip} testID="package-noship">
              {t.noShip}
            </Text>
          )}
          {detail.description === null ? null : <Text style={styles.description}>{detail.description}</Text>}

          {/* ── İçerik listesi (v3:23-33): satıra basınca ürün detayı ── */}
          <Text style={styles.sectionTitle}>{t.contents.title}</Text>
          <View style={styles.items}>
            {detail.items.map((item, index) => (
              <PressableSurface
                /* Aynı ürünün iki boyu iki satır olabilir — slug tek başına anahtar olamaz. */
                key={`${item.slug}-${index}`}
                onPress={() => router.push(`/product/${item.slug}`)}
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
                  <Image source={{ uri: item.image.url }} style={styles.itemPhoto} accessibilityIgnoresInvertColors />
                )}
                <Text style={styles.itemLabel}>{itemLabel(item)}</Text>
                <Text style={styles.itemQty}>{`×${item.qty}`}</Text>
                <Text style={styles.itemChevron}>›</Text>
              </PressableSurface>
            ))}
          </View>
          <Text style={styles.note}>{t.contents.note}</Text>
        </View>

        {/* Yapışkan barın payı (v3:36 — 108, ürün detayıyla aynı durak). */}
        <View style={styles.barSpace} />
      </ScrollView>

      {/* ── Yapışkan alt bar (v3:1254-1270) — krem cam, ürün barıyla aynı yüzey kararı ── */}
      <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="package-bar">
        <View style={styles.barGlass} pointerEvents="none" />
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
              onPress={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))}
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
      </BlurView>

      {/* Sepet FAB'ı — v3:602: sepet doluyken vitrin·katalog·ürün·paket dörtlüsünde; barın
          ÜSTÜNDE durur (ürün detayının yerleşimi birebir). Boş sepette komponent kendini çizmez. */}
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

  /* Başlık (v3:9): 8px 14px dolgu, 10 aralık, altta 1,5 mürekkep çizgi; zemin sayfanın kremi. */
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
  /** Paylaş dairesi geri düğmesinin `bar` varyantıyla AYNI ölçü/geri bildirim (v3 ikisi tek stil). */
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
  skeletonBody: {
    padding: theme.space['4xl'],
    gap: theme.space.xl,
  },
  errorBody: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space['3xl'],
  },

  hero: {
    aspectRatio: 16 / 10,
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

  /* Gövde (v3:18): 16px 18px dolgu, 10 aralık. */
  body: {
    paddingVertical: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  /* v3 28px Lora — token durağı yok, ürün başlığının kademesi (`h1-sm`) birebir alındı. */
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
  /* Ürün detayının çipiyle TEK stil (sapma 3) — iki ekranda iki farklı kısıt çipi olmasın. */
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
  /* v3 16px Lora 600 — en yakın durak `screen-title` (17, aynı yazı/ağırlık; ±1 yuvarlama kuralı). */
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
    width: PACKAGE_ITEM_PHOTO,
    height: PACKAGE_ITEM_PHOTO,
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
  itemChevron: {
    fontSize: theme.text.body,
    color: theme.colors['sand-600'],
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * 1.5,
    color: theme.colors.muted,
  },
  barSpace: {
    height: customerMetrics.productBarSpace,
  },

  /* Bar ve FAB yerleşimi ürün detayınınkiyle AYNI karar (v3 iki ekranda tek kalıp çiziyor). */
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
  stepGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['h2-sm'],
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
