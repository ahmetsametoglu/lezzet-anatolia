import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import {
  applyCoupon,
  cartCount,
  cartSubtotalCents,
  cartTotalCents,
  removeBundle,
  removeCoupon,
  removeProduct,
  seedCart,
  setBundleQuantity,
  setProductQuantity,
  useCart,
} from '@/screens/customer-kit/cart-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { CartLineRow } from './cart-line-row';
import { cartFixture, DEMO_COUPONS, MINIMUM_ORDER_CENTS } from './cart-fixture';
import messages from './messages.json';

/*
  SEPET (v3 `vCart`) — hazır paket satırları, ürün satırları, kupon, tutar özeti ve yapışkan
  "siparişi tamamla" barı.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Sepetin bir UCU YOK; durum uygulama ömrü boyunca yaşayan sepet deposunda (`customer-kit/
  cart-store`). Adet değiştirmek, satır kaldırmak, kupon uygulamak GERÇEKTEN çalışır ve vitrindeki
  yüzen düğmenin sayısını da o an değiştirir — ekran "çalışıyormuş gibi" yapmıyor.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Kupon sayfası kitin `BottomSheet`i.** Şablonun kupon yüzeni (`shCoupon`) aynı yerleşimi
     kullanıyor; ikinci bir yüzen sayfa kurmak yerine kitteki kullanıldı.
  2. **Geçersiz kod SESSİZ DEĞİL.** Şablon kodu toast ile reddediyor; toast küresel bir kabuk
     öğesi (bu ekranın parçası değil, bkz. vitrin künyesi) — mesaj alanın kendi hata satırına
     yazıldı, yani hata kodun YANINDA duruyor ve ekran okuyucuya alanla birlikte gidiyor.
  3. **Asgari tutar uyarısı `Note` ile** (kitteki terracotta tonu) — şablonun kum-turuncu kutusu
     birebir aynı rol. Yapışkan bardaki düğme o sırada ENGELLİ değil: şablon da tıklatınca uyarıyı
     gösteriyor, yani engel checkout'un kapısında değil sepetin kendisindedir. Burada uyarı ZATEN
     görünür olduğu için düğme kapatıldı — görünmeyen bir kuralı düğmeye basınca öğrenmek yerine
     kural ekranda duruyor.
  4. **Tükendi satırı otomatik silinmez.** Şablon da silmiyor: müşteriye "şunu kaldırın" diyor.
     Sessizce kaldırmak, sepetten haber vermeden ürün çıkarmak olurdu.
*/

type Messages = LocalizedCopy<typeof messages>;

/*
  DEMO SEPETİ MODÜL YÜKLENİRKEN BİR KEZ kurulur (UI-only etap). Ekranın içinde kurulsaydı her
  açılışta yeniden kurulurdu ve müşterinin kaldırdığı satır geri gelirdi — sepet kendi kendine
  dolardı. Modül düzeyi doğru yer: expo-router rota ağacını AÇILIŞTA topluca `require` eder, yani
  bu satır uygulama başlarken tam bir kez çalışır ve vitrindeki yüzen düğme de o an doğru sayıyı
  gösterir. Gerçek uç geldiğinde burası sunucudan sepet çekmeye döner; ekranın gerisi değişmez.
  Testler kendi hâllerini `seedCart` ile kurar (aynı kapı).
*/
seedCart(cartFixture());

export function CartScreen() {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();

  const [couponSheetOpen, setCouponSheetOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  const count = cartCount(cart);
  const subtotalCents = cartSubtotalCents(cart);
  const totalCents = cartTotalCents(cart);
  const missingCents = MINIMUM_ORDER_CENTS - totalCents;
  const isEmpty = count === 0;

  const submitCoupon = () => {
    const code = couponInput.trim().toLocaleUpperCase('tr-TR');
    const amountCents = DEMO_COUPONS[code];
    if (amountCents === undefined) {
      setCouponError(t.coupon.invalid);
      return;
    }
    applyCoupon({ code, amountCents });
    setCouponInput('');
    setCouponError(null);
    setCouponSheetOpen(false);
  };

  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(subtotalCents, locale) },
    ...(cart.coupon === null
      ? []
      : [
          {
            key: 'discount',
            label: `${t.summary.discount} · ${cart.coupon.code}`,
            // İndirim EKSİ yazılır: özetteki tek çıkarma satırı odur ve işaretsiz yazılırsa
            // toplamla aritmetiği tutmuyormuş gibi okunur.
            value: `−${formatPrice(cart.coupon.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
  ];

  const header = (
    <View style={styles.header}>
      <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="cart-back" />
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      <Text style={styles.count}>{t.count.replace('{n}', String(count))}</Text>
    </View>
  );

  if (isEmpty) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon={<CustomerIcon name="cart" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          action={<PrimaryButton label={t.empty.cta} shape="pill" onPress={() => router.push('/catalog')} testID="cart-browse" />}
          testID="cart-empty"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.content} testID="cart-scroll">
        <View style={styles.lines}>
          {cart.bundles.map((bundle) => (
            <CartLineRow
              key={bundle.id}
              name={bundle.name}
              subtitle={bundle.contentLabel}
              totalLabel={formatPrice(bundle.unitCents * bundle.quantity, locale)}
              quantity={bundle.quantity}
              photoUri={bundle.photoUri}
              tone="bundle"
              eyebrow={t.line.bundle}
              removeLabel={t.line.remove}
              removeAccessibilityLabel={t.line.removeLabel.replace('{name}', bundle.name)}
              decreaseLabel={t.line.decrease.replace('{name}', bundle.name)}
              increaseLabel={t.line.increase.replace('{name}', bundle.name)}
              onDecrease={() => setBundleQuantity(bundle.id, bundle.quantity - 1)}
              onIncrease={() => setBundleQuantity(bundle.id, bundle.quantity + 1)}
              onRemove={() => removeBundle(bundle.id)}
              testID={`cart-bundle-${bundle.id}`}
            />
          ))}
          {cart.products.map((product) => (
            <CartLineRow
              key={product.id}
              name={product.name}
              subtitle={t.line.unit
                .replace('{variant}', product.variantLabel)
                .replace('{price}', formatPrice(product.unitCents, locale))}
              totalLabel={formatPrice(product.unitCents * product.quantity, locale)}
              quantity={product.quantity}
              photoUri={product.photoUri}
              tone="product"
              discountLabel={product.discounted ? t.line.discounted : undefined}
              soldOutLabel={product.soldOut ? t.line.soldOut : undefined}
              removeLabel={t.line.remove}
              removeAccessibilityLabel={t.line.removeLabel.replace('{name}', product.name)}
              decreaseLabel={t.line.decrease.replace('{name}', product.name)}
              increaseLabel={t.line.increase.replace('{name}', product.name)}
              onDecrease={() => setProductQuantity(product.id, product.quantity - 1)}
              onIncrease={() => setProductQuantity(product.id, product.quantity + 1)}
              onRemove={() => removeProduct(product.id)}
              testID={`cart-line-${product.id}`}
            />
          ))}
        </View>

        {cart.coupon === null ? (
          <PressableSurface
            onPress={() => setCouponSheetOpen(true)}
            feedback="scale"
            style={styles.couponInvite}
            accessibilityLabel={t.coupon.add}
            testID="cart-coupon-open"
          >
            <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
            <Text style={styles.couponInviteLabel}>{t.coupon.add}</Text>
            <Text style={styles.couponChevron}>›</Text>
          </PressableSurface>
        ) : (
          <View style={styles.couponApplied} testID="cart-coupon-applied">
            <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            <Text style={styles.couponAppliedLabel}>{t.coupon.applied.replace('{code}', cart.coupon.code)}</Text>
            <TextAction
              label={t.coupon.remove}
              onPress={removeCoupon}
              accessibilityHint={t.coupon.removeLabel}
              testID="cart-coupon-remove"
            />
          </View>
        )}

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(totalCents, locale)}
          note={t.summary.note}
          testID="cart-summary"
        />

        {missingCents > 0 ? (
          <Note
            tone="terracotta"
            description={t.minimum
              .replace('{minimum}', formatPrice(MINIMUM_ORDER_CENTS, locale))
              .replace('{missing}', formatPrice(missingCents, locale))}
            testID="cart-minimum"
          />
        ) : null}

        <View style={styles.continueRow}>
          <TextAction label={t.continue} onPress={() => router.push('/catalog')} testID="cart-continue" />
        </View>
      </ScrollView>

      {/* Yapışkan bar kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kendi kalıbı). */}
      <View style={styles.stickyBar}>
        <PressableSurface
          onPress={() => router.push('/checkout')}
          feedback="shadow"
          disabled={missingCents > 0}
          style={[styles.checkoutButton, missingCents > 0 ? styles.checkoutDisabled : styles.checkoutEnabled]}
          accessibilityLabel={t.checkout}
          testID="cart-checkout"
        >
          <Text style={styles.checkoutLabel}>{t.checkout}</Text>
          <View style={styles.checkoutTotal}>
            <Text style={styles.checkoutLabel}>{formatPrice(totalCents, locale)}</Text>
          </View>
        </PressableSurface>
      </View>

      {/* Kupon yüzeni kendi katmanını kurar (kitteki `BottomSheet`), ekranın yerleşimine karışmaz. */}
      <BottomSheet
        visible={couponSheetOpen}
        title={t.coupon.sheetTitle}
        onClose={() => setCouponSheetOpen(false)}
        testID="cart-coupon-sheet"
      >
        <View style={styles.couponForm}>
          <TextField
            value={couponInput}
            onChangeText={(value) => {
              setCouponInput(value);
              // Yazmaya başlayınca hata düşer: eski bir reddin yeni kodun üstünde durması yanlış olurdu.
              setCouponError(null);
            }}
            accessibilityLabel={t.coupon.field}
            placeholder={t.coupon.placeholder}
            errorText={couponError ?? undefined}
            testID="cart-coupon-input"
          />
          <PrimaryButton label={t.coupon.apply} onPress={submitCoupon} testID="cart-coupon-apply" />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space['3xl'],
    paddingTop: theme.space.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
  count: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  content: {
    padding: theme.space['4xl'],
    gap: theme.space.xl,
    // Yapışkan barın altında kalan son satır için nefes (şablon: 120 px'lik boşluk bloğu).
    paddingBottom: theme.space['9xl'] + theme.space['5xl'],
  },
  lines: { gap: theme.space.lg },

  couponInvite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    padding: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
  },
  couponInviteLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  couponChevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['sand-600'],
  },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    padding: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors['sand-150'],
  },
  couponAppliedLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  continueRow: { alignItems: 'center' },

  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['6xl'],
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    backgroundColor: theme.colors['cream-glass'],
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: theme.size.controlLg,
    paddingLeft: theme.space['5xl'],
    paddingRight: theme.space.md,
    borderRadius: theme.radius.control,
    boxShadow: theme.shadow.hard,
  },
  checkoutEnabled: { backgroundColor: theme.colors.olive },
  checkoutDisabled: { backgroundColor: theme.colors['disabled-fill'] },
  checkoutLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors.card,
  },
  checkoutTotal: {
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['scrim-soft'],
  },
  couponForm: { gap: theme.space.xl },
}));
