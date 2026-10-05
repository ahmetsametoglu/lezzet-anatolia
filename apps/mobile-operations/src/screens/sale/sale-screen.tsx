import { memo, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { SaleCatalogProduct } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScanFab } from '@/components/operations/scan-fab';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { OperationsProductRow } from '@/components/operations/product-row';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { saleCopy } from './copy';
import { useWarehouseStatus } from '@/screens/warehouse/warehouse-status';
import { useSalePlace, useSaleContext } from './sale-context';
import { selectionOf } from './use-sale.hook';

/*
  Yerinde satış kataloğu: satan kişi malın yanındaki personeldir ve depoyu sunucu künyeden çözer, ekran depo sormaz. Burası yalnız "ne
  satıyorum" sorusudur; sepet dolunca alttaki çubuk `/sale/cart`a götürür, kartta ürün görseli personelin müşteriyle ürünün yüzü üstünden
  konuşması içindir.
*/

const t = saleCopy;

/**
 * Yükleme iskeletindeki kutunun boyu ürün kartının kendi bloklarından türer (iki dolgu + `md` kare): sabit yazılsaydı kart değişince
 * ayrışır ve veri gelince sayfa zıplardı.
 */
const SALE_CARD_HEIGHT =
  operationsTheme.space['2xl'] * 2 + operationsTheme.size.thumb + operationsTheme.border.base * 2;

/** Sepet çubuğunun boyu (`styles.sticky` + `styles.cta`) — daire bunun kadar yukarı kalkar. */
const CART_BAR_LIFT = operationsTheme.space.xl + operationsTheme.size.controlLg + operationsTheme.space['3xl'];

export function SaleScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  /* Satış yeri ekranın cümlesini de değiştirir: araçta liste aracın içeriğidir ve boş liste "araçta mal yok" demektir, aynı cümle
     kuryeyi olmayan ürünü aramaya gönderirdi. */
  const place = useSalePlace();
  /* Çevrimdışı kilidi depo ekranlarının sinyalinden okunur: hat kapalıyken fiyat ve kalan stok bayattır ve bayat fiyatla yazılan satış
     yanlış paradır. */
  const { offline } = useWarehouseStatus();

  const draftSelection = sale.draft === null ? null : selectionOf(sale.draft);
  const draftPriceCents = sale.draft === null ? null : parseAmountToCents(sale.draft.priceText);
  const overStock = draftSelection !== null && sale.draft !== null && sale.draft.qty > draftSelection.availableHere;
  /* Arama çekmecesi EKRANIN durumu, kancanın değil: aramanın kendisi (metin, sonuçlar) kancada
     yaşıyor ve orada kalıyor; açık/kapalı yalnız bu ekranın bir yüzeyi. */
  const [searchOpen, setSearchOpen] = useState(false);
  const draftReady =
    !offline &&
    draftSelection !== null &&
    sale.draft !== null &&
    sale.draft.qty > 0 &&
    draftPriceCents !== null &&
    !overStock;

  return (
    <View style={styles.screen} testID="sale-screen">
      <OperationsStackHeader
        title={t.title}
        subtitle={place === 'van' ? t.van.subtitle : t.subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="sale-header"
      />

      {/*
        Giriş tasarımın iki düğmesidir (Barkod okut, Ürün ara); arama çekmecede durur ve gövde tazelenirken sökülmez, sökülseydi her
        tuşta IME kompozisyonu ölürdü.
      */}
      <View style={styles.entryBlock}>
        <PrimaryButton
          label={t.scanCta}
          icon="scan"
          tone="olive"
          elevation="glow"
          onPress={() => sale.setScanOpen(true)}
          disabled={offline}
          testID="sale-scan-cta"
        />
        <SecondaryButton
          label={t.searchCta}
          icon="plus"
          elevation="flat"
          onPress={() => setSearchOpen(true)}
          testID="sale-search-cta"
        />
      </View>

      {sale.status === 'loading' ? (
        /* İlk yük iskelettir, halka değil: kutular gelecek kartların boyunda durur ki veri gelince sayfa zıplamasın; ekranda her zaman
           en az üç ürün vardır. */
        <View style={styles.list}>
          <OperationsSkeletonList
            heights={[SALE_CARD_HEIGHT, SALE_CARD_HEIGHT, SALE_CARD_HEIGHT]}
            label={t.loading}
            testID="sale-loading"
          />
        </View>
      ) : sale.status === 'error' ? (
        <View style={styles.block}>
          <OperationsNoticeBlock variant="error" title={t.error.title} description={t.error.body} testID="sale-error" />
          <TextAction label={t.retry} onPress={sale.reload} testID="sale-retry" />
        </View>
      ) : (
        <FormScroll contentContainerStyle={styles.list} testID="sale-body">
          {sale.products.length === 0 ? (
            place === 'van' && sale.search.trim().length === 0 ? (
              /* Aranmadan boş kalan araç bir arama sonucu değil durumdur; cümle çıkış kapısını, rampada serbest ürün yüklemeyi
                 gösterir. */
              <OperationsNoticeBlock
                variant="empty"
                title={t.van.empty}
                description={t.van.emptyHint}
                testID="sale-van-empty"
              />
            ) : (
              <Text style={styles.hint} testID="sale-search-empty">
                {place === 'van' ? t.van.searchEmpty : t.searchEmpty}
              </Text>
            )
          ) : (
            sale.products.map((product) => (
              <ProductRow key={product.id} product={product} onOpen={sale.openProduct} />
            ))
          )}
          {sale.hasMore ? <TextAction label={t.loadMore} onPress={sale.loadMore} testID="sale-load-more" /> : null}

          {/* Son satışlar tasarımdaki yerinde: listenin altında, sola yaslı. */}
          <View style={styles.recentRow}>
            <TextAction label={t.recentLinkLower} onPress={() => router.navigate('/sale/history')} testID="sale-recent-link" />
          </View>

          {/* Dipnot ekranın üç kuralını söyler: müşteri kaydı istenmez, para alınınca stok anında iner, pazarlık meşrudur ama
              iz bırakır. */}
          <Text style={styles.footnote} testID="sale-footnote">
            {t.footnote}
          </Text>
        </FormScroll>
      )}

      {/* SEPET ÇUBUĞU — yalnız sepet doluyken; dokunuş sepet yüzeyine götürür. Satışın kendisi
          burada YAZILMAZ: parayı yazan düğme, kalemlerin son kez görüldüğü ekranda durur. */}
      {sale.lines.length === 0 ? null : (
        <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
          <PressableSurface
            onPress={() => router.navigate('/sale/cart')}
            feedback="shadow"
            style={[styles.cta, styles.ctaReady]}
            accessibilityLabel={t.cartBar.cta}
            testID="sale-cart-bar"
          >
            <Text style={styles.ctaLabel}>
              {fillCopy(t.cartBar.summary, {
                n: String(sale.lines.reduce((sum, line) => sum + line.qty, 0)),
                total: money(sale.indicativeTotalCents),
              })}
            </Text>
          </PressableSurface>
        </LinearGradient>
      )}

      {/* Arama çekmecesi: ürün seçilince kapanır ve kartın çekmecesi açılır; liste aynı `sale.products`tır, iki liste iki gerçek
          olurdu. */}
      <BottomSheet visible={searchOpen} title={t.searchSheetTitle} fill onClose={() => setSearchOpen(false)} testID="sale-search-sheet">
        <TextInput
          value={sale.search}
          onChangeText={sale.setSearch}
          placeholder={t.searchPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.searchPlaceholder}
          autoFocus
          style={styles.search}
          testID="sale-search"
        />
        <View style={styles.sheetList}>
          {sale.products.length === 0 ? (
            <Text style={styles.hint} testID="sale-search-empty">
              {place === 'van' ? t.van.searchEmpty : t.searchEmpty}
            </Text>
          ) : (
            sale.products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                onOpen={(picked) => {
                  setSearchOpen(false);
                  sale.openProduct(picked);
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>

      {/* OKUTMA PENCERESİ — çözüm ve karar kancada (`handleScan`): bulunan boy kartın çekmecesini
          açar, bulunamayan kod toast'la söylenir. Simülasyon çipleri kitin havuzundan (ürün
          barkodları statik formülle taklit edilebiliyor — `dev-scan-pool`). */}
      {/*
        Okutma yüzen düğmede de durur, çünkü üstteki giriş düğmesi listeyle kayıp gider; sepet çubuğu varken daire onun kadar yukarı
        kalkar, yoksa tutarı örterdi.
      */}
      <OperationsScanFab
        icon="scan"
        tone="scan"
        accessibilityLabel={t.scanCta}
        onPress={() => sale.setScanOpen(true)}
        disabled={offline}
        lift={sale.lines.length === 0 ? 0 : CART_BAR_LIFT}
        testID="sale-scan-fab"
      />

      <ScanSheet
        open={sale.scanOpen}
        title={t.scan.title}
        hint={t.scan.hint}
        onClose={() => sale.setScanOpen(false)}
        onScan={sale.handleScan}
        devResolve={sale.describeDevCode}
        testID="sale-scan-sheet"
      />

      {/*
        Sepete ekleme çekmecesi kitin parçalarından kurulur, çünkü kitin okutma çekmecesi bilerek fiyat taşımaz: boy yalnız çok boylu
        kartta sorulur, adet kitin büyük sayacıdır, fiyat satışa özgüdür. Fotoğraf yoktur, ürünün yüzü listede zaten görüldü.
      */}
      <BottomSheet
        visible={sale.draft !== null}
        title={draftSelection?.name ?? sale.draft?.product.name ?? ''}
        onClose={sale.closeDraft}
        testID="sale-drawer"
      >
        {sale.draft === null ? null : (
          <View style={styles.drawerBody}>
            {sale.draft.variants === 'loading' ? (
              <Text style={styles.hint}>{t.drawer.variantsLoading}</Text>
            ) : sale.draft.variants === 'error' ? (
              <Text style={styles.warnText} testID="sale-drawer-variants-error">
                {t.drawer.variantsError}
              </Text>
            ) : Array.isArray(sale.draft.variants) && sale.draft.variants.length > 1 ? (
              <View style={styles.section}>
                <Text style={styles.heading}>{t.drawer.variantHeading}</Text>
                <View style={styles.chipRow}>
                  {sale.draft.variants.map((variant) => (
                    <OperationsChoiceChip
                      key={variant.id}
                      label={
                        variant.priceCents === null
                          ? fillCopy(t.drawer.variantMetaClosed, { label: variant.label })
                          : fillCopy(t.drawer.variantMeta, {
                              label: variant.label,
                              price: money(variant.priceCents),
                              n: String(variant.availableHere),
                            })
                      }
                      selected={sale.draft?.pickedVariantId === variant.id}
                      onPress={() => sale.pickVariant(variant)}
                      testID={`sale-variant-${variant.id}`}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {draftSelection === null ? null : (
              <>
                <View style={styles.qty}>
                  <OperationsStepperGroup
                    value={sale.draft.qty}
                    onChange={sale.setDraftQty}
                    label={t.drawer.qty}
                    min={1}
                    max={draftSelection.availableHere}
                    size="lg"
                    testID="sale-drawer-qty"
                  />
                  <Text style={styles.qtyCaption}>
                    {fillCopy(t.card.remaining, { n: String(draftSelection.availableHere) })}
                  </Text>
                </View>
                {/* Sayaç `+`yı kalanda söndürür; buraya yalnız okutmayla gelen fazla düşer (koli
                    çarpanı kalandan büyük). Sessizce kırpılmaz — kurye kolinin tamamını
                    satamayacağını görmeli. */}
                {overStock ? (
                  <Text style={styles.warnText} testID="sale-drawer-overstock">
                    {fillCopy(t.drawer.overStock, { n: String(draftSelection.availableHere) })}
                  </Text>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.heading}>{t.drawer.priceHeading}</Text>
                  <View style={styles.priceRow}>
                    <TextInput
                      value={sale.draft.priceText}
                      onChangeText={sale.setDraftPrice}
                      keyboardType="decimal-pad"
                      accessibilityLabel={t.drawer.priceField}
                      style={styles.priceInput}
                      testID="sale-drawer-price"
                    />
                    <Text style={styles.priceCurrency}>€</Text>
                  </View>
                  <Text style={styles.hint}>
                    {fillCopy(t.drawer.priceHint, { price: money(draftSelection.listPriceCents) })}
                  </Text>
                  {draftPriceCents === null ? <Text style={styles.warnText}>{t.drawer.invalidPrice}</Text> : null}
                </View>
              </>
            )}

            <PrimaryButton
              label={offline ? t.offline.addCta : t.drawer.confirm}
              onPress={sale.confirmDraft}
              disabled={!draftReady}
              elevation="flat"
              testID="sale-drawer-confirm"
            />
            {/* SEBEP DÜĞMENİN ALTINDA: kapalı bir düğme, neden kapalı olduğunu söylemezse arıza
                gibi okunur (depo ekranlarının aynı kararı). */}
            {offline ? (
              <Text style={styles.warnText} testID="sale-drawer-offline">
                {t.offline.addHint}
              </Text>
            ) : null}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

interface ProductRowProps {
  product: SaleCatalogProduct;
  onOpen: (product: SaleCatalogProduct) => void;
}

/**
 * Katalog kartı. `memo` çekmece akıcılığı içindir: karta dokunmak `draft`ı değiştirir ve kartlar çekmece animasyonuyla aynı karede
 * yeniden çizilirdi; kararlı `onOpen` ile dokunuş yalnız çekmeceyi çizdirir.
 */
const ProductRow = memo(function ProductRow({ product, onOpen }: ProductRowProps) {
  const multi = product.variantCount > 1;
  // Tek boyluda satılamaz hâller karttan bellidir; çok boyluda karar çekmecede verilir (boy boy).
  const sellable = multi || (product.variantId !== null && product.priceCents !== null && !product.soldOut);
  const badge =
    product.variantId === null
      ? t.card.noUnit
      : multi
        ? fillCopy(t.card.options, { n: String(product.variantCount) })
        : product.soldOut || product.availableHere === 0
          ? t.card.soldOut
          : fillCopy(t.card.remaining, { n: String(product.availableHere ?? 0) });

  /*
    Satır kitten gelir (`OperationsProductRow`), çünkü elle çizilen kopyalar ayrışır ve aynı ürün iki ekranda iki farklı resimle
    görünürdü. `memo` yerinde kalır, gerekçesi kartın künyesindedir.
  */
  return (
    <OperationsProductRow
      name={product.name}
      image={product.image}
      size="md"
      meta={
        <Text style={styles.productMeta}>
          {[product.unitLabel, product.priceCents === null ? null : money(product.priceCents)]
            .filter((part): part is string => part !== null && part.length > 0)
            .join(' · ')}
        </Text>
      }
      right={<Text style={[styles.productBadge, sellable ? null : styles.productBadgeClosed]}>{badge}</Text>}
      onPress={sellable ? () => onOpen(product) : undefined}
      accessibilityLabel={product.name}
      style={[styles.productRow, sellable ? null : styles.productRowClosed]}
      testID={`sale-product-${product.id}`}
    />
  );
});

const styles = StyleSheet.create({
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space.xl,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.lg,
  },
  /** İki giriş düğmesi alt alta, listeyle aynı yan nefes. */
  entryBlock: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space.xl,
    gap: operationsTheme.space.xl,
  },
  /** Arama çekmecesinin sonuç listesi — kutunun altında, kartlar arası listeyle aynı aralık. */
  sheetList: {
    paddingTop: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  search: {
    flex: 1,
    minHeight: operationsTheme.size.controlSm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  recentRow: {
    alignItems: 'flex-start',
  },
  section: {
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
  },
  /** KABUK yalnız: dizilim kitin `OperationsProductRow`undan geliyor. */
  productRow: {
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  productRowClosed: {
    backgroundColor: operationsTheme.colors.panel,
  },
  productMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  productBadge: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  productBadgeClosed: {
    color: operationsTheme.colors.muted,
  },
  /** Çekmece gövdesi — kit çekmecesinin (`scan-qty-sheet`) dikey nefesi. */
  drawerBody: {
    gap: operationsTheme.space.xl,
  },
  qty: {
    gap: operationsTheme.space.sm,
  },
  qtyCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  warnText: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.terracotta,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  priceInput: {
    flex: 1,
    minHeight: operationsTheme.size.controlSm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  priceCurrency: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.muted,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaReady: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
