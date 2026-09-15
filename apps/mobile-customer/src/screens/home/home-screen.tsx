import {
  bandCountLabel,
  cardBadgeOf,
  formatPrice,
  greetingOf,
  offerDiscountLabel,
  offerLimitOf,
  productPriceLabel,
  scopeBadgeOf,
} from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
// Metin iki yüzeyin ortak malı: web'in telefon görünümü de bu sözlükten okur.
import messages from '@lezzet/i18n/customer/home';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';

import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { OfflineNotice } from '@/components/ui/offline-notice';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { rememberPlaceName, useRememberedPlaceName } from '@/lib/places/place-name-memory';
import { usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { PhotoTile } from '@/screens/customer-kit/photo-tile';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useMe, useWholesale } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { CollectionBand, CollectionPhotoOverlay } from './collection-band';
import { homeData, type HomeData } from './home-fixture';
import {
  DEFAULT_HOME_LAYOUT,
  getHomeLayoutSnapshot,
  saveHomeLayout,
  subscribeHomeLayout,
} from './home-layout-memory';
import { HomeSkeleton } from './home-skeleton';
import { useNotificationBadge } from '@/screens/notifications/use-notification-badge.hook';
import { useHome } from './use-home.hook';
import { useHomeOrders } from './use-home-orders.hook';

/*
  Vitrin, uygulamanın açılış ekranı: şablonun sırası korunur (başlık → süren sipariş → fırsat rayı → koleksiyon bantları → vitrin
  rayı → tarif rayı → hazır paketler → davetler) ve veri dört kaynaktan gelir (`/home`, `/me`, `/me/orders`, cihazdaki posta kodu).
  Aşağı çekme bölümleri ve kimliği birlikte tazeler, ekran iskelete düşmez; süren sipariş varken "tekrarla" bandı çizilmez, çünkü
  aktif teslimatın üstüne "geçen siparişi tekrarla" demek olan biteni gizlerdi.
*/

type Messages = LocalizedCopy<typeof messages>;

interface HomeScreenProps {
  /** Vitrin verisi; varsayılanı fixture, testler kendi hâllerini aynı kapıdan kurar. */
  data?: HomeData;
}

/* Selamlamanın saati çizim anında okunur: bir saatte bir değişen bir kelime için saniyelik yeniden çizim ödenecek bedel değil. */

/* Selamlama, fırsat kartının sınır satırı ve bandın sayaç satırı `@lezzet/helper`ın `home-copy.ts`inde, çünkü web'in telefon
   görünümü de bu vitrini çizer. */

export function HomeScreen({ data = homeData() }: HomeScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();
  const count = cartCount(cart);

  const { customer: fixtureCustomer } = data;
  /* Kimlik gerçek oturumdan: ad `/me`den (ilk kelime, çünkü selamlama hitaptır), toptan rozeti onaylı kurumsal müşteriden. `/me`
     puan taşımadığı için puan rozeti çizilmez; `error` misafir gibi çizilir ama misafir sayılmaz. */
  const meState = useMe();
  const wholesale = useWholesale();
  /* Ad HİÇ girilmemiş olabilir (e-postayla yeni açılan hesap: `name` boş dize) — boş ad, adsız
     selamlamadır; "İyi akşamlar, " diye yarım cümle kurulmaz. */
  const firstName = meState.status === 'ready' && meState.me !== null ? (meState.me.name.trim().split(/\s+/)[0] ?? '') : '';
  const signedIn = meState.status === 'ready' && meState.me !== null;
  /* Bildirim rozeti gerçek uçtan (`/me/notifications/badge`), odakta tazelenir; bildirim ekranından dönüşte okunan satır rozetten
     anında düşer. */
  const unreadNotifications = useNotificationBadge(signedIn && meState.me !== null ? meState.me.id : null);
  const customer = {
    ...fixtureCustomer,
    firstName: firstName === '' ? null : firstName,
    wholesale,
    points: null,
    unreadNotifications,
  };
  /* Bantlar, seçki, fırsatlar, tarifler ve paketler `/api/v1/home`dan gelir; yüklenirken ve hata anında bu bölümler çizilmez. */

  /* Sipariş bantları `/api/v1/me/orders`tan ve oturuma bağlı: misafirde ne çağrı yapılır ne bant çizilir. */
  const homeOrders = useHomeOrders(locale, signedIn);
  const liveOrder = homeOrders.live;
  const lastOrder = homeOrders.last;

  /* Teslimat bölgesinin kaynağı cihazdaki kod, adı `/places`tan; kod hiç girilmemişse hap bir davet olur, boş yer adı basılmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  /* Tam kanca (`place` + `refresh`), çünkü aşağı çekme kapsamı da tazeler; hareket çağıranın kaydırma alanına ait olduğu için buradan
     bağlanır. */
  const savedPlaceLookup = usePlaceLookup(postalCode ?? '');
  const savedPlace = savedPlaceLookup.place;
  const resolvedName = savedPlace?.kind === 'resolved' ? savedPlace.place.placeName : null;
  /* Hatırlanan ad: `/places` cevabı gelene kadar ya da istek düşerse başlık çıplak kod yazardı; bir posta kodunun şehri değişmez,
     cihazın geçen sefer öğrendiği ad en doğru tahmindir. */
  const rememberedName = useRememberedPlaceName(postalCode);
  const savedPlaceName = resolvedName ?? rememberedName;
  const postalLabel =
    postalCode === null ? null : savedPlaceName === null ? postalCode : `${postalCode} ${upperIn(savedPlaceName, locale)}`;

  /* Yazma YALNIZ canlı çözümden: hatırlanan adı geri yazmak kaydı hiç tazelemeden döngüye sokardı.
     `rememberPlaceName` aynı kaydı ikinci kez diske yazmıyor. */
  useEffect(() => {
    if (postalCode !== null && resolvedName !== null) void rememberPlaceName(postalCode, resolvedName);
  }, [postalCode, resolvedName]);

  /* Vitrin okuması yere bağlı: posta kodu `useHome`a geçer, sunucu depoyu çözer ve fırsat rayı ancak öyle dolar; çağrı bu yüzden
     posta kodunun tanımlandığı satırdan sonra durur. */
  const home = useHome(locale, postalCode);
  const bands = home.home?.bands ?? [];
  const featured = home.home?.featured ?? [];
  const offers = home.home?.offers ?? [];
  const recipes = home.home?.recipes ?? [];
  const packages = home.home?.packages ?? [];

  /* İskeletin yerleşimi son açılıştan gelir, çünkü sabit iskelet olmayan blokları çizip veri gelince kaybeder ve ekran zıplar; iz
     yalnız başarılı yüklemede yazılır. Sipariş bandı misafirde çizilmez, oturum henüz okunmadıysa ize güvenilir. */
  const storedLayout = useSyncExternalStore(subscribeHomeLayout, getHomeLayoutSnapshot);
  const knownGuest = meState.status === 'ready' && meState.me === null;
  const layout = storedLayout ?? DEFAULT_HOME_LAYOUT;
  const skeletonSections = { ...layout, orderBand: layout.orderBand && !knownGuest };

  const hasOrderBand = liveOrder !== null || lastOrder !== null;
  useEffect(() => {
    if (home.status !== 'ready') return;
    void saveHomeLayout({
      orderBand: hasOrderBand,
      // Günün fırsatı çizilmiyor (ucu yok), yani hiç görülmedi.
      flash: false,
      offers: offers.length,
      bands: bands.length,
      featured: featured.length,
      recipes: recipes.length,
      packages: packages.length,
    });
  }, [
    home.status,
    hasOrderBand,
    offers.length,
    bands.length,
    featured.length,
    recipes.length,
    packages.length,
  ]);

  const [zipSheetOpen, setZipSheetOpen] = useState(false);
  /* Hap her hâlde çekmeceyi açar, şablonun girişliye "adresleriniz Hesap'ta" demesinden bilinçli sapma: posta kodu bir gezinme
     merceğidir, teslimat kararı değil, ve girişli müşteri de vitrini başka bir bölge için gezebilmeli. Kayıt ve onay
     çekmecenin içindedir. */
  const openLocation = () => setZipSheetOpen(true);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  /* İlk yükte sayfanın yerini iskelet tutar, yenilemede bölümler yerinde kalır; bütün kancalar bu satırın üstünde çağrıldığı için
     erken dönüş çağrı sırasını bozmaz. */
  if (home.status === 'loading')
    return (
      /* Keşif daveti her hâlde çizildiği için iskelet de kutuya her zaman yer ayırır; sipariş bandı ise girişliye özel kalır. */
      <HomeSkeleton sections={skeletonSections} discoverInvite testID="home-skeleton" />
    );

  /* Sunucuya ulaşılamadıysa sayfa bunu söyler, yoksa her bölüm "boş dizi = bölüm yok" kuralıyla düşer ve vitrin "mağaza boş" gibi
     okunurdu; görünüm katalog ve siparişlerin `connection-off` kalıbıdır (`OfflineNotice`). */
  if (home.status === 'error')
    return (
      <OfflineNotice
        title={t.error.title}
        description={t.error.body}
        retryLabel={t.error.retry}
        onRetry={home.retry}
        testID="home-error"
      />
    );

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting} accessibilityRole="header">
            {greetingOf(t.greeting, new Date().getHours(), customer.firstName)} <Text style={styles.asterisk}>✺</Text>
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
        {/* Konum hapı çekmece açar. */}
        <PressableSurface
          onPress={openLocation}
          feedback="opacity"
          compact
          accessibilityLabel={
            postalLabel === null ? t.header.locationEmptyLabel : t.header.locationLabel.replace('{postal}', postalLabel)
          }
          testID="home-location"
        >
          <Text style={styles.location}>
            {postalLabel === null ? t.header.locationEmpty : t.header.location.replace('{postal}', postalLabel)}
          </Text>
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

  /* Teslim penceresi yazılmaz: sözleşme saat taşımıyor, veritabanı da yalnız günü tutuyor ve uydurma bir saat müşteriye verilmiş
     bir söz olurdu. */
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
        <Icon name="truck" size={theme.size.inlineIcon} color={theme.colors['olive-light']} />
        <View style={styles.liveText}>
          <Text style={styles.liveTitle} numberOfLines={1}>
            {t.liveOrder.title
              .replace('{status}', t.liveOrder.status[liveOrder.status])
              .replace('{reference}', liveOrder.reference)}
          </Text>
        </View>
        <View style={styles.trackTilt}>
          <View style={styles.trackChip}>
            <Text style={styles.trackLabel}>{t.liveOrder.track}</Text>
          </View>
        </View>
      </PressableSurface>
    );

  /* Süren sipariş varken "tekrarla" bandı çizilmez. Bant sepete değil sipariş detayına götürür, çünkü tekrar siparişin ucu yok ve
     boş sepeti açmak "tek dokunuşla sepete" sözünü tutmamak olurdu. */
  const lastOrderBand =
    liveOrder !== null || lastOrder === null ? null : (
      <PressableSurface
        onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: lastOrder.reference } })}
        feedback="scale"
        style={styles.repeatBand}
        accessibilityLabel={t.lastOrder.title}
        testID="home-last-order"
      >
        <Icon name="refresh" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
        <View style={styles.repeatText}>
          <Text style={styles.repeatTitle}>{t.lastOrder.title}</Text>
          <Text style={styles.repeatBody}>
            {t.lastOrder.summary
              .replace('{reference}', lastOrder.reference)
              .replace('{total}', formatPrice(lastOrder.totalCents, locale))}
          </Text>
        </View>
        <Text style={styles.repeatChevron}>›</Text>
      </PressableSurface>
    );

  /* Günün fırsatı çizilmez: böyle bir özellik yok (seçilmiş kayıt da bitiş anını taşıyan uç da), fırsat rayı ise süresiz
     indirimli ürünlerdir; kurgu veriyle çizmek tutulamayacak bir söz olurdu. */

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
                // Oran iki yüzeyin ortak kurucusundan; `?? 0` tip daraltmasıdır (uç fiyatsızı süzer).
                label={offerDiscountLabel(offer.priceCents ?? 0, offer.wasCents, t.offers)}
                rotate={-7}
                shadow
              />
            </View>
            {/* Fotoğraf yoksa baş harf; kitin tek dairesi. */}
            <CirclePhoto
              size={customerMetrics.offerPhoto}
              initial={offer.name.slice(0, 1)}
              initialFontSize={theme.text['h2-sm']}
              initialStyle={styles.offerInitial}
              image={offer.image}
            />
            <View style={styles.offerText}>
              <Text style={styles.offerName}>{offer.name}</Text>
              <View style={styles.offerPriceRow}>
                {/* Fiyatsız ürün fırsat rayına giremez (uç süzer); `?? 0` tip daraltmasıdır. */}
                <Text style={styles.offerPrice}>{formatPrice(offer.priceCents ?? 0, locale)}</Text>
                <Text style={styles.offerWas}>{formatPrice(offer.wasCents, locale)}</Text>
              </View>
              {/* Satır veriden gelir, gerekçesi `offerLimit` yardımcısında; sınır yoksa hiçbir şey yazılmaz. */}
              {offerLimitOf(offer.limitLabel, t.offers) === null ? null : (
                <Text style={styles.offerLimit}>{offerLimitOf(offer.limitLabel, t.offers)}</Text>
              )}
            </View>
          </PressableSurface>
        ))}
      </ScrollView>
    );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={home.refreshing}
            /* Hareket vitrini, yeri, kimliği ve sipariş bantlarını birlikte tazeler; gösterge yalnız vitrinin hâline bağlı, ayrı
               göstergeler birden çok yükleme varmış izlenimi verirdi. */
            onRefresh={() => {
              home.refresh();
              savedPlaceLookup.refresh();
              meState.refresh();
              // Teslimat gün içinde ilerler; en üstte eski bir durum kalması vitrinin yanlış söylemesi olurdu.
              homeOrders.refresh();
            }}
            {...pullRefreshColors(theme.colors.olive)}
          />
        }
        testID="home-scroll"
      >
        {header}
        {liveOrderBand}
        {lastOrderBand}
        {offerRail}

        {bands.length === 0 ? null : (
          <View style={styles.collections}>
            <Text style={[styles.sectionEyebrow, styles.collectionsEyebrow]}>{upperIn(t.collections.eyebrow, locale)}</Text>
            {/* Daireler bantların içinde değil yığının üstünde: daire komşu bantlara taşar ve RN'de kardeş sırası z-sırası olduğu için
                bunu ancak sonradan çizilen bir üst katman verir. */}
            <View style={styles.bandStack}>
              {bands.map((band, index) => (
                <CollectionBand
                  key={band.slug}
                  name={band.name}
                  subtitle={band.subtitle}
                  countLabel={bandCountLabel(band, t, locale)}
                  /* ROZET BURAYA VERİLMEZ, aşağıdaki üst katmana verilir: vitrinde daireler
                     bantların ÜSTÜNDE çiziliyor (`photoInOverlay`) ve rozet dairenin köşesinde
                     duruyor — burada verilirse hiç çizilmezdi. */
                  index={index}
                  image={band.image}
                  onPress={() =>
                    /* Her iki tür de kataloğu kendi süzgeciyle açar; parametre adları uçtakiyle ve web'in URL'siyle aynı, süzgecin sahibi
                       katalog ekranı. */
                    band.kind === 'category'
                      ? router.push({ pathname: '/catalog', params: { category: band.slug } })
                      : router.push({ pathname: '/catalog', params: { collection: band.slug } })
                  }
                  testID={`home-collection-${band.slug}`}
                  photoInOverlay
                />
              ))}
              {bands.map((band, index) => (
                <CollectionPhotoOverlay
                  key={`photo-${band.slug}`}
                  name={band.name}
                  index={index}
                  image={band.image}
                  /* Rozet dairenin köşesinde ve daireler bu katmanda çiziliyor; bandın kendi dalına verilen `discountLabel` vitrinde
                     kullanılmaz. */
                  discountLabel={scopeBadgeOf(band.campaign, t.campaign, locale)}
                />
              ))}
            </View>
          </View>
        )}

        {featured.length === 0 ? null : (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              {/* Kataloğun kapısı rayın sonundaki kart, parmağın zaten kaydırdığı yerde. */}
              <SectionHeader eyebrow={t.featured.eyebrow} title={t.featured.title} testID="home-featured-header" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleRail}>
              {featured.map((product) => {
                /* Yer işareti katalog kartıyla aynı cümle ve aynı bileşen, çünkü iki ekran aynı ürüne bakar ve işaret yalnız birinde
                   çizilseydi rota dışı müşteri iki farklı gerçek okurdu. */
                const stockMark = stockMarkOf(product.stockStatus, savedPlace, locale);
                /* "Kargoyla gelir" kartta çizilmez, cümlesi listenin başındaki bantta tek yerde durur; kartta yalnız kapalı kapı
                   konuşur. */
                const placeMark = stockMark === null || stockMark.tone === 'info' ? undefined : stockMark;
                return (
                  <ProductCircleCard
                    key={product.slug}
                    name={product.name}
                    priceLabel={productPriceLabel(product.priceCents, locale)}
                    /* Yalnız fırsat rozeti: kapsam kampanyası kesitin kendi kartında, ürün başına yazılsa vaat gibi okunurdu. */
                    discountLabel={cardBadgeOf(product, { offer: t.card.offer })}
                    image={product.image}
                    stockMark={placeMark}
                    // Solma yalnız kapalı kapıda, katalogdaki kuralla aynı.
                    dimmed={stockMark?.tone === 'blocked'}
                    onPress={() => openProduct(product.slug)}
                    testID={`home-featured-${product.slug}`}
                  />
                );
              })}
              {/* Rayın sonundaki katalog kartı ürün dairesinin ikizi ama ürün değil; `ProductCircleCard` fiyatı zorunlu tuttuğu için
                  kullanılmadı. */}
              <PressableSurface
                onPress={() => router.push('/catalog')}
                feedback="scale"
                style={styles.railEndCard}
                accessibilityLabel={t.featured.allCatalogLabel}
                testID="home-featured-all"
              >
                <View style={styles.catalogCircleFrame}>
                  <View style={styles.catalogCircle}>
                    <Icon name="catalog" size={theme.size.decorIcon} color={theme.colors['sand-600']} />
                  </View>
                  <View style={styles.catalogArrow}>
                    <Tag label="→" rotate={4} shadow />
                  </View>
                </View>
                <Text style={styles.railEndLabel}>{t.featured.allCatalog}</Text>
              </PressableSurface>
            </ScrollView>
          </View>
        )}

        {recipes.length === 0 ? null : (
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
                  image={recipe.image}
                  initial={recipe.name.slice(0, 1)}
                  /* `duration` hazır metindir ("35 dk"), `null` ise rozet çizilmez. */
                  topBadge={recipe.duration === null ? undefined : <Tag label={recipe.duration} tone="cream" rotate={-3} />}
                  onPress={() => router.push({ pathname: '/recipe/[slug]', params: { slug: recipe.slug } })}
                  accessibilityLabel={recipe.name}
                  testID={`home-recipe-${recipe.slug}`}
                >
                  <Text style={styles.tileTitle}>{recipe.name}</Text>
                  {/* "N malzeme" = bizim ürün satırları + evden malzemeler (sözleşme ikisini ayrı taşır). */}
                  <Text style={styles.tileMeta}>{t.recipes.meta.replace('{n}', String(recipe.itemCount + recipe.pantryCount))}</Text>
                </PhotoTile>
              ))}
              {/* Rayın sonundaki koyu kart tarifler listesine götürür; "{n} tarif daha" yazılmaz, çünkü toplam tarif sayısı sözleşmede
                  yok. */}
              <PressableSurface
                onPress={() => router.push('/recipes')}
                feedback="scale"
                style={styles.recipesMoreCard}
                accessibilityLabel={t.recipes.moreLabel}
                testID="home-recipes-all"
              >
                <View style={styles.recipesMoreTop}>
                  <Text style={styles.recipesMoreEyebrow}>{upperIn(t.recipes.eyebrow, locale)}</Text>
                  <Text style={styles.recipesMoreTitle}>{t.recipes.moreTitle}</Text>
                </View>
                <View style={styles.recipesMoreAction}>
                  <View style={styles.recipesMoreArrow}>
                    <Text style={styles.recipesMoreArrowGlyph}>→</Text>
                  </View>
                  <Text style={styles.recipesMoreLabel}>{t.recipes.moreAction}</Text>
                </View>
              </PressableSurface>
            </ScrollView>
          </View>
        )}

        {packages.length === 0 ? null : (
          <>
        <View style={styles.sectionPad}>
          <Text style={styles.sectionEyebrow}>{upperIn(t.packages.eyebrow, locale)}</Text>
        </View>
        <View style={styles.packages}>
          {packages.map((pack) => {
            /* Paketin yer işareti ürün dairesiyle aynı kapıdan: paketin hâli önce ürün sözlüğüne çevrilir (`packageStockStatus`), cümleyi
               `stockMarkOf` kurar. */
            const stockMark = stockMarkOf(packageStockStatus(pack), savedPlace, locale);
            /* "Kargoyla gelir" (`info`) yazılmaz — cümlesi listelerin başındaki bantta (ürün
               dairesinin aynı satırı). Kartta yalnız kapalı kapı ve bekleyen bölge konuşur. */
            const placeNote = stockMark === null || stockMark.tone === 'info' ? undefined : stockMark.label;
            const note = pack.soldOut ? undefined : placeNote;
            const faded = pack.soldOut || stockMark?.tone === 'blocked';
            return (
              <PhotoTile
                key={pack.slug}
                height={customerMetrics.packageCardHeight}
                image={pack.image}
                initial={pack.name.slice(0, 1)}
                dimmed={faded}
                topBadge={
                  pack.soldOut ? (
                    <View style={styles.packageSoldOut}>
                      <Text style={styles.packageSoldOutLabel}>{t.packages.soldOut}</Text>
                    </View>
                  ) : undefined
                }
                onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
                accessibilityLabel={[pack.name, pack.soldOut ? t.packages.soldOut : undefined, note]
                  .filter((part) => part !== undefined)
                  .join(' · ')}
                testID={`home-package-${pack.slug}`}
              >
                <View style={styles.packageRow}>
                  <View style={styles.packageText}>
                    <Text style={styles.packageEyebrow}>{t.packages.badge.replace('{n}', String(pack.itemCount))}</Text>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {pack.name}
                    </Text>
                    {/* YER NOTU zeminsiz, künyenin son satırı — kare kartın ve paket listesinin
                        aynı kararı (rozet değil, yazı). */}
                    {note === undefined ? null : (
                      <Text style={styles.packagePlaceNote} numberOfLines={2} testID={`home-package-note-${pack.slug}`}>
                        {note}
                      </Text>
                    )}
                  </View>
                  <View style={styles.packagePriceTilt}>
                    <View style={styles.packagePrice}>
                      <Text style={styles.packagePriceLabel}>{formatPrice(pack.priceCents, locale)}</Text>
                    </View>
                  </View>
                </View>
              </PhotoTile>
            );
          })}
        </View>
          </>
        )}

        <View style={styles.invites}>
          {/* Keşif davetinin cümlesi sayı vermez, çünkü kazanç kart sayısına bağlı ve ne vitrin sözleşmesi puan taşıyor ne kart sayısı
              burada biliniyor; misafire de çizilir ama "giriş yaparsanız puan kazandırır" cümlesiyle. Oylanacak kart kalmadıysa
              (`discoverCards`) davet hiç çizilmez, çünkü boş bir tura çağırmak olurdu. */}
          {home.home !== null && home.home.discoverCards > 0 ? (
            <DashedInvite
              title={t.discover.title}
              description={signedIn ? t.discover.body : t.discover.guestBody}
              onPress={() => router.push('/discover')}
              action={<Text style={styles.inviteChevron}>›</Text>}
              testID="home-discover"
            />
          ) : null}
          {/* İki davet aynı görsel dilde ama ayrı renkte, çünkü ikisi ayrı yere götürür. Profesyonel daveti onaylı toptancıya ve
              başvurusu incelemede olana gösterilmez, kişisel hesapta durur, çünkü `/professionals`a giden tek kapı bu kart. */}
          {wholesale || (meState.status === 'ready' && meState.me?.b2bPending === true) ? null : (
            <DashedInvite
              title={t.professional.title}
              description={t.professional.body}
              tone="olive"
              onPress={() => router.push('/professionals')}
              action={<Text style={styles.inviteChevronOlive}>›</Text>}
              testID="home-professional"
            />
          )}
          {/* Vitrinde yasal blok yok: kanun belgelerin erişilebilir olmasını ister, her ekranda gösterilmesini değil; kapılar hesap
              ekranında ve checkout'ta. */}
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

      <PostalCodeSheet
        visible={zipSheetOpen}
        code={postalCode}
        onClose={() => setZipSheetOpen(false)}
        // Vitrinde bölge dışı müşteri de geziniyor: "nerelere gidiyorsunuz" sorusu burada da doğar.
        showZonesLink
        testID="home-zip"
      />
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
    // Tasarımın 27'si ölçekte yok, en yakın durak `page-title-sm`.
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  asterisk: { color: theme.colors.terracotta },
  location: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
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
    color: theme.colors['sand-50'],
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
    color: theme.colors.ink,
  },
  repeatBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
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
    // Kitin üstbaşlık aralığı; tasarımın .16em'iyle farkı gözle seçilmez.
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['terracotta-line'],
  },
  flashName: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
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
    // Görsel bandın dışına üstten ve alttan taşar; kesik görünüm tasarımın imzası.
    marginVertical: -theme.space.xs,
    transform: [{ rotate: '8deg' }],
    // Gölge iOS'ta `shadow*`, Android'de `elevation` ile.
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
    color: theme.colors.muted,
  },
  offerText: { gap: theme.space['2xs'] },
  offerName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  offerPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  offerPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
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
    color: theme.colors.terracotta,
  },

  /* ── Bölümler ───────────────────────────────────────────────────────────── */
  // Bantlar bitişik, taşan daireler aralarını köprüler; boşluk yalnız üstbaşlıkla ilk bant arasında.
  collections: {},
  collectionsEyebrow: { paddingBottom: theme.space.md },
  // Daire katmanının konum çapası + yatay taşmanın kırpılmaması.
  bandStack: { position: 'relative', overflow: 'visible' },
  section: { gap: theme.space.md },
  sectionPad: { paddingHorizontal: theme.space['6xl'] },
  sectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
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

  /* ── Rayların sonundaki "tümünü gör" kartları ───────────────────────────── */
  /** Ürün dairesiyle aynı hizada durur (kitin kart yerleşimi: ortalı, 6'lık ara). */
  railEndCard: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  catalogCircleFrame: {
    width: theme.size.circleLg,
    height: theme.size.circleLg,
    position: 'relative',
  },
  catalogCircle: {
    width: '100%',
    height: '100%',
    borderRadius: theme.size.circleLg / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-250'],
  },
  /** Fiyat çipiyle aynı köşe: kart ürün dairesinin ikizi. */
  catalogArrow: {
    position: 'absolute',
    right: -theme.space['2xs'],
    bottom: -theme.space['2xs'],
  },
  railEndLabel: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  /** Tarif rayının koyu kapanış kartı, tarif kartıyla aynı ölçüde. */
  recipesMoreCard: {
    width: customerMetrics.recipeCardWidth,
    height: customerMetrics.recipeCardHeight,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.ink,
    padding: theme.space['2xl'],
    justifyContent: 'space-between',
  },
  recipesMoreTop: { gap: theme.space.sm },
  recipesMoreEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-light'],
  },
  recipesMoreTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors['on-image'],
  },
  recipesMoreAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  recipesMoreArrow: {
    width: customerMetrics.railMoreArrow,
    height: customerMetrics.railMoreArrow,
    borderRadius: customerMetrics.railMoreArrow / 2,
    borderWidth: theme.border.base,
    borderColor: theme.colors['olive-light'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipesMoreArrowGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['olive-light'],
  },
  recipesMoreLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors['on-image'],
  },
  tileTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors['on-image'],
  },
  tileMeta: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
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
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-light'],
  },
  /* Yer notu zeminsiz yazı, künyenin son satırı ve vurgu tonunda, çünkü taşıdığı şey künye değil uyarı; paket listesindeki
     kardeşiyle aynı karar. */
  packagePlaceNote: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.terracotta,
  },
  /* Tükendi rozeti — kare ürün kartının tükendi rozetiyle aynı geometri ve örtü tonu. */
  packageSoldOut: {
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['scrim-72'],
  },
  packageSoldOutLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
    textTransform: 'uppercase',
    color: theme.colors['sand-50'],
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
  /* Zeytin kartın işareti — biçim aynı, YALNIZ renk ayrı. İşaret kartın çerçevesiyle aynı
     aileden olmazsa kutunun içine yapıştırılmış yabancı bir öğe gibi durur. */
  inviteChevronOlive: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['olive-dark'],
  },

  /* Yüzen düğme sekme çubuğunun üstünde sağ altta; çubuk ekranın akışında olduğu için burada yalnız üstündeki nefes kalır. */
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: theme.space['5xl'],
  },
}));
