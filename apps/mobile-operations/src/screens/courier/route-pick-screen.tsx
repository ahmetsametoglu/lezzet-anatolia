import { Fragment, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRoute } from '@lezzet/types';

import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { timeOf } from '@/lib/operations/stamp';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy } from './copy';
import { dayTagOf } from './day-tag';
import { isRouteFree, routeHasWork, routeKeyOf, useCourierDay } from './use-courier-day.hook';

/*
  Kurulacak seferlerin seçildiği ekran: araç (tek seçim), seferler (çoklu, güne göre gruplu) ve seçimin toplamı.
  Gün ekranından ayrıdır, çünkü sefer açıkken de araca sefer eklemek için açılır.
*/

const t = courierCopy;

/** İlk yük iskeleti — araç satırı ve iki rota kartı; ekranın gerçekten çizdiği bloklar. */
const PICK_SKELETON = { vehicle: 62, route: 96 } as const;

/**
 * Özet bloğunun iki hâli (bekleyiş kutusu ve üç sayılık özet) aynı tabanı taşır ki işaretleme altındaki öğeleri zıplatmasın.
 * Değer dolu hâlin doğal yüksekliğidir (dp); dolu hâl büyürse bu sayı da onunla güncellenir.
 */
const SUMMARY_BOX_MIN_HEIGHT = 102;

export function CourierRoutePickScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  /* Araç seçimi tek satır + çekmece: satır kararın hâlini söyler ve dört araçlı depoda liste rota bölümünü ekran dışına itmez. */
  const [vehicleSheet, setVehicleSheet] = useState(false);
  /* "Araçsız devam" açık bir seçimdir: `null` araç "henüz seçmedim" ile "araçsız gideceğim"i ayıramaz, düğme eksiği ancak böyle söyler. */
  const [noVehicle, setNoVehicle] = useState(false);
  /* Listenin alt boşluğu yapışkan çubuğun ölçülen yüksekliğidir, çünkü çubuk dipnotla birlikte büyür ve sabit bir değer son kartı örter.
     İlk değer 0: uydurma bir başlangıç, ölçüm gelince listeyi zıplatırdı. */
  const [barHeight, setBarHeight] = useState(0);
  const vehicle = day.vehicles.find((row) => row.vehicleId === day.selectedVehicleId) ?? null;
  const vehicleDecided = vehicle !== null || noVehicle;

  const picked = day.routes.filter((route) => day.selectedRouteKeys.includes(routeKeyOf(route)));
  const pickedStops = picked.reduce((sum, route) => sum + route.stopCount, 0);
  const pickedBoxes = picked.reduce((sum, route) => sum + route.boxCount, 0);
  const ready = picked.length > 0 && vehicleDecided;

  /* Çıkış deposu rotalardan okunur: liste zaten kuryenin kapsamına süzülü (`listCourierRoutes`
     `scope`u), yani ilk rotanın deposu kuryenin deposudur. Okunamazsa ad YAZILMAZ. */
  const warehouseName = day.routes.find((route) => route.warehouseName !== null)?.warehouseName ?? null;

  const header = (
    <OperationsStackHeader
      title={t.routePick.title}
      /* Bağlam satırı kim ve hangi depo; yönerge zaten başlıkta yazıyor. */
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
      {/* Başlık kaydırıcının içinde, çünkü yapışkan mikro başlık ve alt çubuk gizlemesi bu kaptan beslenir; dışarıda kalsaydı mikro
          şerit inince altında asılı kalırdı. */}
      <OperationsScreenScroll
        title={t.routePick.title}
        caption={operationsCopy.sections.courier.tab}
        contentContainerStyle={[styles.list, { paddingBottom: barHeight + operationsTheme.space.xl }]}
      >
        <OperationsHeadBleed pad="5xl">{header}</OperationsHeadBleed>
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
            const key = routeKeyOf(route);
            const selected = day.selectedRouteKeys.includes(key);
            /* GÜN ETİKETİ grup başlığı olarak (v3:17): araç birden çok günün seferini alabiliyor
               ve hangi günün rotasını işaretlediği kartın üstünde yazmalı. */
            const dayHead =
              route.day !== day.routes[index - 1]?.day ? (
                <Text style={styles.dayTag}>{dayTagOf(route.day, t)}</Text>
              ) : null;
            return (
              <Fragment key={key}>
                {dayHead}
                <RouteCard route={route} selected={selected} onPress={() => day.toggleRoute(key)} />
              </Fragment>
            );
          })
        )}

        {/* Toplam bir onaydır: kurye düğmeye basmadan ne yüklediğini sefer, durak ve kutu olarak görür. Seçim yokken başlık çizilmez,
            boş hâl kendi kesikli kutusudur. */}
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
      </OperationsScreenScroll>

      <OperationsStickyBar onHeight={setBarHeight}>
        {/* Düğme eksik adımı söyler (önce sefer, sonra araç); tek bir pasif etiket hangi adımın eksik olduğunu söylemezdi. */}
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
            Kurulan sefer yüklemeye götürür, düğmenin sözü bu; yarım başarıda da gidilir, çünkü en az bir sefer kurulduysa yüklenecek kutu doğmuştur.
            `dismissTo`, çünkü bu ekrana gün ekranından ya da araçtaki seferlerden gelinir ve `navigate` ikinci yolda yığında iki kopya bırakırdı.
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
        {/* Kurmanın sonucu bildirimde (toast) söylenir: dipnot her zaman doğru bir kural, sonuç bir olaydır ve alt alta iki gri satır
            birbirine karışırdı. */}
      </OperationsStickyBar>

      {/* Araçsız seçenek kesikli çerçeveli ve listenin sonunda: meşru ama varsayılan değil. Araç kaydı yoksa açıklama bunu söyler, boş
          çekmece kuryeye kendi hatasıymış gibi görünürdü. */}
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

/** Araç kapısı ekranın ilk satırıdır ve kararın hâlini renkle söyler: seçilmemiş amber, araç seçili yeşil, araçsız nötr. */
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
 * Rota kartı; çoklu seçim olduğu için solda onay kutusu var, kurye kaçını işaretlediğini tek bakışta görür.
 * Seferi açılmış rota seçilemez ve pasif çizilir, kimin sürdüğü kartta yazar.
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
  /* Seçilemezliğin iki sebebi (başkasında · işi yok) ayrı cümledir; tek "seçilemez" hâli kuryeye yarın gelip gelmeyeceğini söylemezdi.
     Cümle gün söylemez, çünkü liste üç gün taşır ve kart zaten gün başlığının altındadır. */
  const free = isRouteFree(route);
  const hasWork = routeHasWork(route);
  const pickable = free && hasWork;
  /* Üç sayı kuryenin seçerken sorduğu soruları cevaplar (araca sığar mı, kaç kez para sayacağım); depo adı başlıkta, çünkü liste tek
     deponun. */
  const meta = fillCopy(t.routePick.routeMeta, {
    stops: String(route.stopCount),
    boxes: String(route.boxCount),
    collections: String(route.collectionCount),
  });
  /* Üçüncü satır kartın hâlini söyler (boşta · araca alınacak · kimin sürdüğü), işaretlemenin ne değiştirdiği karttan okunsun diye. */
  const note = !free
    ? [
        /* Kapanmış sefer geçmiş zamanla yazılır, yoksa kurye rotanın hâlâ yolda olduğunu sanır. */
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
      {/* İşaret yalnız seçiliyken çizilir: saydam renkli bir işaret cihazda görünür kalır ve her kutuyu işaretli gösterir. */}
      <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
        {selected ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.cardTitle, pickable ? null : styles.cardTitleTaken]}>{route.zoneName}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        {/* Geri getirilecek kutu ayrı satırdır: üç sayıya karışsaydı kurye onu teslim edilecek kutu sanar ve akşam sayısı tutmazdı.
            Sıfırsa çizilmez. */}
        {route.returningBoxCount > 0 ? (
          <Text style={styles.returning} testID={`courier-route-returning-${route.zoneId}`}>
            {fillCopy(t.routePick.returningBoxes, { n: String(route.returningBoxCount) })}
          </Text>
        ) : null}
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
    /* Yan boşluk tasarımın 20 px'idir; araç satırı ve rota listesi aynı kenarı taşır. */
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
  /* Araç kapısının üç hâli üç renk üçlüsüdür. Amber hâlin ikon karesi nötr kalır, çünkü tasarımdaki tek kullanımlık rengin token
     karşılığı yok; amber kimliği zemin, kenar, metin ve ikon çizgisinden gelir. */
  gate: {
    /* Ölçüler tasarımın `padding:13px 15px` · `gap:12px` değerleri, ölçeğin en yakın basamaklarına yuvarlandı. */
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
    /* Kare satırın baş öğesidir, boşluk değil: ölçü `listAvatar` (tasarım 36), köşe `badge` (12). */
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
    /* Tasarım 13,5/700 = `button` kademesi; satırın taşıdığı karar (hangi araç) ekranın en küçük yazısıyla söylenmez. */
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
  /* Satır ölçüleri tasarım karesinden: yükseklik dolgudan gelir (sabit sayı yazılmaz), yan dolgu 17, radyo 28, radyo–metin arası 12. */
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
    /* Öğenin kendi ölçüsü (tasarımda 28), boşluk ölçeğinden okunmaz. */
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
  /* Geri getirilecek kutu yük sayılarıyla aynı boyda ama terracotta: aynı aileden, ama bir ölçü değil bir uyarı. */
  returning: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  /** Kimin sürdüğü bir uyarı değil bir olgu; bu yüzden hata kırmızısı değil terracotta. */
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
    /* Açıkça `solid`: dolu özet boş hâlin kesikli kutusuyla aynı yerde çizilir ve RN kenar stilini devralır. */
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
