import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from '@/components/ui/circle-photo';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@/lib/i18n/app-locale';
import {
  getOnboardingSnapshot,
  saveOnboarding,
  subscribeOnboarding,
} from '@/lib/onboarding/onboarding-store';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { publishToast } from '@/lib/toast/toast-store';
import { addProduct, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { PhotoTile } from '@/screens/customer-kit/photo-tile';
import { useMe, useWholesale } from '@/screens/customer-kit/use-me.hook';
import { CollectionBand, CollectionPhotoOverlay } from './collection-band';
import { homeData, type HomeData } from './home-fixture';
import { HomeSkeleton } from './home-skeleton';
import messages from './messages.json';
import { PostalCodeSheet } from './postal-code-sheet';
import { useHome } from './use-home.hook';

/*
  VİTRİN (v3 `vHome`) — uygulamanın açılış ekranı. Şablonun sırası birebir korundu: başlık →
  süren sipariş → günün fırsatı → fırsat rayı → koleksiyon bantları → vitrin rayı → tarif rayı →
  hazır paketler → Keşif ve profesyonel davetleri.

  ── VERİNİN ÜÇ KAYNAĞI ──────────────────────────────────────────────────────
  · `/api/v1/home` (bantlar · seçki · FIRSATLAR · tarifler · paketler),
  · `/api/v1/me` (selamlama adı, toptan rozeti),
  · cihaz (`lib/onboarding` — teslimat bölgesi kodu) + `/places` (kodun şehri).
  Kalan üç blok hâlâ fixture ve gerekçeleri `home-fixture` künyesinde (süren sipariş · geçen
  sipariş · günün fırsatı). Veri PROP olarak alınıyor (varsayılanı fixture) ki testler kendi
  hâllerini aynı kapıdan kursun.

  ── AŞAĞI ÇEKEREK YENİLEME (kullanıcı isteği 09.08) ─────────────────────────
  Vitrin uygulamanın açılış ekranı ve içeriği gün içinde değişiyor (fırsat biter, paket tükenir);
  o yüzden hareket İKİ kaynağı birden tazeler — vitrin bölümlerini ve kimliği. Yenileme sırasında
  ekran iskelete DÜŞMEZ: bölümler yerinde kalır, hareketin kendi göstergesi yeter (hook künyesi).

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
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();
  const count = cartCount(cart);

  const { customer: fixtureCustomer, liveOrder, lastOrder, flashDeal } = data;
  /* KİMLİK GERÇEK OTURUMDAN (21.14c): ad `/me`den (ilk kelime — selamlama tam ad değil hitaptır),
     toptan rozeti onaylı kurumsal müşteriden (ölçüt `useWholesale`da, sekme çatalıyla ORTAK).
     PUAN ARTIK ÇİZİLMEZ: `/me` puan taşımıyor (puan modülü ayrı) ve oturum gerçekken kurgu sayı
     basılamaz — alan bağlanınca rozet geri gelir. Bildirim sayacı da aynı gerekçeyle 0 (altyapısı
     21.13). `error` misafir GİBİ çizilir ama misafir sayılmaz (hook künyesi). */
  const meState = useMe();
  const wholesale = useWholesale();
  /* Ad HİÇ girilmemiş olabilir (e-postayla yeni açılan hesap: `name` boş dize) — boş ad, adsız
     selamlamadır; "İyi akşamlar, " diye yarım cümle kurulmaz. */
  const firstName = meState.status === 'ready' && meState.me !== null ? (meState.me.name.trim().split(/\s+/)[0] ?? '') : '';
  const signedIn = meState.status === 'ready' && meState.me !== null;
  const customer = {
    ...fixtureCustomer,
    firstName: firstName === '' ? null : firstName,
    wholesale,
    points: null,
    unreadNotifications: 0,
  };
  /* Bantlar + seçki + FIRSATLAR + tarifler + paketler GERÇEK uçtan (`/api/v1/home`); yüklenirken/
     hata anında bu bölümler çizilmez (vitrin tasarımında iskelet/hata hâli yok; gerekçe hook
     künyesinde). Fixture'da kalanlar: kimlikli bölümler ve günün fırsatı (fixture künyesi). */

  /* TESLİMAT BÖLGESİ — kaynak CİHAZ (onboarding'de yazılan kod), adı da gerçek uçtan (`/places`).
     Fixture'daki sabit "67000 STRASBOURG" kalktı: kullanıcının kendi cevabı dururken uydurma bir
     şehir yazmak, ekranın en görünür yerinde yalan söylemekti. Kod hiç girilmemişse (onboarding
     atlandı) hap bir DAVET olur — boş bir yer adı basılmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const savedPlace = usePlaceResolution(postalCode ?? '');
  const savedPlaceName = savedPlace?.kind === 'resolved' ? savedPlace.place.placeName : null;
  const postalLabel =
    postalCode === null ? null : savedPlaceName === null ? postalCode : `${postalCode} ${savedPlaceName.toLocaleUpperCase(locale)}`;

  /* Vitrin okuması YERE bağlı: posta kodu `useHome`a geçer, sunucu depoyu çözer ve fırsat şeridi
     ancak öyle dolar (ölçüldü 09.08 — kodsuz 0, 67000 ile 2). Çağrı bu yüzden posta kodunun
     TANIMLANDIĞI satırdan sonra durur; kod değişince hook yeniden okur. */
  const home = useHome(locale, postalCode);
  const bands = home.home?.bands ?? [];
  const featured = home.home?.featured ?? [];
  const offers = home.home?.offers ?? [];
  const recipes = home.home?.recipes ?? [];
  const packages = home.home?.packages ?? [];

  const [zipSheetOpen, setZipSheetOpen] = useState(false);
  /* HAP HER HÂLDE ÇEKMECEYİ AÇAR (kullanıcı kararı 09.08) — v3'ün `pillTap` kuralından bilinçli
     sapma.

     Şablon girişli müşteride çekmece yerine "adresleriniz Hesap bölümünde" diyordu ve gerekçesi
     makul görünüyordu: girişlinin gerçek adres kaydı var, buradaki yalnız bir bölge kodu. Ama
     ölçülünce iki arıza çıktı (kullanıcı, cihaz 09.08):
       1. Girişli müşteri vitrini BAŞKA bir bölge için gezemiyordu ("anneme göndersem ne çıkar").
       2. Kayıtlı adresi OLMAYAN girişli müşteri hiçbir yerden bölge seçemiyordu — ne hap açılıyor
          ne seçilecek adres var. Çıkışsız oda; fırsatlar da o yüzden hiç çözülmüyordu.

     KURGU (kullanıcının tarifi, web'de zaten böyle): posta kodu bir GEZİNME MERCEĞİDİR, teslimat
     kararı değil. Müşteri onu istediği gibi değiştirir; SEPETE gidince sepet gönderilecek ADRESE
     göre güncellenir. İki bilgi ayrı sorulara cevap veriyor, o yüzden çelişmiyorlar — ve çekmece
     bunu girişli müşteriye açıkça söyler (`t.zip.browsingOnly`). */
  const openLocation = () => setZipSheetOpen(true);
  const saveLocation = (code: string) => {
    setZipSheetOpen(false);
    /* Kaydın ÖTEKİ alanları korunur: bu çekmece yalnız posta kodunu değiştirir. Kayıt yoksa
       (onboarding atlanmış olsa bile kapı geçilmiş demektir) `done: true` yazılır — aksi hâlde
       bir sonraki açılış kullanıcıyı akışa geri fırlatırdı. */
    /* Dil CANLI kaynaktan yazılır, kayıttaki eski değerden değil: `onboarding?.locale` akışın
       İZİdir (onboarding'in yapıldığı andaki dil). Kullanıcı sonradan dilini değiştirdiyse onu geri
       yazmak, ayarı sessizce eski hâline döndürürdü. */
    void saveOnboarding({ done: true, locale, postalCode: code });
    publishToast(t.zip.saved);
  };

  /* Geri sayım — şablonun saniyelik sayacı. Kaynak `endsAtMs`; ekran yalnız "şimdi"yi tazeler,
     yani bitiş anı tek bir yerde durur ve her karede yeniden hesaplanmaz. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (flashDeal === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [flashDeal]);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  /* İLK YÜK: sayfanın yerini iskelet tutar (kullanıcı isteği 09.08 — "vitrin sayfasını bire bir
     kopyalasın"). Yalnız İLK yük: aşağı çekerek yenilemede hook `loading`e düşmez (künyesi),
     bölümler yerinde kalır. Bütün kancalar bu satırın ÜSTÜNDE çağrılıyor; erken dönüş çağrı
     sırasını bozmaz. */
  if (home.status === 'loading') return <HomeSkeleton testID="home-skeleton" />;

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
        {/* Konum hapı artık ÇEKMECE açıyor (v3 `shZip` — kullanıcı isteği 09.08). */}
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
              onPress={() => {
                addProduct({
                  id: `${flashDeal.slug}-default`,
                  slug: flashDeal.slug,
                  name: flashDeal.name,
                  variantLabel: '',
                  unitCents: flashDeal.priceCents,
                  photoUri: flashDeal.photoUri,
                  discounted: true,
                  soldOut: false,
                });
                publishToast(t.flash.addedToast);
              }}
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
                  String(Math.round((1 - (offer.priceCents ?? 0) / offer.wasCents) * 100)),
                )}
                rotate={-7}
                shadow
              />
            </View>
            {/* Foto varsa foto, yoksa baş harf — kitin tek dairesi (v3 fırsat kartı daire FOTO çizer). */}
            <CirclePhoto
              size={customerMetrics.offerPhoto}
              initial={offer.name.slice(0, 1)}
              initialFontSize={theme.text['h2-sm']}
              initialStyle={styles.offerInitial}
              photoUri={offer.image.url}
            />
            <View style={styles.offerText}>
              <Text style={styles.offerName}>{offer.name}</Text>
              <View style={styles.offerPriceRow}>
                {/* Fiyatsız ürün fırsat rayına giremez (uç süzer); `?? 0` tip daraltmasıdır. */}
                <Text style={styles.offerPrice}>{formatPrice(offer.priceCents ?? 0, locale)}</Text>
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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={home.refreshing}
            /* Hareket İKİ kaynağı tazeler: vitrin bölümleri ve kimlik (ad/toptan rozeti). Gösterge
               vitrinin hâline bağlı — kimlik okuması sessiz ve hızlıdır, ayrı bir gösterge
               göstermek kullanıcıya iki ayrı yükleme varmış izlenimi verirdi. */
            onRefresh={() => {
              home.refresh();
              meState.refresh();
            }}
            tintColor={theme.colors.olive}
          />
        }
        testID="home-scroll"
      >
        {header}
        {liveOrderBand}
        {lastOrderBand}
        {flashBand}
        {offerRail}

        {bands.length === 0 ? null : (
          <View style={styles.collections}>
            <Text style={[styles.sectionEyebrow, styles.collectionsEyebrow]}>{t.collections.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
            {/* Daireler bantların İÇİNDE değil, yığının ÜSTÜNDE (aşağıdaki katman): v3'te daire
                komşu bantlara taşar; RN'de kardeş sırası z-sırası olduğundan bunu ancak sonradan
                çizilen bir üst katman verebilir (kullanıcı bulgusu 08.08). */}
            <View style={styles.bandStack}>
              {bands.map((band, index) => (
                <CollectionBand
                  key={band.slug}
                  name={band.name}
                  subtitle={band.subtitle}
                  countLabel={t.collections.count.replace('{n}', String(band.productCount))}
                  index={index}
                  photoUri={band.image.url}
                  onPress={() =>
                    /* Kategori bandı katalogu O SÜZGEÇLE açar; koleksiyon kesiti mobil katalogda
                       henüz yok — koleksiyon bandı kataloğun köküne gider (BEKLEYEN(21.14) —
                       katalog koleksiyon süzgeci, doc 21 kalan listesinde). */
                    band.kind === 'category'
                      ? router.push({ pathname: '/catalog', params: { category: band.slug } })
                      : router.push('/catalog')
                  }
                  testID={`home-collection-${band.slug}`}
                  photoInOverlay
                />
              ))}
              {bands.map((band, index) => (
                <CollectionPhotoOverlay key={`photo-${band.slug}`} name={band.name} index={index} photoUri={band.image.url} />
              ))}
            </View>
          </View>
        )}

        {featured.length === 0 ? null : (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              {/* Başlığın sağındaki "Tüm katalog ›" bağlantısı KALKTI (v3 yeni sürüm): kapı artık
                  rayın SONUNDAKİ kart — parmağın zaten kaydırdığı yerde duruyor. */}
              <SectionHeader eyebrow={t.featured.eyebrow} title={t.featured.title} testID="home-featured-header" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleRail}>
              {featured.map((product) => (
                <ProductCircleCard
                  key={product.slug}
                  name={product.name}
                  /* Fiyatsız ürünü uç zaten süzer (satışa kapalı raya giremez); `?? 0` tip daraltması. */
                  priceLabel={formatPrice(product.priceCents ?? 0, locale)}
                  photoUri={product.image.url}
                  onPress={() => openProduct(product.slug)}
                  testID={`home-featured-${product.slug}`}
                />
              ))}
              {/* Rayın sonundaki KATALOG kartı (v3:130) — ürün dairesinin ikizi ama ürün DEĞİL:
                  fiyat çipi yerine ok rozeti, fotoğraf yerine katalog ikonu taşır. Bu yüzden
                  `ProductCircleCard` kullanılmadı; o kart fiyatı ZORUNLU tutar (künyesi) ve
                  fiyatsız bir kart doğurmak, ürün kartını "bazen ürün değil"e çevirirdi. */}
              <PressableSurface
                onPress={() => router.push('/catalog')}
                feedback="scale"
                style={styles.railEndCard}
                accessibilityLabel={t.featured.allCatalogLabel}
                testID="home-featured-all"
              >
                <View style={styles.catalogCircleFrame}>
                  <View style={styles.catalogCircle}>
                    {/* v3:133 ikonu 46; kitin büyük dekoratif ikon durağı `emptyIcon` (44) tam
                        bu aralık için açıldı (metrics künyesi: "tasarım 40–46"). */}
                    <Icon name="catalog" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />
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
                  photoUri={recipe.image.url}
                  initial={recipe.name.slice(0, 1)}
                  /* `duration` hazır metindir ("35 dk" — 05.16, cümleyi cihaz kurmaz); null →
                     rozet çizilmez (girilmemiş süreye rozet uydurulmaz). */
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
              {/* Rayın sonundaki KOYU kart (v3:155) → tarifler listesi. Tasarımın başlığı
                  "{n} tarif daha" diyor ama o sayı SÖZLEŞMEDE YOK: `/home` yalnız rayın kendi
                  dilimini taşıyor, toplam tarif sayısını değil. Uydurma bir sayı yazmaktansa
                  sayısız cümle kuruldu ("Tüm tarifler") — alan geldiği gün metin tek satırda
                  sayılı hâline döner (terfi ihtiyacı raporlandı). */}
              <PressableSurface
                onPress={() => router.push('/recipes')}
                feedback="scale"
                style={styles.recipesMoreCard}
                accessibilityLabel={t.recipes.moreLabel}
                testID="home-recipes-all"
              >
                <View style={styles.recipesMoreTop}>
                  <Text style={styles.recipesMoreEyebrow}>{t.recipes.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
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
          <Text style={styles.sectionEyebrow}>{t.packages.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
        </View>
        <View style={styles.packages}>
          {packages.map((pack) => (
            <PhotoTile
              key={pack.slug}
              height={customerMetrics.packageCardHeight}
              photoUri={pack.image.url}
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
          </>
        )}

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

      <PostalCodeSheet
        visible={zipSheetOpen}
        code={postalCode}
        signedIn={signedIn}
        copy={t.zip}
        onSave={saveLocation}
        onClose={() => setZipSheetOpen(false)}
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
    // Şablon 27; ölçekte en yakın durak `page-title-sm` (26).
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
    // Şablonun `.16em`i ile kitin üstbaşlık aralığı (.18em) arasındaki fark ölçülemez; token kazanır.
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
    fontSize: theme.text.helper,
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
  /** Fiyat çipiyle AYNI köşe (v3:135) — kart ürün dairesinin ikizi olduğu için hiza da aynı. */
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
  /** Tarif rayının koyu kapanış kartı — tarif kartıyla aynı ölçü (v3:155). */
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
    // v3:158 — 26; sayfa başlığı kademesiyle aynı durak.
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
  inviteArrow: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
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
