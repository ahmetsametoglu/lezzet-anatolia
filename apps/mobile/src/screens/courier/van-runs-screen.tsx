import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRunDetail } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { OperationsSurface } from '@/components/operations/surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
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

/**
 * Seferin GÜNÜ okunur hâlde — "bugün" · "yarın" · "2 Eylül".
 *
 * Tarih sunucudan geliyor (`deliveryDate`), "bugün"ün kendisi cihazdan: kurye rampada saat 23:50'de
 * bakıyorsa yarının seferi ona "yarın" demeli. İkisini de sunucuya sormak, cihazın saatiyle
 * sunucunun saatinin ayrıştığı bir gece yarısı üretirdi — ve o gece kurye yanlış seferi başlatırdı.
 */
function dayTag(date: string): string {
  const today = new Date();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date === iso(today)) return t.day.vanRuns.today;
  if (date === iso(tomorrow)) return t.day.vanRuns.tomorrow;
  return new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

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

  /* Aracın adı YOKSA cümle de kurulmaz (31.08 · ölçüldü): şablon "— · araç bir ara depodur" diye
     çiziyordu ve o tire hiçbir şey söylemiyordu. Araçsız sefer meşru; eksik olanı tire ile
     doldurmak, bilgiyi tamamlamak değil uydurmaktır (CLAUDE §1). */
  const plate = day.runs.find((run) => run.vehicleLabel !== null)?.vehicleLabel ?? null;

  const header = (
    <OperationsStackHeader
      title={t.day.vanRuns.title}
      subtitle={plate === null ? t.day.vanRuns.contextNoVehicle : fillCopy(t.day.vanRuns.context, { plate })}
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
        {/* ÜST BLOK KOYU (v3:16 `#2f353a`) — kitin `ink` tonu. Açık bir yüzeyle çizilmişti ve
            ekranın ağırlık merkezi kayboluyordu: bu blok "araçta ne var" özetini taşıyor ve
            tasarımda sayfanın tek koyu alanı. */}
        <OperationsSurface tone="ink" style={styles.hint}>
          <Text style={styles.hintCount}>
            {fillCopy(t.day.vanRuns.loadMeta, {
              loaded: String(day.boxCounter?.loaded ?? 0),
              total: String(day.boxCounter?.total ?? 0),
            })}
          </Text>
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
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{run.zoneName ?? run.referenceNo}</Text>
                      {/* GÜN ETİKETİ (v3:16) — araç iki-üç günün seferini taşıyor; hangisinin
                          bugün olduğu kartın kendisinde yazmalı. */}
                      <Text style={styles.cardMeta}>{`${dayTag(run.deliveryDate)} · ${run.referenceNo}`}</Text>
                      <Text style={styles.cardSummary}>
                        {fillCopy(t.day.vanRuns.summary, { stops: String(load.stops), boxes: String(load.boxes) })}
                      </Text>
                    </View>
                    {/* Durum ROZET (v3:16) — dolgulu ve sağ üstte; düz metin olarak çizilmişti ve
                        kartın kendi başlığıyla aynı ağırlıkta duruyordu. */}
                    <OperationsStatusBadge
                      label={state.label}
                      tone={state.driving ? 'active' : 'idle'}
                      testID={`courier-van-state-${run.runId}`}
                    />
                  </View>

                  {/* SÜRÜLEN sefer başlatılmaz, duraklarına GİDİLİR — iki eylem aynı yerde durursa
                      kurye hangisinin ne yaptığını ayırt edemez. */}
                  {state.driving ? (
                    <>
                      <SecondaryButton
                        label={t.day.vanRuns.toStops}
                        tone="olive"
                        onPress={() => router.back()}
                        testID={`courier-van-stops-${run.runId}`}
                      />
                      {/*
                        GEÇ YÜKLENEN KUTULARIN YOLU (ölçüldü 31.08 · cihazda). Sefer sürülürken
                        rampada kalan bir kutu okutulunca o durak `ready` kalıyor — yola çıkaran
                        tek kapı sefer başlatma ve o düğme sürülen seferde çizilmiyordu. Sonuç:
                        kurye kutuyu okutuyor, durak hâlâ açılmıyor ve yapacak bir şey kalmıyordu.

                        Eylem AYNI kapıya gidiyor (`departCourierRun` → catch-up claim) ve
                        tekrarı ZARARSIZ: yola çıkmış durak `alreadyOut` diye döner, ikinci kez
                        bildirim gitmez ("geçiş başına tek mail" kuralı durum kaydından türüyor).
                      */}
                      <TextAction
                        label={t.day.vanRuns.catchUp}
                        onPress={() => day.departRun(run.runId)}
                        disabled={day.starting}
                        testID={`courier-van-catchup-${run.runId}`}
                      />
                    </>
                  ) : (
                    /* BEDEL DÜĞMENİN İÇİNDE (v3:16) — dışına yazılmıştı ve düğmeden kopuk bir not
                       gibi duruyordu. Tasarımda iki satır TEK dokunma alanının içinde: basmanın ne
                       yaptığı, basılan şeyin üstünde yazılı. */
                    <PrimaryButton
                      label={t.day.vanRuns.depart}
                      hint={t.day.vanRuns.departHint}
                      onPress={() => day.departRun(run.runId)}
                      disabled={day.starting}
                      tone="olive"
                      testID={`courier-van-depart-${run.runId}`}
                    />
                  )}
                </View>
              );
            })}

            {/*
              YÜKLEME KAPISI BURADA (31.08 · cihazda ölçüldü) — ve gerekçesi bir arıza.

              Kapı önce yalnız "araçta yük var, sürülen sefer yok" gövdesindeydi. Cihazda görüldü:
              kurye ikinci seferi başlattığı anda o gövde kapanıyor ve ekran durak listesine
              dönüyor — ama yeni seferin dört kutusu HÂLÂ rampada. Yani başlatma, yüklemenin yolunu
              kapatıyordu. Araç bir ara depo olduğu için yükleme sefer boyunca sürebilir; kapının
              yeri de bu yüzden araçtaki seferlerin yanı.
            */}
            <SecondaryButton
              label={t.day.vanRuns.load}
              onPress={() => router.navigate('/load')}
              testID="courier-van-load"
            />
            <Text style={styles.loadMeta}>
              {fillCopy(t.day.vanRuns.loadMeta, {
                loaded: String(day.boxCounter?.loaded ?? 0),
                total: String(day.boxCounter?.total ?? 0),
              })}
            </Text>

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
  hint: { padding: operationsTheme.space.xl, gap: operationsTheme.space.sm },
  /** Araçtaki yükün SAYISI — koyu bloğun kahramanı (v3:16 `600 26px 'Lora'`). */
  hintCount: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h1--font-weight']],
    fontSize: operationsTheme.text.h2,
    color: operationsTheme.colors.cream,
  },
  cardText: { flex: 1, gap: 3, minWidth: 0 },
  cardSummary: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  hintText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    /* Koyu blok üstünde gövde rengi okunmaz — `on-ink-label` bu zeminin kendi metin tonu. */
    color: operationsTheme.colors['on-ink-label'],
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
  /* Rozet ÜST hizada (v3:16 `align-items:flex-start`) — ortalanınca kartın iki alt satırıyla
     birlikte kayıyor ve başlığın rozeti olmaktan çıkıyordu. */
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  loadMeta: {
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
