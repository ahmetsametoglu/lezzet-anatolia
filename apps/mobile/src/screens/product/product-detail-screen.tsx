import { formatPrice } from '@lezzet/helper';
import type { TextSegment } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { ALLERGEN_LABELS, NUTRITION_KEYS, resolveLocalizedText } from '@lezzet/types';
import type { CatalogVariant, Nutrition, ProductAllergen } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { BlurView } from 'expo-blur';
import { CirclePhoto } from '@/components/ui/circle-photo';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { toastInfo, toastSuccess } from '@/lib/toast/toast-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addProduct, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { fromPriceLabel, productPriceLabel } from '@/screens/customer-kit/price-label';
import { emToDp } from '@/theme/parse';
import messages from './messages.json';
import { ProductSkeleton } from './product-skeleton';
import { useProduct } from './use-product.hook';

/*
  ÜRÜN DETAY (v3 `vProduct`, v3:238-316 + yapışkan bar v3:1228-1252) — GERÇEK UÇTAN okur
  (`GET /api/v1/products/:slug`): sayfaya katalogdan gerçek slug'la gelinir ve fixture göstermek
  müşteriye başka bir ürünü satmak olurdu. 21.14'ün "backend işi üretmez" kısıtı bozulmadı — uç
  zaten vardı (21.6), burada yalnız TÜKETİLİYOR (katalog ekranının emsali).

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Puan/yorum ÇİZİLMEZ, "yorum yok" hâli çizilir.** Sözleşme yorumu bilerek taşımıyor
     (`CatalogProductDetail` künyesi, 17.1: moderasyon geri bildirim modülünün işi). Üstbaşlıkta
     bu yüzden yalnız kategori adı var (şablon: "{kategori} · ★ 4,8 (12)"); Değerlendirmeler
     bölümü şablonun kendi `noRev` kutusunu gösterir. Geri bildirim modülü bağlanınca iki yer
     birlikte açılır.
  2. **"İz miktarda" satırı EKLENDİ** (şablonda yok): çapraz bulaşma beyanı INCO'nun zorunlu
     yüküdür ve sözleşme `traces`i bunun için taşıyor (`StorefrontDeclaration` künyesi) — yasal
     beyanı tasarım unuttu diye düşürmek seçenek değil. Cümle web'in şablonuyla AYNI.
  3. **B2B adet çipleri (×5 ×10 ×20) ÇİZİLMEDİ**: şablon `b2bChip` bayrağına bağlıyor ve müşteri
     tipi bu etapta cihaza bağlanmadı (oturum → müşteri profili ucu ayrı iş). Tip geldiğinde bar
     altına şablondaki sıra eklenir.
  4. **"Stok gelince haber ver" YEREL anahtar**: aboneliği yazacak uç yok (şablonda da yalnız
     bayrak çeviriyor); giriş kapısı da müşteri profili bağlanınca gelir. UI tam, arka uç stub —
     "statik ≠ işlevsiz" (CLAUDE §3).
  5. **Paylaş, sistem paylaşım kağıdını açar** (şablon kendi sheet'ini çiziyor): RN'de bunun
     doğal karşılığı `Share.share`. Web ürün URL'i müşteri yüzeyine bağlanınca mesaja eklenir;
     bugün ürün adı paylaşılıyor.
  6. **Sepete ekleme onayı sessiz** (şablon toast basıyor): küresel toast katmanı bilinen borç
     (21.14a raporu) — katman gelince buradaki `add` da onu çağırır.
  7. **İskelet şablonda tanımlı değil**; katalog iskeletinin diliyle asgari bloklar çizildi
     (kahraman + başlık + satır). Uydurulmuş bir tasarım değil, uygulamanın kendi bekleme dili.
  8. **Yer işareti KAHRAMANIN FİLİGRANI, satın alma barı ise KALKAR** (kullanıcı bildirimi 10.08 —
     arıza düzeltmesi; şablonda ikisi de yok, `design/KARARLAR.md`). Ekran şimdiye dek yalnız
     `soldOut`a bakıyordu; `stockStatus`ün `elsewhere` hâli hiç okunmadığı için katalogda
     "Bölgenizde şu an yok" yazan ürün DETAYDA normal satılabilir çiziliyor ve sepete girebiliyordu.
     Cümle KATALOGLA AYNI yerden gelir (`stockMarkOf`) — ikinci bir sözlük açılmadı.
  9. **Kahraman GALERİ oldu** (kullanıcı isteği 09.08, `design/KARARLAR.md`): şablonun tek
     `image-slot`u yerine kaydırılabilir şerit (`PhotoGallery`) — sözleşme zaten birden çok görsel
     taşıyordu (`gallery`) ve ekran onları atıyordu. Yerleşim DEĞİŞMEDİ: ölçü, degrade, yüzen
     düğmeler ve rozetler aynı yerde; tek görselli üründe şerit de gösterge de çizilmez.

  KAHRAMAN ROZETİ KOMŞUYA TAŞAR (fiyat, alt kenardan -22): kardeş çizim sırası yüzünden içerik
  bloğu rozeti ezerdi — kahraman kapsayıcısı `zIndex` ile üste alındı (koleksiyon dairelerinin
  dersi, 08.08; burada tek kapsayıcı yettiği için ayrı üst katman komponenti gerekmedi).
*/

type Messages = LocalizedCopy<typeof messages>;

/** `{price}` gibi tekil yer tutucuları doldurur — sayfanın tüm şablonları tek anahtarlı. */
function fill(template: string, key: string, value: string): string {
  return template.replace(`{${key}}`, value);
}

/** Vurgulu/vurgusuz parçaları tek `Text` altında dizer (kalın parça `strong` kademesiyle). */
function SegmentText({ segments, style, strongStyle }: { segments: TextSegment[]; style: object; strongStyle: object }) {
  return (
    <Text style={style}>
      {segments.map((segment, index) => (
        <Text key={index} style={segment.strong ? strongStyle : undefined}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

/** Alerjen kodları görünen ada — sözlük şemanın yanında (`ALLERGEN_LABELS`), liste virgülle kurulur. */
function allergenList(codes: ProductAllergen[], locale: 'tr' | 'fr' | 'de'): string {
  return codes.map((code) => resolveLocalizedText(ALLERGEN_LABELS[code], locale)).join(', ');
}

/**
 * Beyan tablosunu şablonun TEK SATIRINA indirger ("100 g için: …" — v3:285): dolu kalemler
 * INCO sırasıyla (`NUTRITION_KEYS`) "Ad değer" çiftine döner. Enerji iki birimi tek kalemde
 * taşır (kJ/kcal) — ikisi ayrı satır olsaydı aynı şeyin iki ölçümü iki kalem gibi okunurdu.
 */
function nutritionLine(nutrition: Nutrition, t: Messages): string {
  const parts: string[] = [];
  if (nutrition.energyKj !== null || nutrition.energyKcal !== null) {
    const kj = nutrition.energyKj === null ? null : `${nutrition.energyKj} kJ`;
    const kcal = nutrition.energyKcal === null ? null : `${nutrition.energyKcal} kcal`;
    parts.push(`${t.nutrition.energy} ${[kj, kcal].filter((v) => v !== null).join(' / ')}`);
  }
  const grams: Partial<Record<keyof Nutrition, string>> = {
    fatG: t.nutrition.fat,
    saturatedFatG: t.nutrition.saturatedFat,
    carbohydrateG: t.nutrition.carbohydrate,
    sugarsG: t.nutrition.sugars,
    proteinG: t.nutrition.protein,
    saltG: t.nutrition.salt,
  };
  for (const key of NUTRITION_KEYS) {
    const label = grams[key];
    const value = nutrition[key];
    if (label === undefined || value === null) continue;
    parts.push(`${label} ${value} g`);
  }
  return parts.join(' · ');
}

interface ProductDetailScreenProps {
  slug: string;
}

export function ProductDetailScreen({ slug }: ProductDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  /* Yer bağlamı katalogla AYNI kaynaktan: iki ekran farklı yer sorarsa aynı ürün iki fiyatla
     görünür (ölçüldü 09.08 — listede 1,84 €, detayda 2,30 €). */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const { status, detail, retry } = useProduct(slug, locale, onboarding?.postalCode ?? null);
  /* "Rota içinde miyim" sorusunun kapısı katalogla AYNI (`usePlaceResolution`): stok HÂLİNİ sunucu
     zaten cevaplıyor, buradaki çözüm yalnız `elsewhere`in iki alt sebebini ayırmaya yarıyor
     (geçici KALEM ↔ kalıcı BÖLGE). Kod beş haneye ulaşmamışsa hook `null` döner ve kural
     "bilinmiyorsa kalem" der. */
  const place = usePlaceResolution(onboarding?.postalCode ?? '');

  /* Seçim ürüne değil boya aittir; ürün değişince (aile çipi `setParams`la slug'ı yerinde
     değiştirir, rota `key={slug}` ile ekranı yeniden kurar) seçim doğal olarak sıfırlanır.
     `null` = henüz seçilmedi → ilk boy (şablon `vs[0]`). */
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [alertOn, setAlertOn] = useState(false);
  /** Eklemenin ANINDAKİ kalem sayısı — sunucunun cevabını bu sayının değişmesinden anlıyoruz. */
  const [awaitingMinimumHint, setAwaitingMinimumHint] = useState<number | null>(null);
  const cart = useCart();
  const fabCount = cartCount(cart);

  /*
    ASGARİ SEPET HATIRLATMASI — eklemeden hemen sonra, ama SUNUCUNUN cevabıyla (kullanıcı isteği
    16.08). Müşteri katalogdayken öğrensin ki sepete gidip kilitli bir düğmeyle karşılaşmasın.

    ── BURADA, ÇÜNKÜ HOOK KOŞULSUZ OLMALI (cihazda ölçüldü 16.08) ─────────────
    Etki önce `addToCart`ın yanında duruyordu ve orası ekranın erken `return`lerinden SONRASI:
    yükleme/bulunamadı hâllerinde bileşen o satıra hiç varmıyor, veri gelince varıyordu. React
    bunu "önceki render'dan daha fazla hook" diye reddetti ve ekran KIRMIZI hata verdi. Hook'ların
    sırası her render'da aynı olmalı — o yüzden bütün hook'lar ilk `return`den önce toplanır.

    ── NEDEN İKİNCİ BİR TOAST DEĞİL, AYNI TOAST'IN GÜNCELLENMESİ ──────────────
    Toast deposu tek satır taşır ve yeni mesaj eskisinin yerine geçer (`toast-store` künyesi).
    Yani bu çağrı ikinci bir bildirim ÜRETMİYOR, ilkinin metnini zenginleştiriyor. Ve `toastInfo`
    ile: titreşim ZATEN basma anında verildi, ikinci bir titreşim tek harekete iki cevap olurdu.

    ── NEDEN `itemCount` NÖBETİ ───────────────────────────────────────────────
    Ekleme anındaki sayı saklanıyor ve etki yalnız sayı DEĞİŞİNCE konuşuyor. `resolving` bayrağına
    bakmak yetmezdi: eklemenin hemen ardından tur henüz başlamamış olabilir ve etki o karede ESKİ
    görünümü okuyup eski rakamı yazardı. Sayının değişmesi, sunucunun bu eklemeyi görmüş olmasının
    kendisidir.

    Eşiği geçen sepette SESSİZ: söylenecek bir şey yok, ilk onay zaten yerinde duruyor. Eşik
    tanımsızsa (`minBasketCents === 0`, sözleşmenin "bilinmiyor" hâli) de susar — sıfır bir eşik
    değil, ölçülmemiş bir değerdir.
  */
  useEffect(() => {
    if (awaitingMinimumHint === null || cart.view.itemCount === awaitingMinimumHint) return;
    setAwaitingMinimumHint(null);
    if (cart.view.minBasketOk || cart.view.minBasketCents === 0) return;
    toastInfo(t.minimumHint.replace('{missing}', formatPrice(cart.view.missingForMinBasketCents, locale)));
  }, [awaitingMinimumHint, cart.view, locale, t.minimumHint]);
  /* Akordeonlar kapalı açılır (şablonun `acc` başlangıcı boş). */
  const [accordion, setAccordion] = useState({ ingredients: false, nutrition: false, storage: false });

  /* İLK YÜK: sayfanın yerini skeleton tutar (`product-skeleton` — yalnız HER ZAMAN görünen
     bölümler; gerekçesi ve ölçülerin kaynağı o dosyanın künyesinde). Ekranın içine gömülü dört
     çubuk sökülüp oraya taşındı: ölçüleri ham sayıydı ve sayfanın yarısını (akordeon ·
     değerlendirmeler · yapışkan bar) hiç temsil etmiyordu. */
  if (status === 'loading') return <ProductSkeleton testID="product-loading" />;

  if (status === 'missing' || status === 'error' || detail === null) {
    const missing = status === 'missing';
    return (
      <View style={styles.errorScreen} testID={missing ? 'product-missing' : 'product-error'}>
        <EmptyState
          icon={missing ? undefined : <Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={missing ? t.notFound.title : t.error.title}
          description={missing ? t.notFound.body : t.error.body}
          action={
            <PrimaryButton
              label={missing ? t.notFound.back : t.error.retry}
              shape="pill"
              onPress={missing ? () => router.back() : retry}
              testID="product-error-action"
            />
          }
        />
      </View>
    );
  }

  const variants = detail.variants;
  /* AÇILIŞ BOYU SUNUCUDAN (`primaryVariantId`) — `variants[0]` DEĞİL. Liste `sort_order`dadır,
     yani operatörün sırası, ve fiyatı bilmez; kartta yazan fiyat ise fiyatı olan EN UCUZ boyunkidir
     (`primaryVariantOf`). İkisi ayrışınca kart bir fiyat, detay başka bir fiyat gösteriyordu —
     ölçüldü (MB-20: kart 4,11 €, detay 6,80 €/450g seçili açıldı). Web müşteri yüzeyi aynı kararı
     `08.10`'da almıştı (`product-client.tsx:45`); mobil sözleşmede alan yoktu, o yüzden geride
     kalmıştı. Ölçüt EKRANDA HESAPLANMAZ, okunur — iki yüzeyin ayrışmaması buna bağlı. */
  const variant: CatalogVariant | undefined =
    variants.find((v) => v.id === variantId) ??
    variants.find((v) => v.id === detail.primaryVariantId) ??
    variants[0];
  const price = variant?.priceCents ?? null;
  const was = variant?.wasCents;
  const soldOut = variant?.soldOut ?? true;
  const discounted = was !== undefined;
  /* YERİN CEVABI — cümleyi kuran yer `stockMarkOf`, ekran yalnız çizer (katalog kartının emsali).
     İki eleme bilinçli:
       · `info` ("Kargoyla gelir") ELENİR — kullanıcı kararı 10.08 ile o işaret ekranlardan
         kaldırıldı; kargolanabilirlik künyedeki `noShip` çipiyle zaten konuşuyor.
       · fiyatsız ürün SESSİZ kalır — ürün her kanalda satışa kapalıyken "bu adrese gelmiyor"
         demek, cevabı olmayan bir soruya cevap vermektir (tükendinin aynı kuralı; `soldOut`
         hâlinde `stockMarkOf` kendiliğinden `null` döner). */
  const stockMark = variant === undefined || price === null ? null : stockMarkOf(variant.stockStatus, place, locale);
  const placeMark = stockMark === null || stockMark.tone === 'info' ? null : stockMark;
  /* "Haber ver" dalı PAYLAŞILIR (yeni düğme kurulmadı): tükendi ile "bölgenizde şu an yok" farklı
     sebepler ama müşterinin yapabileceği şey aynı — kalem gelince haber almak. `blocked` bu dala
     GİRMEZ: orada beklenen kalem değil BÖLGEdir ve tutamayacağımız bir söz verilmez. */
  const alertBar = soldOut || placeMark?.tone === 'pending';
  /* Barın açıklama satırı tek yerde kurulur. Filigrandaki iki satırlık cümle barda TEK satıra
     iner: barın yüksekliği tasarımın kararıdır (v3:1228) ve bir cümle onu büyütmemeli. */
  const barNote = soldOut ? t.soldOutBar.text : placeMark === null ? null : placeMark.label.replace('\n', ' ');
  const declaration = detail.declaration;
  /* Fiyatsız benzer kart çizilmez: kitin kartı fiyat etiketini zorunlu tutuyor (fiyatsız kart
     doğmasın diye) ve fiyatı olmayan ürün zaten satışa kapalı. */
  const similar = detail.similar.filter((product) => product.priceCents !== null);
  /* Kahraman şeridi sözleşmenin GALERİSİNDEN kurulur (ilk öğe kapaktır — `CatalogProductDetail`
     künyesi); galeri hiç gelmediyse tek kapakla çizilir ve ekran bugünkü hâlini korur. Adressiz
     görsel elenir: `url === null` "görsel yok / R2 tabanı ayarsız" demektir, boş bir karo değil. */
  const heroPhotos = (detail.gallery.length > 0 ? detail.gallery : [detail.image])
    .map((image) => image.url)
    .filter((url): url is string => url !== null);

  const share = () => {
    void Share.share({ message: detail.name });
  };

  const addToCart = () => {
    if (variant === undefined || price === null) return;
    addProduct(
      {
        id: `${detail.slug}-${variant.id}`,
        slug: detail.slug,
        name: detail.name,
        variantLabel: variant.label,
        unitCents: price,
        photoUri: detail.image.url,
        discounted,
        soldOut: false,
      },
      quantity,
    );
    toastSuccess(t.addedToast);
    /* Eşik hatırlatması İKİNCİ kademede (aşağıdaki etki): eklemenin sepeti eşiğin neresine
       taşıdığını ancak SUNUCU söyleyebilir. Burada tahmini bir sayı yazmak, kalemin hangi gruba
       (kapıya teslim / kargo) düştüğünü bilmeden hesap yapmak olurdu — yanlış bir sayı, hiç sayı
       olmamasından kötüdür. Anlık onay yine anında veriliyor; eksik kalan yalnız RAKAM. */
    setAwaitingMinimumHint(cart.view.itemCount);
  };


  return (
    <View style={styles.screen} testID="product-detail">
      <ScrollView contentContainerStyle={styles.content} testID="product-scroll">
        {/* ── Kahraman: galeri şeridi + üst degrade + yüzen düğmeler + rozetler (v3:240-249) ── */}
        <View style={styles.hero}>
          {/* Şerit kahramanın YERİNE geçer, yerleşimini değiştirmez: degrade, düğmeler ve rozetler
              onun üstünde çizilmeye devam eder (kardeş sırası korundu). */}
          <PhotoGallery
            uris={heroPhotos}
            photoLabel={t.gallery.photo}
            fallback={
              <View style={styles.heroFallback}>
                <Text style={styles.heroInitial}>{detail.name.slice(0, 1)}</Text>
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
          {/* YER FİLİGRANI — kart ailesinin ikizi (`ProductPhotoCard.noteVeil`,
              `ProductCircleCard.markVeil`): kahramanı örten yarı saydam katman + ORTALANMIŞ cümle,
              rozet kabuğu YOK. Galerinin KARDEŞİ, çocuğu değil: örtü şeridin içine konsaydı hem
              kaydırmayla birlikte kayar hem de solmaya ortak olurdu — okunması gereken cümle tam o
              anda okunaksızlaşırdı (10.08 kart arızasının dersi). `pointerEvents="none"`: galeri
              kaydırması ve göstergesi bozulmaz, yüzen düğmeler de üstte kalır. */}
          {placeMark === null ? null : (
            <View style={styles.placeVeil} pointerEvents="none" testID="product-place-veil">
              <Text style={styles.placeVeilText} numberOfLines={3}>
                {placeMark.label}
              </Text>
            </View>
          )}
          <View style={styles.heroButtons}>
            <BackButton onPress={() => router.back()} accessibilityLabel={t.back} variant="photo" testID="product-back" />
            <PressableSurface
              onPress={share}
              feedback="scale-small"
              compact
              style={styles.shareButton}
              accessibilityLabel={t.share}
              testID="product-share"
            >
              <Icon name="share" size={theme.size.inlineIcon} color={theme.colors.ink} />
            </PressableSurface>
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

        {/* ── Künye: kategori · ad · birim satırı · çipler · aile · boylar · açıklama ── */}
        <View style={styles.head}>
          {detail.category === null ? null : <Text style={styles.eyebrow}>{detail.category.name.toLocaleUpperCase('tr-TR')}</Text>}
          <Text style={styles.title} accessibilityRole="header">
            {detail.name}
          </Text>
          <Text style={styles.meta}>
            {variant?.comparisonCents == null ? t.meta.vat : `${fill(t.meta.perKg, 'price', formatPrice(variant.comparisonCents, locale))} · ${t.meta.vat}`}
            {was === undefined ? '' : ` · ${fill(t.meta.was, 'price', formatPrice(was, locale))}`}
          </Text>
          {variant?.limitLabel == null ? null : (
            <Text style={styles.limitChip}>{fill(t.limit, 'n', variant.limitLabel)}</Text>
          )}
          {detail.shippable ? null : (
            <Text style={styles.noShipChip} testID="product-noship">
              {t.noShip}
            </Text>
          )}

          {detail.family.length === 0 || detail.category === null ? null : (
            <View style={styles.familyBlock}>
              <Text style={styles.familyEyebrow}>{fill(t.family.browse, 'name', detail.category.name.toLocaleUpperCase('tr-TR'))}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.familyRailPull}
                contentContainerStyle={styles.familyRail}
              >
                {detail.family.map((member) => (
                  <PressableSurface
                    key={member.slug}
                    onPress={() => {
                      /* Aile çipi yığına sayfa EKLEMEZ (kullanıcı kararı 08.08): aynı rotanın
                         parametresi değişir, içerik yerinde tazelenir. Geri tuşu böylece aileyi
                         gezinti geçmişi olarak değil, geldiği yeri hatırlayarak çalışır. */
                      if (!member.isCurrent) router.setParams({ slug: member.slug });
                    }}
                    feedback="scale-small"
                    compact
                    style={styles.familyChip}
                    accessibilityLabel={member.label}
                    testID={`product-family-${member.slug}`}
                  >
                    <CirclePhoto
                      size={customerMetrics.productFamilyPhoto}
                      initial={member.label.slice(0, 1)}
                      initialFontSize={theme.text.note}
                      photoUri={member.image.url}
                    />
                    <View>
                      <Text style={styles.familyName}>{member.label}</Text>
                      <Text style={styles.familyPrice}>
                        {/* "…'dan" eki KİTTEN (`customer-kit/price-label`): aynı cümle katalog ve
                            vitrin kartlarında da yazılıyor, iki yerde tanımlansaydı bir gün
                            ayrışırdı (CLAUDE §1). Fiyat yoksa satır boş kalır — sıfır yazılmaz. */}
                        {member.isCurrent ? t.family.current : (fromPriceLabel(member.fromPriceCents, locale) ?? '')}
                      </Text>
                    </View>
                  </PressableSurface>
                ))}
              </ScrollView>
            </View>
          )}

          {variants.length <= 1 ? null : (
            <View style={styles.variantRow}>
              {variants.map((option) => {
                const selected = option.id === variant?.id;
                return (
                  <PressableSurface
                    key={option.id}
                    onPress={() => {
                      setVariantId(option.id);
                      setQuantity(1);
                    }}
                    feedback="scale-small"
                    compact
                    selected={selected}
                    style={[styles.variantChip, selected ? styles.variantChipSelected : null]}
                    accessibilityLabel={option.label}
                    testID={`product-variant-${option.id}`}
                  >
                    <Text style={styles.variantLabel}>{option.label}</Text>
                    <Text style={styles.variantPrice}>{option.priceCents === null ? '—' : formatPrice(option.priceCents, locale)}</Text>
                  </PressableSurface>
                );
              })}
            </View>
          )}

          {detail.description === null ? null : <Text style={styles.description}>{detail.description}</Text>}
        </View>

        {/* ── Akordeonlar (v3:281-288): üst/alt düz mürekkep, aralar kesik kum ── */}
        <View style={styles.accordion}>
          <PressableSurface
            onPress={() => setAccordion((current) => ({ ...current, ingredients: !current.ingredients }))}
            feedback="opacity"
            style={styles.accordionHead}
            accessibilityLabel={t.accordion.ingredients}
            testID="product-acc-ingredients"
          >
            <Text style={styles.accordionTitle}>{t.accordion.ingredients}</Text>
            <Text style={styles.accordionCaret}>▾</Text>
          </PressableSurface>
          {accordion.ingredients ? (
            <View style={styles.accordionBody}>
              {declaration.ingredients === null ? null : (
                <SegmentText segments={declaration.ingredients} style={styles.accordionText} strongStyle={styles.accordionStrong} />
              )}
              {declaration.allergens.length === 0 ? null : (
                <Text style={styles.allergenLine} testID="product-allergens">
                  {fill(t.accordion.allergens, 'list', allergenList(declaration.allergens, locale))}
                </Text>
              )}
              {declaration.traces.length === 0 ? null : (
                <Text style={styles.accordionText}>{fill(t.accordion.traces, 'list', allergenList(declaration.traces, locale))}</Text>
              )}
            </View>
          ) : null}

          <PressableSurface
            onPress={() => setAccordion((current) => ({ ...current, nutrition: !current.nutrition }))}
            feedback="opacity"
            style={[styles.accordionHead, styles.accordionDivided]}
            accessibilityLabel={t.accordion.nutrition}
            testID="product-acc-nutrition"
          >
            <Text style={styles.accordionTitle}>{t.accordion.nutrition}</Text>
            <Text style={styles.accordionCaret}>▾</Text>
          </PressableSurface>
          {accordion.nutrition ? (
            <View style={styles.accordionBody}>
              {declaration.nutrition === null ? null : (
                <Text style={styles.accordionText}>{fill(t.accordion.per100, 'rows', nutritionLine(declaration.nutrition, t))}</Text>
              )}
              {variant?.netWeightG == null ? null : (
                <Text style={styles.netWeight}>{fill(t.accordion.netWeight, 'grams', String(variant.netWeightG))}</Text>
              )}
            </View>
          ) : null}

          <PressableSurface
            onPress={() => setAccordion((current) => ({ ...current, storage: !current.storage }))}
            feedback="opacity"
            style={[styles.accordionHead, styles.accordionDivided]}
            accessibilityLabel={t.accordion.storage}
            testID="product-acc-storage"
          >
            <Text style={styles.accordionTitle}>{t.accordion.storage}</Text>
            <Text style={styles.accordionCaret}>▾</Text>
          </PressableSurface>
          {accordion.storage && declaration.storage !== null ? (
            <View style={styles.accordionBody}>
              <SegmentText segments={declaration.storage} style={styles.accordionText} strongStyle={styles.accordionStrong} />
            </View>
          ) : null}
        </View>

        {/* ── Değerlendirmeler: sözleşme yorum taşımıyor → şablonun "yorum yok" hâli (sapma 1) ── */}
        <View style={styles.reviews}>
          <Text style={styles.sectionTitle}>{t.reviews.title}</Text>
          <Text style={styles.reviewsEmpty}>{t.reviews.empty}</Text>
        </View>

        {similar.length === 0 ? null : (
          <View style={styles.related}>
            <Text style={[styles.sectionTitle, styles.relatedTitle]}>{t.related}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRail}>
              {similar.map((product) => (
                <ProductCircleCard
                  key={product.slug}
                  name={product.name}
                  priceLabel={productPriceLabel(product.priceCents, product.variantCount, locale)}
                  size="sm"
                  photoUri={product.image.url}
                  initial={product.name.slice(0, 1)}
                  onPress={() => router.push(`/product/${product.slug}`)}
                  testID={`product-similar-${product.slug}`}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Yapışkan barın payı (v3:314 — 108). */}
        <View style={styles.barSpace} />
      </ScrollView>

      {/* ── Yapışkan alt bar (v3:1228-1252) — krem cam, tab bar ile aynı yüzey kararı ── */}
      <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="product-bar">
        <View style={styles.barGlass} pointerEvents="none" />
        {alertBar ? (
          <View style={styles.barRow}>
            <Text style={styles.soldOutText}>{barNote}</Text>
            <PressableSurface
              onPress={() => setAlertOn((current) => !current)}
              feedback="scale-small"
              selected={alertOn}
              style={[styles.alertButton, alertOn ? styles.alertButtonOn : null]}
              accessibilityLabel={alertOn ? t.soldOutBar.alertOn : t.soldOutBar.alert}
              testID="product-stock-alert"
            >
              <Text style={[styles.alertText, alertOn ? styles.alertTextOn : null]}>
                {alertOn ? t.soldOutBar.alertOn : t.soldOutBar.alert}
              </Text>
            </PressableSurface>
          </View>
        ) : placeMark !== null ? (
          /* KAPALI KAPI (`blocked`) — satın alma öğeleri hiç çizilmez, yerine TEK satır bilgi.
             Buraya "Buraya da gelin" eylemi KONMAZ: o bandın işi kataloğun başındadır ve mesele
             bu ürün değil BÖLGEdir; aynı daveti ikinci kez, hem de müşterinin alamayacağı bir
             ürünün sayfasında tekrarlamak, onu ürünün olmadığı bir işe zorlamak olurdu. */
          <Text style={styles.soldOutText} testID="product-place-blocked">
            {barNote}
          </Text>
        ) : price === null ? (
          <Text style={styles.soldOutText} testID="product-closed">
            {t.cta.closed}
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
                testID="product-qty-decrease"
              >
                <Text style={styles.stepGlyph}>−</Text>
              </PressableSurface>
              <Text style={styles.stepValue} testID="product-qty">
                {quantity}
              </Text>
              <PressableSurface
                onPress={() => setQuantity((current) => Math.min(99, current + 1))}
                feedback="opacity"
                compact
                style={styles.stepButton}
                accessibilityLabel={fill(t.stepper.increase, 'name', detail.name)}
                testID="product-qty-increase"
              >
                <Text style={styles.stepGlyph}>+</Text>
              </PressableSurface>
            </View>
            <View style={styles.ctaSlot}>
              <PrimaryButton
                label={`${t.cta.add} · ${formatPrice(price * quantity, locale)}`}
                onPress={addToCart}
                testID="product-add"
              />
            </View>
          </View>
        )}
      </BlurView>

      {/* Sepet FAB'ı — v3:602: sepet doluyken vitrin·katalog·ürün·paket dörtlüsünde; bu sayfada
          yapışkan barın ÜSTÜNDE durur (v3 `b:112px`). Boş sepette komponent kendini çizmez. */}
      <View style={styles.fabSlot} pointerEvents="box-none">
        <CartFab
          count={fabCount}
          onPress={() => router.push('/cart')}
          accessibilityLabel={t.cart.open.replace('{n}', String(fabCount))}
          testID="product-cart-fab"
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

  /* Kahraman kapsayıcısı içeriğin ÜSTÜNE çizilir (zIndex) — fiyat rozeti alt komşuya taşıyor. */
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
  /**
   * YER FİLİGRANI — kahramanı örten yarı saydam katman (kart ailesinin ikizi: `noteVeil` /
   * `markVeil`). Cümle bir dipnot değil, sayfanın o müşteri için verdiği cevap: ortalanır ve
   * künye kademesinde (`body`) yazılır. Zemin/kenarlık YOK — okunurluğu filigranın kendisi verir.
   */
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
    /* Foto tam ekrana taşar (saatİN ALTINA girer — v3 niyeti); düğmeler ise girmez: şablonun
       8px'i ÜST GÜVENLİ ALANIN üstüne eklenir (kullanıcı bulgusu 08.08 — iPhone'da saate biniyordu;
       çentiksiz cihazda inset 0, davranış şablonla aynı kalır).
       Değerler v3'ün kendisi (göz denetimi 09.08): `top:8 · left/right:16` — md/3xl; tarifle hizalı. */
    top: rt.insets.top + theme.space.md,
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** Paylaş dairesi geri düğmesinin `photo` varyantıyla AYNI yüzey (v3 ikisini tek stile bağlıyor). */
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
  /** Fiyat alt kenardan sarkar (v3: `bottom:-22px`, 3° dönüş, gölge) — taşma tasarımın imzası. */
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

  head: {
    paddingTop: theme.space['2xl'],
    paddingHorizontal: theme.space['2xl'],
    paddingBottom: theme.space.sm,
    gap: theme.space.md,
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

  familyBlock: {
    gap: theme.space.sm,
  },
  familyEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  /* Ray kenardan kenara kayar (şablon: `margin:0 -22px; padding:2px 22px`). RN'de ikisi AYRI
     katmana gider: negatif kenar payı ScrollView'ın KENDİSİNE, iç dolgu İÇERİK kabına — ikisi
     birden içerik kabına konursa ilk/son kart sayfa boşluğunun altında kalır (yaşandı 08.08,
     kullanıcı bulgusu). */
  familyRailPull: {
    marginHorizontal: -theme.space['2xl'],
  },
  familyRail: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  /* Dolgular v3'ün kendisi (göz kıyası 09.08 — dar basılıyordu): `7px 14px 7px 8px` + iç gap 9;
     sol dar bilerek (foto o kenara yaslı), ±1 yuvarlamada ferah yön seçildi. */
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
    paddingLeft: theme.space.md,
    paddingRight: theme.space['2xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  familyName: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  familyPrice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
  },

  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  /* Dolgu v3'ün kendisi (aynı göz kıyası): `9px 15px` — ±1'de ferah yön (10/16). */
  variantChip: {
    gap: theme.space['2xs'],
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  variantChipSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  variantLabel: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  variantPrice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  accordion: {
    marginVertical: theme.space.xs,
    marginHorizontal: theme.space.xl,
    borderTopWidth: theme.border.base,
    borderBottomWidth: theme.border.base,
    borderColor: theme.colors.ink,
  },
  accordionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.lg,
  },
  accordionDivided: {
    borderTopWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
  },
  accordionTitle: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  accordionCaret: {
    color: theme.colors.muted,
  },
  accordionBody: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
    gap: theme.space.xs,
  },
  accordionText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  accordionStrong: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
  },
  allergenLine: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
  netWeight: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors.ink,
  },

  reviews: {
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    gap: theme.space.md,
  },
  sectionTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  reviewsEmpty: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.xl,
  },

  related: {
    paddingTop: theme.space.lg,
    gap: theme.space.md,
  },
  relatedTitle: {
    marginHorizontal: theme.space.xl,
  },
  relatedRail: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    paddingBottom: theme.space.sm,
  },
  barSpace: {
    height: customerMetrics.productBarSpace,
  },

  /** FAB yapışkan barın üstünde (v3: 112); bar alt insetle büyüdüğünde arayı korumak için fark eklenir. */
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
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    /* Alt güvenli alan barın İÇİNDE; dolguyla TOPLANMAZ (tab bar kararı 08.08 — ikisinin büyüğü). */
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
  soldOutText: {
    flex: 1,
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * 1.4,
    color: theme.colors.muted,
  },
  alertButton: {
    borderWidth: theme.border.base,
    borderColor: theme.colors['olive-line'],
    backgroundColor: theme.colors.olive,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
  },
  alertButtonOn: {
    backgroundColor: theme.colors['olive-bg'],
  },
  alertText: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.card,
  },
  alertTextOn: {
    color: theme.colors['olive-dark'],
  },
}));
