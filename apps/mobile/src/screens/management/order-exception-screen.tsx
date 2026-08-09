import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { ORDER_EXCEPTION } from './management-fixture';

/*
  Y2 · EKSİK TOPLAMA KARARI (v2:581-610) — kalemler · motor önerisi · para önizlemesi · karar.

  ── EKRAN HESAP YAPMAZ, MOTORA SORAR ────────────────────────────────────────
  "Eksik oran %14", "eşiğin altında", "iade edilecek 12,90 €" — üçü de MOTORUN cevabıdır ve ekranda
  yalnız YAZILIR (CLAUDE §1: domain-core saf karar, uygulama iş kuralını kendi içinde hesaplamaz).
  Eşiği burada yeniden hesaplamak, aynı kuralın ikinci bir kopyası olurdu ve ikisi bir gün ayrışır.
  Bugün değerler fixture'dan geliyor (UI-only); BAĞLANMA NOKTASI: `engine` bloğu motorun öneri
  cevabına, kararın kendisi de yazma ucuna bağlanır — ekranın gövdesi değişmez.

  ── İKİ KARAR, İKİ AYRI SONUÇ ───────────────────────────────────────────────
  Tasarım üç kutu çiziyor ama yalnız ikisi bir karar: "Kalanı gönder" ve "Müşteriye sor". Üçüncüsü
  ("Masada devam et") tasarımda EYLEMSİZ ve öyle bırakıldı — mobilde açacağı bir kapı yok.
  Karar verildikten sonra İKİSİ DE kapanır: aynı istisnaya iki kez karar verilmez.
  İptal sebebi v1'de seçilmez (tasarımın kendi notu) — o yüzden üçüncü bir yol da çizilmedi.
*/

const t = managementCopy;

/** Verilen kararın kimliği; `null` = henüz karar yok. */
type ExceptionDecision = 'send-rest' | 'ask-customer';

export function OrderExceptionScreen() {
  const router = useRouter();
  const exception = ORDER_EXCEPTION;
  const [decision, setDecision] = useState<ExceptionDecision | null>(null);
  const refund = money(exception.engine.refundCents);

  return (
    <View style={styles.screen} testID="management-order-exception">
      <OperationsStackHeader
        title={t.exception.title}
        subtitle={fillCopy(t.exception.caption, {
          reference: exception.reference,
          customer: exception.customer,
          status: exception.status,
        })}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-order-exception-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-order-exception-body">
        <View>
          {exception.lines.map((line) => (
            <View key={line.id} style={styles.line} testID={`management-exception-line-${line.id}`}>
              <Text style={line.pickedQty === undefined ? styles.lineLabel : styles.lineLabelShort}>
                {line.pickedQty === undefined
                  ? line.label
                  : fillCopy(t.exception.shortLine, { line: line.label, picked: String(line.pickedQty) })}
              </Text>
              <Text style={styles.lineAmount}>{money(line.cents)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t.exception.total}</Text>
            <Text style={styles.totalAmount}>{money(exception.totalCents)}</Text>
          </View>
        </View>

        <View style={styles.engine} testID="management-exception-engine">
          <Text style={styles.engineEyebrow}>{t.exception.engine.eyebrow}</Text>
          <Text style={styles.engineDecision}>{exception.engine.decision}</Text>
          <Text style={styles.engineReason}>{exception.engine.reason}</Text>
          <Text style={styles.enginePreview}>{fillCopy(t.exception.engine.preview, { refund })}</Text>
        </View>

        <Text style={styles.footnote}>{t.exception.footnote}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <PressableSurface
          onPress={() => setDecision('send-rest')}
          disabled={decision !== null}
          feedback="shadow"
          style={[styles.cta, decision === null ? styles.ctaOpen : styles.ctaDone]}
          accessibilityLabel={
            decision === 'send-rest' ? t.exception.sendRestDone : fillCopy(t.exception.sendRest, { refund })
          }
          testID="management-exception-send-rest"
        >
          <Text style={styles.ctaLabel}>
            {decision === 'send-rest' ? t.exception.sendRestDone : fillCopy(t.exception.sendRest, { refund })}
          </Text>
        </PressableSurface>

        <View style={styles.footerRow}>
          <PressableSurface
            onPress={() => setDecision('ask-customer')}
            disabled={decision !== null}
            feedback="scale"
            style={[styles.secondary, decision === null ? undefined : styles.secondaryClosed]}
            accessibilityLabel={decision === 'ask-customer' ? t.exception.askCustomerDone : t.exception.askCustomer}
            testID="management-exception-ask-customer"
          >
            <Text style={styles.secondaryLabel}>
              {decision === 'ask-customer' ? t.exception.askCustomerDone : t.exception.askCustomer}
            </Text>
          </PressableSurface>
          {/* Tasarımda eylemsiz (v2:607) — uzun iş masaüstünde sürer; hatırlatma, kapı değil. */}
          <Text style={[styles.secondary, styles.deskNote]}>{t.common.desk}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xl'],
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  lineLabel: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  /** Eksik toplanan kalem KIRMIZI okunur: kararın sebebi o satırdır (v2:592). */
  lineLabelShort: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.error,
  },
  lineAmount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: operationsTheme.space.lg,
  },
  totalLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  totalAmount: {
    // v2: `800 15px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  engine: {
    gap: operationsTheme.space.xs,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  engineEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  engineDecision: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    lineHeight: operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  engineReason: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** Paranın önizlemesi TERRACOTTA: kararın bedeli, kararın kendisinden ayrı okunmalı. */
  enginePreview: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.terracotta,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaOpen: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  ctaDone: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  secondary: {
    flex: 1,
    paddingVertical: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  secondaryClosed: {
    borderColor: operationsTheme.colors['sand-300'],
  },
  secondaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
    textAlign: 'center',
  },
  deskNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
});
