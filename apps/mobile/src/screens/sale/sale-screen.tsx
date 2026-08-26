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
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { saleCopy } from './copy';
import { selectionOf, useSale } from './use-sale.hook';

/*
  YERİNDE SATIŞ EKRANI (21.119) — depo kapısı ve kuryenin aracı, aynı ekran (`DOMAIN §17`: satan
  kişi malın yanında duran personeldir; hangi depodan satıldığını SUNUCU künyeden çözer, ekran
  depo sormaz).

  Görsel dil mevcut operasyon deseninden (kullanıcı onayı 26.08: "mevcut desene uyarak kendimiz
  hazırlayalım"): mal kabulün arama + çekmece akışı, sayım ekranının bölüm/CTA düzeni. Kararların
  tamamı hook künyesinde; burada yalnız çizim var.

  Akış: ara → karta dokun → (çok boyluda boy seç) → adet + fiyat → sepete ekle → tahsilat türü →
  tek CTA ile satış. Reddin üç hâli de sepeti bozmaz; sonuç cümlesi yapışkan bloktadır ki telefon
  cebe girmeden görülsün.
*/

const t = saleCopy;

export function SaleScreen() {
  const router = useRouter();
  const sale = useSale();

  const draftSelection = sale.draft === null ? null : selectionOf(sale.draft);
  const draftPriceCents = sale.draft === null ? null : parseAmountToCents(sale.draft.priceText);
  const overStock = draftSelection !== null && sale.draft !== null && sale.draft.qty > draftSelection.availableHere;
  const draftReady = draftSelection !== null && sale.draft !== null && sale.draft.qty > 0 && draftPriceCents !== null && !overStock;

  const cta = sale.sending
    ? { label: t.cta.sending, enabled: false }
    : sale.lines.length === 0
      ? { label: t.cta.idle, enabled: false }
      : { label: fillCopy(t.cta.ready, { total: money(sale.indicativeTotalCents) }), enabled: true };

  return (
    <View style={styles.screen} testID="sale-screen">
      <OperationsStackHeader
        title={t.title}
        subtitle={t.subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="sale-header"
      />

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
          <TextInput
            value={sale.search}
            onChangeText={sale.setSearch}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={operationsTheme.colors.muted}
            accessibilityLabel={t.searchPlaceholder}
            style={styles.search}
            testID="sale-search"
          />

          {sale.products.length === 0 ? (
            <Text style={styles.hint} testID="sale-search-empty">
              {t.searchEmpty}
            </Text>
          ) : (
            sale.products.map((product) => (
              <ProductRow key={product.id} product={product} onPress={() => sale.openProduct(product)} />
            ))
          )}
          {sale.hasMore ? <TextAction label={t.loadMore} onPress={sale.loadMore} testID="sale-load-more" /> : null}

          <View style={styles.section}>
            <Text style={styles.heading}>{t.cart.heading}</Text>
            {sale.lines.length === 0 ? (
              <Text style={styles.hint}>{t.cart.empty}</Text>
            ) : (
              <>
                {sale.lines.map((line) => (
                  <View key={line.variantId} style={styles.cartRow} testID={`sale-cart-${line.variantId}`}>
                    <View style={styles.cartInfo}>
                      <Text style={styles.cartName}>{line.name}</Text>
                      <Text style={styles.cartMeta}>
                        {fillCopy(t.cart.line, {
                          qty: String(line.qty),
                          price: money(line.negotiatedCents ?? line.listPriceCents),
                        })}
                        {line.negotiatedCents === null ? '' : ` · ${t.cart.negotiated}`}
                      </Text>
                    </View>
                    <PressableSurface
                      onPress={() => sale.removeLine(line.variantId)}
                      feedback="scale"
                      compact
                      style={styles.cartRemove}
                      accessibilityLabel={fillCopy(t.cart.remove, { name: line.name })}
                      testID={`sale-cart-remove-${line.variantId}`}
                    >
                      <Text style={styles.cartRemoveMark}>{t.cart.removeMark}</Text>
                    </PressableSurface>
                  </View>
                ))}
                <Text style={styles.cartTotal} testID="sale-cart-total">
                  {fillCopy(t.cart.total, { total: money(sale.indicativeTotalCents) })}
                </Text>
                <Text style={styles.hint}>{t.cart.totalNote}</Text>
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.heading}>{t.payment.heading}</Text>
            <View style={styles.chipRow}>
              <OperationsChoiceChip
                label={t.payment.cash}
                selected={sale.payment === 'cash'}
                onPress={() => sale.setPayment('cash')}
                testID="sale-payment-cash"
              />
              <OperationsChoiceChip
                label={t.payment.card}
                selected={sale.payment === 'card'}
                onPress={() => sale.setPayment('card')}
                testID="sale-payment-card"
              />
            </View>
          </View>
        </FormScroll>
      )}

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {sale.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${sale.notice.tone}`]]}
            accessibilityRole="alert"
            testID="sale-notice"
          >
            {sale.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={sale.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="sale-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>

      <BottomSheet
        visible={sale.draft !== null}
        title={t.drawer.title}
        onClose={sale.closeDraft}
        testID="sale-drawer"
      >
        {sale.draft === null ? null : (
          <>
            <Text style={styles.drawerName}>{sale.draft.product.name}</Text>

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
              accessibilityLabel={t.drawer.confirm}
              testID="sale-drawer-confirm"
            >
              <Text style={styles.ctaLabel}>{t.drawer.confirm}</Text>
            </PressableSurface>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

interface ProductRowProps {
  product: SaleCatalogProduct;
  onPress: () => void;
}

/** Katalog kartı — ad + birim + fiyat solda, kalan/tükendi rozeti sağda. */
function ProductRow({ product, onPress }: ProductRowProps) {
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
      onPress={onPress}
      disabled={!sellable}
      feedback="scale"
      style={[styles.productRow, sellable ? null : styles.productRowClosed]}
      accessibilityLabel={product.name}
      testID={`sale-product-${product.id}`}
    >
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
}

const styles = StyleSheet.create({
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
  search: {
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
  section: {
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
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
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.md,
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['sand-500'],
  },
  cartInfo: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  cartName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  cartMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  cartRemove: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  cartRemoveMark: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  cartTotal: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
    paddingTop: operationsTheme.space.md,
  },
  drawerName: {
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
  notice: {
    marginBottom: operationsTheme.space.md,
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  notice_ok: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  notice_warn: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  notice_error: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
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
