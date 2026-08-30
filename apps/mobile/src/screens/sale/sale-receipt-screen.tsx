import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { stampFullOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { saleCopy } from './copy';
import { useSaleContext } from './sale-context';

/*
  YERİNDE SATIŞ · FİŞ — `/sale/receipt` (Operasyon Mobil v3:22).

  ── NEDEN KENDİ EKRANI ──────────────────────────────────────────────────────
  Sonuç, sepet ekranında tek satırlık bir bildirimdi ve satış kapanınca sepet BOŞALIYORDU: cevabı
  okuyan göz, "sepet boş" ekranının üstünde asılı duran bir cümleye bakıyordu. Referans numarası ve
  tutar da o satıra sığmıyordu. Fiş artık o satışın kendi sayfası — ne yazıldığını, kaça, neyle ve
  ne zaman yazıldığını bir arada söylüyor.

  ── ZAMAN CİHAZIN, SUNUCUNUN DEĞİL ──────────────────────────────────────────
  `OnSiteSaleResponse` bir zaman damgası taşımıyor; damga cevabın geldiği anda yazılıyor
  (`use-sale.hook.ts` künyesi). Bu bir belge değil, "az önce ne oldu" sayfasıdır ve yazdırma zaten
  bu sürümde bağlı değil — sunucu damgası gerektiğinde sözleşmeye alan eklenir, ekran uydurmaz.

  ── KASA AYARSIZSA FİŞ SUSMAZ ───────────────────────────────────────────────
  Satış kapanmış ama para deftere geçmemiş olabilir (`paymentRecorded === false`). Yeşil bir "tamam"
  ekranının altında bu gerçeği saklamak, arızayı gözden kaçırmak olurdu; uyarı kartın içinde,
  tutarın hemen altında duruyor.
*/

const t = saleCopy;

export function SaleReceiptScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  const receipt = sale.receipt;

  const header = (
    <OperationsStackHeader
      title={t.receipt.title}
      onBack={() => router.back()}
      backLabel={t.back}
      testID="sale-receipt-header"
    />
  );

  /* FİŞSİZ AÇILIŞ bir arıza değil: derin bağlantıyla ya da uygulama yeniden başlatıldıktan sonra
     bu sayfa boş açılır. Uydurma bir fiş çizmek yerine ne olduğu söyleniyor. */
  if (receipt === null) {
    return (
      <View style={styles.screen} testID="sale-receipt-screen">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.receipt.empty.title}
            description={t.receipt.empty.body}
            testID="sale-receipt-empty"
          />
        </View>
      </View>
    );
  }

  const meta = fillCopy(receipt.referenceNo === null ? t.receipt.metaNoRef : t.receipt.meta, {
    method: t.payment[receipt.method],
    ref: receipt.referenceNo ?? '',
    stamp: stampFullOf(receipt.at),
  });

  return (
    <View style={styles.screen} testID="sale-receipt-screen">
      {header}

      <View style={styles.block}>
        <View style={styles.card} testID="sale-receipt-card">
          <View style={styles.mark}>
            <Icon name="check" size={operationsTheme.size.headerIcon} color={operationsTheme.colors['olive-dark']} />
          </View>
          <Text style={styles.total} testID="sale-receipt-total">
            {money(receipt.totalCents)}
          </Text>
          <Text style={styles.meta} testID="sale-receipt-meta">
            {meta}
          </Text>

          {receipt.paymentRecorded ? null : (
            <Text style={styles.warn} testID="sale-receipt-payment-missing">
              {t.result.paymentMissing}
            </Text>
          )}

          <View style={styles.rule} />
          <Text style={styles.note}>{t.receipt.note}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <PressableSurface
          onPress={() => {
            sale.clearReceipt();
            router.replace('/sale');
          }}
          feedback="shadow"
          style={[styles.action, styles.actionPrimary]}
          accessibilityLabel={t.receipt.again}
          testID="sale-receipt-again"
        >
          <Text style={styles.actionPrimaryLabel}>{t.receipt.again}</Text>
        </PressableSurface>
        <PressableSurface
          onPress={() => {
            sale.clearReceipt();
            router.replace('/warehouse');
          }}
          feedback="scale"
          style={[styles.action, styles.actionOutline]}
          accessibilityLabel={t.receipt.leave}
          testID="sale-receipt-leave"
        >
          <Text style={styles.actionOutlineLabel}>{t.receipt.leave}</Text>
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  block: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.xl,
  },
  card: {
    alignItems: 'center',
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['6xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  // DAİRE, hap DEĞİL: yarıçap ölçüden türer (`/ 2` — kitin kendi deseni). `radius.pill` 46 dp'lik
  // bir kutuda kavisli kare bırakıyordu ve onay imi "düğme" gibi görünüyordu (cihazda görüldü).
  mark: {
    width: operationsTheme.size.avatarMd,
    height: operationsTheme.size.avatarMd,
    borderRadius: operationsTheme.size.avatarMd / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: operationsTheme.space.sm,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  total: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  meta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  warn: {
    marginTop: operationsTheme.space.md,
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.terracotta,
    textAlign: 'center',
  },
  rule: {
    alignSelf: 'stretch',
    height: operationsTheme.border.base,
    marginVertical: operationsTheme.space.xl,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  // İki çıkış ekranın DİBİNDE: fiş okunur, sonra karar verilir — sıra tersine dönerse düğmeler
  // fişi okumadan basılan bir refleks olur.
  actions: {
    marginTop: 'auto',
    gap: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
  },
  action: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  actionPrimaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  actionOutline: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
  },
  actionOutlineLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
});
