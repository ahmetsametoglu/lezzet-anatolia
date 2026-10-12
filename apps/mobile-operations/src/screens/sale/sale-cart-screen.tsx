import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { saleCopy } from './copy';
import { subtotalBasisOf } from '@/screens/staff-order/staff-order-format';
import { useWarehouseStatus } from '@/screens/warehouse/warehouse-status';
import { useSaleContext } from './sale-context';
import { saleCreditOf } from './sale-credit';

/*
  Satış sepeti (`/sale/cart`): kalemlerin son kontrolü, tahsilat türünün bilinçli seçimi (varsayılan yok) ve tek CTA. Durum katalogla
  ortaktır (`SaleProvider`); sonucu bilinmeyen satış varken sepet kilitlidir, yalnız aynı satış tamamlanır ya da vazgeçilir.
*/

const t = saleCopy;

export function SaleCartScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  const receipt = sale.receipt;
  /* Kilit katalogla AYNI sinyalden (`sale-screen.tsx` künyesi): burada kapanan şey satışın
     kendisidir — kesin toplam ve stok hareketi sunucudan gelir, kapıda çevrimdışı satış yazılmaz. */
  const { offline } = useWarehouseStatus();
  const locked = sale.unresolved;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const credit = saleCreditOf(sale.customer, sale.indicativeTotalCents);

  /* Satış yazılınca fişe `replace` ile geçilir, çünkü sepet sıfırlandı ve geriye basan boş sepete düşerdi; yönlendirme ekranın işi
     olduğu için etkidedir, hook rota bilmez. */
  useEffect(() => {
    if (receipt !== null) router.replace('/sale/receipt');
  }, [receipt, router]);

  const cta = offline
    ? { label: t.offline.sellCta, enabled: false }
    : sale.sending
      ? { label: t.cta.sending, enabled: false }
      : sale.quoting
        ? { label: t.cta.quoting, enabled: false }
        : sale.lines.length === 0
          ? { label: t.cta.idle, enabled: false }
          : sale.payment === null
            ? { label: t.cta.pickPayment, enabled: false }
            : { label: fillCopy(t.cta.ready, { total: money(sale.indicativeTotalCents) }), enabled: true };

  return (
    <View style={styles.screen} testID="sale-cart-screen">
      <OperationsStackHeader
        title={t.cartScreen.title}
        subtitle={sale.customer?.name ?? t.cartScreen.subtitle}
        subtitleLines={1}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="sale-cart-header"
      />

      <FormScroll contentContainerStyle={styles.list} testID="sale-cart-body">
        {sale.lines.length === 0 ? (
          <>
            <OperationsNoticeBlock
              variant="empty"
              title={t.cartScreen.empty.title}
              description={t.cartScreen.empty.body}
              testID="sale-cart-empty"
            />
            <TextAction label={t.cartScreen.backToCatalog} onPress={() => router.back()} testID="sale-cart-back" />
          </>
        ) : (
          <>
            {sale.lines.map((line) => (
              <View key={line.variantId} style={styles.cartRow} testID={`sale-cart-${line.variantId}`}>
                <CirclePhoto size={44} initial={line.name.slice(0, 1)} initialFontSize={18} image={line.image} />
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
                  disabled={locked}
                  feedback="scale"
                  compact
                  style={[styles.cartRemove, locked && styles.cartRemoveLocked]}
                  accessibilityLabel={fillCopy(t.cart.remove, { name: line.name })}
                  testID={`sale-cart-remove-${line.variantId}`}
                >
                  <Text style={[styles.cartRemoveMark, locked && styles.cartRemoveMarkLocked]}>{t.cart.removeMark}</Text>
                </PressableSurface>
              </View>
            ))}
            <Text style={styles.cartTotal} testID="sale-cart-total">
              {fillCopy(t.cart.total, {
                total: money(sale.indicativeTotalCents),
                basis: subtotalBasisOf(sale.customer ?? { channel: 'b2c' }),
              })}
            </Text>
            <Text style={styles.hint}>{t.cart.totalNote}</Text>

            <View style={styles.section}>
              <Text style={styles.heading}>{t.payment.heading}</Text>
              {/* Kilitliyken seçim değiştirilemez; seçilmiş tür düz metindir, çalışmayan bir düğme gibi görünmesin. */}
              {locked ? (
                <Text style={styles.cartName} testID="sale-payment-locked">
                  {sale.payment === null ? '' : t.payment[sale.payment]}
                </Text>
              ) : (
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
                  {credit?.open ? (
                    <OperationsChoiceChip
                      label={t.payment.credit}
                      selected={sale.payment === 'credit'}
                      onPress={() => sale.setPayment('credit')}
                      testID="sale-payment-credit"
                    />
                  ) : null}
                </View>
              )}
              {/* Kart Revolut'un uygulamasında çekilir; kesin tutarı "tamamla"nın açtığı onay çekmecesi söyler. */}
              {sale.payment === 'card' ? (
                <Text style={styles.hint} testID="sale-card-note">
                  {t.payment.cardNote}
                </Text>
              ) : null}
              {/* Açık vadelinin sonucu seçilince, kapalı vadelinin sebebi müşteri seçiliyken yazar. */}
              {credit === null ? null : credit.open ? (
                sale.payment === 'credit' ? (
                  <Text style={styles.creditBox} testID="sale-credit-note">
                    {credit.text}
                  </Text>
                ) : null
              ) : (
                <Text style={styles.hint} testID="sale-credit-closed">
                  {credit.text}
                </Text>
              )}
            </View>
          </>
        )}
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {/* Kapalı düğmenin SEBEBİ düğmenin üstünde — depo yazma ekranlarının kararı (v3:20). */}
        {offline ? (
          <Text style={[styles.notice, styles.notice_warn]} testID="sale-offline-hint">
            {t.offline.sellHint}
          </Text>
        ) : null}
        {locked && !sale.sending ? (
          <Text style={[styles.notice, styles.notice_warn]} testID="sale-unresolved-hint">
            {t.unresolved.hint}
          </Text>
        ) : null}
        {/* Olumsuz cevap toast'tadır; buradaki satırlar sonuç değil, düğmenin hâlinin sebebidir ve yerinde kalır. */}
        <PressableSurface
          onPress={sale.requestSale}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="sale-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
        {locked && !sale.sending ? (
          <View style={styles.discardRow}>
            <TextAction
              label={t.unresolved.discard}
              onPress={() => setConfirmDiscard(true)}
              align="center"
              compactEdges="up"
              testID="sale-unresolved-discard"
            />
          </View>
        ) : null}
      </LinearGradient>

      {/* Nakit ve kart para alındıktan sonra yazılır, çünkü kasa fişi yazıldığı anda kapanır; çekmece kesin tutarı ve bedeli söyler. */}
      <OperationsConfirmSheet
        visible={sale.confirming !== null}
        title={fillCopy(sale.payment === 'card' ? t.confirm.cardTitle : t.confirm.cashTitle, {
          total: money(sale.confirming?.totalCents ?? 0),
        })}
        message={sale.payment === 'card' ? t.confirm.cardBody : t.confirm.cashBody}
        confirmLabel={sale.payment === 'card' ? t.confirm.cardConfirm : t.confirm.cashConfirm}
        cancelLabel={t.confirm.cancel}
        tone="olive"
        busy={sale.sending}
        busyLabel={t.cta.sending}
        onConfirm={sale.confirmSale}
        onCancel={sale.cancelConfirm}
        testID="sale-confirm-sheet"
      />

      <OperationsConfirmSheet
        visible={confirmDiscard}
        title={t.unresolved.discardTitle}
        message={t.unresolved.discardBody}
        confirmLabel={t.unresolved.discardConfirm}
        cancelLabel={t.unresolved.discardCancel}
        tone="error"
        onConfirm={() => {
          sale.discardPending();
          setConfirmDiscard(false);
        }}
        onCancel={() => setConfirmDiscard(false)}
        testID="sale-unresolved-discard-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.lg,
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
  creditBox: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['success-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['olive-dark'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
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
  // Kapalı hâl CTA'nın kapalı dolgusuyla aynı aileden: bekleyen satış varken kalem çıkarılamaz.
  cartRemoveLocked: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  cartRemoveMarkLocked: { color: operationsTheme.colors.muted },
  cartTotal: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
    paddingTop: operationsTheme.space.md,
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
  notice_warn: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
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
  discardRow: { alignItems: 'center', paddingTop: operationsTheme.space.lg },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
