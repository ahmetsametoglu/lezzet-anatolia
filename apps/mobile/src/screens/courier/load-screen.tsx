import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
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

/*
  İLK YÜK İSKELETİ — sayaç kartı (dolgu 14×2 + sayaç başı + çubuk 6 + kalan satırı), okut düğmesi
  (dolgu 12×2 + düğme metni) ve ilk durak satırı. Üçü, ekranın gerçekten çizdiği üç blok.
*/
const LOAD_SKELETON = { counter: 100, scan: 44, stop: 66 } as const;

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
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[LOAD_SKELETON.counter, LOAD_SKELETON.scan, LOAD_SKELETON.stop]}
            label={t.day.loading}
            testID="courier-load-loading"
          />
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
        {/*
          SAYAÇ KARTI KOYU (v3:1412 · 30.08 ikinci tur) — günün rotasındaki özet kartıyla AYNI
          aileden ve aynı sebeple: rampada kuryenin ilk bakışı buraya düşmeli. Krem çizilmişti ve
          o hâlde altındaki okut düğmesiyle, durak kartlarıyla eşit sesle konuşuyordu.

          "araçta" da rozete dönüyor: çıplak gri bir yazıyken sayının kuyruğu gibi okunuyordu,
          oysa o bir ETİKET — hangi sayının neyi saydığını söyler.
        */}
        <View style={styles.counterCard} testID="courier-load-counter">
          <View style={styles.counterHead}>
            {/* SAYI KAHRAMAN, BİRİMİ SESSİZ — aynı bölme günün rotasında da var (21.165). */}
            <Text style={styles.counterValue}>
              {String(loaded)}
              <Text style={styles.counterRest}>
                {fillCopy(t.day.load.counterRest, { total: String(total) })}
              </Text>
            </Text>
            <Text style={styles.counterBadge}>{t.day.load.counterLabel}</Text>
          </View>
          <OperationsProgressBar
            value={total === 0 ? 0 : loaded / total}
            /* İZ KOYU: açık iz bu kartın üstünde çubuğu dolu gösteriyordu (kit prop'u, 30.08). */
            onInk
            testID="courier-load-progress"
          />
          <Text style={remaining === 0 ? styles.counterDone : styles.counterRemaining}>
            {remaining === 0 ? t.day.load.complete : fillCopy(t.day.load.remaining, { n: String(remaining) })}
          </Text>
        </View>

        {/*
          OKUT DÜĞMESİ KİTTEN (30.08). İkon + etiket + zeytin dolgu + `flat` yükselti — üçü de
          `PrimaryButton`ın kendi işi; burada elden çiziliyordu. İkon emoji DEĞİL çizgi ikon:
          emoji cihazdan cihaza başka çiziliyor ve paletin dışında duruyor.

          IŞIMA VERİLEMİYOR ve sebebi kitte: tasarımın zeytin ışıması (`0 4px 14px`) bugün yalnız
          `OperationsStickyBar`ın `glow` prop'unda yaşıyor, bu düğme ise AKIŞTA. Ölçtüm — tasarımın
          dört ışımalı düğmesinin DÖRDÜ DE akışta, hiçbiri yapışkan çubukta değil; yani ışıma
          bugün ulaşılamaz bir yerde duruyor. Kite bildirildi (ortak defter), karar kit sahibinde.
        */}
        {remaining === 0 ? null : (
          <PrimaryButton
            label={t.day.boxes.scanCta}
            onPress={() => day.setBoxScanOpen(true)}
            tone="olive"
            elevation="flat"
            icon="scan"
            testID="courier-load-scan"
          />
        )}

        <Text style={styles.stopsHeading}>
          {day.runs.length > 1 ? t.day.load.stopsBySefer : t.day.load.stopsHeading}
        </Text>

        {boxedStops.map((stop, index) => {
          const state = loadStateOf(stop);
          /* SEFERE GÖRE GRUPLU (31.08 · v3:17 "SEFERE GÖRE KUTULAR") — araçta birden çok seferin
             kutusu olabiliyor ve kurye rampada "hangi seferin kutusu eksik" diye soruyor. Başlık
             yalnız birden çok sefer varken çizilir: tek seferde başlık, olmayan bir ayrımı
             duyurmak olurdu. */
          /* Grup başlığı SAYACINI da taşır (v3:18 `{{ yd.grupSayac }}`) — kurye rampada "hangi
             seferin kutusu eksik" diye soruyor ve cevabı başlığın kendisinde olmalı; her satırı
             tek tek saymak o soruyu ekrana bırakmaktı. */
          const group = boxedStops.filter((row) => row.runId === stop.runId);
          const groupLoaded = group.reduce(
            (sum, row) => sum + row.boxes.filter((box) => box.loadedAt !== null).length,
            0,
          );
          const groupTotal = group.reduce((sum, row) => sum + row.boxes.length, 0);
          const groupHead =
            day.runs.length > 1 && stop.runId !== boxedStops[index - 1]?.runId ? (
              <View style={styles.runGroupRow} testID={`courier-load-group-${stop.runId}`}>
                <Text style={styles.runGroupHeading}>{stop.runLabel ?? ''}</Text>
                <OperationsStatusBadge
                  label={fillCopy(t.day.load.stopCounter, { loaded: String(groupLoaded), total: String(groupTotal) })}
                  tone={groupLoaded === groupTotal ? 'active' : groupLoaded === 0 ? 'idle' : 'warn'}
                />
              </View>
            ) : null;
          return (
            /* DURAK KENDİ KARTINDA (v3:1440 · 30.08): kesikli ayraçla bölünmüş düz satırlardı ve
               liste "bir metin bloğu" gibi okunuyordu. Kart, her durağı kendi başına bir İŞ hâline
               getiriyor — kurye rampada gözüyle tek tek tarıyor. */
            <View key={stop.orderId}>
              {groupHead}
              <View style={styles.stopCard} testID={`courier-load-stop-${stop.orderId}`}>
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
            </View>
          );
        })}

      </ScrollView>

      {/*
        YAPIŞKAN DİP: "günün rotasına dön" + eksik kutu dipnotu (v3:1461).

        Dipnot kaydırma alanının içinde, listenin en sonundaydı — yani ancak sonuna kadar inen
        kurye görüyordu. Oysa cümle bir KARARIN bedelini anlatıyor ("eksik kutuyla çıkarsan o durak
        açılmaz") ve karar dipteki düğmeyle veriliyor; ikisi yan yana durmalı.

        Dipnot YALNIZ eksik varken çizilir: hepsi bindiğinde uyarının konusu yok ve her hâlde
        yazılan bir uyarı, okunmayan bir uyarıdır.
      */}
      <OperationsStickyBar>
        {/* KOYU: bu ekranın çıkışı bir İLERLEME değil DÖNÜŞ — zeytin olsaydı üstündeki
            "Kutuyu okut"la aynı sesle konuşurdu ve rampadaki kurye asıl işi çıkıştan ayıramazdı. */}
        <PrimaryButton
          label={t.day.load.back}
          onPress={() => router.back()}
          tone="ink"
          elevation="flat"
          testID="courier-load-back-cta"
        />
        {remaining === 0 ? null : <Text style={styles.footnote}>{t.day.load.footnote}</Text>}
      </OperationsStickyBar>

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
  /** Yer tutucu gerçek blokların başlayacağı yerde başlar — ortalanmaz; dolgu `list` ile aynı. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
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
  /* SAYAÇ KARTI KOYU (v3:1412) — çerçeve YOK: koyu yüzey kendi kenarıdır (kitin `ink` kuralı). */
  counterCard: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  counterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterValue: {
    /* v3: `600 30px Lora` — sayı SERİF, çünkü bu kartın kahramanı o. Gövde yazısıyla yazıldığında
       sağdaki rozetle aynı ailedendi ve göz hangisinin ölçü olduğunu ayırmıyordu. */
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2--font-weight']],
    fontSize: operationsTheme.text.h2,
    color: operationsTheme.colors.cream,
  },
  /** Sayının kuyruğu — "/7 kutu": aynı satırda, bir kademe küçük ve sessiz. */
  counterRest: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors['on-ink-label'],
  },
  /*
    "araçta" ROZET (v3:1414). Zemin `ink-inset` — tasarım `#3a4249` diyor, bizimki beyazın %14'ü
    ve koyu zeminde ondan bir tık açık çıkıyor. Kendi durağını açmadım: fark ölçülebilir ama
    ayırt edilebilir değil ve `ink-inset` "koyu kartın içindeki kabartma" anlamının TEK adı
    (günün rotasındaki "kapıda kaldı" şeridi de o).
  */
  counterBadge: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    // Tasarım `#e8dcc9`; en yakın durak `sand-250` (#ece3c8, Δ4/7/1 — eşiğin altında, kendi durağı yok).
    color: operationsTheme.colors['sand-250'],
    backgroundColor: operationsTheme.colors['ink-inset'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.xl,
    overflow: 'hidden',
  },
  /* KOYU ZEMİNİN İKİ CEVABI: uyarı sıcak (`on-ink-warn`), tamamlanma sakin yeşil-gri
     (`on-ink-label`). Açık zeminin `terracotta`/`olive-dark` çifti koyu kartta okunmuyordu. */
  counterRemaining: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  counterDone: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-label'],
  },
  /* Sefer grup başlığı — gün ekranındakiyle aynı kesit; iki ekran aynı ayracı aynı ağırlıkta
     çiziyor (kurye ikisi arasında gidip geliyor). */
  runGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space.xs,
  },
  runGroupHeading: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  stopsHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** Durak KARTI (v3:1440) — kesikli ayraçlı düz satırın yerine geçti. */
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
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
  /** Düğmenin DİPNOTU — ortalı, düğmenin altında (v3:1465). */
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
  },
  /*
    DİP DÜĞMESİ KOYU (v3:1462) — bu ekranın çıkışı bir İLERLEME değil, bir DÖNÜŞ: yükleme bitti,
    günün rotasına geri gidiliyor. Zeytin olsaydı üstündeki "Kutuyu okut"la aynı sesle konuşurdu
    ve rampadaki kurye asıl işi (okutma) ile çıkışı ayırt edemezdi.
  */
});
