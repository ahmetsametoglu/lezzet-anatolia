import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
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

  /* Partiyi D4'e taşıyan tek yol — hem satırdaki bağ hem alttaki düğme buradan geçiyor.
     İki ayrı çağrı yazsaydık biri bir gün ötekinden başka parametre gönderirdi. */
  const toStockCount = (batch: { stockId: string; code: string; name: string } | null) =>
    router.navigate({
      pathname: '/stock-count',
      // Parti D4'e TAŞINIR: ekranın kendi partisi yok ve olmayan bir konuyu uydurmak yerine
      // buradaki seçim geçiriliyor. İmhalık yoksa konu da yok — D4 bunu söyler.
      params: batch === null ? {} : { stockId: batch.stockId, code: batch.code, name: batch.name },
    });

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
            <View style={styles.rowHead}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{batch.name}</Text>
                <Text style={[styles.rowSub, styles[`urgency_${batch.urgency}`]]}>
                  {fillCopy(t.nearExpiry.row, { qty: String(batch.qty), days: batch.daysLabel })}
                </Text>
              </View>
              <Text style={[styles.decision, styles[`decision_${batch.decision}`]]}>
                {t.nearExpiry.decision[batch.decision]}
              </Text>
            </View>

            {/*
              ÖMÜR ÇUBUĞU (v3:840) — yüzdeyi hem çizerek hem yazarak söyler. Çubuk göz taramasıyla
              okunur, sayı kararı gerekçelendirir.

              ÖLÇÜLEMEYEN ÖMÜRDE ÇUBUK HİÇ ÇİZİLMEZ (CLAUDE §1): boş bir çubuk "%0" gibi görünür ve
              o partiyi imhalık gösterirdi. Onun yerine eşiğin neden uygulanmadığı yazılır.
            */}
            {batch.lifePercent === null ? (
              <Text style={styles.lifeUnknown} testID={`warehouse-near-expiry-${batch.code}-life-unknown`}>
                {t.nearExpiry.lifeUnknown}
              </Text>
            ) : (
              <View style={styles.lifeRow}>
                <OperationsProgressBar
                  value={batch.lifePercent / 100}
                  tone={LIFE_TONE[batch.urgency]}
                  testID={`warehouse-near-expiry-${batch.code}-life`}
                />
                <Text style={[styles.lifeLabel, { color: LIFE_TONE[batch.urgency] }]}>
                  {fillCopy(t.nearExpiry.life, { n: String(batch.lifePercent) })}
                </Text>
              </View>
            )}

            {/* İMHALIK SATIRIN KENDİ BAĞI (v3:849) — alttaki genel düğme "bir" partiyi taşır
                (`discardCandidate`); imhalık birden çoksa depocu hangisinin taşındığını bilemezdi.
                Satırdaki bağ o satırın partisini götürüyor. */}
            {batch.decision !== 'discard' ? null : (
              <TextAction
                label={t.nearExpiry.toBatchCount}
                onPress={() => toStockCount(batch)}
                testID={`warehouse-near-expiry-${batch.code}-to-count`}
              />
            )}
          </View>
        ))}

        <Text style={styles.footnote}>{t.nearExpiry.footnote}</Text>

        <PressableSurface
          onPress={() => toStockCount(candidate)}
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

/**
 * Ömür çubuğunun rengi — aciliyetten türer, karardan DEĞİL.
 *
 * İkisi ayrı şeydir: "karar" sistemin türettiği eylem (teklif · imha), "aciliyet" ise partinin
 * kaç günü kaldığıdır. Çubuk zamanı çiziyor, o yüzden zamanın rengini taşıyor; kararın rengi zaten
 * rozettedir ve ikisi aynı olsaydı satırda iki kez aynı şey söylenirdi.
 */
const LIFE_TONE = {
  expired: operationsTheme.colors.error,
  soon: operationsTheme.colors.terracotta,
  calm: operationsTheme.colors.olive,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
  },
  /* Satır artık iki katman: künye+karar üstte, ömür çubuğu altta (v3:836). Yön DİKEY oldu —
     çubuk künyenin yanına sıkışsaydı ne çubuk okunurdu ne ad. */
  row: {
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  lifeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  lifeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  /** Ömür ölçülemediğinde çubuk YOK — eşiğin neden uygulanmadığı yazılır (CLAUDE §1). */
  lifeUnknown: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
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
    color: operationsTheme.colors.ink,
  },
});
