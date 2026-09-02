import { Fragment, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRoute } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { timeOf } from '@/lib/operations/stamp';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayTagOf } from './day-tag';
import { isRouteFree, routeHasWork, useCourierDay } from './use-courier-day.hook';

/*
  K · SEFER VE ARAÇ SEÇİMİ (v3:17) — kurulacak seferlerin seçildiği ekran.

  ── NEDEN AYRI EKRAN (kullanıcı bulgusu 31.08) ──────────────────────────────
  Seçim önce GÜN EKRANININ gövdesine gömülüydü: araç boşken gün ekranı doğrudan rota kartlarını
  çiziyordu. Kullanıcı tasarımı gösterip sordu — *"giriş ekranı bu olması gerekmiyor mu?"* — ve
  haklıydı: v3:15'in boş hâli bir REHBERDİR (üç adım: seç → yükle → başlat) ve seçime ancak
  düğmeyle geçilir. İkisi bir ekrana sığdırıldığında kurye "ne yapacağım" sorusunun cevabını
  hiç görmüyor, doğrudan bir listeyle karşılaşıyordu.

  Ayrım işlevsel de: bu ekran sefer AÇIKKEN de gerekiyor (araca ikinci sefer eklemek), yani gün
  ekranının boş hâline bağlı olamaz.

  ── ÜÇ BLOK, ÜÇ AYRI KARAR ─────────────────────────────────────────────────
  ARAÇ (tek seçim) · ARACA ALINACAK SEFERLER (çoklu seçim, güne göre gruplu) · ARACA ALINACAKLAR
  (seçimin toplamı). Sonuncusu bir özet değil bir ONAY: kurye düğmeye basmadan önce ne yüklediğini
  görür.
*/

const t = courierCopy;

/** İlk yük iskeleti — araç satırı ve iki rota kartı; ekranın gerçekten çizdiği bloklar. */
const PICK_SKELETON = { vehicle: 62, route: 96 } as const;

/**
 * **ÖZET BLOĞUNUN YÜKSEKLİĞİ — iki hâlde de aynı** (kullanıcı kararı 01.09).
 *
 * Blok iki ayrı şey çiziyor: seçim yokken kesikli bir bekleyiş kutusu, seçim varken üç sayılık
 * özet. İkisi farklı yükseklikteydi ve her işaretlemede altındaki her şey zıplıyordu —
 * kullanıcının istediği şey bu zıplamanın bitmesi: *"o bölümün yüksekliği ile seçilince ortaya
 * çıkan bilgi kartının yüksekliği aynı olmalı."*
 *
 * Değer DOLU hâlin ölçülmüş doğal yüksekliği: cihazda **305 px @3x = 102 dp** (Poco, iki hâl aynı
 * turda ölçüldü; boş hâl 65 dp'ydi). Tasarımın kendi hesabıyla da aynı kapıya çıkıyor (v3:17 dolu
 * blok ≈ 100 px). Taban olarak (`minHeight`) iki stile de veriliyor, yani dolu hâl büyürse buradaki
 * sayı da onunla güncellenir.
 *
 * Tasarımda ikisi eşit DEĞİL (≈100 ↔ ≈70 px) — bu bilinçli bir sapma ve sebebi HAREKET: tasarım
 * duran bir kare, ekran ise seçimle değişen canlı bir yüzey.
 *
 * *(İlk denemede 85 yazılmıştı: ölçüm tek bir sütundan alınmış ve kartın yuvarlatılmış köşesine
 * denk gelmişti. Doğrusu satır satır, tüm genişlikte taranarak bulundu.)*
 */
const SUMMARY_BOX_MIN_HEIGHT = 102;

export function CourierRoutePickScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  /*
    ARAÇ SEÇİMİ ÇEKMECEDE (v3:17 `openArac` → `sheetArac` · kullanıcı bulgusu 31.08).

    Araçlar sayfaya düz bir liste olarak seriliyordu ve iki şeyi birden bozuyordu: sayfanın ilk
    bloğu bir SEÇİM değil bir KARAR olmalı ("araç seçildi mi"), ve dört araçlı bir depoda liste
    rota bölümünü ekranın dışına itiyordu. Tasarımın deseni tek satır + çekmece: satır kararın
    HÂLİNİ söyler, çekmece kararı ALIR.
  */
  const [vehicleSheet, setVehicleSheet] = useState(false);
  /*
    "ARAÇSIZ DEVAM ET" AÇIK BİR SEÇİMDİR, seçimsizlik değil (v3:17 `aracKey === 'yok'`).
    `selectedVehicleId === null` iki ayrı şeyi birden anlatıyordu: "henüz seçmedim" ve "araçsız
    gideceğim". İkisi ayrılmadan CTA "önce araç seç" diyemez — ya hiç demez ya da araçsız gitmeye
    karar vermiş kuryeyi sonsuza kadar bekletirdi.
  */
  const [noVehicle, setNoVehicle] = useState(false);
  /*
    LİSTENİN ALTINDAKİ BOŞLUK ÖLÇÜLÜR, TAHMİN EDİLMEZ (kullanıcı bulgusu 01.09).

    Yapışkan çubuk mutlak konumlu ve listenin son kartını örtüyordu: *"aşağıda açılan bir bölüm
    var"* — kullanıcının gördüğü şey, "Araca alınacaklar" özetinin yarısı düğmenin arkasında
    kalmış hâliydi (cihazda ölçüldü: kartın üst 30 dp'si görünüyor, üç hücrelik ızgarası hiç
    görünmüyor). Boşluk `space['9xl']` (70) yazılıydı; çubuğun kendisi düğme + ÜÇ SATIR DİPNOT
    taşıdığı için gerçek yüksekliği bunun iki katına yakın.

    İlk hâl `0`: çubuk ölçülene kadar bir kare boyunca boşluk yok ve bu doğru — uydurma bir
    başlangıç değeri, ölçüm gelince listeyi zıplatırdı.
  */
  const [barHeight, setBarHeight] = useState(0);
  const vehicle = day.vehicles.find((row) => row.vehicleId === day.selectedVehicleId) ?? null;
  const vehicleDecided = vehicle !== null || noVehicle;

  const picked = day.routes.filter((route) => day.selectedZoneIds.includes(route.zoneId));
  const pickedStops = picked.reduce((sum, route) => sum + route.stopCount, 0);
  const pickedBoxes = picked.reduce((sum, route) => sum + route.boxCount, 0);
  const ready = picked.length > 0 && vehicleDecided;

  /* Çıkış deposu rotalardan okunur: liste zaten kuryenin kapsamına süzülü (`listCourierRoutes`
     `scope`u), yani ilk rotanın deposu kuryenin deposudur. Okunamazsa ad YAZILMAZ. */
  const warehouseName = day.routes.find((route) => route.warehouseName !== null)?.warehouseName ?? null;

  const header = (
    <OperationsStackHeader
      title={t.routePick.title}
      /* BAĞLAM SATIRI TASARIMIN CÜMLESİ (v3:17 "Marc Lemoine · Strasbourg Merkez deposu"): kim ve
         hangi depo. "araca ne alacağını seç" bir yönergeydi ve zaten ekranın başlığında yazıyor. */
      subtitle={
        warehouseName === null
          ? t.routePick.contextPlain
          : fillCopy(t.routePick.context, { name: userName, warehouse: warehouseName })
      }
      onBack={() => router.back()}
      backLabel={t.day.load.back}
      testID="courier-route-pick-header"
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-route-pick">
        {header}
        <OperationsSkeletonList
          heights={[PICK_SKELETON.vehicle, PICK_SKELETON.route, PICK_SKELETON.route]}
          label={t.day.loading}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="courier-route-pick">
      {header}

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: barHeight + operationsTheme.space.xl }]}>
        {/* ── ARAÇ: TEK SATIR + ÇEKMECE (v3:17) ───────────────────────── */}
        <VehicleGate
          value={
            vehicle !== null
              ? `${vehicle.plate}${vehicle.label === null ? '' : ` · ${vehicle.label}`}`
              : noVehicle
                ? t.day.vehicle.noneChosen
                : t.day.vehicle.unset
          }
          state={vehicle !== null ? 'picked' : noVehicle ? 'none' : 'unset'}
          onPress={() => setVehicleSheet(true)}
        />

        {/* ── ARACA ALINACAK SEFERLER ─────────────────────────────────── */}
        <Text style={styles.headingSpaced}>{t.routePick.routesHeading}</Text>
        <Text style={styles.note}>{t.routePick.routesHint}</Text>

        {day.routes.length === 0 ? (
          <OperationsNoticeBlock
            variant="empty"
            title={t.routePick.empty.title}
            description={t.routePick.empty.body}
            testID="courier-route-pick-empty"
          />
        ) : (
          day.routes.map((route, index) => {
            const selected = day.selectedZoneIds.includes(route.zoneId);
            /* GÜN ETİKETİ grup başlığı olarak (v3:17): araç birden çok günün seferini alabiliyor
               ve hangi günün rotasını işaretlediği kartın üstünde yazmalı. */
            const dayHead =
              route.day !== day.routes[index - 1]?.day ? (
                <Text style={styles.dayTag}>{dayTagOf(route.day, t)}</Text>
              ) : null;
            return (
              <Fragment key={route.zoneId}>
                {dayHead}
                <RouteCard route={route} selected={selected} onPress={() => day.toggleRoute(route.zoneId)} />
              </Fragment>
            );
          })
        )}

        {/*
          ARACA ALINACAKLAR — ÜÇ SÜTUN, AYRAÇLI (v3:17 `grid-template-columns:1fr 1fr 1fr`).

          Tek satırlık bir cümleydi ("2 sefer · 8 durak") ve kutu sayısı hiç yoktu. Bu blok bir
          özet değil bir ONAY: kurye düğmeye basmadan önce ne yüklediğini üç ayrı sayıda görür ve
          hacim (kutu) o üçlünün en somut olanı. Seçim yokken bölüm başlığı da çizilmez — tasarımda
          boş hâl kendi kesikli kutusudur, üstünde başlık yok.
        */}
        {picked.length === 0 ? (
          <View style={styles.summaryIdleBox} testID="courier-route-pick-summary">
            <Text style={styles.summaryIdle}>{t.routePick.summaryIdle}</Text>
            <Text style={styles.note}>{t.routePick.summaryIdleBody}</Text>
          </View>
        ) : (
          <View style={styles.summary} testID="courier-route-pick-summary">
            <Text style={styles.summaryBadge}>{t.routePick.summaryBadge}</Text>
            <View style={styles.summaryGrid}>
              <SummaryCell value={picked.length} label={t.routePick.summaryRuns} first />
              <SummaryCell value={pickedStops} label={t.routePick.summaryStops} />
              <SummaryCell value={pickedBoxes} label={t.routePick.summaryBoxes} />
            </View>
          </View>
        )}
      </ScrollView>

      <OperationsStickyBar onHeight={setBarHeight}>
        {/* DÜĞME EKSİĞİ SÖYLER (v3:17 `seferCtaLabel`): sefer yoksa "önce sefer seç", sefer var
            ama araç kararı yoksa "önce araç seç". Tek bir pasif etiket, kuryeye hangi adımın
            eksik olduğunu söylemiyordu. */}
        <PrimaryButton
          label={
            day.starting
              ? t.day.starting
              : picked.length === 0
                ? t.day.openRuns.ctaIdle
                : !vehicleDecided
                  ? t.day.openRuns.ctaNoVehicle
                  : fillCopy(t.day.openRuns.cta, { n: String(picked.length) })
          }
          /*
            SEFER KURULDU → EKRAN DEĞİŞİR (01.09 · kullanıcı bulgusu).

            Kurma başarılı olduğunda ekran yerinde kalıyordu: *"rotanın sorumluluğunu alıyor ama
            hâlâ rota sayfasında kalıyor, ne olduğunu anlayamıyor bile."* Seçim listesi boşalmış,
            düğme pasifleşmiş bir sayfada bırakılan kurye, işin olup olmadığını ancak geri gidip
            bakarak anlıyordu.

            Gidilecek yer DÜĞMENİN KENDİ SÖZÜ: *"Seferleri kur — N sefer **yüklemeye geçer**"*
            (v3 `03-Sefer-ve-Arac/03`). Bir tur boyunca araçtaki seferlere gidiyordu ve o ekran
            tasarımın akışında yüklemeden SONRA geliyor (`02-Aractaki-Seferler` karelerinde bütün
            seferler 7/7 · 4/4 · 9/9 yüklü). Kutular rampada dururken kuryeyi başlatma ekranına
            götürmek, düğmenin verdiği sözü tutmamaktı.

            `dismissTo` bilinçli — bu ekrana ya gün ekranından ya ARAÇTAKİ SEFERLER'den gelinir;
            `navigate` ikinci yolda yığında iki kopya bırakırdı, `dismissTo` varsa geri döner,
            yoksa yerine geçer.

            YARIM başarıda da gidiyoruz: en az bir sefer kurulduysa araç değişti ve yüklenecek kutu
            doğdu. Hiçbiri kurulmadıysa kalınır — yapılacak iş bu ekranda.
          */
          onPress={() => {
            void day.openRuns().then((outcome) => {
              if (outcome !== 'failed') router.dismissTo('/load');
            });
          }}
          disabled={day.starting || !ready}
          tone="olive"
          elevation="flat"
          testID="courier-route-pick-cta"
        />
        {/* Kurulan seferin BAŞLAMADIĞINI düğmenin altında söylüyoruz: bu ekran müşteriye haber
            göndermiyor ve kurye onu bilmeli (v3:17'nin kendi dipnotu). */}
        <Text style={styles.footnote}>{t.day.openRuns.footnote}</Text>
        {/* Sefer kurmanın SONUCU burada değil TOAST'ta (kullanıcı kararı 01.09): düğmenin altına
            asılan cümle bir sonraki eyleme kadar duruyordu ve dipnotla karışıyordu — ikisi de aynı
            puntoda, alt alta iki gri satır. Dipnot bir KURAL (her zaman doğru), sonuç bir OLAY. */}
      </OperationsStickyBar>

      {/*
        ARAÇ ÇEKMECESİ (v3:17 `sheetArac`) — radyo satırları + "araçsız devam et".

        Araçsız seçenek KESİKLİ çerçeveli ve listenin sonunda: meşru bir seçim ama varsayılan
        değil. Araç kaydı hiç yoksa liste boş kalır ve açıklama bunu söyler — boş bir çekmece,
        kuryeye kendi hatasıymış gibi görünürdü.
      */}
      <BottomSheet
        visible={vehicleSheet}
        title={t.day.vehicle.sheetTitle}
        onClose={() => setVehicleSheet(false)}
        testID="courier-vehicle-sheet"
      >
        <Text style={styles.sheetNote}>
          {day.vehicles.length === 0
            ? t.day.vehicle.sheetNoteEmpty
            : fillCopy(t.day.vehicle.sheetNote, { warehouse: warehouseName ?? t.routePick.warehouseUnknown })}
        </Text>
        {day.vehicles.map((row) => (
          <VehicleOption
            key={row.vehicleId}
            title={row.plate}
            body={row.label}
            selected={row.vehicleId === day.selectedVehicleId}
            onPress={() => {
              day.selectVehicle(row.vehicleId);
              setNoVehicle(false);
              setVehicleSheet(false);
            }}
            testID={`courier-vehicle-${row.vehicleId}`}
          />
        ))}
        <VehicleOption
          title={t.day.vehicle.noneTitle}
          body={t.day.vehicle.noneBody}
          selected={noVehicle}
          dashed
          onPress={() => {
            day.selectVehicle(null);
            setNoVehicle(true);
            setVehicleSheet(false);
          }}
          testID="courier-vehicle-none"
        />
      </BottomSheet>
    </View>
  );
}

/**
 * **ARAÇ KAPISI** (v3:17 `c.aracSatir`) — ekranın ilk satırı ve bir KARARIN hâli.
 *
 * Üç renk, üç anlam: seçilmemişken SICAK (amber — "burada eksik bir adım var"), araç seçilince
 * YEŞİL, "araçsız devam" seçilince NÖTR. Renk kuryeye eksiği söylüyor; düz bir liste bunu
 * söyleyemezdi çünkü listenin kendisi hiçbir hâl taşımıyor.
 */
function VehicleGate({
  value,
  state,
  onPress,
}: {
  value: string;
  state: 'picked' | 'none' | 'unset';
  onPress: () => void;
}) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.gate, styles[`gate_${state}`]]}
      accessibilityLabel={`${t.day.vehicle.heading} · ${value}`}
      testID="courier-vehicle-gate"
    >
      <View style={[styles.gateIcon, styles[`gateIcon_${state}`]]}>
        <Icon
          name="courier"
          size={operationsTheme.size.stripIcon}
          color={state === 'picked' ? operationsTheme.colors['olive-dark'] : state === 'none' ? operationsTheme.colors.muted : operationsTheme.colors.warehouse}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.gateEyebrow}>{t.day.vehicle.heading}</Text>
        <Text style={[styles.gateValue, styles[`gateValue_${state}`]]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.gateAction}>
        {`${state === 'unset' ? t.day.vehicle.actionPick : t.day.vehicle.actionChange} ›`}
      </Text>
    </PressableSurface>
  );
}

/** Çekmecenin radyo satırı (v3:17) — halka + nokta, sonra plaka ve adı. */
function VehicleOption({
  title,
  body,
  selected,
  dashed = false,
  onPress,
  testID,
}: {
  title: string;
  body: string | null;
  selected: boolean;
  dashed?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.option, dashed ? styles.optionDashed : styles.optionSolid, selected ? styles.optionOn : null]}
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.optionTitle}>{title}</Text>
        {body === null ? null : <Text style={styles.rowMeta}>{body}</Text>}
      </View>
    </PressableSurface>
  );
}

/** "ARACA ALINACAKLAR" üçlüsünün bir sütunu — sayı Lora, etiket küçük ve soluk (v3:17). */
function SummaryCell({ value, label, first = false }: { value: number; label: string; first?: boolean }) {
  return (
    <View style={[styles.summaryCell, first ? null : styles.summaryCellDivided]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/**
 * Rota kartı — ÇOKLU seçim, o yüzden solda onay KUTUSU var (v3:17). Tek seçimde kenarlık yeterdi;
 * çoklu seçimde kurye "kaçını işaretledim" sorusunu tek bakışta cevaplayabilmeli.
 *
 * Seferi açılmış rota seçilemez (K3) ve pasif çizilir — kimin sürdüğü kartın kendisinde yazar.
 */
function RouteCard({
  route,
  selected,
  onPress,
}: {
  route: CourierRoute;
  selected: boolean;
  onPress: () => void;
}) {
  /* İKİ AYRI SEBEP, İKİ AYRI CÜMLE (kullanıcı kararı 01.09): rota ya BAŞKASINDA olduğu için ya da
     İŞİ OLMADIĞI için seçilemez. İkisi de kartı pasifleştiriyor ama aynı şey değiller — tek bir
     "seçilemez" hâli, kuryeye yarın gelip gelmemesi gerektiğini söylemezdi.

     CÜMLE GÜN SÖYLEMEZ (kullanıcı bulgusu 01.09: *"yarında da bugün iş yok diyor"*): liste ÜÇ GÜN
     taşıyor ve kart zaten bir gün başlığının altında duruyor. "Bugün iş yok" yazan bir kart,
     yarının satırında düpedüz yanlış bilgidir. */
  const free = isRouteFree(route);
  const hasWork = routeHasWork(route);
  const pickable = free && hasWork;
  /* ÜÇ SAYI (v3:17 `r.ozet`): "5 durak · 7 kutu · 2 tahsilat". Depo adı buradan ÇIKTI ve
     başlığa gitti — liste zaten tek deponun, her kartta tekrarlanması bir bilgi değil bir
     gürültüydü. Yerine gelen iki sayı kuryenin seçerken sorduğu asıl soruları cevaplıyor:
     "araca sığar mı" ve "kaç kez para sayacağım". */
  const meta = fillCopy(t.routePick.routeMeta, {
    stops: String(route.stopCount),
    boxes: String(route.boxCount),
    collections: String(route.collectionCount),
  });
  /* ÜÇÜNCÜ SATIR HÂLİ SÖYLER (v3:17 `r.not`): boşta · araca alınacak · kimin sürdüğü. Yalnız
     "alınmış" hâli yazılıydı; seçilebilir kartlar sessizdi ve işaretlemenin ne değiştirdiği
     karttan okunamıyordu. */
  const note = !free
    ? [
        /* KAPANMIŞ SEFER "sürüyor" DEMEZ (31.08): rota alınmış ama iş BİTMİŞ — geçmiş zaman
           kipiyle yazılmazsa kurye o rotanın hâlâ yolda olduğunu sanır. */
        fillCopy(route.run?.closed === true ? t.routePick.takenClosed : t.routePick.taken, {
          courier: route.run?.courierName ?? t.routePick.someone,
        }),
        route.run?.departedAt == null ? null : fillCopy(t.routePick.takenAt, { time: timeOf(route.run.departedAt) }),
      ]
        .filter((part): part is string => part !== null)
        .join(' · ')
    : !hasWork
      ? t.routePick.noWork
      : selected
        ? t.routePick.willTake
        : t.routePick.free;
  return (
    <PressableSurface
      onPress={onPress}
      disabled={!pickable}
      feedback="scale"
      style={[styles.card, selected ? styles.cardOn : pickable ? styles.cardOff : styles.cardTaken]}
      accessibilityLabel={route.zoneName}
      testID={`courier-route-${route.zoneId}`}
    >
      {/* İŞARET YALNIZ SEÇİLİYKEN ÇİZİLİR (cihazda ölçüldü 31.08): saydam renkli bir ✓ yazılıydı
          ve cihazda saydam olmadı — dört kutu da işaretli görünüyordu, yani ekran "hepsini
          seçtim" diyordu. Görünmemesi gereken şey renklendirilmez, HİÇ ÇİZİLMEZ. */}
      <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
        {selected ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.cardTitle, pickable ? null : styles.cardTitleTaken]}>{route.zoneName}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        <Text style={[styles.takenNote, !pickable ? styles.takenNoteBusy : selected ? styles.takenNoteOn : null]}>
          {note}
        </Text>
      </View>
      {/* SEFER KÜNYESİ SAĞ UÇTA (v3:17 `r.kunye`) — kurye rampada kâğıttaki kodu kartla
          eşleştiriyor; kod olmadan iki "Strasbourg" rotası ayırt edilemez. Sefer henüz kurulmamış
          rotada kod da YOKTUR ve yazılmaz. */}
      {route.run === null ? null : <Text style={styles.cardRef}>{route.run.referenceNo}</Text>}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    /* EKRANIN YAN NEFESİ 20 (v3:17 — hem araç satırı `margin:0 20px` hem rota listesi
       `padding:0 20px`). 14 yazılıydı ve kartlar tasarımdan 6 px geniş çiziliyordu; fark tek
       başına küçük ama ekranın tamamını sıkışık gösteriyor (kullanıcı bulgusu 01.09). */
    paddingHorizontal: operationsTheme.space['5xl'],
    /* DİKEY BOŞLUK BURADA DEĞİL: yapışkan çubuğun ÖLÇÜLEN yüksekliği satır içinde ekleniyor
       (künyesi `barHeight` durumunda). Sabit bir değer bırakmak, iki doğruluk kaynağı olurdu. */
    gap: operationsTheme.space.md,
  },
  heading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  headingSpaced: {
    paddingTop: operationsTheme.space['3xl'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  /** Gün etiketi ZEYTİN (v3:17) — rota kartlarının üstünde ayraç, ama bir başlık kadar sessiz. */
  dayTag: {
    paddingTop: operationsTheme.space.sm,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.olive,
  },
  /* ── ARAÇ KAPISI (v3:17 `c.aracSatir`) ─────────────────────────────────────
     Üç hâl, üç renk üçlüsü. Amber hâlin ikon karesi tasarımda #f2ddc2 — envanterde karşılığı YOK
     ve tasarımın TAMAMINDA bir kez geçiyor (ölçüldü: 1 kullanım). Tek kullanımlık bir değer token
     hak etmez (CLAUDE §3'ün envanter kuralı), o yüzden kare nötr kalıyor ve amber kimliği kartın
     zemininden, kenarından, metninden ve ikonun çizgi renginden geliyor — dördü aynı aileden. */
  gate: {
    /* ÖLÇÜLER v3:17'NİN KENDİ SAYILARI (kullanıcı bulgusu 01.09 — "yükseklik tasarımdan az"):
       `padding:13px 15px` · `gap:12px`. Üçü de `lg`(10) yazılıydı, yani satır her eksende
       birkaç piksel eziliyordu ve toplamda 49 px yüksekliğinde çiziliyordu (tasarım ≈65).
       13 ve 15 ölçeğin arasına düşüyor, en yakın basamaklara yuvarlandı (`metrics.ts`in kuralı). */
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  gate_picked: {
    borderColor: operationsTheme.colors['success-line'],
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  gate_none: {
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  gate_unset: {
    borderColor: operationsTheme.colors['warning-line'],
    backgroundColor: operationsTheme.colors['warning-bg'],
  },
  gateIcon: {
    /* Tasarım 36×36 · köşe 12. Kare `space` ölçeğinden (30) okunuyordu ve hem küçüktü hem yanlış
       aileden: bu bir BOŞLUK değil, satırın baş karesi. `listAvatar` (34) aynı rolün resmî durağı
       ve Δ2 — dosyanın "yakın ölçü ayrı ad almaz" kuralı. Köşe `tight`(8) değil `badge`(12):
       resmî mobil sette rozet kademesi zaten 12. */
    width: operationsTheme.size.listAvatar,
    height: operationsTheme.size.listAvatar,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateIcon_picked: { backgroundColor: operationsTheme.colors['olive-bg'] },
  gateIcon_none: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  gateIcon_unset: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  gateEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  gateValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    /* Tasarım 13,5/700 — `button` kademesinin ta kendisi. `helper`(12) yazılıydı: satırın taşıdığı
       KARAR (hangi araç) ekranın en küçük yazısıyla söyleniyordu. */
    fontSize: operationsTheme.text.button,
  },
  gateValue_picked: { color: operationsTheme.colors.ink },
  gateValue_none: { color: operationsTheme.colors.body },
  gateValue_unset: { color: operationsTheme.colors.warehouse },
  gateAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    /* Tasarım 11,5/700 → `tag`(11); `meta`(10,5) künye ölçüsüdür, dokunulacak bir eylemin değil. */
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /* ── ARAÇ ÇEKMECESİ ─────────────────────────────────────────────────────── */
  sheetNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /*
    ÖLÇÜLER TASARIM GÖRÜNTÜSÜNDEN (kullanıcı bulgusu 01.09: *"araç seçme çekmecesi ile tasarım
    arası ölçü farkları var"*). `03-Sefer-ve-Arac/02` karesinden piksel ölçüldü (@2×, tasarım px):
    satır YÜKSEKLİĞİ 94 · yan dolgu 17 · radyo 28 · radyo–metin arası 12.

    Bizde satır ~52 idi: aynı satır tasarımdan kırk piksel kısaydı ve çekmece sıkışık okunuyordu.
    Yükseklik dolgudan geliyor (sabit bir sayı yazılmadı): 30+30 dolgu + iki satır metin ≈ 96.
  */
  option: {
    minHeight: operationsTheme.size.controlLg,
    paddingVertical: operationsTheme.space['8xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  optionSolid: {
    borderStyle: 'solid',
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  /** "Araçsız devam et" KESİKLİ (v3:17): meşru bir seçim ama varsayılan değil. */
  optionDashed: {
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    backgroundColor: 'transparent',
  },
  optionOn: {
    borderStyle: 'solid',
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  optionTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  radio: {
    /* Boşluk ölçeğinden (22) alınıyordu; bu bir aralık değil ÖĞENİN kendi ölçüsü ve tasarımda 28. */
    width: operationsTheme.size.radioMark,
    height: operationsTheme.size.radioMark,
    borderRadius: operationsTheme.radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: operationsTheme.colors['olive-dark'] },
  radioOff: { borderColor: operationsTheme.colors['sand-500'] },
  radioDot: {
    width: operationsTheme.space.lg,
    height: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors['olive-dark'],
  },
  rowText: { flex: 1, gap: operationsTheme.space['2xs'], minWidth: 0 },
  rowMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  card: {
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  cardOn: { borderColor: operationsTheme.colors['olive-line'], backgroundColor: operationsTheme.colors['olive-bg'] },
  cardOff: { borderColor: operationsTheme.colors['neutral-bg'], backgroundColor: operationsTheme.colors.panel },
  cardTaken: { borderColor: operationsTheme.colors['neutral-bg'], backgroundColor: 'transparent' },
  cardTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.ink,
  },
  cardTitleTaken: { color: operationsTheme.colors.muted },
  /** Onay kutusu — çoklu seçimin işareti; tek seçimde kenarlık yeterdi. */
  check: {
    width: operationsTheme.space['6xl'],
    height: operationsTheme.space['6xl'],
    borderRadius: operationsTheme.radius.tight,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-dark'],
  },
  checkOff: { borderColor: operationsTheme.colors['neutral-bg'], backgroundColor: 'transparent' },
  checkMark: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.cream,
  },
  takenNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Alınmış rota — kimin sürdüğü UYARI değil bir GERÇEK; terracotta, hata kırmızısı değil. */
  takenNoteBusy: { color: operationsTheme.colors.terracotta },
  takenNoteOn: { color: operationsTheme.colors['olive-dark'] },
  /** Sefer künyesi sağ uçta — kartın en sessiz öğesi (v3:17 `#b3ab97`). */
  cardRef: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
  summary: {
    marginTop: operationsTheme.space.xl,
    minHeight: SUMMARY_BOX_MIN_HEIGHT,
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    /* AÇIKÇA `solid` (cihazda ölçüldü 31.08): boş hâlin kesikli kutusuyla aynı konumda çizildiği
       için RN kenar stilini devralıyor ve dolu özet de kesikli görünüyordu. Varsayılana
       güvenmek, iki hâlin sırasına güvenmek demek. */
    borderStyle: 'solid',
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.lg,
  },
  /** Blok başlığı bir ROZET (v3:17): "ARACA ALINACAKLAR" zeytin çipin içinde, sola yaslı. */
  summaryBadge: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors['olive-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.olive,
  },
  summaryGrid: { flexDirection: 'row' },
  summaryCell: { flex: 1, gap: 1 },
  /** Sütun ayracı (v3:17 `border-left:1px solid #e2ddcc`) — ilk sütunda yok. */
  summaryCellDivided: {
    borderLeftWidth: 1,
    borderLeftColor: operationsTheme.colors['sand-200'],
    paddingLeft: operationsTheme.space.lg,
  },
  summaryValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h1--font-weight']],
    /* v3:17 `600 20px 'Lora'` = ölçeğin `h2-sm` kademesi; yeni bir durak açılmadı. */
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  summaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Seçim yokken KESİKLİ kutu (v3:17 `secimBos`) — bir eksik değil, bir bekleyiş. */
  summaryIdleBox: {
    marginTop: operationsTheme.space.xl,
    minHeight: SUMMARY_BOX_MIN_HEIGHT,
    /* İki satır az yer tuttuğu için ortalanıyor: tabanı yükseltip metni yukarıda bırakmak,
       kutunun altında sebepsiz bir boşluk gösterirdi. */
    justifyContent: 'center',
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    gap: operationsTheme.space['2xs'],
  },
  summaryIdle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  note: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
});
