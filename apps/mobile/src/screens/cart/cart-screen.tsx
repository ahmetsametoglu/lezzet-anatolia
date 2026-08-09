import type { z } from 'zod';
import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { CartDiscountReasonSchema, MeCartViewLine } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SectionHeader } from '@/components/ui/section-header';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { useAppLocale } from '@/lib/i18n/app-locale';
import {
  applyCoupon,
  cartCount,
  cartLineId,
  removeBundle,
  removeCoupon,
  removeProduct,
  setBundleQuantity,
  setProductQuantity,
  useCart,
} from '@/screens/customer-kit/cart-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { CartLineRow } from './cart-line-row';
import messages from './messages.json';

/*
  SEPET (v3 `vCart`) — satırlar, kupon, tutar özeti ve yapışkan "siparişi tamamla" barı.

  ── EKRAN HESAP YAPMAZ, ÇİZER ───────────────────────────────────────────────
  Ara toplam · indirim · toplam · asgari sepet · ücretsiz kargo eşiği · "tükendi, çıkarın" hâli —
  hepsi SUNUCUNUN çözdüğü görünümden (`MeCartView`) okunur. Ekranın kendi aritmetiği YOK ve kupon
  sözlüğü YOK: sepetteki fiyat bağlayıcı değildir, her okumada yeniden çözülür (DOMAIN §5) ve iki
  yüzeyde iki ayrı hesap bir gün iki farklı tutar gösterirdi. Görünümü misafirde de sunucu çözer
  (`POST /cart/view`) — aynı sepet misafirken bir, giriş yapınca başka bir tutar göstermesin.

  Deponun kaynağını (sunucu ⟷ cihaz) ekran BİLMEZ; sunucu turunu da o AÇMAZ (`useCartSync` müşteri
  sekme kabuğunda takılı — `app/(tabs)/_layout`; ikinci kez takmak aynı aboneliği iki yerden
  yönetmek olurdu).

  ── SEPETİN İKİ GRUBU ───────────────────────────────────────────────────────
  Kalemin yolunu STOK belirler (`route`): kendi deposunda bulunan araçla kapıya gider, yalnız kargo
  deposunda olan kargoyla. İki grup = İKİ SİPARİŞ ve ikincisi zorunlu değil (web sepetinin aynı
  hükmü, `cart-group.tsx`). Başlıklar YALNIZ iki grup da doluyken çizilir: tek yolu olan sepette
  başlık, olmayan bir seçimi varmış gibi gösterir. Yolu BİLİNMEYEN satır varsa (posta kodu yok →
  `route: null`) ayrım hiç yapılmaz — sözleşmenin kendi hükmü.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Kupon sayfası kitin `BottomSheet`i.** Şablonun kupon yüzeni (`shCoupon`) aynı yerleşimi
     kullanıyor; ikinci bir yüzen sayfa kurmak yerine kitteki kullanıldı.
  2. **Kuponun REDDİ artık sunucudan gelir ve alanın altında değil, sepette yazar.** Doğrulama bir
     ağ turudur; yüzen sayfayı cevabı beklerken açık tutmak, müşteriyi boş bir formun başında
     bekletirdi. Alanın kendi hata satırı duruyor ama tek işi kalıyor: boş kodu göndermemek.
     Sebep CÜMLESİ gerçek (`süresi dolmuş` ⟷ `asgari sepet` ⟷ `hakkı bitmiş` üç ayrı şeydir ve
     ikincisinde müşteri sepetine ürün ekleyerek kuponu kullanabilir).
  3. **Asgari tutar uyarısı `Note` ile** (kitteki terracotta tonu) — şablonun kum-turuncu kutusu
     birebir aynı rol. Yapışkan bardaki düğme o sırada ENGELLİ değil: şablon da tıklatınca uyarıyı
     gösteriyor, yani engel checkout'un kapısında değil sepetin kendisindedir. Burada uyarı ZATEN
     görünür olduğu için düğme kapatıldı — görünmeyen bir kuralı düğmeye basınca öğrenmek yerine
     kural ekranda duruyor.
  4. **Tükendi satırı otomatik silinmez.** Şablon da silmiyor: müşteriye "şunu kaldırın" diyor.
     Sessizce kaldırmak, sepetten haber vermeden ürün çıkarmak olurdu.
  5. **Grup başlıkları ve bölünme uyarısı kitin `SectionHeader`/`Note`u ile.** Mobil tasarımda
     sepetin bölünmesi çizilmemiş; yeni bir görsel dil üretmek yerine ekranın zaten kullandığı iki
     bileşen kullanıldı — bilgi web sepetiyle aynı, biçim mobilin kendi kiti.
*/

type Messages = LocalizedCopy<typeof messages>;
type DiscountReason = z.infer<typeof CartDiscountReasonSchema>;

/**
 * SUNUCUDAN GELEN PAKET SATIRI UYGULAMADAN DÜZENLENEMEZ. Sebep 21.21'de DEĞİŞTİ ve ölçüldü: yazma
 * gövdesi paket dalını artık kabul ediyor (ekleme çalışıyor, adet birleşiyor) ama satırın ADRESİ
 * yok — `PATCH`/`DELETE` yolu varyant + parti ile adresliyor ve paket kimliğiyle atılan `DELETE`
 * satırı bulamıyor (canlı ölçüm: sepet aynen döndü). Basılınca hiçbir şey yapmayan bir sayaç,
 * müşteriye arızalı bir uygulama gösterirdi.
 *
 * Satır GİZLENMEZ — sepettedir ve müşteri neyi taşıdığını görmeli. BEKLEYEN(21.14):
 * `CartService.setQty`/`removeItem` satır anahtarına (`CartRef`) geçince bu süzgeç kalkar.
 */
function isReadOnly(line: MeCartViewLine): boolean {
  return line.kind === 'bundle';
}

export function CartScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();
  const view = cart.view;

  const [couponSheetOpen, setCouponSheetOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  const count = cartCount(cart);
  const isEmpty = count === 0;

  /* Cihazda niyet var ama görünüm henüz yok: sepet ÇÖZÜLEMEDİ. Tutar gösterilmez ve sipariş
     tamamlanamaz — boş bir görünümü "toplam 0,00 €" diye çizmek, ölçülemeyen değeri sıfır saymak
     olurdu (CLAUDE §1). */
  const unresolved = cart.products.length > 0 && view.lines.length === 0;

  /* AYNI PAKET İKİ KEZ ÇİZİLMEZ. Cihazdaki paket kaydı ile sunucunun görünüm satırı aynı satırın
     iki yüzüdür ve 21.21'den beri aynı kimliği taşıyorlar (paketin uuid'si). Çizilen YEREL kayıttır:
     sunucu paketi bugün çözemiyor (`CartBundlePort` mobil uçlarda geçilmiyor — adı boş, fiyatı
     `null` döner), yereldeki ise adını ve fiyatını taşıyor. Süzgeç olmasaydı müşteri aynı paketi
     biri adsız iki satır hâlinde görürdü. */
  const localBundleIds = new Set(cart.bundles.map((bundle) => bundle.id));
  const lines = view.lines.filter((line) => line.kind !== 'bundle' || !localBundleIds.has(line.bundleId));

  const shippingLines = lines.filter((line) => line.route === 'shipping');
  const routeLines = lines.filter((line) => line.route !== 'shipping');
  const placeKnown = lines.every((line) => line.route !== null);
  const split = !view.shippingOnly && placeKnown && shippingLines.length > 0 && routeLines.length > 0;

  const discount = view.discount;
  const checkoutBlocked = unresolved || view.hasBlocked || !view.minBasketOk;

  /** Kendiliğinden inen indirimin künyesi — kampanyanın İÇ adı değil, müşterinin okuduğu sebep. */
  const reasonLabel = (reason: DiscountReason): string => {
    if (reason.kind === 'customer_rate') return t.discount.customerRate.replace('{percent}', String(reason.percent));
    return reason.percent === null
      ? t.discount.campaign
      : t.discount.campaignPercent.replace('{percent}', String(reason.percent));
  };

  const discountRow = (): SummaryRow | null => {
    const row = (label: string | null, amountCents: number): SummaryRow => ({
      key: 'discount',
      label: label === null ? t.summary.discount : `${t.summary.discount} · ${label}`,
      // İndirim EKSİ yazılır: özetteki tek çıkarma satırı odur ve işaretsiz yazılırsa
      // toplamla aritmetiği tutmuyormuş gibi okunur.
      value: `−${formatPrice(amountCents, locale)}`,
      tone: 'olive',
    });

    if (discount.status === 'applied') return row(discount.label ?? discount.code, discount.amountCents);
    if (discount.status === 'automatic') return row(discount.label ?? reasonLabel(discount.reason), discount.amountCents);
    /* Kupon tutmasa da müşteri hak ettiği otomatik indirimi KAYBETMEZ — sözleşmenin `appliedInstead`
       kararı; özet satırı bir kupon denendi diye künyesini yitirmemeli. */
    if (discount.status === 'rejected' && discount.appliedInsteadCents > 0) {
      const instead = discount.appliedInstead;
      return row(instead === null ? null : (instead.label ?? reasonLabel(instead.reason)), discount.appliedInsteadCents);
    }
    return null;
  };

  const rejection = discount.status === 'rejected' ? discount : null;
  const rejectionText =
    rejection === null
      ? null
      : rejection.reason === 'outranked'
        ? t.coupon.rejected.outranked.replace('{amount}', formatPrice(rejection.appliedInsteadCents, locale))
        : t.coupon.rejected[rejection.reason];

  const discountSummary = discountRow();
  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(view.subtotalCents, locale) },
    ...(discountSummary === null ? [] : [discountSummary]),
  ];

  const submitCoupon = () => {
    /* Kod bir KİMLİKTİR, dilin harf kuralına tabi değil: `toLocaleUpperCase('tr')` "i"yi "İ" yapar
       ve sunucudaki kodu bulamaz hâle getirirdi. */
    const code = couponInput.trim().toUpperCase();
    if (code === '') {
      setCouponError(t.coupon.empty);
      return;
    }
    applyCoupon(code);
    setCouponInput('');
    setCouponError(null);
    setCouponSheetOpen(false);
  };

  const renderLine = (line: MeCartViewLine) => {
    const id = cartLineId(line);
    const bundle = line.kind === 'bundle';
    const priceLabel = line.unitPriceCents === null ? null : formatPrice(line.unitPriceCents, locale);
    const contents = line.contents.map((item) => `${item.name} ×${item.qty}`).join(' · ');

    const subtitle =
      bundle && contents !== ''
        ? contents
        : priceLabel === null
          ? line.unitLabel === ''
            ? t.line.noPrice
            : line.unitLabel
          : line.unitLabel === ''
            ? priceLabel
            : t.line.unit.replace('{variant}', line.unitLabel).replace('{price}', priceLabel);

    /* Fiyat ARTTIYSA önce o söylenir (DOMAIN §5: müşteriye açıkça söylenir); düzenlenemezlik ikinci
       derecede bir bilgidir ve ancak başka uyarı yokken yer alır. */
    const notice =
      line.priceChange !== undefined
        ? t.line.priceUp.replace('{price}', formatPrice(line.priceChange.previousCents, locale))
        : isReadOnly(line)
          ? t.line.readOnly
          : undefined;

    return (
      <CartLineRow
        key={id}
        name={line.name}
        subtitle={subtitle}
        totalLabel={line.lineTotalCents === null ? t.line.noPrice : formatPrice(line.lineTotalCents, locale)}
        quantity={line.qty}
        photoUri={line.image.url}
        tone={bundle ? 'bundle' : 'product'}
        eyebrow={bundle ? t.line.bundle : undefined}
        discountLabel={line.wasCents === undefined ? undefined : t.line.discounted}
        soldOutLabel={line.blocked ? (line.unitPriceCents === null ? t.line.closed : t.line.soldOut) : undefined}
        noticeLabel={notice}
        readOnly={isReadOnly(line)}
        removeLabel={t.line.remove}
        removeAccessibilityLabel={t.line.removeLabel.replace('{name}', line.name)}
        decreaseLabel={t.line.decrease.replace('{name}', line.name)}
        increaseLabel={t.line.increase.replace('{name}', line.name)}
        onDecrease={() => setProductQuantity(id, line.qty - 1)}
        onIncrease={() => setProductQuantity(id, line.qty + 1)}
        onRemove={() => removeProduct(id)}
        testID={`cart-line-${id}`}
      />
    );
  };

  /* Ücretsiz kargo eşiği YALNIZ kargo grubu varken anlamlıdır: kapıya teslimde kargo ücreti diye
     bir şey yok ve eşiği orada göstermek olmayan bir hedefi varmış gibi okuturdu. Eşik 0 =
     "tanımsız" (sözleşmenin hükmü) — blok hiç çizilmez. */
  const freeShippingRemaining = view.freeShippingCents - view.shippingSubtotalCents;
  const freeShippingNote =
    view.freeShippingCents === 0 || shippingLines.length === 0 ? null : freeShippingRemaining > 0 ? (
      <Note
        tone="warm"
        description={t.freeShipping.remaining.replace('{amount}', formatPrice(freeShippingRemaining, locale))}
        testID="cart-free-shipping"
      />
    ) : (
      <Note tone="olive" description={t.freeShipping.reached} testID="cart-free-shipping" />
    );

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
          {/* Cihazda duran hazır paket satırları — depo onları henüz sunucuya bağlamıyor (iki ölçülmüş
              engel: satır çözülemiyor, satır silinemiyor — `cart-store` künyesi). */}
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

          {split ? (
            <>
              <SectionHeader eyebrow={t.group.route} testID="cart-group-route" />
              {routeLines.map(renderLine)}
              <SectionHeader eyebrow={t.group.shipping} testID="cart-group-shipping" />
              {shippingLines.map(renderLine)}
            </>
          ) : (
            lines.map(renderLine)
          )}
        </View>

        {unresolved ? (
          cart.resolving ? (
            <LoadingState accessibilityLabel={t.unresolved.loading} label={t.unresolved.loading} testID="cart-loading" />
          ) : (
            <Note tone="terracotta" description={t.unresolved.failed} testID="cart-unresolved" />
          )
        ) : null}

        {freeShippingNote}

        {/* Bölünme SEPETİN kendi hâlidir, bir seçim değil: müşteri kalem taşımaz, yol seçmez. */}
        {split ? <Note tone="warm" description={t.group.split} testID="cart-split" /> : null}

        {discount.status === 'applied' ? (
          <View style={styles.couponApplied} testID="cart-coupon-applied">
            <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            <Text style={styles.couponAppliedLabel}>{t.coupon.applied.replace('{code}', discount.code)}</Text>
            <TextAction
              label={t.coupon.remove}
              onPress={removeCoupon}
              accessibilityHint={t.coupon.removeLabel}
              testID="cart-coupon-remove"
            />
          </View>
        ) : (
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
        )}

        {rejectionText === null ? null : (
          <Note tone="terracotta" description={rejectionText} testID="cart-coupon-rejected" />
        )}

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(view.totalCents, locale)}
          note={t.summary.note}
          testID="cart-summary"
        />

        {/* Sunucu reddi: iyimser yazım geri alındı, yani ekrandaki sepet SUNUCUDAKİ sepettir.
            GELİŞTİRMEDE RET ANAHTARI DA YAZILIR: müşteriye tek cümle yeter ama biz o cümleyle
            arızayı teşhis edemiyorduk — "eşitlenemedi" `unauthorized`ı da `invalid_response`u da
            aynı görünüşe indiriyor ve hangisi olduğu ancak cihazda tekrar üretilerek anlaşılıyor
            (09.08). Anahtar depoda zaten duruyordu, ekran onu atıyordu. */}
        {cart.error === null ? null : (
          <Note
            tone="terracotta"
            description={__DEV__ ? `${t.sync.failed} [${cart.error}]` : t.sync.failed}
            testID="cart-sync-error"
          />
        )}

        {view.hasBlocked ? <Note tone="error" description={t.blocked} testID="cart-blocked" /> : null}

        {view.minBasketOk || unresolved ? null : (
          <Note
            tone="terracotta"
            description={t.minimum
              .replace('{minimum}', formatPrice(view.minBasketCents, locale))
              .replace('{missing}', formatPrice(view.missingForMinBasketCents, locale))}
            testID="cart-minimum"
          />
        )}

        <View style={styles.continueRow}>
          <TextAction label={t.continue} onPress={() => router.push('/catalog')} testID="cart-continue" />
        </View>
      </ScrollView>

      {/* Yapışkan bar kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kendi kalıbı). */}
      <View style={styles.stickyBar}>
        <PressableSurface
          onPress={() => router.push('/checkout')}
          feedback="shadow"
          disabled={checkoutBlocked}
          style={[styles.checkoutButton, checkoutBlocked ? styles.checkoutDisabled : styles.checkoutEnabled]}
          accessibilityLabel={t.checkout}
          testID="cart-checkout"
        >
          <Text style={styles.checkoutLabel}>{t.checkout}</Text>
          <View style={styles.checkoutTotal}>
            <Text style={styles.checkoutLabel}>{formatPrice(view.totalCents, locale)}</Text>
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
