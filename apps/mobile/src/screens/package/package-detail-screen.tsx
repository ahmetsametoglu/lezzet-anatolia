import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PackageItem } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Image, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { BlurView } from 'expo-blur';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { publishToast } from '@/lib/toast/toast-store';
import { StockMark } from '@/components/ui/stock-mark';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addBundle, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { emToDp } from '@/theme/parse';
import messages from './messages.json';
import { usePackage } from './use-package.hook';

/*
  PAKET DETAY (v3 `vPackage`, v3:318-349 + yapışkan bar v3:1254-1270) — GERÇEK UÇTAN okur
  (`GET /api/v1/packages/:slug`): vitrinin "Hazır paketler" kartı gerçek slug'la geliyor ve
  fixture göstermek müşteriye başka bir paketi satmak olurdu (ürün detayının aynı gerekçesi).

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **"Tükendi" hâli ARTIK ÇİZİLİYOR (10.08)** — eski sapma kapandı. Künye 10.08'e kadar şöyle
     diyordu: *"sözleşme `soldOut` bilerek taşımıyor … karar terfi edince bar iki hâlini şablondaki
     sırayla kazanır."* Karar 09.08'de terfi etti, sözleşme 10.08'de alanı kazandı: foto rozeti
     (v3:16) ve barın tükendi kutusu (v3:53-55) yerinde. Ürün detayının "haber ver" anahtarı
     ALINMADI: pakette öyle bir kayıt yolu yok ve olmayan bir söz verilmez.

     **YER EKSENİ DE AYNI TURDA GELDİ** (kullanıcı kararı 10.08): sayfa artık posta kodunu
     gönderiyor ve "bu adrese gönderemiyoruz / bölgenizde şu an yok" cümlesini kataloğun kendi
     kapısından kuruyor (`stockMarkOf` + `packageStockStatus`). Kart listesinde olan solma burada
     da var ve yalnız KAHRAMANA uygulanır: yazı katmanı tam opak kalır, yoksa solmanın sebebini
     açıklayan cümle okunaksızlaşırdı. **"Tükendi" ile "buraya gelemez" AYRI şeylerdir:** birincisi
     sepete eklemeyi kapatır (karşılayamayacağımız şey teklif edilmez), ikincisi KAPATMAZ — yer bir
     söz, bir filtre değil; sepet ve ödeme adımı o kararı kendi kapısında veriyor.
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
  8. **Kahraman GALERİ oldu** (kullanıcı isteği 09.08, `design/KARARLAR.md`): tek foto yerine
     kaydırılabilir şerit (`PhotoGallery`) — önce paketin kapağı, sonra kalemlerin ana görselleri.
     16:10 kutu, konum ve başlık DEĞİŞMEDİ; görselsiz kalem atlanır, tek görselli pakette şerit
     de gösterge de çizilmez.
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
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  /* YER: kaynak katalog/vitrinle AYNI (cihazdaki onboarding kaydı). Kod sunucuya gider ve `route`
     onunla dolar; ikinci çözüm (`usePlaceResolution`) yalnız "rota içinde miyim" sorusunu
     cevaplar — cümlenin GEÇİCİ mi KALICI mı olduğu ondan çıkar. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const place = usePlaceResolution(postalCode ?? '');
  const { status, detail, retry } = usePackage(slug, locale, postalCode);

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

  /* YER İŞARETİ — cümleyi ekran kurmaz, `stockMarkOf` kurar; paketin kendi gerçeği ona
     `packageStockStatus` ile çevrilir (liste kartıyla TEK sözlük). Tükendide işaret basılmaz:
     hiçbir yerde yokken "bu adrese gelmez" demek cevabı olmayan bir soruya cevap vermektir. */
  const stockMark = detail.soldOut ? null : stockMarkOf(packageStockStatus(detail), place, locale);
  /* "Kargoyla gelir" (`info`) detayda da yazılmaz: kargo kısıtı zaten kendi çipiyle (`noShip`)
     konuşuyor ve rota dışındaki müşteri için bu cümle listelerin başındaki bantta duruyor. */
  const placeMark = stockMark !== null && stockMark.tone !== 'info' ? stockMark : null;
  /* Solma yalnız KAHRAMANA: kart listesindeki kararla aynı — bilgi katmanı tam opak kalır. */
  const heroFaded = detail.soldOut || placeMark?.tone === 'blocked';

  /* Kahraman şeridi: ÖNCE paketin kendi kapağı, SONRA kalemlerin ana görselleri. Sıra kararın
     kendisidir — satılan şey pakettir, kalemler onun içeriği; kapağı araya karıştırmak paketi
     kalemlerinden biri gibi gösterirdi. Adressiz kalem ELENİR (boş kare çizilmez); tekrarlanan
     adresi galeri komponenti eler. Paket sözleşmesinde ayrı bir `gallery` alanı YOK — şerit
     kalemlerin kendi kapaklarından kurulur (`PackageDetailSchema.items[].image`). */
  const heroPhotos = [detail.image, ...detail.items.map((item) => item.image)]
    .map((image) => image.url)
    .filter((url): url is string => url !== null);

  const addToCart = () => {
    addBundle(
      {
        /* Satırın kimliği paketin UUID'sidir, slug'ı değil (21.21): sunucu sepetinde paket satırının
           adresi `bundleId`dir (`cart.items[].bundle_id`) ve görünüm satırı da onunla anılıyor
           (`cartLineId`). Slug bir GÖRÜNTÜ kimliğidir — yeniden adlandırılabilir ve sepetteki satırı
           sessizce ikizler. Sözleşme uuid'yi 21.21'de kazandı; ondan önce elimizde yalnız slug vardı
           ve paket bu yüzden sunucuya hiç yazılamıyordu. */
        id: detail.id,
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
        {/* ── Foto 16:10 (v3:14-17), galeri şeridi olarak; tükendi rozeti v3:16 ── */}
        <View style={styles.hero}>
          {/* SOLAN GRUP yalnız galeri; rozet onun kardeşi ve tam opak (sapma 1). */}
          <View style={[styles.heroPhotos, heroFaded ? styles.heroFaded : undefined]}>
            <PhotoGallery
              uris={heroPhotos}
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
              <Text style={styles.heroBadgeLabel}>{t.badge.soldOut}</Text>
            </View>
          ) : null}
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
          {/* YER İŞARETİ — kitin ortak rozeti (`StockMark`), cümlesi katalogla AYNI. Sarmalayıcı
              onu SOLA yaslar: rozetin kendi hizası daire kartın ortalı ekseni içindir, bu sayfa
              ise sola hizalı bir gövde (kısıt çipiyle aynı sütun). */}
          {placeMark === null ? null : (
            <View style={styles.placeMarkSlot}>
              <StockMark label={placeMark.label} tone={placeMark.tone} testID="package-place-mark" />
            </View>
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
        {/* TÜKENDİ BARI (v3:53-55) — sayaç ve ekleme düğmesi HİÇ çizilmez: karşılayamayacağımız
            bir şeyi teklif eden bir düğme, müşteriyi sepette ya da ödemede duvara götürürdü.
            "Bu adrese gönderemiyoruz" hâli burayı DEĞİŞTİRMEZ (sapma 1): paket bir yerde var,
            yalnız bu adrese o yoldan gitmiyor — kararı sepet ve ödeme adımı veriyor. */}
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
        )}
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
  /** Galeri kutuyu doldurur; rozet onun kardeşi olduğu için ayrı bir katman gerekiyor. */
  heroPhotos: { flex: 1 },
  /* Solma durağı kart listesiyle AYNI (`soldOutOpacity`): iki yüzey aynı şeyi söylemeli. */
  heroFaded: { opacity: theme.soldOutOpacity },
  /* Tükendi rozeti (v3:16) — ürün detayının kahraman rozetiyle aynı yuva ve aynı mürekkep zemin. */
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
  /** Tükendi barının tek satırı — ürün detayının aynı kademesi ve rengi (v3:53-55). */
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
