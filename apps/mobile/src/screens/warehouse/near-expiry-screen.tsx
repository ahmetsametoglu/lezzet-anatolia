import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { discardCandidate, NEAR_EXPIRY_FIXTURE } from './near-expiry-fixture';

/*
  D3 · YAKIN-SKT TURU (v2:403-424) — bölümün TEK salt-okunur ekranı.

  ── EKRANDA HİÇBİR İŞARETLEME YOK, VE BU TASARIMIN KARARI ───────────────────
  v2 birebir: *"Karar sistemce türetilir — bu liste fiziksel ayıklama rehberidir; işaretleme yok."*
  Depocu burada bir şey seçmez, onaylamaz, indirim oranı girmez (o yönetimde onaylanır). Tek eylem
  tasarımın çizdiği geçiştir: *"'İmha edilmeli' → Sayım/Düzeltme"* ve o geçiş partiyi D4'e TAŞIR —
  D4'ün "hangi parti" sorusunun bugünkü tek cevabı bu.

  ── LİSTE FIXTURE, ÇÜNKÜ KAPISI YOK (06.13) ─────────────────────────────────
  Gerekçenin tamamı `near-expiry-fixture.ts` künyesinde, tek yerde: yakın-SKT okumasının adresi
  `apps/web/lib/stock/batch-view.ts` ve `server-only`; terfisi 06.13 görevidir. Ekranın kendisi TAM
  yazıldı — o gün yalnız veri kaynağı değişir.
*/

const t = warehouseCopy;

export function NearExpiryScreen() {
  const router = useRouter();
  const candidate = discardCandidate(NEAR_EXPIRY_FIXTURE);

  return (
    <View style={styles.screen} testID="warehouse-near-expiry">
      <OperationsStackHeader
        title={t.nearExpiry.title}
        subtitle={t.nearExpiry.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="warehouse-near-expiry-header"
      />

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-near-expiry-list">
        {NEAR_EXPIRY_FIXTURE.map((batch) => (
          <View key={batch.stockId} style={styles.row} testID={`warehouse-near-expiry-${batch.code}`}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{batch.name}</Text>
              <Text style={[styles.rowSub, styles[`urgency_${batch.urgency}`]]}>
                {fillCopy(t.nearExpiry.row, {
                  qty: String(batch.qty),
                  days: batch.daysLabel,
                  life: batch.lifeLabel,
                })}
              </Text>
            </View>
            <Text style={[styles.decision, styles[`decision_${batch.decision}`]]}>
              {t.nearExpiry.decision[batch.decision]}
            </Text>
          </View>
        ))}

        <Text style={styles.footnote}>{t.nearExpiry.footnote}</Text>

        <PressableSurface
          onPress={() =>
            router.navigate({
              pathname: '/stock-count',
              // Parti D4'e TAŞINIR: ekranın kendi partisi yok ve olmayan bir konuyu uydurmak yerine
              // buradaki seçim geçiriliyor. İmhalık yoksa konu da yok — D4 bunu söyler.
              params:
                candidate === null
                  ? {}
                  : { stockId: candidate.stockId, code: candidate.code, name: candidate.name },
            })
          }
          feedback="scale"
          style={styles.toAdjustment}
          accessibilityLabel={t.nearExpiry.toAdjustment}
          testID="warehouse-near-expiry-to-count"
        >
          <Text style={styles.toAdjustmentLabel}>{t.nearExpiry.toAdjustment}</Text>
        </PressableSurface>
      </ScrollView>
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
    paddingBottom: operationsTheme.space['8xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
  },
  urgency_expired: { color: operationsTheme.colors.error },
  urgency_soon: { color: operationsTheme.colors.terracotta },
  urgency_calm: { color: operationsTheme.colors.muted },
  decision: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  decision_offer_open: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  decision_offer_candidate: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  decision_discard: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  /** "Karar yok" nötr durur — bilinmeyen bir ömür, kötü bir haber değildir (CLAUDE §1). */
  decision_none: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.xl,
  },
  toAdjustment: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  toAdjustmentLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.ink,
  },
});
