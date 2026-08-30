import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsIdentity } from '@/screens/operations/sections-context';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { useCourierDay } from './use-courier-day.hook';

/*
  K · SEFER KÜNYESİ (Operasyon Mobil v3:1367-1399) — yola çıkmadan önce "ne taşıyorum" ekranı.

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Kurye rampaya indiğinde üç sayıyı bilmek ister: kaç durak, kaç kutu, kaç tahsilat. v2'de bu
  üçü hiçbir yerde YAN YANA yoktu — durak sayısı listeden sayılıyordu, kutu sayısı yükleme
  satırında, tahsilat ise gün özetinde. Üçünü ayrı yerlerden toplamak, günü zihinde kurmayı
  kuryeye bırakıyordu.

  ── ÜÇ SAYI DA LİSTEDEN TÜRER ───────────────────────────────────────────────
  Yeni uç istemiyor: duraklar zaten geliyor, kutular durakların içinde (`stop.boxes`), kapıda
  tahsilat da durağın `doorAmountCents`ından. Dördüncü bir "özet" ucu, aynı gerçeği bir kez daha
  okumak olurdu (depo hub'ının aynı kuralı).

  ── ARAÇ VE DEPO ADI YAZILMADI ──────────────────────────────────────────────
  Şablon "FR-482-BX · soğutmalı panelvan" ve rota zincirini (Strasbourg → Krutenau → …) yazıyor.
  Gün yanıtının `run`u yalnız `vehicleId` taşıyor, ADI yok; `warehouseName` de rota SEÇİM
  listesinde var, günün seferinde değil. Uydurma bir plaka, kuryeyi yanlış aracın önüne gönderir
  (CLAUDE §1) — alan geldiği gün buraya yazılır. Uyuşmazlık defterinde.
*/

const t = courierCopy;

/*
  İLK YÜK İSKELETİ — ekranın kendi blokları: künye kartı (dolgu 14×2 + başlık + rota zinciri +
  üç sayı hücresi + not, aralarında `xl`), sonra araç satırı ve dipnot — ikisi de tek satırlık
  metin. İnce iki kutu bilerek: yer tutucu gelecek satırın KALINLIĞINI de söyler, hepsini kart
  boyunda çizmek sayfayı olduğundan dolu gösterirdi.
*/
const TRIP_SKELETON = { card: 160, note: 18 } as const;

export function CourierTripScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const identity = useOperationsIdentity();

  const header = (
    <OperationsStackHeader
      title={t.day.trip.title}
      subtitle={fillCopy(t.day.trip.context, { courier: identity.name })}
      onBack={() => router.back()}
      backLabel={t.day.load.back}
      testID="courier-trip-header"
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-trip">
        {header}
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[TRIP_SKELETON.card, TRIP_SKELETON.note, TRIP_SKELETON.note]}
            label={t.day.loading}
            testID="courier-trip-loading"
          />
        </View>
      </View>
    );
  }

  /* SEFER YOKSA KÜNYE DE YOK: bu ekran açık bir seferi anlatır, açılacak seferi değil — rota
     seçimi günün rotasında yapılır ve iki yerde iki kapı, birinin bir gün ötekinden ayrılmasıdır. */
  if (day.run === null) {
    return (
      <View style={styles.screen} testID="courier-trip">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.day.empty.title}
            description={t.day.empty.body}
            testID="courier-trip-empty"
          />
        </View>
      </View>
    );
  }

  const boxTotal = day.stops.reduce((sum, stop) => sum + stop.boxes.length, 0);
  /* "Tahsilat" = kapıda parası kalan durak. Ölçü günün rotasındakiyle AYNI (`payment.dueAmountCents`);
     ayrı bir tanım yazmak, iki ekranın aynı seferi iki farklı sayıyla anlatması demekti. */
  const doorCount = day.stops.filter((stop) => (stop.payment.dueAmountCents ?? 0) > 0).length;

  return (
    <View style={styles.screen} testID="courier-trip">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="courier-trip-list">
        <View style={styles.card} testID="courier-trip-card">
          <View style={styles.cardHead}>
            <Text style={styles.assigned}>{t.day.trip.assigned}</Text>
            {/* BAŞLIKTA YALNIZ REFERANS — rota adı alttaki zincirde (30.08). `runLabel` ikisini
                birleştiriyor ("Kuzey rotası · SF-26-…") ve zincir gelince aynı ad kartta İKİ KEZ
                görünüyordu. `runLabel` paylaşılan bir yardımcı, öteki ekranlarda birleşik hâli
                doğru; değişen yalnız BU kartın ne söylediği. */}
            <Text style={styles.reference}>{day.run.referenceNo}</Text>
          </View>

          {/* ROTA ZİNCİRİ — "nereden nereye" (30.08 · uyuşmazlık #12 kapandı).
              Depo adı okunamazsa uydurma bir ad yerine SEBEP yazılır: yanlış rampaya gönderilen
              kurye, boş bir satırdan daha pahalıdır (CLAUDE §1). */}
          <Text style={styles.route} testID="courier-trip-route">
            {day.run.warehouseName === null
              ? t.day.trip.routeUnknown
              : fillCopy(t.day.trip.route, { warehouse: day.run.warehouseName, zone: day.run.zoneName ?? '—' })}
          </Text>

          {/* ÜÇ SAYI YAN YANA — kuryenin rampada sorduğu üç soru, tek bakışta. */}
          <View style={styles.counts}>
            {[
              { key: 'stops', value: day.stops.length, label: t.day.trip.stops },
              { key: 'boxes', value: boxTotal, label: t.day.trip.boxes },
              { key: 'collections', value: doorCount, label: t.day.trip.collections },
            ].map((cell, index) => (
              <View key={cell.key} style={[styles.countCell, index === 0 ? null : styles.countCellDivided]}>
                <Text style={styles.countValue} testID={`courier-trip-${cell.key}`}>
                  {String(cell.value)}
                </Text>
                <Text style={styles.countLabel}>{cell.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.routeNote}>{t.day.trip.routeNote}</Text>
        </View>

        {/* ARAÇ — 30.08'e kadar burada "künye bu ekrana ulaşmıyor" yazıyordu; alan geldi.
            İki hâl AYRI cümle: adı olmayan araç ile araçsız sefer aynı şey değil — birincisi bir
            eksik, ikincisi meşru bir kurulum (araç kaydı zorunlu değil). */}
        <Text style={styles.vehicleNote} testID="courier-trip-vehicle">
          {day.run.vehicleLabel === null
            ? t.day.trip.vehicleNone
            : fillCopy(t.day.trip.vehicle, { vehicle: day.run.vehicleLabel })}
        </Text>

        <Text style={styles.footnote}>{t.day.trip.footnote}</Text>
      </ScrollView>

      <View style={styles.sticky}>
        <PressableSurface
          onPress={() => router.navigate('/load')}
          feedback="shadow"
          style={styles.cta}
          accessibilityLabel={t.day.trip.cta}
          testID="courier-trip-cta"
        >
          <Text style={styles.ctaLabel}>{t.day.trip.cta}</Text>
        </PressableSurface>
      </View>
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
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },
  card: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.xl,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  assigned: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['olive-dark'],
  },
  reference: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  counts: {
    flexDirection: 'row',
  },
  countCell: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  countCellDivided: {
    borderLeftWidth: operationsTheme.border.hairline,
    borderLeftColor: operationsTheme.colors['sand-300'],
    paddingLeft: operationsTheme.space.xl,
  },
  countValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  countLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Rota zinciri — künyenin kimlik satırı: sayaçlardan önce "nereden nereye" okunur. */
  route: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
    marginTop: operationsTheme.space.xs,
  },
  routeNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  vehicleNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
  },
  cta: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.ink,
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
