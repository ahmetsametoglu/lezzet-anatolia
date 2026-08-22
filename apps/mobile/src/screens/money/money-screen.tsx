import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { moneyCopy } from './copy';
import { ACCOUNT_BALANCES, COURIER_FLOAT, PENDING_COLLECTIONS, TODAY_BY_METHOD } from './money-fixture';

/*
  PARA KÖKÜ · TAHSİLAT İZLEME (v2:716-756) — bölümün kökü ve SALT OKUMA.

  ── HİÇBİR YAZMA AKSİYONU ÇİZİLMEZ ──────────────────────────────────────────
  Tasarımın altın kuralı ekranın son satırında yazılı: *"'bakiye düzeltme' diye bir kavram yok."*
  Para bu yüzeyde DÜZELTİLMEZ, yalnız izlenir; kayıt masaüstünde ve muhasebe kurallarıyla doğar.
  Bu yüzden ekranda tek bir düğme var ve o da gezinme: "Gün sonu →".

  ── ZİL YOK, METİN EYLEMİ VAR ───────────────────────────────────────────────
  Başlığın sağ yuvası bu bölümde bildirim düğmesi DEĞİL (v2:719) — karar `section-header.tsx`
  künyesinde ve kabuk testinde ölçülü. Yalnız muhasebe rolü taşıyan kullanıcı bildirim ekranına
  kabuktan ulaşamaz; bu bir eksik değil tasarımın hâli.

  ── BU EKRAN 21.9'un YER TUTUCUSUNUN YERİNİ ALDI ────────────────────────────
  `screens/operations/section-screen.tsx` dört bölümün başlığını çiziyordu ve son iki tüketicisi
  (Yönetim · Para) bu dilimde kendi gövdelerine kavuştu; ortak dosya SÖKÜLDÜ (ölü kod bırakılmaz).

  ── BOŞ HÂL VAR, HATA HÂLİ YOK ──────────────────────────────────────────────
  21.8'in açık bıraktığı "Para kökünün boş/hata durumu" burada kapanıyor — YARIM: bekleyen tahsilat
  listesi boş olabilir ve o cümle yazıldı. "Yüklenemedi" hâli ise okuma yapan bir kapı olmadan
  DOĞAMAZ; basıldığında hiçbir şey denemeyen bir "Tekrar dene" çizmek yerine, hata hâli uç
  bağlandığı gün gerçek düşüşle birlikte gelecek (aynı karar: yönetim kökü).
*/

const t = moneyCopy;
const shell = operationsCopy;

export function MoneyTrackingScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen} testID="operations-section-money">
      <OperationsSectionHeader
        section="money"
        eyebrow={shell.sections.money.eyebrow}
        title={shell.sections.money.title}
        right={
          <PressableSurface
            onPress={() => router.navigate('/day-end')}
            feedback="opacity"
            compact
            style={styles.dayEndAction}
            accessibilityLabel={t.track.dayEnd}
            testID="money-day-end-link"
          >
            <Text style={styles.dayEndLabel}>{t.track.dayEnd}</Text>
          </PressableSurface>
        }
        identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      />

      <ScrollView contentContainerStyle={styles.body} testID="money-tracking-body">
        <View style={styles.block}>
          <Text style={styles.eyebrow}>{t.track.pending.eyebrow}</Text>
          {PENDING_COLLECTIONS.length === 0 ? (
            <Text style={styles.emptyLine} testID="money-pending-empty">
              {t.track.pending.empty}
            </Text>
          ) : (
            PENDING_COLLECTIONS.map((item) => (
              <View key={item.id} style={styles.dashedRow} testID={`money-pending-${item.id}`}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.reference}</Text>
                  <Text style={styles.rowMeta}>{item.who}</Text>
                </View>
                <Text style={styles.pendingSentence}>{pendingSentence(item)}</Text>
              </View>
            ))
          )}
          <Text style={styles.note}>{t.track.pending.note}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.eyebrow}>{t.track.today.eyebrow}</Text>
          {TODAY_BY_METHOD.map((row) => (
            <View key={row.method} style={styles.dashedRow} testID={`money-today-${row.method}`}>
              <Text style={styles.rowLabel}>{t.track.today[row.method]}</Text>
              <Text style={styles.rowValue}>{money(row.cents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.floatCard} testID="money-courier-float">
          <Text style={styles.eyebrow}>{t.track.float.eyebrow}</Text>
          <Text style={styles.floatValue}>
            {fillCopy(t.track.float.value, {
              cash: money(COURIER_FLOAT.cashCents),
              card: money(COURIER_FLOAT.cardCents),
            })}
          </Text>
          <Text style={styles.note}>{t.track.float.note}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.eyebrow}>{t.track.balances.eyebrow}</Text>
          {ACCOUNT_BALANCES.map((balance, index) => (
            <View
              key={balance.account}
              /* Son satırın altında ayraç YOK (v2:750): blok orada bitiyor ve altındaki not
                 satırın devamı gibi okunmamalı. */
              style={index === ACCOUNT_BALANCES.length - 1 ? styles.plainRow : styles.dashedRow}
              testID={`money-balance-${balance.account}`}
            >
              <Text style={styles.rowLabel}>{t.track.balances[balance.account]}</Text>
              <Text style={styles.rowValue}>{money(balance.cents)}</Text>
            </View>
          ))}
          <Text style={styles.note}>{t.track.balances.note}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Bekleyen satırın SAĞ cümlesi (v2:733). Tutar yalnız tahsil EDİLECEKSE yazılır; vadeli satırda
 * rakam yoktur, çünkü o para bugün beklenmiyor — rakamı tekrarlamak "bugün tahsil edilecek" gibi
 * okunurdu.
 */
function pendingSentence(item: (typeof PENDING_COLLECTIONS)[number]): string {
  const method = item.method === undefined ? '' : t.common.method[item.method];
  if (item.kind === 'term') return fillCopy(t.track.pending.term, { due: item.dueLabel ?? '' });
  const amount = item.cents === undefined ? '' : money(item.cents);
  const template = item.kind === 'door' ? t.track.pending.door : t.track.pending.partial;
  return fillCopy(template, { amount, method });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  dayEndAction: {
    // v2:723 — metin eylemi başlığın ilk satırıyla hizalansın diye biraz aşağıda durur.
    paddingTop: operationsTheme.space.md,
  },
  dayEndLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  block: {
    gap: operationsTheme.space['2xs'],
  },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  dashedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  plainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.lg,
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Bekleyen para TERRACOTTA: henüz kasada değil — "geldi" ile karışmasın (v2:733). */
  pendingSentence: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.terracotta,
    textAlign: 'right',
  },
  rowLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  rowValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  emptyLine: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.lg,
  },
  floatCard: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  floatValue: {
    // v2: `800 20px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.xs,
  },
});
