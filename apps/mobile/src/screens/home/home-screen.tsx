import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from '@/components/ui/circle-photo';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Tag } from '@/components/ui/tag';
import { deviceLocale } from '@/lib/i18n/locale';
import { addProduct, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { PhotoTile } from '@/screens/customer-kit/photo-tile';
import { CollectionBand, CollectionPhotoOverlay } from './collection-band';
import { homeData, type HomeData } from './home-fixture';
import messages from './messages.json';

/*
  VİTRİN (v3 `vHome`) — uygulamanın açılış ekranı. Şablonun sırası birebir korundu: başlık →
  süren sipariş → günün fırsatı → fırsat rayı → koleksiyon bantları → vitrin rayı → tarif rayı →
  hazır paketler → Keşif ve profesyonel davetleri.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Vitrinin bir UCU YOK ve bu etapta backend işi ÜRETİLMEZ; ekran `home-fixture`tan besleniyor.
  Veri PROP olarak alınıyor (varsayılanı fixture): uç geldiğinde bu satır bir hook çağrısına
  döner ve ekranın gövdesi hiç değişmez. Testler de aynı kapıdan kendi hâllerini kuruyor.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Onboarding (`ob`) ve toast ÇİZİLMEDİ.** İkisi de kabuk öğesidir, vitrinin parçası değil:
     onboarding uygulamanın ilk açılışına, toast ise küresel bir bildirim katmanına ait. Bu
     ekranın içine gömülselerdi ikisi de yalnız vitrinde çalışırdı.
  2. **`moreCats`/`band1-3` yolları kullanılmadı.** Şablon aynı koleksiyon şeridini iki ayrı
     yoldan kuruyor (döngü + üç elle yazılmış bant); döngü olan alındı, ötekisi aynı şeyin ikinci
     kopyasıydı.
  3. **Puan rozeti B2B'de ve misafirde çizilmez** — şablonun kendi kuralı (`hdrPts`).
  4. **Süren sipariş ile "tekrarla" bandı aynı anda çıkmaz** (şablon: `lastOrder` yalnız süren
     sipariş yokken hesaplanıyor). Veri ikisini birden verirse SÜREN olan kazanır: aktif bir
     teslimatın üstüne "geçen siparişi tekrarla" demek, olan biteni gizlerdi.
  5. **Geri sayım saniyede bir tazelenir**, şablondaki gibi; süre dolduğunda sayaç yerine "süre
     doldu" yazılır — negatif bir süre yazmak ya da 00:00:00'da donmak ikisi de yalan olurdu.
*/

type Messages = LocalizedCopy<typeof messages>;

interface HomeScreenProps {
  /** Vitrin verisi — varsayılanı fixture (UI-only etap). */
  data?: HomeData;
}

/** ms → "05:12:44". Saat 24'ü aşarsa da doğru: saat alanı taşar, kırpılmaz. */
function countdownLabel(remainingMs: number): string {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}`;
}

/** Şablonun selamlama eşikleri: 11'den önce sabah, 18'den önce gündüz, sonrası akşam. */
function greetingOf(t: Messages, hour: number, firstName: string | null): string {
  if (firstName === null) return t.greeting.guest;
  const part = hour < 11 ? t.greeting.morning : hour < 18 ? t.greeting.afternoon : t.greeting.evening;
  return t.greeting.withName.replace('{greeting}', part).replace('{name}', firstName);
}

export function HomeScreen({ data = homeData() }: HomeScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();
  const count = cartCount(cart);

  const { customer, liveOrder, lastOrder, flashDeal, offers, collections, featured, recipes, packages } = data;

  /* Geri sayım — şablonun saniyelik sayacı. Kaynak `endsAtMs`; ekran yalnız "şimdi"yi tazeler,
     yani bitiş anı tek bir yerde durur ve her karede yeniden hesaplanmaz. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (flashDeal === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [flashDeal]);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting} accessibilityRole="header">
            {greetingOf(t, new Date(now).getHours(), customer.firstName)} <Text style={styles.asterisk}>✺</Text>
          </Text>
          {customer.points === null ? null : (
            <Tag
              label={t.header.points.replace('{n}', String(customer.points))}
              tone="sand"
              rotate={-2}
              onPress={() => router.push('/account')}
              accessibilityLabel={t.header.pointsLabel.replace('{n}', String(customer.points))}
              testID="home-points"
            />
          )}
        </View>
        {/* Konum hapı bugün bir SEÇİM AÇMIYOR: posta kodu sayfası (v3 `shZip`) bu etabın kapsamı
            dışında. Yine de dokunulabilir ve hesaba götürüyor — adres orada yönetiliyor. */}
        <PressableSurface
          onPress={() => router.push('/account')}
          feedback="opacity"
          compact
          accessibilityLabel={t.header.locationLabel.replace('{postal}', customer.postalLabel)}
          testID="home-location"
        >
          <Text style={styles.location}>{t.header.location.replace('{postal}', customer.postalLabel)}</Text>
        </PressableSurface>
      </View>
      <View style={styles.headerActions}>
        {customer.wholesale ? <Tag label={t.header.wholesale} tone="ink" rotate={-3} /> : null}
        <PressableSurface
          onPress={() => router.push('/notifications')}
          feedback="scale-small"
          style={styles.bellButton}
          accessibilityLabel={
            customer.unreadNotifications > 0
              ? t.header.notificationsUnread.replace('{n}', String(customer.unreadNotifications))
              : t.header.notifications
          }
          testID="home-bell"
        >
          <Icon name="bell" size={theme.text.icon} color={theme.colors.ink} />
          {customer.unreadNotifications > 0 ? (
            <View style={styles.bellBadge} pointerEvents="none">
              <Text style={styles.bellBadgeLabel}>{customer.unreadNotifications}</Text>
            </View>
          ) : null}
        </PressableSurface>
      </View>
    </View>
  );

  const liveOrderBand =
    liveOrder === null ? null : (
      <PressableSurface
        onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: liveOrder.reference } })}
        feedback="scale"
        style={styles.liveBand}
        accessibilityLabel={t.liveOrder.title
          .replace('{status}', t.liveOrder.status[liveOrder.status])
          .replace('{reference}', liveOrder.reference)}
        testID="home-live-order"
      >
        <CustomerIcon name="truck" size={theme.size.inlineIcon} color={theme.colors['olive-light']} />
        <View style={styles.liveText}>
          <Text style={styles.liveTitle} numberOfLines={1}>
            {t.liveOrder.title
              .replace('{status}', t.liveOrder.status[liveOrder.status])
              .replace('{reference}', liveOrder.reference)}
          </Text>
          <Text style={styles.liveDay}>{liveOrder.dayLabel}</Text>
        </View>
        <View style={styles.trackTilt}>
          <View style={styles.trackChip}>
            <Text style={styles.trackLabel}>{t.liveOrder.track}</Text>
          </View>
        </View>
      </PressableSurface>
    );

  /* Sapma 4: süren sipariş varken "tekrarla" bandı çizilmez. */
  const lastOrderBand =
    liveOrder !== null || lastOrder === null ? null : (
      <PressableSurface
        onPress={() => router.push('/cart')}
        feedback="scale"
        style={styles.repeatBand}
        accessibilityLabel={t.lastOrder.title}
        testID="home-last-order"
      >
        <Icon name="refresh" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
        <View style={styles.repeatText}>
          <Text style={styles.repeatTitle}>{t.lastOrder.title}</Text>
          <Text style={styles.repeatBody}>
            {t.lastOrder.body
              .replace('{reference}', lastOrder.reference)
              .replace('{total}', formatPrice(lastOrder.totalCents, locale))}
          </Text>
        </View>
        <Text style={styles.repeatChevron}>›</Text>
      </PressableSurface>
    );

  const flashBand =
    flashDeal === null ? null : (
      <PressableSurface
        onPress={() => openProduct(flashDeal.slug)}
        feedback="scale"
        style={styles.flashBand}
        accessibilityLabel={flashDeal.name}
        testID="home-flash"
      >
        <View style={styles.flashText}>
          <Text style={styles.flashEyebrow}>
            {flashDeal.endsAtMs <= now
              ? t.flash.ended
              : t.flash.eyebrow.replace('{time}', countdownLabel(flashDeal.endsAtMs - now))}
          </Text>
          <Text style={styles.flashName}>{flashDeal.name}</Text>
          <View style={styles.flashPriceRow}>
            <Text style={styles.flashPrice}>{formatPrice(flashDeal.priceCents, locale)}</Text>
            <Text style={styles.flashWas}>{formatPrice(flashDeal.wasCents, locale)}</Text>
            <Tag
              label={t.flash.add}
              tone="cream"
              rotate={-3}
              onPress={() =>
                addProduct({
                  id: `${flashDeal.slug}-default`,
                  slug: flashDeal.slug,
                  name: flashDeal.name,
                  variantLabel: '',
                  unitCents: flashDeal.priceCents,
                  photoUri: flashDeal.photoUri,
                  discounted: true,
                  soldOut: false,
                })
              }
              accessibilityLabel={t.flash.addLabel.replace('{name}', flashDeal.name)}
              testID="home-flash-add"
            />
          </View>
        </View>
        <View style={styles.flashPhoto} pointerEvents="none">
          {flashDeal.photoUri === null ? (
            <View style={styles.flashPhotoPlaceholder}>
              <Text style={styles.flashInitial}>{flashDeal.name.slice(0, 1)}</Text>
            </View>
          ) : (
            <Image source={{ uri: flashDeal.photoUri }} style={styles.flashImage} accessibilityIgnoresInvertColors />
          )}
        </View>
      </PressableSurface>
    );

  const offerRail =
    offers.length === 0 ? null : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} testID="home-offers">
        {offers.map((offer) => (
          <PressableSurface
            key={offer.slug}
            onPress={() => openProduct(offer.slug)}
            feedback="scale-small"
            style={styles.offerCard}
            accessibilityLabel={offer.name}
            testID={`home-offer-${offer.slug}`}
          >
            <View style={styles.offerBadge}>
              <Tag
                label={t.offers.discount.replace(
                  '{n}',
                  String(Math.round((1 - offer.priceCents / offer.wasCents) * 100)),
                )}
                rotate={-7}
                shadow
              />
            </View>
            {/* Foto varsa foto, yoksa baş harf — kitin tek dairesi (harf-only hâli fixture'ın
                foto taşımadığı ilk günden kalmaydı; v3 fırsat kartı da daire FOTO çizer). */}
            <CirclePhoto
              size={customerMetrics.offerPhoto}
              initial={offer.name.slice(0, 1)}
              initialFontSize={theme.text['h2-sm']}
              initialStyle={styles.offerInitial}
              photoUri={offer.photoUri}
            />
            <View style={styles.offerText}>
              <Text style={styles.offerName}>{offer.name}</Text>
              <View style={styles.offerPriceRow}>
                <Text style={styles.offerPrice}>{formatPrice(offer.priceCents, locale)}</Text>
                <Text style={styles.offerWas}>{formatPrice(offer.wasCents, locale)}</Text>
              </View>
              <Text style={styles.offerLimit}>{t.offers.limited}</Text>
            </View>
          </PressableSurface>
        ))}
      </ScrollView>
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="home-scroll">
        {header}
        {liveOrderBand}
        {lastOrderBand}
        {flashBand}
        {offerRail}

        <View style={styles.collections}>
          <Text style={[styles.sectionEyebrow, styles.collectionsEyebrow]}>{t.collections.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
          {/* Daireler bantların İÇİNDE değil, yığının ÜSTÜNDE (aşağıdaki katman): v3'te daire
              komşu bantlara taşar; RN'de kardeş sırası z-sırası olduğundan bunu ancak sonradan
              çizilen bir üst katman verebilir (kullanıcı bulgusu 08.08). */}
          <View style={styles.bandStack}>
            {collections.map((collection, index) => (
              <CollectionBand
                key={collection.slug}
                name={collection.name}
                subtitle={collection.subtitle}
                countLabel={t.collections.count.replace('{n}', String(collection.productCount))}
                index={index}
                photoUri={collection.photoUri}
                onPress={() => router.push('/catalog')}
                testID={`home-collection-${collection.slug}`}
                photoInOverlay
              />
            ))}
            {collections.map((collection, index) => (
              <CollectionPhotoOverlay key={`photo-${collection.slug}`} name={collection.name} index={index} photoUri={collection.photoUri} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionPad}>
            <SectionHeader
              eyebrow={t.featured.eyebrow}
              title={t.featured.title}
              actionLabel={t.featured.action}
              onActionPress={() => router.push('/catalog')}
              testID="home-featured-header"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleRail}>
            {featured.map((product) => (
              <ProductCircleCard
                key={product.slug}
                name={product.name}
                priceLabel={formatPrice(product.priceCents, locale)}
                photoUri={product.photoUri}
                onPress={() => openProduct(product.slug)}
                testID={`home-featured-${product.slug}`}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionPad}>
            <SectionHeader eyebrow={t.recipes.eyebrow} title={t.recipes.title} testID="home-recipes-header" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {recipes.map((recipe) => (
              <PhotoTile
                key={recipe.slug}
                width={customerMetrics.recipeCardWidth}
                height={customerMetrics.recipeCardHeight}
                photoUri={recipe.photoUri}
                initial={recipe.name.slice(0, 1)}
                topBadge={<Tag label={t.recipes.time.replace('{n}', String(recipe.minutes))} tone="cream" rotate={-3} />}
                onPress={() => router.push({ pathname: '/recipe/[slug]', params: { slug: recipe.slug } })}
                accessibilityLabel={recipe.name}
                testID={`home-recipe-${recipe.slug}`}
              >
                <Text style={styles.tileTitle}>{recipe.name}</Text>
                <Text style={styles.tileMeta}>{t.recipes.meta.replace('{n}', String(recipe.ingredientCount))}</Text>
              </PhotoTile>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sectionPad}>
          <Text style={styles.sectionEyebrow}>{t.packages.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
        </View>
        <View style={styles.packages}>
          {packages.map((pack) => (
            <PhotoTile
              key={pack.slug}
              height={customerMetrics.packageCardHeight}
              photoUri={pack.photoUri}
              initial={pack.name.slice(0, 1)}
              onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
              accessibilityLabel={pack.name}
              testID={`home-package-${pack.slug}`}
            >
              <View style={styles.packageRow}>
                <View style={styles.packageText}>
                  <Text style={styles.packageEyebrow}>{t.packages.badge.replace('{n}', String(pack.itemCount))}</Text>
                  <Text style={styles.tileTitle} numberOfLines={1}>
                    {pack.name}
                  </Text>
                </View>
                <View style={styles.packagePriceTilt}>
                  <View style={styles.packagePrice}>
                    <Text style={styles.packagePriceLabel}>{formatPrice(pack.priceCents, locale)}</Text>
                  </View>
                </View>
              </View>
            </PhotoTile>
          ))}
        </View>

        <View style={styles.invites}>
          <DashedInvite
            title={t.discover.title}
            description={t.discover.body}
            onPress={() => router.push('/discover')}
            action={<Text style={styles.inviteChevron}>›</Text>}
            testID="home-discover"
          />
          <DashedInvite
            title={t.professional.title}
            description={t.professional.body}
            tone="sand"
            onPress={() => router.push('/professionals')}
            action={<Text style={styles.inviteArrow}>→</Text>}
            testID="home-professional"
          />
        </View>
      </ScrollView>

      <View style={styles.fabSlot} pointerEvents="box-none">
        <CartFab
          count={count}
          onPress={() => router.push('/cart')}
          accessibilityLabel={t.cart.open.replace('{n}', String(count))}
          testID="home-cart-fab"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    paddingTop: rt.insets.top,
    paddingBottom: theme.space['6xl'],
    gap: theme.space['4xl'],
  },

  /* ── Başlık ─────────────────────────────────────────────────────────────── */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space['7xl'],
    gap: theme.space.xl,
  },
  headerText: { flex: 1, gap: theme.space['2xs'] },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    flexWrap: 'wrap',
  },
  greeting: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    // Şablon 27; ölçekte en yakın durak `page-title-sm` (26).
    fontSize: theme.text['page-title-sm'],
    fontWeight: theme.text['page-title-sm--font-weight'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  asterisk: { color: theme.colors.terracotta },
  location: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    fontWeight: theme.text['button--font-weight'],
    letterSpacing: theme.text.micro * 0.08,
    color: theme.colors.terracotta,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.sm,
  },
  bellButton: {
    width: theme.size.controlSm,
    height: theme.size.controlSm,
    borderRadius: theme.size.controlSm / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-150'],
  },
  bellBadge: {
    position: 'absolute',
    top: -theme.space.xs,
    right: -theme.space.xs,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.sm,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.terracotta,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-50'],
  },
  bellBadgeLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.card,
  },

  /* ── Süren sipariş / tekrarla ───────────────────────────────────────────── */
  liveBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    marginHorizontal: theme.space['6xl'],
    padding: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.ink,
  },
  liveText: { flex: 1, gap: theme.space['2xs'] },
  liveTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors['sand-50'],
  },
  liveDay: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors['neutral-400'],
  },
  trackTilt: { transform: [{ rotate: '3deg' }] },
  trackChip: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['olive-light'],
  },
  trackLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors['ink-deep'],
  },
  repeatBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    marginHorizontal: theme.space['6xl'],
    padding: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-150'],
  },
  repeatText: { flex: 1, gap: theme.space['2xs'] },
  repeatTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  repeatBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  repeatChevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors.terracotta,
  },

  /* ── Günün fırsatı ──────────────────────────────────────────────────────── */
  flashBand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.ink,
    overflow: 'hidden',
  },
  flashText: {
    flex: 1,
    gap: theme.space['2xs'],
    paddingVertical: theme.space['4xl'],
    paddingLeft: theme.space['6xl'],
  },
  flashEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    // Şablonun `.16em`i ile kitin üstbaşlık aralığı (.18em) arasındaki fark ölçülemez; token kazanır.
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['terracotta-line'],
  },
  flashName: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    fontWeight: theme.text['h2-sm--font-weight'],
    color: theme.colors['sand-50'],
  },
  flashPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    flexWrap: 'wrap',
    marginTop: theme.space.xs,
  },
  flashPrice: {
    fontFamily: theme.font.body[theme.text['step-sm--font-weight']],
    fontSize: theme.text['step-sm'],
    fontWeight: theme.text['step-sm--font-weight'],
    color: theme.colors['olive-light'],
  },
  flashWas: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors['neutral-400'],
    textDecorationLine: 'line-through',
  },
  flashPhoto: {
    width: customerMetrics.flashPhoto,
    height: customerMetrics.flashPhoto,
    borderRadius: customerMetrics.flashPhoto / 2,
    overflow: 'hidden',
    marginRight: -theme.space['5xl'],
    // v3: görsel 132, yuvası 124 — üstten ve alttan 4'er px bandın DIŞINA taşar (die-cut imzası).
    marginVertical: -theme.space.xs,
    transform: [{ rotate: '8deg' }],
    // v3'ün drop-shadow'u (0 8 16 rgba(21,23,15,.35)) — iOS gölge + Android elevation.
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: theme.space.md },
    shadowRadius: theme.space['4xl'],
    shadowOpacity: 0.35,
    elevation: theme.space.md,
  },
  flashImage: { width: '100%', height: '100%' },
  flashPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  flashInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    fontWeight: theme.text['h1-sm--font-weight'],
    color: theme.colors.muted,
  },

  /* ── Fırsat rayı ────────────────────────────────────────────────────────── */
  rail: {
    flexDirection: 'row',
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
    // Rozet kartın üstünden taşıyor; ray onu kırpmasın diye üstte nefes var.
    paddingTop: theme.space.lg,
  },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    paddingLeft: theme.space.lg,
    paddingRight: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
    transform: [{ rotate: '-1deg' }],
  },
  offerBadge: {
    position: 'absolute',
    top: -theme.space.lg,
    left: -theme.space.md,
    zIndex: 1,
  },
  offerInitial: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontWeight: theme.text['h2-sm--font-weight'],
    color: theme.colors.muted,
  },
  offerText: { gap: theme.space['2xs'] },
  offerName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  offerPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  offerPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.terracotta,
  },
  offerWas: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  offerLimit: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    color: theme.colors.terracotta,
  },

  /* ── Bölümler ───────────────────────────────────────────────────────────── */
  // v3'te bantlar BİTİŞİK (kolon, gap yok) — taşan daireler bantlar arasını köprüler; boşluk
  // yalnız üstbaşlıkla ilk bant arasında (v3: eyebrow'un kendi 10px alt boşluğu).
  collections: {},
  collectionsEyebrow: { paddingBottom: theme.space.md },
  // Daire katmanının konum çapası + yatay taşmanın kırpılmaması.
  bandStack: { position: 'relative', overflow: 'visible' },
  section: { gap: theme.space.md },
  sectionPad: { paddingHorizontal: theme.space['6xl'] },
  sectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
    paddingHorizontal: theme.space['6xl'],
  },
  circleRail: {
    flexDirection: 'row',
    gap: theme.space['4xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space.lg,
  },
  tileTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    fontWeight: theme.text['h2-sm--font-weight'],
    color: theme.colors['on-image'],
  },
  tileMeta: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors['olive-light'],
  },
  packages: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  packageText: { flex: 1, gap: theme.space['2xs'] },
  packageEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-light'],
  },
  packagePriceTilt: { transform: [{ rotate: '3deg' }] },
  packagePrice: {
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.terracotta,
    boxShadow: theme.shadow.badge,
  },
  packagePriceLabel: {
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    fontWeight: theme.text['screen-title--font-weight'],
    color: theme.colors.card,
  },

  /* ── Davetler ───────────────────────────────────────────────────────────── */
  invites: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space.xl,
  },
  inviteChevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors.terracotta,
  },
  inviteArrow: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.olive,
  },

  /* Yüzen düğme: sekme çubuğunun üstünde, sağ altta (şablon: `right:18px; bottom:84px` — çubuğun
     yüksekliği ekranın kendi akışında olduğu için burada yalnız çubuğun üstündeki nefes kalır). */
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: theme.space['5xl'],
  },
}));
