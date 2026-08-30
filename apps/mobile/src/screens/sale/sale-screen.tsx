import { memo } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { SaleCatalogProduct } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtySlider } from '@/components/operations/qty-slider';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { CirclePhoto } from '@/components/ui/circle-photo';
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { saleCopy } from './copy';
import { useWarehouseStatus } from '@/screens/warehouse/warehouse-status';
import { useSaleContext } from './sale-context';
import { selectionOf } from './use-sale.hook';

/*
  YERİNDE SATIŞ · KATALOG — `/sale` (21.119 · `DOMAIN §17`: satan kişi malın yanında duran
  personeldir; depoyu SUNUCU künyeden çözer, ekran depo sormaz).

  ── AKIŞ İKİ YÜZEY (kullanıcı kararı 26.08) ─────────────────────────────────
  Liste ile sepet aynı sayfadaydı ve kötüydü: iki ayrı soru tek ekranda itişiyordu. Artık burası
  yalnız "ne satıyorum" — ara, karta dokun, çekmecede adet+fiyat, sepete at. Sepet dolunca altta
  ÇUBUK belirir ve `/sale/cart`a götürür: son kontrol, tahsilat seçimi ve yazma orada. Kaydedilen
  satışlar `/sale/history`de (başlığın altındaki bağ). Durum `SaleProvider`da ortak.

  Kartta ÜRÜN GÖRSELİ var (aynı karar): personel müşteriyle ürünün yüzü üstünden konuşur; görselsiz
  liste, adı benzeyen iki böreği ayırt ettirmiyordu. Görsel yoksa baş harf çizilir (`CirclePhoto` —
  kitin kendi yedeği), boş bir kare değil.
*/

const t = saleCopy;

export function SaleScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  /* ÇEVRİMDIŞI KİLİDİ (v3:20) — depo yazma ekranlarının kuralı burada da geçerli ve AYNI sinyalden
     okunuyor: sepete atılan kalem, o anki fiyatı ve kalan stoğu taşır; hat kapalıyken ikisi de
     bayattır ve bayat fiyatla yazılan satış, müşterinin gözünün önünde yanlış para demektir. */
  const { offline } = useWarehouseStatus();

  const draftSelection = sale.draft === null ? null : selectionOf(sale.draft);
  const draftPriceCents = sale.draft === null ? null : parseAmountToCents(sale.draft.priceText);
  const overStock = draftSelection !== null && sale.draft !== null && sale.draft.qty > draftSelection.availableHere;
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
        subtitle={t.subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="sale-header"
      />

      {/* Arama DURUM DALININ DIŞINDA: her tuş bir yeniden yükleme tetikliyor ve alan o dalın
          içinde olsaydı her yüklemede sökülüp odak/IME kompozisyonunu öldürürdü (cihazda ölçüldü
          26.08 — alanda tek harf kalıyordu). Alan hep ayakta durur, yalnız GÖVDE değişir. */}
      <View style={styles.searchBlock}>
        <View style={styles.searchRow}>
          <TextInput
            value={sale.search}
            onChangeText={sale.setSearch}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={operationsTheme.colors.muted}
            accessibilityLabel={t.searchPlaceholder}
            style={styles.search}
            testID="sale-search"
          />
        </View>
        <View style={styles.recentRow}>
          <TextAction label={t.recentLink} onPress={() => router.navigate('/sale/history')} testID="sale-recent-link" />
        </View>
      </View>

      {sale.status === 'loading' ? (
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.loading} label={t.loading} />
        </View>
      ) : sale.status === 'error' ? (
        <View style={styles.block}>
          <OperationsNoticeBlock variant="error" title={t.error.title} description={t.error.body} testID="sale-error" />
          <TextAction label={t.retry} onPress={sale.reload} testID="sale-retry" />
        </View>
      ) : (
        <FormScroll contentContainerStyle={styles.list} testID="sale-body">
          {sale.products.length === 0 ? (
            <Text style={styles.hint} testID="sale-search-empty">
              {t.searchEmpty}
            </Text>
          ) : (
            sale.products.map((product) => (
              <ProductRow key={product.id} product={product} onOpen={sale.openProduct} />
            ))
          )}
          {sale.hasMore ? <TextAction label={t.loadMore} onPress={sale.loadMore} testID="sale-load-more" /> : null}

          {/* DİPNOT (v3:20) — bu ekranın üç kuralı: müşteri kaydı istenmez, para alınınca stok
              anında iner, pazarlık meşrudur ama iz bırakır. Üçü de ekranda görünmeyen ama satışı
              yazan kişinin bilmesi gereken şeyler. */}
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

      <BottomSheet
        visible={sale.draft !== null}
        title={t.drawer.title}
        onClose={sale.closeDraft}
        testID="sale-drawer"
      >
        {sale.draft === null ? null : (
          <>
            <View style={styles.drawerHead}>
              <CirclePhoto
                size={44}
                initial={sale.draft.product.name.slice(0, 1)}
                initialFontSize={18}
                photoUri={sale.draft.product.image.url}
              />
              <Text style={styles.drawerName}>{sale.draft.product.name}</Text>
            </View>

            {sale.draft.variants === 'loading' ? (
              <Text style={styles.hint}>{t.drawer.variantsLoading}</Text>
            ) : sale.draft.variants === 'error' ? (
              <Text style={styles.warnText} testID="sale-drawer-variants-error">
                {t.drawer.variantsError}
              </Text>
            ) : Array.isArray(sale.draft.variants) ? (
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
                <OperationsQtySlider
                  key={draftSelection.variantId}
                  value={sale.draft.qty}
                  onChange={sale.setDraftQty}
                  step={1}
                  expected={draftSelection.availableHere}
                  accessibilityLabel={t.drawer.qty}
                  fineLabels={{ increase: t.drawer.qtyIncrease, decrease: t.drawer.qtyDecrease }}
                  caption={fillCopy(t.card.remaining, { n: String(draftSelection.availableHere) })}
                  testID="sale-drawer-qty"
                />
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

            <PressableSurface
              onPress={sale.confirmDraft}
              disabled={!draftReady}
              feedback="shadow"
              style={[styles.cta, draftReady ? styles.ctaReady : styles.ctaIdle]}
              accessibilityLabel={offline ? t.offline.addCta : t.drawer.confirm}
              testID="sale-drawer-confirm"
            >
              <Text style={styles.ctaLabel}>{offline ? t.offline.addCta : t.drawer.confirm}</Text>
            </PressableSurface>
            {/* SEBEP DÜĞMENİN ALTINDA: kapalı bir düğme, neden kapalı olduğunu söylemezse arıza
                gibi okunur (depo ekranlarının aynı kararı). */}
            {offline ? (
              <Text style={styles.warnText} testID="sale-drawer-offline">
                {t.offline.addHint}
              </Text>
            ) : null}
          </>
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
 * Katalog kartı — görsel + ad + birim + fiyat solda, kalan/tükendi rozeti sağda.
 *
 * **`memo` BİR SÜS DEĞİL, ÇEKMECE AKICILIĞININ KENDİSİ** (kullanıcı bulgusu 26.08: "çekmece
 * kasarak açılıyor", başka çekmecelerde yok). Karta dokunmak `draft` durumunu değiştiriyor ve
 * ekranın kökü yeniden çiziliyordu — 30 kart, çekmece animasyonuyla AYNI karede; çok boylu
 * üründe boylar gelince animasyonun ortasında bir tur daha. Kartların hiçbiri o anda değişmiyor.
 * `memo` + kararlı `onOpen` (hook'un `useCallback`'i) ile dokunuş yalnız çekmeceyi çizdirir;
 * kartlar ancak LİSTE değişince (arama, sayfa, satış sonrası tazeleme) yeniden çizilir.
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

  return (
    <PressableSurface
      onPress={() => onOpen(product)}
      disabled={!sellable}
      feedback="scale"
      style={[styles.productRow, sellable ? null : styles.productRowClosed]}
      accessibilityLabel={product.name}
      testID={`sale-product-${product.id}`}
    >
      <CirclePhoto size={44} initial={product.name.slice(0, 1)} initialFontSize={18} photoUri={product.image.url} />
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productMeta}>
          {[product.unitLabel, product.priceCents === null ? null : money(product.priceCents)]
            .filter((part): part is string => part !== null && part.length > 0)
            .join(' · ')}
        </Text>
      </View>
      <Text style={[styles.productBadge, sellable ? null : styles.productBadgeClosed]}>{badge}</Text>
    </PressableSurface>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
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
  searchBlock: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space.sm,
    gap: operationsTheme.space['2xs'],
  },
  searchRow: {
    flexDirection: 'row',
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
    alignItems: 'flex-end',
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
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  productRowClosed: {
    backgroundColor: operationsTheme.colors.panel,
  },
  productInfo: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  productName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
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
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  drawerName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
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
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
