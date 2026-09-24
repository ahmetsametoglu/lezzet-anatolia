// Kart rozeti ve fiyat etiketi web telefon görünümüyle ortak kuruculardan.
import { cardBadgeOf, formatPrice, fromPriceLabel, openingVariantOf, productPriceLabel, showsNoShipChip } from '@lezzet/helper';
import type { TextSegment } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { ALLERGEN_LABELS, NUTRITION_KEYS, resolveLocalizedText } from '@lezzet/types';
import type { CatalogVariant, Nutrition, ProductAllergen } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { usePurchasePlace } from '@/screens/customer-kit/purchase-place';
import { BlurView } from 'expo-blur';
import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { ProductCircleCard } from '@/components/ui/product-circle-card';
import { submitStockNotice } from '@/lib/api/stock-notices';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import placeMessages from '@lezzet/i18n/customer/place';
import { stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { toastError, toastInfo, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { addProduct, cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { useSelectedPickupWarehouse } from '@/screens/customer-kit/delivery-address-store';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { NoticeSheet, type NoticeSheetCopy } from '@/screens/customer-kit/notice-sheet';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { useSheet } from '@/screens/customer-kit/use-sheet.hook';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import messages from '@lezzet/i18n/customer/product';
import { ProductSkeleton } from './product-skeleton';
import { useProduct } from './use-product.hook';

/*
  Ürün detayı gerçek uçtan okur (`GET /api/v1/products/:slug`). Yer işareti kahramanın filigranıdır ve kapalı kapıda satın alma
  barı kalkar; cümle katalogla aynı yerden (`stockMarkOf`) gelir.
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
 * Beyan tablosunu tek satıra indirger: dolu kalemler INCO sırasıyla "Ad değer" çifti olur. Enerji iki birimi tek kalemde taşır,
 * ayrı satırlar aynı ölçümü iki kalem gibi okuturdu.
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
  /** Bağlantının istediği boy (paket kalemi); verilmezse sayfa kartın boyuyla açılır. */
  initialVariantId?: string | null;
}

export function ProductDetailScreen({ slug, initialVariantId = null }: ProductDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  /* Yer bağlamı katalogla aynı kaynaktan: iki ekran farklı yer sorarsa aynı ürün iki fiyatla görünür. */
  const { postalCode } = usePurchasePlace();
  // Gel-al seçiliyken stok ve fiyat seçilen depodan okunur: soğuk zincir kalem adrese gelmese de depodan alınabilir.
  const pickupWarehouseId = useSelectedPickupWarehouse();
  const { status, detail, retry } = useProduct(slug, locale, postalCode, pickupWarehouseId);
  /* "Rota içinde miyim" kapısı katalogla aynı; stok hâlini sunucu cevaplar, bu çözüm yalnız `elsewhere`in geçici kalem ile
     kalıcı bölge sebebini ayırır. */
  const place = usePlaceResolution(postalCode ?? '');

  /* Seçim boya aittir; aile çipi slug'ı değiştirince rota ekranı yeniden kurar ve seçim sıfırlanır. `null` = henüz seçilmedi,
     açılış boyu kullanılır. */
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  /* "Gelince haber ver" kaydının hâli boy başına; `sending` çift dokunuşu kilitler, `ok`/`already` sunucunun cevabıdır. */
  const [stockNotice, setStockNotice] = useState<{ variantId: string; status: 'sending' | 'ok' | 'already' } | null>(null);
  /* Misafire çekmece: girişliye e-posta sorulmaz, misafir aynı akışta doğrulanmış hesaba dönüşür. */
  const stockSheet = useSheet();
  const meState = useMe();
  /** Eklemenin ANINDAKİ kalem sayısı — sunucunun cevabını bu sayının değişmesinden anlıyoruz. */
  const [awaitingMinimumHint, setAwaitingMinimumHint] = useState<number | null>(null);
  const cart = useCart();
  const fabCount = cartCount(cart);

  /*
    Asgari sepet hatırlatması eklemeden sonra, sunucunun cevabıyla gelir: ekleme anındaki kalem sayısı değişince konuşur, çünkü
    sayının değişmesi sunucunun bu eklemeyi görmesidir. Hook koşulsuz olmalı, bu yüzden erken `return`lerden önce; eşik
    tanımsızsa (`0`) susar.
  */
  useEffect(() => {
    if (awaitingMinimumHint === null || cart.view.itemCount === awaitingMinimumHint) return;
    setAwaitingMinimumHint(null);
    if (cart.view.minBasketOk || cart.view.minBasketCents === 0) return;
    toastInfo(t.minimumHint.replace('{missing}', formatPrice(cart.view.missingForMinBasketCents, locale)));
  }, [awaitingMinimumHint, cart.view, locale, t.minimumHint]);
  const [accordion, setAccordion] = useState({ ingredients: false, nutrition: false, storage: false });

  /* İlk yükte sayfanın yerini iskelet tutar; kapsamı ve ölçüleri `product-skeleton`da. */
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
  /* Müşteri boy seçmediyse açılış boyu ortak kuraldan: bağlantının istediği boy, yoksa kartın fiyatını taşıyan birincil boy.
     Kural ekranda yazılmaz ki web ile ayrışmasın. */
  const variant: CatalogVariant | undefined =
    variants.find((v) => v.id === variantId) ?? openingVariantOf(variants, initialVariantId, detail.primaryVariantId);
  const price = variant?.priceCents ?? null;
  const was = variant?.wasCents;
  const soldOut = variant?.soldOut ?? true;
  const discounted = was !== undefined;
  /* `info` ("Kargoyla gelir") elenir, kargolanabilirliği künyedeki `noShip` çipi söylüyor. Fiyatsız ürün sessiz kalır: satışa
     kapalı ürüne "bu adrese gelmiyor" demek cevabı olmayan bir soruya cevap vermektir. */
  const stockMark = variant === undefined || price === null ? null : stockMarkOf(variant.stockStatus, place, locale);
  const placeMark = stockMark === null || stockMark.tone === 'info' ? null : stockMark;
  /* "Haber ver" dalını tükendi ile "bölgenizde şu an yok" paylaşır, müşterinin yapabileceği aynı. `blocked` bu dala girmez:
     orada beklenen kalem değil bölgedir. */
  const alertBar = soldOut || placeMark?.tone === 'pending';
  /* Filigrandaki iki satırlık cümle barda tek satıra iner: barın yüksekliği bir cümleyle büyümemeli. */
  const barNote = soldOut ? t.soldOutBar.text : placeMark === null ? null : placeMark.label.replace('\n', ' ');
  /* Kaydın yeri cihazın çözülmüş cevabı; yer bilinmiyorsa düğme çizilmez, nereye haber vereceğimizi bilmeden kayıt alınmaz. */
  const stockBody =
    variant !== undefined && place?.kind === 'resolved'
      ? { variantId: variant.id, country: place.place.country, postalCode: place.place.postalCode }
      : null;
  const stockStatus = stockNotice !== null && stockNotice.variantId === variant?.id ? stockNotice.status : null;
  const placeCopy = placeMessages[locale].placeNotice;
  /* Kimlik adımı ve hata cümleleri yer ailesinin sözlüğünden (aynı akış), başlık ve sonuçlar bu ekranın kaydından. */
  const stockCopy: NoticeSheetCopy | null =
    stockBody === null
      ? null
      : {
          ...placeCopy,
          sheetTitle: t.stockNotice.sheetTitle,
          sheetIntro: t.stockNotice.sheetIntro,
          recorded: t.stockNotice.recorded.replace('{code}', stockBody.postalCode),
          alreadyRecorded: t.stockNotice.alreadyRecorded.replace('{code}', stockBody.postalCode),
          emailRequired: t.stockNotice.emailRequired,
        };

  /** Kaydı bırakır — girişlide tek dokunuş (e-posta gövdeye KONMAZ, sunucu profilden çözer), misafirde çekmece. */
  const requestStockNotice = () => {
    if (stockBody === null) return;
    const me = meState.status === 'ready' ? meState.me : null;
    if (me === null) {
      stockSheet.open();
      return;
    }
    setStockNotice({ variantId: stockBody.variantId, status: 'sending' });
    void submitStockNotice(stockBody).then((result) => {
      /* Dört hâlin dördü de söylenir; kayıt alınmadıysa düğme geri gelir ki müşteri tekrar deneyebilsin. */
      if (result.error !== null) {
        setStockNotice(null);
        toastError(placeCopy.failed);
        return;
      }
      if (result.data.status === 'place_unknown' || result.data.status === 'email_required') {
        setStockNotice(null);
        toastError(result.data.status === 'place_unknown' ? placeCopy.placeUnknown : t.stockNotice.emailRequired);
        return;
      }
      setStockNotice({ variantId: stockBody.variantId, status: result.data.status });
      toastSuccess(
        (result.data.status === 'ok' ? t.stockNotice.recorded : t.stockNotice.alreadyRecorded).replace('{code}', stockBody.postalCode),
      );
    });
  };
  const declaration = detail.declaration;
  /* Fiyatsız benzer kart çizilmez: kart fiyat etiketini zorunlu tutar, fiyatı olmayan ürün zaten satışa kapalı. */
  const similar = detail.similar.filter((product) => product.priceCents !== null);
  /* Kahraman şeridi sözleşmenin galerisinden (ilk öğe kapak); galeri gelmediyse tek kapakla çizilir. */
  const heroPhotos = detail.gallery.length > 0 ? detail.gallery : [detail.image];

  /* Paylaşım adı ve adresi taşır: önizleme çıkmayan uygulamada neyin paylaşıldığını ad söyler. Adres sunucudan (`shareUrl`),
     çünkü dil öneki ve yol çevirisi web rotasının kuralı. */
  const share = () => {
    void Share.share({ message: `${detail.name}\n${detail.shareUrl}` });
  };

  const addToCart = () => {
    if (variant === undefined || price === null) return;
    addProduct(
      {
        id: `${detail.slug}-${variant.id}`,
        /* Sunucudaki adres açıkça geçer: `id`den çıkarmak, biçimi değişince satırı sessizce adressiz bırakırdı. */
        variantId: variant.id,
        slug: detail.slug,
        name: detail.name,
        variantLabel: variant.label,
        unitCents: price,
        image: detail.image,
        discounted,
        soldOut: false,
      },
      quantity,
    );
    toastSuccess(t.addedToast);
    /* Eşik hatırlatması ikinci kademede: eklemenin sepeti eşiğin neresine taşıdığını ancak sunucu söyleyebilir. */
    setAwaitingMinimumHint(cart.view.itemCount);
  };


  return (
    <View style={styles.screen} testID="product-detail">
      <ScrollView contentContainerStyle={styles.content} testID="product-scroll">
        {/* ── Kahraman: galeri şeridi, üst degrade, yüzen düğmeler, rozetler ── */}
        <View style={styles.hero}>
          {/* Şerit kahramanın YERİNE geçer, yerleşimini değiştirmez: degrade, düğmeler ve rozetler
              onun üstünde çizilmeye devam eder (kardeş sırası korundu). */}
          <PhotoGallery
            images={heroPhotos}
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
          {/* Yer filigranı galerinin kardeşi, çocuğu değil: şeridin içinde kaydırmayla kayar ve solmaya ortak olurdu.
              `pointerEvents="none"` galeriyi ve yüzen düğmeleri bozmaz. */}
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
          {detail.category === null ? null : <Text style={styles.eyebrow}>{upperIn(detail.category.name, locale)}</Text>}
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
          {showsNoShipChip(detail.shippable, placeMark?.tone ?? null) ? (
            <Text style={styles.noShipChip} testID="product-noship">
              {t.noShip}
            </Text>
          ) : null}

          {detail.family.length === 0 || detail.category === null ? null : (
            <View style={styles.familyBlock}>
              <Text style={styles.familyEyebrow}>{fill(t.family.browse, 'name', upperIn(detail.category.name, locale))}</Text>
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
                      /* Aile çipi yığına sayfa eklemez: rotanın parametresi değişir, geri tuşu geldiği yeri hatırlar. */
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
                      image={member.image}
                    />
                    <View>
                      <Text style={styles.familyName}>{member.label}</Text>
                      <Text style={styles.familyPrice}>
                        {/* Aile kartındaki sayı başka ürünün en ucuz boyu, bu yüzden "'dan" ekiyle yazılır; fiyat yoksa satır
                            boş kalır. */}
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

        {/* ── Akordeonlar: üst ve alt düz mürekkep, aralar kesik kum ── */}
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
              {variant?.netQuantity == null || variant.netUnit === null ? null : (
                <Text style={styles.netWeight}>
                  {fill(t.accordion.netQuantity, 'quantity', `${variant.netQuantity} ${variant.netUnit}`)}
                </Text>
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

        {/* ── Değerlendirmeler: sözleşme yorum taşımıyor, bu yüzden "yorum yok" hâli çizilir ── */}
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
                  priceLabel={productPriceLabel(product.priceCents, locale)}
                  /* Yalnız fırsat rozeti; kural katalog ve vitrinle aynı kurucuda. */
                  discountLabel={cardBadgeOf(product, { offer: t.card.offer })}
                  size="sm"
                  image={product.image}
                  initial={product.name.slice(0, 1)}
                  onPress={() => router.push(`/product/${product.slug}`)}
                  testID={`product-similar-${product.slug}`}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Yapışkan barın payı. */}
        <View style={styles.barSpace} />
      </ScrollView>

      {/* ── Yapışkan alt bar: krem cam, sekme çubuğuyla aynı yüzey ── */}
      <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="product-bar">
        <View style={styles.barGlass} pointerEvents="none" />
        {alertBar ? (
          <View style={styles.barRow}>
            <Text style={styles.soldOutText}>{barNote}</Text>
            {stockStatus === 'ok' || stockStatus === 'already' ? (
              /* Kayıt alındı: düğme kalkar, yerine sonucun satırı geçer; ikinci kez isteten düğme "sayılmadım mı?" dedirtirdi. */
              <View style={[styles.alertButton, styles.alertButtonOn]} testID="product-stock-alert-recorded">
                <Text style={[styles.alertText, styles.alertTextOn]}>{t.soldOutBar.alertOn}</Text>
              </View>
            ) : stockBody === null ? null : (
              <PressableSurface
                onPress={requestStockNotice}
                feedback="scale-small"
                disabled={stockStatus === 'sending'}
                style={styles.alertButton}
                accessibilityLabel={t.soldOutBar.alert}
                testID="product-stock-alert"
              >
                <Text style={styles.alertText}>{t.soldOutBar.alert}</Text>
              </PressableSurface>
            )}
          </View>
        ) : placeMark !== null ? (
          /* Kapalı kapı: satın alma öğeleri yerine tek satır bilgi. "Buraya da gelin" daveti konmaz, mesele bu ürün değil bölgedir ve
             davetin yeri katalog bandı. */
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

      {/* Misafirin "gelince haber ver" çekmecesi ilk açılışta kurulur, kapanınca sökülmez; yer yoksa çekmece de yok. */}
      {stockSheet.mounted && stockBody !== null && stockCopy !== null ? (
        <NoticeSheet
          visible={stockSheet.visible}
          copy={stockCopy}
          submit={() => submitStockNotice(stockBody)}
          onClose={stockSheet.close}
          onRecorded={(status) => setStockNotice({ variantId: stockBody.variantId, status })}
          testID="product-stock-notice"
        />
      ) : null}

      {/* Sepet FAB'ı sepet doluyken çizilir; bu sayfada yapışkan barın üstünde durur. */}
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
  /* Ray kenardan kenara kayar: negatif kenar payı ScrollView'a, iç dolgu içerik kabına; ikisi birden içerik kabına konursa ilk
     ve son kart sayfa boşluğunun altında kalır. */
  familyRailPull: {
    marginHorizontal: -theme.space['2xl'],
  },
  familyRail: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  /* Sol dolgu bilerek dar: fotoğraf o kenara yaslı. */
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

  /** FAB yapışkan barın üstünde; bar alt boşlukla büyüyünce ara korunur. */
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
    /* Alt güvenli alan barın içinde ve dolguyla toplanmaz, ikisinin büyüğü alınır. */
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
  /* Glif `icon-sm`de, başlık kademesinde değil: `−`/`+` bir imdir ve başlık ölçeği değişince adet seçici oynamamalı. */
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
