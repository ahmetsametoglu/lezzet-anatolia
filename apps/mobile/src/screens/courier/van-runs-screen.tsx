import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRunDetail } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { useCourierDay } from './use-courier-day.hook';

/*
  K · ARAÇTAKİ SEFERLER (v3:15) — 31.08'de doğan ekran.

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Kullanıcının modeli: *"bir çeşit araba ara depo gibi oluyor ve içinde birden fazla sefere ait
  sipariş taşıyor. Ve kurye istediği bir seferi başlatabiliyor."* İki senaryo besliyor — dağ
  bölümünün ayrı rota olması (aynı gün, iki sefer) ve iki-üç günlük yolculuk (rotalar tek günlük).

  Bu ekran olmadan araçtaki yük GÖRÜNMÜYORDU: gün ekranı tek sefer varsayıyordu ve kurulmuş ama
  başlamamış bir sefer hiçbir yerde çizilmiyordu.

  ── EKRANIN TAŞIDIĞI TEK KARAR ──────────────────────────────────────────────
  "Hangisini şimdi süreceğim." Başlatma geri alınamaz bir eylemdir — durakları açar VE müşteriye
  haber gönderir — bu yüzden düğmenin altında ne yaptığı yazılı (v3:15). Yükleme ile başlatmanın
  ayrı olduğu da başlıkta duruyor: *"araç bir ara depodur"*.

  ── SEFERLER BİRBİRİNE BAĞLI DEĞİL ──────────────────────────────────────────
  Sıra, zincir ya da "devam" ilişkisi YOK (kullanıcı kararı 31.08) ve dipnot bunu söylüyor. Tek
  ortak yanları aynı araçta olmaları; hangisinin önce süründüğüne kurye karar veriyor.
*/

const t = courierCopy;

/** İlk yük iskeleti — künye satırı ve iki sefer kartı; ekranın gerçekten çizdiği bloklar. */
const VAN_SKELETON = { hint: 40, run: 108 } as const;

/** Seferin hâli üç sözcükte: sürülüyor · araçta bekliyor. Kapanmış sefer bu listede hiç yok. */
function stateOf(run: CourierRunDetail): { label: string; driving: boolean } {
  return run.departedAt === null
    ? { label: t.day.vanRuns.waiting, driving: false }
    : { label: t.day.vanRuns.driving, driving: true };
}

export function CourierVanRunsScreen() {
  const router = useRouter();
  const day = useCourierDay();

  /* Seferin yükü duraklardan TÜRER — ikinci bir uç istenmiyor (sefer künyesi ekranının aynı
     kuralı). Durak zaten `runId` taşıyor (31.08), yani gruplama tek geçişte kuruluyor. */
  const loadOf = (runId: string): { stops: number; boxes: number } => {
    const own = day.stops.filter((stop) => stop.runId === runId);
    return { stops: own.length, boxes: own.reduce((sum, stop) => sum + stop.boxes.length, 0) };
  };

  const header = (
    <OperationsStackHeader
      title={t.day.vanRuns.title}
      subtitle={fillCopy(t.day.vanRuns.context, {
        plate: day.run?.vehicleLabel ?? day.runs.find((run) => run.vehicleLabel !== null)?.vehicleLabel ?? '—',
      })}
      onBack={() => router.back()}
      backLabel={t.day.load.back}
      testID="courier-van-header"
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-van-runs">
        {header}
        <OperationsSkeletonList heights={[VAN_SKELETON.hint, VAN_SKELETON.run, VAN_SKELETON.run]} label={t.day.loading} />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="courier-van-runs">
      {header}

      <ScrollView contentContainerStyle={styles.list}>
        <OperationsSurface tone="quiet" style={styles.hint}>
          <Text style={styles.hintText}>{t.day.vanRuns.hint}</Text>
        </OperationsSurface>

        {day.runs.length === 0 ? (
          <>
            <OperationsNoticeBlock
              variant="empty"
              title={t.day.vanRuns.emptyTitle}
              description={t.day.vanRuns.emptyBody}
              testID="courier-van-empty"
            />
            <SecondaryButton label={t.day.vanRuns.pick} onPress={() => router.back()} testID="courier-van-pick" />
          </>
        ) : (
          <>
            <Text style={styles.heading}>{t.day.vanRuns.heading}</Text>

            {day.runs.map((run) => {
              const state = stateOf(run);
              const load = loadOf(run.runId);
              return (
                <View key={run.runId} style={styles.card} testID={`courier-van-run-${run.runId}`}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{run.zoneName ?? run.referenceNo}</Text>
                    <Text style={[styles.state, state.driving ? styles.stateDriving : styles.stateWaiting]}>
                      {state.label}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>{run.referenceNo}</Text>
                  <Text style={styles.cardMeta}>
                    {fillCopy(t.day.vanRuns.summary, { stops: String(load.stops), boxes: String(load.boxes) })}
                  </Text>

                  {/* SÜRÜLEN sefer başlatılmaz, duraklarına GİDİLİR — iki eylem aynı yerde durursa
                      kurye hangisinin ne yaptığını ayırt edemez. */}
                  {state.driving ? (
                    <SecondaryButton
                      label={t.day.vanRuns.toStops}
                      onPress={() => router.back()}
                      testID={`courier-van-stops-${run.runId}`}
                    />
                  ) : (
                    <>
                      <PrimaryButton
                        label={t.day.vanRuns.depart}
                        onPress={() => day.departRun(run.runId)}
                        disabled={day.starting}
                        tone="olive"
                        elevation="flat"
                        testID={`courier-van-depart-${run.runId}`}
                      />
                      {/* Başlatmanın BEDELİ düğmenin altında: geri alınamaz ve müşteriye gider. */}
                      <Text style={styles.departHint}>{t.day.vanRuns.departHint}</Text>
                    </>
                  )}
                </View>
              );
            })}

            <Text style={styles.note}>{t.day.vanRuns.note}</Text>
          </>
        )}

        {day.startNotice === null ? null : (
          <Text
            style={[styles.notice, day.startNotice.tone === 'error' ? styles.noticeError : styles.noticeOk]}
            testID="courier-van-notice"
          >
            {day.startNotice.text}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/* Stil sayfası TEMAYI DOĞRUDAN okuyor (`operationsTheme`), fabrika biçiminde değil: fabrika
   müşteri+operasyon temalarının BİRLEŞİMİNİ veriyor ve operasyona özgü tokenlar (`meta`, `cream`)
   o birleşimde yok — kurye ekranlarının hepsi bu deseni kullanıyor. */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['2xl'],
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.lg,
  },
  hint: { padding: operationsTheme.space.xl },
  hintText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  heading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  card: {
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  cardTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.ink,
  },
  cardMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  state: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
  },
  stateDriving: { color: operationsTheme.colors.olive },
  stateWaiting: { color: operationsTheme.colors.muted },
  departHint: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  note: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  notice: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  noticeOk: { color: operationsTheme.colors.muted },
  noticeError: { color: operationsTheme.colors.error },
});
