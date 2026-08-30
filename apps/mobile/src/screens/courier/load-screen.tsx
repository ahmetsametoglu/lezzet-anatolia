import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { useCourierDay } from './use-courier-day.hook';

/*
  K · ARACA YÜKLEME (Operasyon Mobil v3:1401-1464) — kutuların araca bindiği ekran.

  ── NEDEN AYRI EKRAN (30.08) ────────────────────────────────────────────────
  Yükleme v2'de günün rotasında tek satırlık bir sayaçtı ("3/7 kutu araçta" + okut düğmesi).
  O satır "kaç kutu bindi"yi söylüyordu ama kuryenin rampada sorduğu asıl soruyu —
  **"HANGİ durağın kutusu eksik"** — cevaplamıyordu: yedi kutunun dördü bindiyse hangi üçünün
  kaldığını ancak araca bakarak anlıyordu.

  Ekran bu soruyu duraklara göre kırarak cevaplıyor. Veri ZATEN VARDI: `stop.boxes[].loadedAt`
  sözleşmede duruyor ve hiçbir yerde çizilmiyordu (ölçüldü 30.08) — depo tarafındaki `areaName`
  ile aynı hikâye.

  ── SAYAÇ LİSTEDEN TÜRER ────────────────────────────────────────────────────
  Toplam ve binen sayısı duraklardan sayılıyor, ikinci bir uçtan değil. Hook'un `boxCounter`ı da
  aynı kaynaktan geliyor; burada tekrar sayılmasının sebebi durak KIRILIMININ zaten gerekmesi —
  aynı diziyi iki kez gezmek, iki ayrı gerçek taşımaktan ucuzdur.

  ── EKSİK KUTUYLA YOLA ÇIKILABİLİR ──────────────────────────────────────────
  Şablonun kendi cümlesi: "Eksik kutuyla yola çıkabilirsin ama o durak 'kutu araçta değil' diye
  açılmaz." Ekran yolu KAPATMIYOR, bedelini söylüyor — kurye rampada beklerken bir kutu bulunamaz
  ve gün durmaz.
*/

const t = courierCopy;

/** Durağın yükleme durumu — binen/toplam ve üç hâlden biri. */
function loadStateOf(stop: CourierStopContract): { loaded: number; total: number; tone: string; label: string } {
  const loaded = stop.boxes.filter((box) => box.loadedAt !== null).length;
  const total = stop.boxes.length;

  if (total > 0 && loaded === total) {
    return { loaded, total, tone: operationsTheme.colors.olive, label: t.day.load.stopReady };
  }
  if (loaded > 0) {
    return { loaded, total, tone: operationsTheme.colors.terracotta, label: t.day.load.stopPartial };
  }
  return { loaded, total, tone: operationsTheme.colors.muted, label: t.day.load.stopNone };
}

export function CourierLoadScreen() {
  const router = useRouter();
  const day = useCourierDay();

  const header = (
    <OperationsStackHeader
      title={t.day.load.title}
      subtitle={t.day.load.context}
      onBack={() => router.back()}
      backLabel={t.day.load.back}
      testID="courier-load-header"
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-load">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.day.loading} label={t.day.loading} testID="courier-load-loading" />
        </View>
      </View>
    );
  }

  /* KUTULU DURAK YOKSA EKRANIN KONUSU DA YOK: kutusuz akışta (eski yol) yükleme diye bir adım
     yoktur ve boş bir sayaç göstermek olmayan bir işi varmış gibi gösterirdi. */
  const boxedStops = day.stops.filter((stop) => stop.boxes.length > 0);
  const total = boxedStops.reduce((sum, stop) => sum + stop.boxes.length, 0);
  const loaded = boxedStops.reduce((sum, stop) => sum + stop.boxes.filter((box) => box.loadedAt !== null).length, 0);
  const remaining = total - loaded;

  /*
    KUTUSUZ SEFERDE EKRANIN KONUSU YOK (ölçüldü 30.08, cihazda) — ve bu bir HÂL, bir başarı değil.
    İlk yazımda `remaining === 0` koşulu sıfır kutuluk seferde de doğruydu ve ekran "Tüm kutular
    araçta — yola çıkabilirsin" diyordu: hiç kutu yokken "hepsi bindi" demek, boş kümeyi
    tamamlanmış saymaktır. Kurye o cümleyi okuyup "yükleme bitti" sanırdı; oysa yükleme diye bir
    adım hiç yoktu.

    Günün rotası bu ekranın kapısını zaten çizmiyor (kutusuz akışta `boxCounter` null), yani buraya
    ancak derin bağlantıyla gelinir — ama gelinen hâl de doğruyu söylemeli.
  */
  if (total === 0) {
    return (
      <View style={styles.screen} testID="courier-load">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.day.load.noBoxes.title}
            description={t.day.load.noBoxes.body}
            testID="courier-load-no-boxes"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="courier-load">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="courier-load-list">
        <View style={styles.counterCard} testID="courier-load-counter">
          <View style={styles.counterHead}>
            <Text style={styles.counterValue}>
              {fillCopy(t.day.load.counter, { loaded: String(loaded), total: String(total) })}
            </Text>
            <Text style={styles.counterLabel}>{t.day.load.counterLabel}</Text>
          </View>
          <OperationsProgressBar value={total === 0 ? 0 : loaded / total} testID="courier-load-progress" />
          <Text style={remaining === 0 ? styles.counterDone : styles.counterRemaining}>
            {remaining === 0 ? t.day.load.complete : fillCopy(t.day.load.remaining, { n: String(remaining) })}
          </Text>
        </View>

        {remaining === 0 ? null : (
          <PressableSurface
            onPress={() => day.setBoxScanOpen(true)}
            feedback="scale"
            style={styles.scanButton}
            accessibilityLabel={t.day.boxes.scanCta}
            testID="courier-load-scan"
          >
            <Text style={styles.scanLabel}>{t.day.boxes.scanCta}</Text>
          </PressableSurface>
        )}

        <Text style={styles.stopsHeading}>{t.day.load.stopsHeading}</Text>

        {boxedStops.map((stop, index) => {
          const state = loadStateOf(stop);
          return (
            <View key={stop.orderId} style={styles.stopRow} testID={`courier-load-stop-${stop.orderId}`}>
              <View style={styles.stopBody}>
                <Text style={styles.stopTitle} numberOfLines={1}>
                  {`${index + 1} · ${stop.customerName}`}
                </Text>
                <Text style={styles.stopMeta} numberOfLines={1}>
                  {`${stop.referenceNo ?? ''} · ${fillCopy(t.day.load.stopCounter, {
                    loaded: String(state.loaded),
                    total: String(state.total),
                  })}`.replace(/^ · /, '')}
                </Text>
              </View>
              <Text style={[styles.stopState, { color: state.tone }]}>{state.label}</Text>
            </View>
          );
        })}

        <Text style={styles.footnote}>{t.day.load.footnote}</Text>
      </ScrollView>

      <ScanSheet
        open={day.boxScanOpen}
        title={t.day.boxes.scanTitle}
        hint={t.day.boxes.scanHint}
        onClose={() => day.setBoxScanOpen(false)}
        onScan={day.handleLoadScan}
        /* Simülasyon çipleri BU seferin kutularıdır: başka bir kod okutulsa kapı reddeder ve çip
           "tanınmayan" gibi görünürdü (depo kuyruğunun aynı kararı). */
        devCodes={boxedStops.flatMap((stop) =>
          stop.boxes.filter((box) => box.loadedAt === null).map((box) => ({ label: `Kutu ${box.boxNo}`, code: box.code })),
        )}
        testID="courier-load-scan-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },
  counterCard: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  counterHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  counterValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  counterLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  counterRemaining: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },
  counterDone: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  scanButton: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.olive,
  },
  scanLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  stopsHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  stopBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  stopTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  stopMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  stopState: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
