import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@/components/ui/back-button';
import { Chip } from '@/components/ui/chip';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { deviceLocale } from '@/lib/i18n/locale';
import { cartSubtotalCents, cartTotalCents, resetCart, useCart } from '@/screens/customer-kit/cart-store';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { checkoutData, type CheckoutData, type DeliveryMode, type PaymentMethod } from './checkout-fixture';
import messages from './messages.json';

/*
  SİPARİŞİ TAMAMLA (v3 `vCheckout`) — adres · teslimat yolu ve günü · ödeme yolu · özet · onay.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Sipariş oluşturma ucu YOK. Ekran sepet deposunu okuyor (gerçek tutarlar), seçimleri kendi
  durumunda tutuyor ve onayda sepeti boşaltıp onay ekranına geçiyor. ONLINE ödeme yolunda araya
  giren ÖDEME EKRANI (v3 `vPayment`, Stripe yüzeyi) bu turda ÇİZİLMEDİ ve raporlandı: sağlayıcı
  yüzeyi olduğu için tasarımdan birebir geçirilmesi tek başına anlamlı değil, ödeme SDK'sıyla
  birlikte yazılmalı. Bugün üç ödeme yolu da doğrudan onaya gider.

  ── ENGELLER KURAL OLARAK TEK YERDE (`blockReason`) ─────────────────────────
  Şablonun `confirmBlock`u ile aynı sıra: doğrulama → kargo engeli → gün → ödeme. Sebep düğmenin
  ÜSTÜNDE yazılı ve düğme engelli: şablon sebebi ancak basınca (toast ile) söylüyordu; kuralı
  basmadan önce göstermek, kullanıcıyı denemeye zorlamaktan iyi.

  ── SEÇİMLER BİRBİRİNİ BOZMAZ ───────────────────────────────────────────────
  Bölge dışı adres seçilince kapıya teslim düşer (ve seçiliyse kargoya geçer); kargoya geçilince
  kapıda ödeme düşer. Bu iki kural şablonun kendi kuralları ve burada TEK yerde duruyor —
  seçeneklerin içine dağıtılsa biri bir gün ötekini unuturdu.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Puan kazancı: her tam euro 1 puan (şablonun `Math.round(total)` kuralı, cent'e uyarlanmış). */
const POINTS_PER_EURO = 1;

interface CheckoutScreenProps {
  data?: CheckoutData;
}

export function CheckoutScreen({ data = checkoutData() }: CheckoutScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const cart = useCart();

  const defaultAddress = data.addresses.find((address) => address.isDefault) ?? data.addresses[0];
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [mode, setMode] = useState<DeliveryMode | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [marketing, setMarketing] = useState(false);

  const address = data.addresses.find((candidate) => candidate.id === addressId) ?? null;
  const inZone = address?.inDeliveryZone ?? false;
  const blockedNames = data.shippingBlockedNames;

  const goodsCents = cartTotalCents(cart);
  const subtotalCents = cartSubtotalCents(cart);
  const freeShipping = goodsCents >= data.freeShippingThresholdCents;
  const shippingCents = mode === 'shipping' && !freeShipping ? data.shippingFeeCents : 0;
  const grandTotalCents = goodsCents + shippingCents;

  /** Adres değişince teslimat yolu ve ödeme yolu bu adreste geçersizse düşer. */
  const selectAddress = (id: string) => {
    setAddressId(id);
    const picked = data.addresses.find((candidate) => candidate.id === id);
    if (picked !== undefined && !picked.inDeliveryZone) {
      setMode('shipping');
      setDay(null);
      if (payment === 'on_delivery') setPayment(null);
    }
  };

  const selectMode = (next: DeliveryMode) => {
    setMode(next);
    if (next === 'shipping') {
      setDay(null);
      if (payment === 'on_delivery') setPayment(null);
    }
  };

  /** Onayı engelleyen İLK sebep; yoksa `null`. Sıra şablonun sırası. */
  const blockReason = (): string | null => {
    if (!data.signedIn) return t.block.login;
    if (mode === 'shipping' && blockedNames.length > 0) return t.block.shipping;
    if (mode === 'door' && day === null) return t.block.day;
    if (mode === null) return t.block.day;
    if (payment === null) return t.block.payment;
    return null;
  };
  const blocked = blockReason();

  const confirm = () => {
    if (blocked !== null) return;
    const points = Math.round((grandTotalCents / 100) * POINTS_PER_EURO);
    // Sepet boşalır ve onay ekranına geçilir — geri tuşuyla checkout'a dönülmesin diye `replace`.
    resetCart();
    router.replace({
      pathname: '/checkout/confirmed',
      params: {
        total: String(grandTotalCents),
        delivery: mode === 'door' ? (day ?? '') : t.delivery.shipping,
        payment: payment === null ? '' : t.payment[paymentKey(payment)],
        points: String(points),
      },
    });
  };

  const summaryRows: SummaryRow[] = [
    ...cart.bundles.map((bundle) => ({
      key: `bundle-${bundle.id}`,
      label: t.summary.line.replace('{quantity}', String(bundle.quantity)).replace('{name}', bundle.name),
      value: formatPrice(bundle.unitCents * bundle.quantity, locale),
    })),
    ...cart.products.map((product) => ({
      key: `product-${product.id}`,
      label: t.summary.line.replace('{quantity}', String(product.quantity)).replace('{name}', product.name),
      value: formatPrice(product.unitCents * product.quantity, locale),
    })),
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(subtotalCents, locale) },
    ...(cart.coupon === null
      ? []
      : [
          {
            key: 'discount',
            label: t.summary.discount,
            value: `−${formatPrice(cart.coupon.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
    {
      key: 'delivery',
      label: t.summary.delivery,
      value: mode === null || shippingCents === 0 ? t.summary.free : formatPrice(shippingCents, locale),
    },
  ];

  const thumbs = [...cart.bundles, ...cart.products].slice(0, 4);

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="checkout-back" />}
        testID="checkout-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="checkout-scroll">
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero}
          </Text>
          <View style={styles.thumbs}>
            {thumbs.map((line) => (
              <AvatarThumb key={line.id} initial={line.name.slice(0, 1)} accessibilityLabel={line.name} size="sm" stacked />
            ))}
          </View>
        </View>

        {data.signedIn ? (
          <View style={styles.signedIn} testID="checkout-signed-in">
            <Text style={styles.signedInLabel}>{t.signedIn.replace('{name}', data.customerName)}</Text>
          </View>
        ) : (
          <DashedInvite
            layout="stack"
            title={t.guest.title}
            description={t.guest.body}
            action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="checkout-login" />}
            testID="checkout-guest"
          />
        )}

        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t.address.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
          {data.addresses.map((candidate) => (
            <OptionRow
              key={candidate.id}
              label={candidate.label}
              description={candidate.line}
              selected={candidate.id === addressId}
              onPress={() => selectAddress(candidate.id)}
              trailing={candidate.isDefault ? <Text style={styles.defaultBadge}>{t.address.default}</Text> : undefined}
              testID={`checkout-address-${candidate.id}`}
            />
          ))}
          <TextAction
            label={t.address.add}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'delivery' } })}
            testID="checkout-address-add"
          />
        </View>

        {mode === 'shipping' && blockedNames.length > 0 ? (
          <Note
            tone="error"
            title={t.blocked.title}
            description={t.blocked.body.replace('{names}', blockedNames.join(', '))}
            testID="checkout-blocked"
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t.delivery.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
          <OptionRow
            label={t.delivery.door}
            description={inZone ? t.delivery.doorBody : t.delivery.doorUnavailable}
            selected={mode === 'door'}
            disabled={!inZone}
            onPress={() => selectMode('door')}
            testID="checkout-mode-door"
          />
          <OptionRow
            label={t.delivery.shipping}
            description={
              freeShipping
                ? t.delivery.shippingFree.replace('{threshold}', formatPrice(data.freeShippingThresholdCents, locale))
                : t.delivery.shippingBody.replace('{fee}', formatPrice(data.shippingFeeCents, locale))
            }
            selected={mode === 'shipping'}
            onPress={() => selectMode('shipping')}
            testID="checkout-mode-shipping"
          />
          {/* Gün seçimi YALNIZ kapıya teslimde: kargonun günü müşterinin kararı değil. */}
          {mode === 'door' ? (
            <View style={styles.dayRow}>
              {data.deliveryDays.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={day === option}
                  onPress={() => setDay(option)}
                  testID={`checkout-day-${option}`}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t.payment.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
          <OptionRow
            label={t.payment.online}
            description={t.payment.onlineBody}
            selected={payment === 'online'}
            onPress={() => setPayment('online')}
            testID="checkout-payment-online"
          />
          {/* Kapıda ödeme yalnız kapıya teslimde var — kargoya verilen bir siparişte kimse
              kapıda tahsil edemez (şablonun kendi kuralı). */}
          <OptionRow
            label={t.payment.onDelivery}
            description={t.payment.onDeliveryBody}
            selected={payment === 'on_delivery'}
            disabled={mode !== 'door'}
            onPress={() => setPayment('on_delivery')}
            testID="checkout-payment-on-delivery"
          />
          <OptionRow
            label={t.payment.transfer}
            description={t.payment.transferBody}
            selected={payment === 'transfer'}
            onPress={() => setPayment('transfer')}
            testID="checkout-payment-transfer"
          />
        </View>

        <SummaryPanel
          eyebrow={t.summary.eyebrow.toLocaleUpperCase('tr-TR')}
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(grandTotalCents, locale)}
          totalTone="terracotta"
          testID="checkout-summary"
        />

        <PressableSurface
          onPress={() => setMarketing(!marketing)}
          feedback="opacity"
          selected={marketing}
          style={styles.consentRow}
          accessibilityLabel={t.marketing}
          testID="checkout-marketing"
        >
          <View style={[styles.checkbox, marketing ? styles.checkboxOn : styles.checkboxOff]}>
            <Text style={styles.checkboxMark}>{marketing ? '✓' : ' '}</Text>
          </View>
          <Text style={styles.consentLabel}>{t.marketing}</Text>
        </PressableSurface>

        {blocked === null ? null : <Text style={styles.blockLine}>{blocked}</Text>}

        <PrimaryButton
          label={t.confirm.replace('{total}', formatPrice(grandTotalCents, locale))}
          onPress={confirm}
          disabled={blocked !== null}
          testID="checkout-confirm"
        />
      </ScrollView>
    </View>
  );
}

/** Ödeme yolunun metin anahtarı — sözlükteki adla enum'un adı ayrı (biri i18n, öteki veri). */
function paymentKey(method: PaymentMethod): 'online' | 'onDelivery' | 'transfer' {
  return method === 'online' ? 'online' : method === 'on_delivery' ? 'onDelivery' : 'transfer';
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  heroTitle: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    fontWeight: theme.text['page-title-sm--font-weight'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  thumbs: {
    flexDirection: 'row',
    paddingLeft: theme.space.lg,
  },
  signedIn: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  signedInLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.ink,
  },
  section: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  checkbox: {
    width: theme.size.markBox,
    height: theme.size.markBox,
    borderRadius: theme.radius.badge,
    borderWidth: theme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.olive,
  },
  checkboxOff: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors['sand-500'],
  },
  checkboxMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.card,
  },
  consentLabel: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  blockLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.terracotta,
  },
}));
