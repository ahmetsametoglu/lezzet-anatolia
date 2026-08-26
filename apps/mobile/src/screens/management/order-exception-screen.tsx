import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { ExceptionLine, OrderException } from '@lezzet/types';
import { managementCopy } from './copy';
import { useExceptions } from './use-exceptions.hook';

/*
  Y2 · EKSİK TOPLAMA KARARI (v2:581-610) — ARTIK GERÇEK UÇTAN (21.12).

  İstisna hazırlık kuyruğundan TÜRETİLİR (ayrı defter yok — motor künyesi): eksik toplanan ve
  henüz müşteriye sorulmamış kalemler. Para BU ekranda görünür (doc 04: D1'de değil Y2'de) —
  eksik tutar kalem satırında.

  ── "KALANI GÖNDER" DÜĞMESİ BİLİNÇLİ ÇİZİLMEDİ (tasarımdan sapma, 26.08) ────
  v2 iki düğme çiziyordu; "kalanı gönder"in yazacağı bir karar kaydı bugün modelde YOK — depo
  kısmi hazırlığı zaten sürdürür, fark teslim tarafında netleşir (07.8). Mekanizmasız düğme,
  basılınca hiçbir şeyi değiştirmeyen ölü bir düğme olurdu (kullanıcı talimatı 26.08: ölü buton
  olmayacak). Motorun önerisi ("kalanı gönder — eksik küçük" dahil) BİLGİ olarak satırda durur;
  karar kaydı modele girdiği gün düğme geri gelir (görev satırında kayıtlı).

  ── "MÜŞTERİYE SOR" GERÇEK ──────────────────────────────────────────────────
  Web hazırlık ekranındaki kapının aynısı (`shortfallQuestion` + `openTicket`): soru operasyon
  talep kuyruğuna düşer, müşteriye otomatik mesaj GİTMEZ; sorulan kalem bu kuyruktan kendiliğinden
  düşer (`awaitingAnswer`).
*/

const t = managementCopy;

export function OrderExceptionScreen() {
  const router = useRouter();
  const exceptions = useExceptions();
  const { state } = exceptions;

  return (
    <View style={styles.screen} testID="management-order-exception">
      <OperationsStackHeader
        title={t.exception.title}
        subtitle={t.exception.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-order-exception-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="management-exception-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.noticeBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: exceptions.retry }}
            testID="management-exception-error"
          />
        </View>
      ) : state.exceptions.length === 0 ? (
        <View style={styles.noticeBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.exception.empty.title}
            description={t.exception.empty.body}
            testID="management-exception-empty"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} testID="management-order-exception-body">
          {state.exceptions.map((exception) => (
            <ExceptionCard key={exception.orderId} exception={exception} exceptions={exceptions} />
          ))}
          <Text style={styles.footnote}>{t.exception.sendRestNote}</Text>
        </ScrollView>
      )}
    </View>
  );
}

interface ExceptionCardProps {
  exception: OrderException;
  exceptions: ReturnType<typeof useExceptions>;
}

function ExceptionCard({ exception, exceptions }: ExceptionCardProps) {
  const statusLabel =
    exception.status === 'confirmed' || exception.status === 'preparing'
      ? t.exception.status[exception.status]
      : exception.status;

  return (
    <View style={styles.card} testID={`management-exception-${exception.orderId}`}>
      <Text style={styles.cardTitle}>
        {fillCopy(t.exception.order, {
          reference: exception.referenceNo ?? t.exception.noRef,
          customer: exception.customerName,
          status: statusLabel,
        })}
      </Text>

      {exception.lines.map((line) => (
        <ExceptionRow key={line.orderItemId} line={line} exceptions={exceptions} />
      ))}
    </View>
  );
}

interface ExceptionRowProps {
  line: ExceptionLine;
  exceptions: ReturnType<typeof useExceptions>;
}

function ExceptionRow({ line, exceptions }: ExceptionRowProps) {
  const ask = exceptions.asks[line.orderItemId];
  const reason = t.exception.adviceReason[line.advice.reason as keyof typeof t.exception.adviceReason] ?? '';
  const adviceLabel = `${t.exception.advice[line.advice.action]}${reason ? ` (${reason})` : ''}`;

  return (
    <View style={styles.line} testID={`management-exception-line-${line.orderItemId}`}>
      <Text style={styles.lineTitle}>
        {fillCopy(t.exception.line, {
          title: line.title,
          ordered: String(line.orderedQty),
          picked: String(line.pickedQty),
        })}
      </Text>
      <Text style={styles.lineValue}>
        {fillCopy(t.exception.lineValue, { missing: String(line.missingQty), value: money(line.missingValueCents) })}
      </Text>
      <Text style={line.advice.action === 'ask_customer' ? styles.adviceAsk : styles.adviceSend}>{adviceLabel}</Text>

      {ask === undefined ? (
        <PressableSurface
          onPress={() => exceptions.ask(line.orderItemId)}
          feedback="shadow"
          style={[styles.askButton, styles.askOpen]}
          accessibilityLabel={t.exception.ask}
          testID={`management-exception-ask-${line.orderItemId}`}
        >
          <Text style={styles.askLabel}>{t.exception.ask}</Text>
        </PressableSurface>
      ) : (
        <Text style={styles.askOutcome} testID={`management-exception-asked-${line.orderItemId}`}>
          {ask.status === 'sending'
            ? t.exception.asking
            : ask.status === 'ok'
              ? t.exception.asked
              : ask.status === 'already_asked'
                ? t.exception.askedAlready
                : t.exception.askStale}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  pending: {
    paddingTop: operationsTheme.space['8xl'],
    alignItems: 'center',
  },
  noticeBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  card: {
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  cardTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  line: {
    gap: operationsTheme.space['2xs'],
    paddingTop: operationsTheme.space.lg,
    borderTopWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderTopColor: operationsTheme.colors['sand-300'],
  },
  /** Eksik kalem KIRMIZI okunur (v2:594) — istisnanın kendisi bu satırdır. */
  lineTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  lineValue: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Motorun "sor" önerisi terracotta, "gönder" önerisi zeytin — aciliyet renkten okunur. */
  adviceAsk: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },
  adviceSend: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  askButton: {
    marginTop: operationsTheme.space.md,
    height: operationsTheme.size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  askOpen: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  askLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.card,
  },
  /** Sorunun akıbeti satırda kalır — düğmenin yerini cümle alır, ikinci basış diye bir şey yok. */
  askOutcome: {
    marginTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
