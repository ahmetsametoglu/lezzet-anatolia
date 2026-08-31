import { Fragment } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRoute, CourierVehicle } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayTagOf } from './day-tag';
import { isRouteFree, useCourierDay } from './use-courier-day.hook';

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

export function CourierRoutePickScreen() {
  const router = useRouter();
  const day = useCourierDay();

  const picked = day.routes.filter((route) => day.selectedZoneIds.includes(route.zoneId));
  const pickedStops = picked.reduce((sum, route) => sum + route.stopCount, 0);

  const header = (
    <OperationsStackHeader
      title={t.routePick.title}
      subtitle={t.routePick.context}
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

      <ScrollView contentContainerStyle={styles.list}>
        {/* ── ARAÇ ────────────────────────────────────────────────────── */}
        <Text style={styles.heading}>{t.day.vehicle.heading}</Text>
        {day.vehicles.length === 0 ? (
          <Text style={styles.note}>{t.day.vehicle.empty}</Text>
        ) : (
          day.vehicles.map((vehicle) => (
            <VehicleRow
              key={vehicle.vehicleId}
              vehicle={vehicle}
              selected={vehicle.vehicleId === day.selectedVehicleId}
              onPress={() =>
                day.selectVehicle(vehicle.vehicleId === day.selectedVehicleId ? null : vehicle.vehicleId)
              }
            />
          ))
        )}

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
            const usable = isRouteFree(route);
            /* GÜN ETİKETİ grup başlığı olarak (v3:17): araç birden çok günün seferini alabiliyor
               ve hangi günün rotasını işaretlediği kartın üstünde yazmalı. */
            const dayHead =
              route.day !== day.routes[index - 1]?.day ? (
                <Text style={styles.dayTag}>{dayTagOf(route.day, t)}</Text>
              ) : null;
            return (
              <Fragment key={route.zoneId}>
                {dayHead}
                <RouteCard route={route} selected={selected} usable={usable} onPress={() => day.toggleRoute(route.zoneId)} />
              </Fragment>
            );
          })
        )}

        {/* ── ARACA ALINACAKLAR ───────────────────────────────────────── */}
        <Text style={styles.headingSpaced}>{t.routePick.summaryHeading}</Text>
        <View style={styles.summary} testID="courier-route-pick-summary">
          {picked.length === 0 ? (
            <>
              <Text style={styles.summaryIdle}>{t.routePick.summaryIdle}</Text>
              <Text style={styles.note}>{t.routePick.summaryIdleBody}</Text>
            </>
          ) : (
            <Text style={styles.summaryValue}>
              {fillCopy(t.routePick.summary, { runs: String(picked.length), stops: String(pickedStops) })}
            </Text>
          )}
        </View>
      </ScrollView>

      <OperationsStickyBar>
        <PrimaryButton
          label={day.starting ? t.day.starting : picked.length === 0 ? t.day.openRuns.ctaIdle : t.day.openRuns.cta}
          onPress={day.openRuns}
          disabled={day.starting || picked.length === 0}
          tone="olive"
          elevation="flat"
          testID="courier-route-pick-cta"
        />
        {/* Kurulan seferin BAŞLAMADIĞINI düğmenin altında söylüyoruz: bu ekran müşteriye haber
            göndermiyor ve kurye onu bilmeli (v3:17'nin kendi dipnotu). */}
        <Text style={styles.footnote}>{t.day.openRuns.footnote}</Text>
        {day.startNotice === null ? null : (
          <Text
            style={[styles.footnote, day.startNotice.tone === 'error' ? styles.footnoteError : null]}
            testID="courier-route-pick-notice"
          >
            {day.startNotice.text}
          </Text>
        )}
      </OperationsStickyBar>
    </View>
  );
}

/** Araç satırı — tek seçim; seçili hâl kenarlıkla işaretlenir (v3:17'nin kendi deseni). */
function VehicleRow({
  vehicle,
  selected,
  onPress,
}: {
  vehicle: CourierVehicle;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.row, selected ? styles.rowOn : styles.rowOff]}
      accessibilityLabel={vehicle.label ?? vehicle.plate}
      testID={`courier-vehicle-${vehicle.vehicleId}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{vehicle.label ?? vehicle.plate}</Text>
        {vehicle.label === null ? null : <Text style={styles.rowMeta}>{vehicle.plate}</Text>}
      </View>
      {selected ? <Text style={styles.tick}>✓</Text> : null}
    </PressableSurface>
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
  usable,
  onPress,
}: {
  route: CourierRoute;
  selected: boolean;
  usable: boolean;
  onPress: () => void;
}) {
  const meta = fillCopy(t.routePick.routeMeta, {
    warehouse: route.warehouseName ?? t.routePick.warehouseUnknown,
    stops: String(route.stopCount),
  });
  return (
    <PressableSurface
      onPress={onPress}
      disabled={!usable}
      feedback="scale"
      style={[styles.card, selected ? styles.cardOn : usable ? styles.cardOff : styles.cardTaken]}
      accessibilityLabel={route.zoneName}
      testID={`courier-route-${route.zoneId}`}
    >
      <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
        <Text style={selected ? styles.checkMarkOn : styles.checkMarkOff}>✓</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.cardTitle, usable ? null : styles.cardTitleTaken]}>{route.zoneName}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        {route.run === null ? null : (
          <Text style={styles.takenNote}>
            {fillCopy(t.routePick.taken, { courier: route.run.courierName ?? t.routePick.someone })}
          </Text>
        )}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['2xl'],
    paddingBottom: operationsTheme.space['9xl'],
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
  row: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  rowOn: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  rowOff: { borderColor: operationsTheme.colors['neutral-bg'], backgroundColor: 'transparent' },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  tick: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
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
  checkMarkOn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.cream,
  },
  checkMarkOff: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: 'transparent',
  },
  takenNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  summary: {
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    gap: operationsTheme.space.xs,
  },
  summaryValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h1--font-weight']],
    fontSize: operationsTheme.text.h2,
    color: operationsTheme.colors.ink,
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
  footnoteError: { color: operationsTheme.colors.error },
});
