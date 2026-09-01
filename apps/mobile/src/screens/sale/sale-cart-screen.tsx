import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { CirclePhoto } from '@/components/ui/circle-photo';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { saleCopy } from './copy';
import { useWarehouseStatus } from '@/screens/warehouse/warehouse-status';
import { useSaleContext } from './sale-context';

/*
  SATIŞ SEPETİ — `/sale/cart` (kullanıcı kararı 26.08: liste ile sepet AYRI yüzeyler).

  Katalog "ne satıyorum" sorusudur, burası "parayı nasıl yazıyorum": kalemlerin son kontrolü,
  tahsilat türünün BİLİNÇLİ seçimi (varsayılan yok — hook künyesi) ve tek CTA. Sonuç bildirimi
  de burada yaşar: satışı yazan göz, cevabı aynı yerde okur. Durum katalogla ORTAK (`SaleProvider`).
*/

const t = saleCopy;

export function SaleCartScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  const receipt = sale.receipt;
  /* Kilit katalogla AYNI sinyalden (`sale-screen.tsx` künyesi): burada kapanan şey satışın
     kendisidir — kesin toplam ve stok hareketi sunucudan gelir, kapıda çevrimdışı satış yazılmaz. */
  const { offline } = useWarehouseStatus();

  /* SATIŞ YAZILINCA FİŞE GEÇİLİR (v3:22). `replace` çünkü sepet artık YOK: satış kapandığında
     kalemler sıfırlandı ve geriye basan personel boş bir sepete düşerdi. Geçiş bir etkiyle
     yapılıyor, `submit`in içinden değil — yazma kararı hook'un, yönlendirme ekranın işidir ve
     hook rota bilmez. */
  useEffect(() => {
    if (receipt !== null) router.replace('/sale/receipt');
  }, [receipt, router]);

  const cta = offline
    ? { label: t.offline.sellCta, enabled: false }
    : sale.sending
    ? { label: t.cta.sending, enabled: false }
    : sale.lines.length === 0
      ? { label: t.cta.idle, enabled: false }
      : sale.payment === null
        ? { label: t.cta.pickPayment, enabled: false }
        : { label: fillCopy(t.cta.ready, { total: money(sale.indicativeTotalCents) }), enabled: true };

  return (
    <View style={styles.screen} testID="sale-cart-screen">
      <OperationsStackHeader
        title={t.cartScreen.title}
        subtitle={t.cartScreen.subtitle}
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
                <CirclePhoto size={44} initial={line.name.slice(0, 1)} initialFontSize={18} photoUri={line.imageUrl} />
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
        {/* Satışın OLUMSUZ cevabı TOAST'ta (kullanıcı kararı 01.09): düğmenin üstündeki cümle
            bir sonraki eyleme kadar asılı kalıyordu. Üstteki çevrimdışı satırı ise bir sonuç
            değil, kapalı düğmenin SEBEBİ — o yerinde kalır. */}
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
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
