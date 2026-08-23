import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { HomeBand } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@/components/ui/pull-refresh';

import { CirclePhoto } from '@/components/ui/circle-photo';
import { Icon } from '@/components/ui/icon';
import { OfflineNotice } from '@/components/ui/offline-notice';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { productPriceLabel } from '@/screens/customer-kit/price-label';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { PhotoTile } from '@/screens/customer-kit/photo-tile';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useMe, useWholesale } from '@/screens/customer-kit/use-me.hook';
import { emToDp } from '@/theme/parse';
import { campaignValueOf, cardBadgeOf } from '@/screens/customer-kit/campaign-label';
import { CollectionBand, CollectionPhotoOverlay } from './collection-band';
import { homeData, type HomeData } from './home-fixture';
import {
  DEFAULT_HOME_LAYOUT,
  getHomeLayoutSnapshot,
  saveHomeLayout,
  subscribeHomeLayout,
} from './home-layout-memory';
import { HomeSkeleton } from './home-skeleton';
import messages from './messages.json';
import { useHome } from './use-home.hook';
import { useHomeOrders } from './use-home-orders.hook';

/*
  VİTRİN (v3 `vHome`) — uygulamanın açılış ekranı. Şablonun sırası birebir korundu: başlık →
  süren sipariş → günün fırsatı → fırsat rayı → koleksiyon bantları → vitrin rayı → tarif rayı →
  hazır paketler → Keşif ve profesyonel davetleri.

  ── VERİNİN DÖRT KAYNAĞI ────────────────────────────────────────────────────
  · `/api/v1/home` (bantlar · seçki · FIRSATLAR · tarifler · paketler),
  · `/api/v1/me` (selamlama adı, toptan rozeti),
  · `/api/v1/me/orders` (süren sipariş bandı + "geçen siparişi tekrarla" bandı — 09.08),
  · cihaz (`lib/onboarding` — teslimat bölgesi kodu) + `/places` (kodun şehri).
  Fixture'da kalan tek şey günün fırsatıdır ve o da ÇİZİLMİYOR (aşağıdaki künye). Veri PROP olarak
  alınıyor (varsayılanı fixture) ki testler kendi hâllerini aynı kapıdan kursun.

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

/* Selamlamanın saati ÇİZİM ANINDA okunur. Eskiden geri sayımın saniyelik sayacına bağlıydı; o
   sayaç günün fırsatıyla birlikte kalktı ve yalnız selamlama için saniyede bir yeniden çizim
   yapmak, bir saatte bir değişen bir kelime için ödenecek bedel değil. En kötü hâl, ekran açık
   dururken selamlamanın bir sonraki etkileşime kadar geç dönmesidir. */

/** Şablonun selamlama eşikleri: 11'den önce sabah, 18'den önce gündüz, sonrası akşam. */
function greetingOf(t: Messages, hour: number, firstName: string | null): string {
  if (firstName === null) return t.greeting.guest;
  const part = hour < 11 ? t.greeting.morning : hour < 18 ? t.greeting.afternoon : t.greeting.evening;
  return t.greeting.withName.replace('{greeting}', part).replace('{name}', firstName);
}

/**
 * **KAÇ TANE KALDIYSA O KADAR ACELE** — fırsat kartının sınır satırı (kullanıcı kararı 19.08).
 *
 * ── ÖNCEKİ HÂL BİR YALANDI ──────────────────────────────────────────────────
 * Satır sabitti ve her karta koşulsuz basılıyordu: *"STOKLA SINIRLI · YALNIZ BUGÜN"*. İkinci
 * yarısının arkasında hiçbir veri YOKTU — fırsat bir kampanya değil, **SKT'si yaklaşan bir
 * partiden doğuyor**; kimse seçmiyor ve `design/BACKLOG.md`nin kendi cümlesiyle *"süresi yoktur"*.
 * Sözleşmede bitiş anı diye bir alan da yok, yani ekran bilse bile yazamazdı. Kullanıcı cihazda
 * gördü ve sordu: *"Gerçekten sadece bugüne özel bir indirim mi yoksa bugün son günü mü?"* — ikisi
 * de değildi. Bu, 09.08'de tam bu sebeple kaldırılan "GÜNÜN FIRSATI · {süre} KALDI" bandının
 * hayatta kalan ikiziydi.
 *
 * ── GERÇEK SINIR GÜN DEĞİL, ADET ────────────────────────────────────────────
 * Teklif fiyatı PARTİYE bağlı: o partide kalandan fazlası normal fiyata taşar (DOMAIN §5). Sayı
 * zaten sözleşmede (`limitLabel`) ve ürün detayı onu doğru kullanıyordu; yalnız bu kart yok
 * sayıyordu. Artık iki ekran aynı gerçeği söylüyor.
 *
 * ── İKİ KADEME (kullanıcı kararı) ───────────────────────────────────────────
 * *"Belirli bir adetten fazla ise stoklarla sınırlı diyelim. Fakat belli bir adetin altındaysa
 * son üç adet de sinirli bir ifade kullanabiliriz."* — çok kalanda aciliyet uydurmak yanlış
 * olurdu, az kalanda ise sayıyı saklamak müşteriden bilgi gizlemek olur.
 *
 * **Sınır YOKSA satır HİÇ çizilmez:** `limitLabel === null` "adet sınırı yok" demektir ve o hâlde
 * söylenecek doğru bir cümle yoktur — sıfır değil, YOK (CLAUDE §1).
 */
function offerLimitOf(limitLabel: string | null, t: Messages['offers']): string | null {
  if (limitLabel === null) return null;
  const left = Number(limitLabel);
  /* Sayıya çevrilemeyen değer beklenmiyor (`map.ts` `String(quantityCap)` yazıyor) ama sessizce
     `NaN` ile eşik karşılaştırmasına girmesin: bilinmeyen sayıda "son N adet" yazmak uydurma olur,
     "stokla sınırlı" ise her hâlde doğru. */
  if (!Number.isFinite(left)) return t.limited;
  return left <= LAST_FEW_THRESHOLD ? t.lastFew.replace('{n}', String(left)) : t.limited;
}

/**
 * Bandın sayaç satırı — kampanya varsa aynı satıra girer (08.44).
 *
 * **Neden yeni bir satır değil:** bandın yüksekliği bir ölçü değil bir SÖZLEŞMEdir (MB-25) — üst
 * katman dairesi bantları `index * collectionBand` ile konumlandırıyor, boy değişirse daireler
 * kayar. 132 dp bütçesi zaten iki satırlık başlıkla dolu; üçüncü bir satır ilk taşan olurdu.
 * Sayaç satırı ise TEK satır ve kampanya oraya sığıyor.
 *
 * **Ve bu bilinçli olarak MÜTEVAZI bir çözüm (CLAUDE §3):** rozetin görsel kararı `.dc.html`de
 * yok; yeni bir çip icat etmek improvise etmek olurdu. Kampanya var olan satıra, var olan vurgu
 * renginde giriyor. Tasarım bir rozet çizerse buradaki türetme aynen kullanılır, yalnız yeri değişir.
 */
function bandCountLabel(band: HomeBand, t: Messages, locale: Locale): string {
  const count = String(band.productCount);
  const campaign = band.campaign === null ? null : campaignValueOf(band.campaign, t.campaign, locale);
  if (campaign === null) return t.collections.count.replace('{n}', count);
  return t.collections.countWithCampaign.replace('{n}', count).replace('{campaign}', campaign);
}

/**
 * "Son birkaç adet" eşiği — **parametrik**, iş kuralı değil bir SUNUM kararı (CLAUDE §4: eşik
 * sorulmaz, makul varsayılan konur ve parametrik yapılır). 5'in altında sayıyı söylemek müşteriye
 * gerçek bir bilgi verir; üstünde "3 kaldı" demek de olmadığı için ölçüt burada duruyor.
 * Değiştirmek isteyen tek satırı değiştirir; iki kademe de aynı yerden okunur.
 */
const LAST_FEW_THRESHOLD = 5;

export function HomeScreen({ data = homeData() }: HomeScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();
  const count = cartCount(cart);

  const { customer: fixtureCustomer } = data;
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

  /* SİPARİŞ BANTLARI GERÇEK UÇTAN (09.08): süren sipariş ve "geçen siparişi tekrarla" artık
     `/api/v1/me/orders`tan okunuyor — sabit `LA-2418` kalktı. Kapı oturuma bağlı (`signedIn`):
     misafirde ne çağrı yapılır ne bant çizilir; giriş/çıkış anında hook kendiliğinden döner. */
  const homeOrders = useHomeOrders(locale, signedIn);
  const liveOrder = homeOrders.live;
  const lastOrder = homeOrders.last;

  /* TESLİMAT BÖLGESİ — kaynak CİHAZ (onboarding'de yazılan kod), adı da gerçek uçtan (`/places`).
     Fixture'daki sabit "67000 STRASBOURG" kalktı: kullanıcının kendi cevabı dururken uydurma bir
     şehir yazmak, ekranın en görünür yerinde yalan söylemekti. Kod hiç girilmemişse (onboarding
     atlandı) hap bir DAVET olur — boş bir yer adı basılmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const savedPlace = usePlaceResolution(postalCode ?? '');
  const savedPlaceName = savedPlace?.kind === 'resolved' ? savedPlace.place.placeName : null;
  const postalLabel =
    postalCode === null ? null : savedPlaceName === null ? postalCode : `${postalCode} ${upperIn(savedPlaceName, locale)}`;

  /* Vitrin okuması YERE bağlı: posta kodu `useHome`a geçer, sunucu depoyu çözer ve fırsat şeridi
     ancak öyle dolar (ölçüldü 09.08 — kodsuz 0, 67000 ile 2). Çağrı bu yüzden posta kodunun
     TANIMLANDIĞI satırdan sonra durur; kod değişince hook yeniden okur. */
  const home = useHome(locale, postalCode);
  const bands = home.home?.bands ?? [];
  const featured = home.home?.featured ?? [];
  const offers = home.home?.offers ?? [];
  const recipes = home.home?.recipes ?? [];
  const packages = home.home?.packages ?? [];

  /* ── SKELETON'IN YERLEŞİMİ SON AÇILIŞTAN (kullanıcı kararı 10.08) ──────────────
     Vitrinin bölümleri koşullu, iskelet ise veri gelmeden hangisinin çıkacağını bilemez. Sabit
     bir iskelet (eski hâli) her açılışta olmayan blokları çizip veri gelince kaybediyordu — ekran
     zıplıyordu. Cihaz bu vitrini geçen sefer gördü; iz o yüzden tutuluyor ve iskelet onu çiziyor.

     YAZMA YALNIZ BAŞARILI YÜKLEMEDE: hata hâlinde bölümler zaten çizilmiyor, o boşluğu "geçen
     sefer böyleydi" diye kaydetmek bir sonraki açılışın iskeletini yanlış küçültürdü.

     Sipariş bandı iki kapıdan geçer — İZ ve OTURUM. İz "vardı" dese bile MİSAFİRDE çizilmez
     (bant girişe bağlı); oturum henüz OKUNMADIYSA ize güvenilir, çünkü ölçülmemiş bir değeri
     "yok" saymak bilinen bir bilgiyi çöpe atmaktır (CLAUDE §1). */
  const storedLayout = useSyncExternalStore(subscribeHomeLayout, getHomeLayoutSnapshot);
  const knownGuest = meState.status === 'ready' && meState.me === null;
  const layout = storedLayout ?? DEFAULT_HOME_LAYOUT;
  const skeletonSections = { ...layout, orderBand: layout.orderBand && !knownGuest };

  const hasOrderBand = liveOrder !== null || lastOrder !== null;
  useEffect(() => {
    if (home.status !== 'ready') return;
    void saveHomeLayout({
      orderBand: hasOrderBand,
      // Günün fırsatı sayfada ÇİZİLMİYOR (ucu yok — aşağıdaki künye), yani hiç görülmedi.
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
     bunu girişli müşteriye açıkça söyler (kit künyesi: `browsingOnly`).

     KAYDI ÇEKMECE YAPAR (10.08, kite taşınırken): kaydetme ve onay toast'ı artık çekmecenin
     içinde — aynı çekmeceyi bilgi bandı ve teslimat bölgeleri sayfası da açıyor ve kaydın ne
     yaptığı üç ekranda üç kez yazılmamalı. Vitrine kalan tek şey açma/kapama. */
  const openLocation = () => setZipSheetOpen(true);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  /* İLK YÜK: sayfanın yerini iskelet tutar (kullanıcı isteği 09.08 — "vitrin sayfasını bire bir
     kopyalasın"). Yalnız İLK yük: aşağı çekerek yenilemede hook `loading`e düşmez (künyesi),
     bölümler yerinde kalır. Bütün kancalar bu satırın ÜSTÜNDE çağrılıyor; erken dönüş çağrı
     sırasını bozmaz. Hangi bölümlerin çizileceğini son açılışın izi söyler (yukarıdaki künye). */
  if (home.status === 'loading')
    return (
      /* KEŞİF DAVETİ ARTIK HER HÂLDE ÇİZİLİYOR (MB-75, 18.08 — aşağıdaki künye), o yüzden iskelet
         de kutuya HER ZAMAN yer ayırır. Eskiden `!knownGuest` idi çünkü kart misafirde hiç
         çizilmiyordu; ölçüt orada kalsaydı misafirin sayfası oturduğu an bir kutu boyu AŞAĞI
         kayardı — iskeletin işi tam bunu önlemek. Sipariş bandının `knownGuest` ölçütü yerinde
         duruyor: o blok gerçekten girişliye özel. */
      <HomeSkeleton sections={skeletonSections} discoverInvite testID="home-skeleton" />
    );

  /* SUNUCUYA ULAŞILAMADIYSA SAYFA BUNU SÖYLER (kullanıcı kararı 20.08).
     Eskiden bu dal YOKTU ve `error` hâli olduğu gibi aşağıya düşüyordu: `home` `null` kaldığı için
     her bölüm "boş dizi = bölüm yok" kuralına takılıp çizilmiyor, ekranda yalnız selamlama ile iki
     statik davet kartı kalıyordu. Cihazda ölçüldü (20.08, mobil API kapalı, soğuk açılış): vitrin
     BOMBOŞ ve tek bir uyarı yok — müşteri "mağaza boş" ya da daha kötüsü "sepetim gitmiş" sanıyor
     (sepet rozeti de o hâlde çizilmiyor). Kaybolan veri değil, okunamayan sunucuydu.

     Dosyanın üstündeki künye bu boşluğu "tasarımdan hata hâli gelirse bu durumdan okunur" diye
     bırakmıştı; karar geldi. Görünüm İCAT EDİLMİYOR: katalog/paketler/siparişler ekranlarının
     zaten kullandığı `connection-off` kalıbı (`OfflineNotice`), yalnız metni vitrinin kendi
     sözlüğünden. `retry` kancada zaten vardı, kullanılmıyordu. */
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
            {greetingOf(t, new Date().getHours(), customer.firstName)} <Text style={styles.asterisk}>✺</Text>
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

  /* TESLİM PENCERESİ YAZILMIYOR (ölçüldü 09.08): şablon "Bugün 14:00 – 18:00" diyordu ama böyle
     bir veri YOK — sözleşmenin liste satırı (`MeOrderSummary`) teslim günü taşımıyor, veritabanı
     da yalnız GÜN tutuyor (`order.delivery_date` bir `date`; saat aralığı hiçbir yerde yok).
     Uydurma bir saat basmak müşteriye verilmiş bir söz olurdu; bant tek satır çiziliyor ve alan
     ihtiyacı raporlandı. */
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
        </View>
        <View style={styles.trackTilt}>
          <View style={styles.trackChip}>
            <Text style={styles.trackLabel}>{t.liveOrder.track}</Text>
          </View>
        </View>
      </PressableSurface>
    );

  /* Sapma 4: süren sipariş varken "tekrarla" bandı çizilmez.

     BANT SEPETE DEĞİL SİPARİŞ DETAYINA GÖTÜRÜR (09.08): tekrar sipariş, kalemleri BUGÜNKÜ fiyat
     ve satılabilirlikle sepete kopyalayan bir orkestrasyondur; o kural `@lezzet/application`a
     terfi etmedi ve ucu da yok (`orders-screen` künyesi sapma 1). Eski hedef boş sepeti açıyordu
     — "tek dokunuşla sepete" diyip hiçbir şey eklememek verilmiş bir sözü tutmamaktı. Detay,
     müşterinin ne aldığını gördüğü ve tekrarın gerçekten başladığı yer; alt satır da bu yüzden
     vaatsiz künyeye (`{reference} · {total}`) indi. Uç geldiği gün hedef sepet olur. */
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

  /* ── GÜNÜN FIRSATI ÇİZİLMİYOR (kullanıcı kararı 09.08) ────────────────────────
     Şablonda geri sayımlı bir "günün fırsatı" bandı var ve buraya fixture'la çizilmişti. Ölçüldü:
     BÖYLE BİR ÖZELLİK YOK — ne "günün fırsatı" diye seçilmiş bir kayıt, ne de bitiş anını
     (`endsAtMs`) taşıyan bir uç. Fırsat şeridi (`offers`) başka bir şeydir: SKT'si yaklaşan
     partiden doğan indirimli ürünler, süresi yok.

     Kurgu veriyle çizilip bırakılsaydı ekranın en görünür yerinde tutulamayacak bir söz dururdu —
     sayaç işleyip biterdi ama arkasında bir kampanya olmazdı. Kaldırıldı; kavram
     `design/BACKLOG.md`ye yazıldı ve uç geldiği gün blok şablondaki yerine döner.
     Yardımcılar (`countdownLabel`, `now` sayacı) da onunla birlikte kalktı. */

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
              {/* SATIR ARTIK VERİDEN (kullanıcı bulgusu + kararı 19.08) — gerekçe `offerLimit`
                  yardımcısının künyesinde. Sınır YOKSA hiçbir şey yazılmaz. */}
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
            /* Hareket İKİ kaynağı tazeler: vitrin bölümleri ve kimlik (ad/toptan rozeti). Gösterge
               vitrinin hâline bağlı — kimlik okuması sessiz ve hızlıdır, ayrı bir gösterge
               göstermek kullanıcıya iki ayrı yükleme varmış izlenimi verirdi. */
            onRefresh={() => {
              home.refresh();
              meState.refresh();
              // Sipariş bantları da tazelenir: teslimat gün içinde ilerliyor ("hazırlanıyor" →
              // "yolda") ve ekranın en üstünde eski bir durum kalması vitrinin yalan söylemesidir.
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
            {/* Daireler bantların İÇİNDE değil, yığının ÜSTÜNDE (aşağıdaki katman): v3'te daire
                komşu bantlara taşar; RN'de kardeş sırası z-sırası olduğundan bunu ancak sonradan
                çizilen bir üst katman verebilir (kullanıcı bulgusu 08.08). */}
            <View style={styles.bandStack}>
              {bands.map((band, index) => (
                <CollectionBand
                  key={band.slug}
                  name={band.name}
                  subtitle={band.subtitle}
                  countLabel={bandCountLabel(band, t, locale)}
                  index={index}
                  photoUri={band.image.url}
                  onPress={() =>
                    /* Her iki tür de katalogu KENDİ süzgeciyle açar (21.64 — koleksiyon kesiti
                       eklenene kadar koleksiyon bandı kataloğun köküne gidiyordu ve müşteri
                       "Bayram Sofrası"na basıp tüm katalogu görüyordu). Parametre adları uçtakiyle
                       ve web'in URL'siyle aynı; süzgecin sahibi katalog ekranıdır. */
                    band.kind === 'category'
                      ? router.push({ pathname: '/catalog', params: { category: band.slug } })
                      : router.push({ pathname: '/catalog', params: { collection: band.slug } })
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
              {featured.map((product) => {
                /* YER İŞARETİ (21.20) — katalog kartıyla AYNI cümle, AYNI komponent. Vitrin ve
                   katalog aynı ürüne bakan iki ekran; işaret yalnız birinde çizilseydi rota dışı
                   müşteri iki ekranda iki farklı gerçek okurdu. Kaynak da aynı: `stockStatus`
                   sözleşmede zaten vardı (`CatalogProductSchema`), vitrin onu atıyordu. */
                const stockMark = stockMarkOf(product.stockStatus, savedPlace, locale);
                /* "KARGOYLA GELİR" ÇİZİLMEZ (kullanıcı kararı 10.08 — katalog ekranının aynı
                   satırı). Rota dışı müşterinin kartlarının neredeyse TAMAMI o işareti taşıyordu,
                   yani bilgi olmaktan çıkıp gürültü oluyordu; cümle listenin başındaki bilgi
                   bandına, TEK yere taşındı. Kartta yalnız KAPALI kapı konuşur ("bu adrese
                   gönderemiyoruz") — o istisnadır ve söylenmezse müşteri sepette öğrenir. */
                const placeMark = stockMark === null || stockMark.tone === 'info' ? undefined : stockMark;
                return (
                  <ProductCircleCard
                    key={product.slug}
                    name={product.name}
                    /* Etiket kitin türetmesinden: çok boyluda "…'dan" eki, fiyat yoksa çip hiç
                       çizilmez. Buradaki eski `?? 0` gerekçeliydi (uç fiyatsızı süzer) ama artık
                       gereksiz — kural tek yerde ve sıfıra düşmüyor (`customer-kit/price-label`). */
                    priceLabel={productPriceLabel(product.priceCents, product.variantCount, locale)}
                    /* KAMPANYA ROZETİ (23.08) — seçki KARIŞIK bir liste: kartları farklı
                       kategorilerden gelir ve üstünde kampanyayı söyleyecek bir başlık yok.
                       Kullanıcı kararının tarif ettiği yer tam burası. Kural kitte (`cardBadgeOf`):
                       Fırsat kampanyayı yener, eşikli kampanya rozete girmez. */
                    discountLabel={cardBadgeOf(product, { offer: t.card.offer, campaign: t.card.campaign }, locale)}
                    photoUri={product.image.url}
                    stockMark={placeMark}
                    // Solma yalnız KAPALI kapıda (gerekçe: katalog ekranının aynı satırı).
                    dimmed={stockMark?.tone === 'blocked'}
                    onPress={() => openProduct(product.slug)}
                    testID={`home-featured-${product.slug}`}
                  />
                );
              })}
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
                    {/* v3:133 ikonu 46; kitin dekoratif ikon durağı `decorIcon` (44) tam bu aralık.
                        Eskiden `emptyIcon`di ve o durak 16.08'de 80'e çıktı (boş hâl ikonu büyüdü) —
                        bu ikon sabit bir dairenin İÇİNDE, sayfanın konusu değil; ayrıldılar. */}
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
            /* PAKETİN YER EKSENİ (10.08) — ürün dairesiyle AYNI kapı, AYNI cümle: paketin kendi
               gerçeği (`soldOut` + `route`) önce ürün sözlüğüne çevrilir (`packageStockStatus`),
               cümleyi yine `stockMarkOf` kurar. Vitrin ile paketler sekmesi aynı karta bakan iki
               ekran; işaret yalnız birinde çizilseydi müşteri iki farklı gerçek okurdu. */
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
                photoUri={pack.image.url}
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
          {/* KEŞİF DAVETİNİN CÜMLESİ SAYI VERMEZ (MB-15, ölçüldü 11.08). Burada bir süre
              "Her tamamlanan tur +10 puan kazandırır" yazıyordu ve o sayı HİÇBİR ayara karşılık
              gelmiyordu: gerçek kazanç kart sayısı × `points_feedback_candidate` (=2), yani dört
              kartlık turda 8; "+10" muhtemelen `points_visit`/`points_order` ile karışmıştı.
              Sayıyı ayardan KURAMIYORUZ: vitrin sözleşmesi puan taşımıyor (`home-api.schema`) ve
              turdaki kart sayısı da burada bilinmiyor (deste `/discover` çağrılınca kuruluyor) —
              ikisi de uç değişikliği ister. Ekrana sabit sayı gömmek ise 29.07 denetiminin
              kapattığı arıza sınıfı: ayar değiştiği gün ekran, vermediğimiz bir ödülü vaat eder.
              Vaadin kendisi (tamamlanan tur puan kazandırır) doğru ve ölçülebilir; yanlış olan
              yalnız sayıydı.

              ── MİSAFİRE DE ÇİZİLİR, AMA BAŞKA CÜMLEYLE (MB-75, 18.08) ────────
              **Eski hâl (MB-58a, 14.08): kart misafire HİÇ çizilmiyordu.** Gerekçesi doğruydu —
              kartın cümlesi *"tamamlanan tur puan kazandırır"* diyor, oysa motor kimliksiz oya
              puan yazmıyor (`application/feedback/discover.ts`, `pointsAwarded: null`); misafire
              tutulamayacak bir söz veriliyordu.

              **Ama çare fazla genişti ve künyesi bunu görmüyordu.** Aynı künye *"turun KENDİSİ
              misafire açık kalmaya devam ediyor … misafir sekmeden ya da bitiş ekranının giriş
              davetinden geçer"* diye yazıyordu; ölçüldü (18.08, kullanıcı sorusu üzerine):
              **sekme YOK** (`app/(tabs)`: index · catalog · packages · account) ve bitiş ekranı
              turun İÇİNDE. `/discover`a giden öteki iki çağrı hesap ekranında, o da misafiri
              `/login`e itiyor. Yani ödül vaadiyle birlikte TURUN KENDİSİ de kapanmıştı ve
              tasarımın kararı (*"misafirin oyu da talep sinyalidir"*) fiilen uygulanmıyordu.

              **Doğru çare cümleyi düzeltmek, kapıyı kapatmak değil** — ve o cümle zaten YAZILMIŞ:
              turun bitiş ekranı aynı sorunu aynı gün doğru çözmüş (MB-14): *"Giriş YAPARSANIZ
              keşif turları puan kazandırır."* Koşullu, gelecek zamanlı, yalansız. Kart artık
              misafirde o registeri kullanıyor (`t.discover.guestBody`); girişlide vaat kesindir
              ve `body` aynen kalır.

              **Misafirin emeği de kaybolmuyor:** girişsiz oylar cihazda tutulup girişte hesaba
              bağlanıyor (`lib/discover/pending-swipes-store` → `/me/discover/claim`). Yani
              koşullu cümle bir teselli değil, gerçekten tutulan bir söz. */}
          {/* OYLANACAK KART KALMADIYSA DAVET HİÇ ÇİZİLMEZ (MB-58b, 20.08). Aday kümesi operatörün
              eliyle büyür ve bugün küçük; hepsini oylamış müşteriye davet göstermek, açtığında
              BOŞ çıkan bir tura çağırmaktı. Sayı artık vitrin sözleşmesinde (`discoverCards`) ve
              destenin kendisini kuran kuraldan geliyor, yani iki taraf ayrı düşemez.

              Backlog bunu "sıcak yola iki sorgu" diye askıya almıştı; askının dayanağı sorguların
              SIRAYLA koşacağı varsayımıydı — ölçüldü, uç zaten yedi okumayı paralel yapıyor ve
              yenisi demetin içine girdi (uç künyesi).

              KOŞUL `> 0`, `!== 0` DEĞİL: sözleşme negatif sayı taşımıyor ama ölçüt niyeti söylesin
              — çizmenin şartı kart OLMASI. */}
          {home.home !== null && home.home.discoverCards > 0 ? (
            <DashedInvite
              title={t.discover.title}
              description={signedIn ? t.discover.body : t.discover.guestBody}
              onPress={() => router.push('/discover')}
              action={<Text style={styles.inviteChevron}>›</Text>}
              testID="home-discover"
            />
          ) : null}
          {/* İKİ DAVET AYNI GÖRSEL DİLDE AMA AYNI RENKTE DEĞİL (MB-27).
              **Birinci adım (14.08):** kart `sand` tonundaydı ve canlı Keşif kartının yanında
              DEVRE DIŞI gibi duruyordu (kullanıcı bulgusu 11.08). Kusur tonun kendisinde değil,
              yanlış seçilmiş olmasındaydı: `sand` bilgi tonudur, bu kart ise bir sayfaya davet
              ediyor. Terracotta'ya çevrildi.
              **İkinci adım (15.08, kullanıcı kararı):** o zaman da iki kart alt alta AYNI renkte
              kaldı ve bu istenmedi. Zeytine geçti — ayrım *"biri sönük"* diye değil, **ikisi ayrı
              yere götürüyor** diye kuruldu; zeytin uygulamanın olumlu/birincil rengi olduğu için
              kart canlı kalıyor. İşaret ikisinde de aynı (`›`): renk NEREYE gittiğini söyler,
              jest ise ne yapıldığını — ikisi farklı sorular. */}
          {/* CEVABI BELLİ SORU SORULMAZ (kullanıcı kararı 20.08). Kart *"Restoran ya da market
              misiniz? Toptan fiyatlar için profesyonel hesap açın"* diyor; onaylı toptancıya bunu
              göstermek, yaptığı şeyi yapmaya davet etmektir — cihazda görüldü (20.08, Bosphore
              hesabı: başlıkta TOPTAN rozeti VE altında bu davet, aynı ekranda). Başvurusu
              incelemede olan da aynı: cevabını vermiş, sırasını bekliyor.

              MB-58(a) ile AYNI SINIF: karşılığı olmayan davet. Ölçüt yeni yazılmadı, `useWholesale`
              zaten burada (TOPTAN rozetini o çiziyor) — künyesi *"iki kopya bir gün ayrışır"* diyor
              ve bu üçüncü çağıran.

              KİŞİSEL HESAPTA DURUR (kullanıcı kararı, seçenekli soruldu): `/professionals`a giden
              TEK kapı bu kart; girişli herkesten gizleseydik kişisel hesapla kaydolmuş bir
              restoranın başvuru yolu tamamen kapanırdı. Soru orada hâlâ anlamlı. */}
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
          {/* VİTRİNDE YASAL BLOK YOK — bir kez konup GERİ ALINDI (kullanıcı kararı 19.08).
              Gerekçe web'in altbilgisiydi: orada beş belge her sayfanın dibinde durur. Ama web'de
              altbilgi sayfanın ZATEN parçası, native'de vitrin alışverişin kendisi — kanunun
              istediği şey belgelerin ERİŞİLEBİLİR olması, her ekranda GÖSTERİLMESİ değil. Ölçüt:
              devlet nerede neyi istiyorsa o kadar. Kapılar hesap ekranında (kalıcı ev) ve
              checkout'ta (sözleşme öncesi bilgi) — vitrin alışveriş yüzeyi olarak kaldı. */}
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
  /* `liveDay` (teslim penceresi satırı) KALDIRILDI — veri yok, bant tek satır (bandın künyesi). */
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
  /* YER NOTU — paket listesindeki kardeşiyle AYNI karar: zeminsiz yazı, künyenin son satırı.
     RENK VURGU TONU (kullanıcı kararı 11.08, paketler sekmesiyle tek karar): krem (`on-image`) adın
     ve üstbaşlığın rengiydi, not onların arasında üçüncü bir künye satırı gibi okunuyordu — oysa
     taşıdığı şey künye değil bir UYARI. İki ekran aynı karta bakıyor (yukarıdaki satırın künyesi);
     rengin ayrışması aynı cümleyi iki ekranda iki ayrı ağırlıkta gösterirdi. */
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

  /* Yüzen düğme: sekme çubuğunun üstünde, sağ altta (şablon: `right:18px; bottom:84px` — çubuğun
     yüksekliği ekranın kendi akışında olduğu için burada yalnız çubuğun üstündeki nefes kalır). */
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: theme.space['5xl'],
  },
}));
