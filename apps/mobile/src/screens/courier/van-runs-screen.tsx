import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRunDetail } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
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
import { dayTagOf } from './day-tag';
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
  return run.departedAt === null ? { label: t.day.vanRuns.waiting, driving: false } : { label: t.day.vanRuns.driving, driving: true };
}

export function CourierVanRunsScreen() {
  const router = useRouter();
  const day = useCourierDay();
  /*
    ÇIKARMA ONAYI ÇEKMECEDE (`OperationsConfirmSheet`, 31.08) — kurulmuş seferi araçtan çıkarmak
    geri alınamaz: kayıt düşer, kutuların damgası silinir. Sayfaya gömülü bir onay bir KARAR anı
    gibi değil bir uyarı satırı gibi okunuyor (kullanıcı ölçümü, kapanış ekranı).
  */
  const [discarding, setDiscarding] = useState<CourierRunDetail | null>(null);
  /* EKSİK KUTUYLA BAŞLATMA ONAYI (01.09) — `discarding` ile aynı gerekçe: geri alınamaz bir karar
     sayfaya gömülü bir uyarı satırıyla değil, KARAR ANI gibi görünen bir çekmeceyle alınır. */
  const [departingShort, setDepartingShort] = useState<CourierRunDetail | null>(null);
  /* SÜRÜLEN sefer — "aynı anda tek sefer" kuralının ekrandaki yüzü. Kapanmış sefer bu listede
     hiç yok (okuma onları süzüyor), yani `departedAt` tek başına yeterli ölçüt. */
  const drivenRun = day.runs.find((run) => run.departedAt !== null) ?? null;

  /* Seferin yükü duraklardan TÜRER — ikinci bir uç istenmiyor (sefer künyesi ekranının aynı
     kuralı). Durak zaten `runId` taşıyor (31.08), yani gruplama tek geçişte kuruluyor. */
  const loadOf = (runId: string): { stops: number; boxes: number; loaded: number } => {
    const own = day.stops.filter((stop) => stop.runId === runId);
    return {
      stops: own.length,
      boxes: own.reduce((sum, stop) => sum + stop.boxes.length, 0),
      loaded: own.reduce((sum, stop) => sum + stop.boxes.filter((box) => box.loadedAt !== null).length, 0),
    };
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
          {/* ÜÇ SAYI (v3:16 `aracYukOzet`): "N sefer · M durak · X/Y kutu". Yalnız kutu sayacı
              yazılıydı ve o YÜKLEME ekranının sorusu; buranın sorusu "araçta ne var". */}
          <Text style={styles.hintCount}>
            {fillCopy(t.day.vanRuns.vanSummary, {
              runs: String(day.runs.length),
              stops: String(day.stops.length),
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
            <SecondaryButton label={t.day.vanRuns.pick} elevation="flat" onPress={() => router.back()} testID="courier-van-pick" />
          </>
        ) : (
          <>
            <Text style={styles.heading}>{t.day.vanRuns.heading}</Text>

            {day.runs.map((run) => {
              const state = stateOf(run);
              const load = loadOf(run.runId);
              return (
                <RunCard
                  key={run.runId}
                  /* SÜRÜLEN KART YEŞİL ZEMİNLİ VE ZEYTİN KENARLI (v3:16 `bg:#f2f7e8 · bd:#5f7a2c`
                     · tur 31.08). Bütün kartlar krem çizilmişti; hangisinin sürüldüğü yalnız
                     rozetten okunuyordu ve rozet de yumuşaktı — üç kart aynı ağırlıktaydı. Kartın
                     kendisi renk değiştirince "şu an bu" sorusu bir bakışta cevaplanıyor. */
                  /* KART KİTİN YÜZEYİ (01.09 · kullanıcı bulgusu: "ortak komponent kullanma
                     kuralını ihlal ettiğini bile görebiliyorum"). Burada dolgu · yarıçap · kenar ·
                     zemin ELLE yazılıydı ve `OperationsSurface`ın `panel` tonunun kopyasıydı —
                     yüzeyin kendi künyesi bu hatayı zaten sayıyor: *"kodda 41 yerde elle
                     çizilmişti."* Kartın kendine ait kalan tek şey SÜRÜLEN hâli: zeytin kenar +
                     açık zeytin zemin (v3:16), o da tonun üstüne kabuk olarak biniyor. */
                  /*
                    UZUN BASINCA ARAÇTAN ÇIKAR (kullanıcı kararı 02.09) — kart bir bağlam eylemi
                    taşıyor ama kısa dokunuşu YOK.

                    Eylem 31.08'de eklenmişti (tasarımda yok; boşluk cihazda görüldü: yanlış rotayı
                    araca alan kuryenin tek çıkışı onu BAŞLATIP kapatmaktı, yani hatanın bedeli
                    müşteriye bildirim olarak yansıyordu). Yeri iki kez değişti: önce kartın altında
                    metin eylemiydi — birincil düğmenin yanında duran yıkıcı bir bağlantı; sonra sağ
                    üst köşede ikon düğme oldu ve kullanıcı *"orada çok olmamış"* dedi. Üçüncü hâl
                    onun kararı: **uzun basma**. Yıkıcı eylem böylece ekranda hiç yer kaplamıyor ve
                    yanlışlıkla basılamıyor.

                    Bedeli KEŞFEDİLEBİLİRLİK: uzun basma görünmez bir yoldur. Ekran okuyucuya ipucu
                    veriliyor (`accessibilityHint`), gören kullanıcı için karşılığı yok — kart
                    üstünde bir işaret istenirse tasarım kararı gerekir.

                    Yalnız BAŞLAMAMIŞ seferde: başlamış seferin çıkışı kapanıştır.
                  */
                  onDiscard={state.driving ? null : () => setDiscarding(run)}
                  discardLabel={run.zoneName ?? run.referenceNo}
                  style={[styles.cardBody, state.driving ? styles.cardDriving : null]}
                  testID={`courier-van-run-${run.runId}`}
                >
                  <View style={styles.cardHead}>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{run.zoneName ?? run.referenceNo}</Text>
                      {/* GÜN ETİKETİ (v3:16) — araç iki-üç günün seferini taşıyor; hangisinin
                          bugün olduğu kartın kendisinde yazmalı. */}
                      <Text style={styles.cardMeta}>{`${dayTagOf(run.deliveryDate, t)} · ${run.referenceNo}`}</Text>
                      {/* KART ÖZETİ OKUNAN/TOPLAM (v3:16 `s.ozet`): "N durak · X/Y kutu araçta".
                          Yalnız toplam yazılıydı ve o seferin YÜKLEMESİ bitmiş mi görünmüyordu. */}
                      <Text style={styles.cardSummary}>
                        {fillCopy(t.day.vanRuns.summary, {
                          stops: String(load.stops),
                          loaded: String(load.loaded),
                          total: String(load.boxes),
                        })}
                      </Text>
                    </View>
                    {/* Durum ROZET (v3:16) — dolgulu ve sağ üstte; düz metin olarak çizilmişti ve
                        kartın kendi başlığıyla aynı ağırlıkta duruyordu. */}
                    <OperationsStatusBadge
                      label={state.label}
                      tone={state.driving ? 'live' : 'idle'}
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
                        /* SERT GÖLGE YOK (v3:16 — düğmenin kendi kuralı, `elevation` künyesi):
                           kitin varsayılanı müşteri yüzeyinin gölgesi ve cihazda kartın altında
                           ikinci bir kenar gibi görünüyordu (tur 31.08). */
                        elevation="flat"
                        /* ZEMİN VE KENAR KABUKTAN (kullanıcı bulgusu 31.08 · ölçüldü): düğme
                           SÜRÜLEN seferin yeşil kartının üstünde duruyor ve zeminsiz kaldığında
                           kartın rengini alıyordu (#f2f7e8); tasarım #fbfaf4 diyor, yani düğme
                           karttan AÇIK olmalı — yoksa yalnız kenarından ibaret kalıyor. Kenar da
                           `success-line` (#c3d3a4): kitin `olive-line`ı (#d7e3bd) bir kademe açık
                           ve yeşil kartın üstünde neredeyse görünmüyor. İkisi de yalnız operasyon
                           temasında var, o yüzden tondan değil kabuktan geliyor. */
                        style={styles.toStops}
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
                        /* Burada EKRAN DEĞİŞMEZ ve bu bilinçli: catch-up geç kalmış kutuların
                           işi ve kurye aynı düğmeye bir kez daha basacak olabilir. Sonucu toast
                           söylüyor. */
                        onPress={() => void day.departRun(run.runId)}
                        disabled={day.starting}
                        testID={`courier-van-catchup-${run.runId}`}
                      />
                    </>
                  ) : (
                    /* BEDEL DÜĞMENİN İÇİNDE (v3:16) — dışına yazılmıştı ve düğmeden kopuk bir not
                       gibi duruyordu. Tasarımda iki satır TEK dokunma alanının içinde: basmanın ne
                       yaptığı, basılan şeyin üstünde yazılı. */
                    <>
                      {/*
                        EKSİK KUTU: ENGEL DEĞİL, BEYAN EDİLMİŞ BİR KARAR (kullanıcı kararı 01.09).

                        Bir tur boyunca kutu eksikken başlatma düğmesi HİÇ çizilmiyordu ("önce
                        yükle"). Kullanıcı düzeltti: *"eksik kutuyu net şekilde ifade edelim, gerekirse
                        bir onay çekmecesi açılsın; kabul ediyorsa eksik kutuyla da kurye yola
                        çıkabilmeli."* Sahada haklı olan bu — rampada kalan tek kutu için bütün seferi
                        rehin tutmak, kuryeyi bekletir.

                        Bedel ARTIK İKİ YERDE YAZILI ve ikisi de basmadan önce:
                          · düğmenin kendi ipucunda ("N kutu binmedi · o duraklar açılmaz"),
                          · onay çekmecesinde, geri alınamazlığıyla birlikte.
                        Tasarımın tek düğmesine (v3 `02-Aractaki-Seferler`) böylece dönülmüş oldu;
                        yükleme ekranına giden yol kartın altında ikincil eylem olarak duruyor.

                        AYNI ANDA TEK SEFER (31.08) kilidi değişmedi: başka sefer sürülürken düğme
                        PASİF ve NEDEN pasif olduğunu yazıyor. Kapı ayrıca veride
                        (`depart_delivery_run` → `another_running`) — ekran iki cihazdan gelen iki
                        isteği ayıramaz.
                      */}
                      <PrimaryButton
                        label={
                          drivenRun === null ? t.day.vanRuns.depart : fillCopy(t.day.vanRuns.departBlocked, { ref: drivenRun.referenceNo })
                        }
                        hint={
                          drivenRun !== null
                            ? t.day.vanRuns.departBlockedHint
                            : load.boxes > load.loaded
                              ? fillCopy(t.day.vanRuns.departShortHint, { n: String(load.boxes - load.loaded) })
                              : t.day.vanRuns.departHint
                        }
                        /*
                          SEFER BAŞLADI → DURAKLARA DÖN (01.09): başlatma bu akışın en büyük durum
                          değişimi (duraklar açılır, müşteriye bildirim gider) ve kuryenin bakması
                          gereken yer durak listesi. Eksik kutu varken ÖNCE onay çekmecesi açılır —
                          karar orada verilir, istek oradan gider.
                        */
                        onPress={() => {
                          if (load.boxes > load.loaded) {
                            setDepartingShort(run);
                            return;
                          }
                          void day.departRun(run.runId).then((outcome) => {
                            if (outcome === 'ok') router.back();
                          });
                        }}
                        disabled={day.starting || drivenRun !== null}
                        tone="olive"
                        /* IŞIMA TASARIMIN KENDİ ÖLÇÜSÜ (v3:16 satır 37 · kullanıcı bulgusu 02.09:
                           *"renk ve gölge farkı var"*): düğmenin gölgesi
                           `box-shadow:0 4px 14px rgba(95,122,44,.22)` ve bizde varsayılan gölge
                           çiziliyordu. Renk zaten doğruydu (`olive` = #5f7a2c); eksik olan ışımaydı
                           ve kitte hazır duruyordu — `elevation="glow"` (token `shadow.glow`).
                           Kitin kendi künyesi bunu bekleyen bir arıza olarak yazmıştı: *"burada
                           henüz patlamamıştı çünkü `elevation='glow'` hiçbir ekrandan gelmiyordu."* */
                        elevation="glow"
                        testID={`courier-van-depart-${run.runId}`}
                      />
                      {/* Yükleme yolu KAPANMADI, ikincil oldu: eksik kutu varken kuryenin ilk
                          seçeneği hâlâ rampaya dönmek. Kutular tamsa satırın konusu da yok. */}
                      {load.boxes > load.loaded ? (
                        <TextAction
                          label={t.day.vanRuns.loadFirst}
                          onPress={() => router.navigate('/load')}
                          disabled={day.starting}
                          testID={`courier-van-load-${run.runId}`}
                        />
                      ) : null}

                    </>
                  )}
                </RunCard>
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
            {/* AYNI KAPI İKİ KEZ ÇİZİLMEZ (01.09): kutusu eksik seferin kartı zaten "Kutuları araca
                yükle" düğmesini taşıyor ve ekran düzeyindeki bu satır onun hemen altında AYNI
                etiketle duruyordu (cihazda ölçüldü). Kart daha iyisini söylüyor — hangi seferin
                kaç kutusu bekliyor. Satır yalnız hiçbir kartın yükleme kapısı olmadığında kalıyor:
                o zaman da işi var, çünkü araç bir ara depo ve yükleme sefer boyunca sürebilir. */}
            {day.runs.some((run) => {
              const own = loadOf(run.runId);
              return run.departedAt === null && own.boxes > own.loaded;
            }) ? null : (
              <SecondaryButton
                label={t.day.vanRuns.load}
                elevation="flat"
                onPress={() => router.navigate('/load')}
                testID="courier-van-load"
              />
            )}
            {/* ARACA SEFER EKLEME (31.08) — model "araç bir ara depo" dediği anda bu yol zorunlu
                oldu: kurye gün içinde ikinci bir seferi de araca alabilmeli. Seçim ekranına giden
                tek kapı gün ekranının BOŞ hâliydi; araçta yük varken oraya hiç düşülmüyordu. */}
            <TextAction label={t.day.vanRuns.addRun} onPress={() => router.navigate('/route-pick')} testID="courier-van-add-run" />
            {/* "X/Y kutu araçta" ÜÇÜNCÜ kez yazılıyordu (01.09 · tasarımla karşılaştırıldı):
                aynı sayı üstteki koyu künyede ve her kartın özetinde zaten var. v3:16'nın ekran
                dibinde yalnız dipnot duruyor. */}

            <Text style={styles.note}>{t.day.vanRuns.note}</Text>
          </>
        )}

        {/* Yola çıkarma/araçtan çıkarma sonucu TOAST'ta (kullanıcı kararı 01.09) — listenin
            SONUNA yazılıyordu, yani kurye kartlara bakarken sonucu görmüyordu bile. */}
      </ScrollView>

      {/*
        ÇIKARMANIN BEDELİ ÇEKMECEDE YAZILI — kaç sipariş serbest kalıyor, kaç kutu rampada.
        Ton `error` DEĞİL: eylem yıkıcı değil, DÜZELTİCİ; kurye kendi hatasını geri alıyor ve
        müşteri hiçbir şey görmedi. `olive` tonu tam bunun için var (kitin künyesi: "geri
        alınamaz ama olumlu").
      */}
      {/*
        EKSİK KUTUYLA BAŞLATMA (kullanıcı kararı 01.09) — bedeli çekmece SAYIYLA yazıyor: kaç kutu
        binmedi, o durakların ne olacağı, ve geri alınamazlığı. Onaylayan kurye yola çıkar.
      */}
      <OperationsConfirmSheet
        visible={departingShort !== null}
        title={t.day.vanRuns.departShortTitle}
        message={
          departingShort === null
            ? ''
            : fillCopy(t.day.vanRuns.departShortBody, {
                route: departingShort.zoneName ?? departingShort.referenceNo,
                n: String(loadOf(departingShort.runId).boxes - loadOf(departingShort.runId).loaded),
              })
        }
        confirmLabel={t.day.vanRuns.departShortConfirm}
        cancelLabel={t.day.vanRuns.departShortCancel}
        tone="olive"
        busy={day.starting}
        busyLabel={t.day.vanRuns.departShortConfirm}
        onConfirm={() => {
          if (departingShort === null) return;
          const runId = departingShort.runId;
          setDepartingShort(null);
          void day.departRun(runId).then((outcome) => {
            /* `awaiting` BURADA BEKLENEN cevap: kurye eksiği zaten onayladı. Ekran yine duraklara
               gider — sefer başladı ve bakılacak yer orası. */
            if (outcome === 'ok' || outcome === 'awaiting') router.back();
          });
        }}
        onCancel={() => setDepartingShort(null)}
        testID="courier-van-depart-short-sheet"
      />

      <OperationsConfirmSheet
        visible={discarding !== null}
        title={t.day.vanRuns.discardTitle}
        message={
          discarding === null
            ? ''
            : fillCopy(loadOf(discarding.runId).loaded > 0 ? t.day.vanRuns.discardBody : t.day.vanRuns.discardBodyNoBoxes, {
                route: discarding.zoneName ?? discarding.referenceNo,
                orders: String(loadOf(discarding.runId).stops),
                boxes: String(loadOf(discarding.runId).loaded),
              })
        }
        confirmLabel={t.day.vanRuns.discardConfirm}
        cancelLabel={t.day.vanRuns.discardCancel}
        /* KIRMIZI (kullanıcı kararı 02.09): eylem YIKICI — sefer kaydı düşer, siparişler serbest
           kalır, araçtaki kutuların damgası silinir. Zeytin ton "geri alınamaz ama olumlu" demek
           (çekmecenin kendi künyesi) ve burada yanlış cümleydi. */
        tone="error"
        busy={day.starting}
        busyLabel={t.day.vanRuns.discardBusy}
        onConfirm={() => {
          if (discarding === null) return;
          day.discardRun(discarding.runId, discarding.zoneName ?? discarding.referenceNo);
          setDiscarding(null);
        }}
        onCancel={() => setDiscarding(null)}
        testID="courier-van-discard-sheet"
      />
    </View>
  );
}

/**
 * **SEFER KARTININ YÜZEYİ** — kitin yüzeyi, üstüne yalnız uzun basma kararı biniyor.
 *
 * Sarmalayıcı bir kaçamak değil, TİPİN gereği: `OperationsSurface`ın dokunuş birleşimi ayrıktır
 * (ya eylem + ad, ya hiçbiri) ve ayrık birleşime yayılmış nesne (`{...(driving ? {} : {…})}`)
 * geçirilemiyor — derleyici hangi dalda olduğunu göremiyor. İki dalı burada AÇIKÇA yazmak, kartın
 * gövdesini iki kez yazmadan aynı sonucu veriyor.
 *
 * `onDiscard === null` = sürülen sefer: kart dokunulamaz. Başlamış seferin çıkışı kapanıştır.
 */
function RunCard({
  children,
  onDiscard,
  discardLabel,
  style,
  testID,
}: {
  children: ReactNode;
  onDiscard: (() => void) | null;
  /** Ekran okuyucuda kartın adı — rota adı, yoksa sefer künyesi. */
  discardLabel: string;
  style: StyleProp<ViewStyle>;
  testID: string;
}) {
  if (onDiscard === null) {
    return (
      <OperationsSurface style={style} testID={testID}>
        {children}
      </OperationsSurface>
    );
  }
  return (
    <OperationsSurface
      onLongPress={onDiscard}
      accessibilityLabel={discardLabel}
      accessibilityHint={t.day.vanRuns.discardHint}
      style={style}
      testID={testID}
    >
      {children}
    </OperationsSurface>
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
  /** Kartın kite EKLEDİĞİ tek şey satır arası — dolgu, yarıçap, kenar ve zemin `panel` tonundan. */
  cardBody: { gap: operationsTheme.space.md },
  /** "Duraklara git" — yeşil kartın üstünde AÇIK zemin (v3:16 `background:#fbfaf4`). */
  toStops: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['success-line'],
  },
  /** Sürülen sefer (v3:16) — açık zeytin zemin + zeytin kenar; listenin tek "şimdi" kartı. */
  cardDriving: {
    backgroundColor: operationsTheme.colors['success-bg'],
    borderColor: operationsTheme.colors.olive,
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
  note: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
