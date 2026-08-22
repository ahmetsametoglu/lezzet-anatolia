import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRoute, CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { NotificationBell } from '@/components/operations/notification-bell';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayLabel, money, runLabel, shortName, turkishUpper } from './courier-format';
import { isRouteFree, useCourierDay } from './use-courier-day.hook';

/*
  K1 · GÜNÜN SEFERİ (v2:33-94) — kurye bölümünün kökü.

  ── BÖLÜM KÖKÜ ARTIK KENDİ GÖVDESİNİ ÇİZİYOR ────────────────────────────────
  Kabuk dilimi (21.9) dört bölümü tek `OperationsSectionScreen`den çiziyordu ve künyesinde
  "ayrıştıkları yer GÖVDEDİR" diyordu. Kurye gövdesi geldiği için bu ekran o ortak iskeletin
  BAŞLIĞINI kullanıyor (`OperationsSectionHeader` + zil, birebir aynı) ama gövdesini kendi
  yazıyor. Depo/Yönetim/Para hâlâ ortak ekranda.

  ── ÜSTBAŞLIĞIN KUYRUĞU ARTIK VERİ ──────────────────────────────────────────
  v2:38 "KURYE · 8 AĞUSTOS · MUSA K." diyor. Gün UÇTAN gelir (`date` cevabın zorunlu alanı —
  istemci kendi hesaplamaz), ad kapıdan (`/me`, oturum bağlamı). Gün henüz okunmadıysa parça
  YAZILMAZ: uydurma bir tarih, kuryenin hangi günü gördüğü sorusunu yanlış cevaplardı.

  ── GÖVDENİN DÖRDÜNCÜ HÂLİ: ROTA SEÇİMİ (18.08 · sefer) ─────────────────────
  Kurye artık rotasını KENDİ alıyor ("kurye giriş yapar, rotayı seçer, aracını doldurur, o rotayı
  sürer" — kullanıcı kararı 17.08); arayüzden kurye ataması kalktı. Sefer yoksa (`run === null`)
  gövde o günün rotalarını kart olarak gösterir ve CTA seçilen rotayla seferi açar. Ayrı bir ekran
  DEĞİL, aynı gövdenin bir hâli: seçim tek dokunuş + tek düğme, araya bir yönlendirme koymak
  kuryeyi sabahın en acele anında bir ekran daha gezdirmek olurdu.
  · **Tek adayda soru sorulmaz:** tek seçilebilir rota kendiliğinden seçilidir, CTA doğrudan onun
    adını taşır (dispatch'in aynı ilkesi).
  · **Başlatılmış rota PASİF:** rota+gün başına tek sefer (K3) — kart kimin sürdüğünü söyler.
  · Sıfır rota → eski "bugün rota yok" boş hâli; seçilecek bir şey olmadığında CTA da çizilmez.
  Kart, durak satırının SADELEŞMİŞ hâlidir (aynı daire + iki satır + kesikli ayraç): yeni bir
  görsel dil kurulmadı.

  ── SEFER KÜNYESİ LİSTENİN BAŞINDA ──────────────────────────────────────────
  "Hangi seferi sürüyorum" sorusu ilerleme satırının üstünde, tek satırda cevaplanıyor: rota adı +
  SF kodu (kapanmışsa "KAPANDI" eki). Üstbaşlığa sıkıştırılmadı — orada gün ve kurye var, üçüncü
  bir kimlik o satırı okunmaz yapardı.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi.** v2'nin demo sözlüğünde üç veri hâli var (dolu/boş/hata) ve
     "yükleniyor" yok — çünkü şablon veriyi yerel dizeden okuyor, ağ yok. Gerçek ekranda o hâl VAR
     ve boş listeyle göstermek "bugün rota yok" demek olurdu.
  2. **"Eşitlenmeyi bekliyor" rozeti ve "eşitleme reddi" kartı ÇİZİLMEDİ** (v2:69-74, 83). İkisi de
     ÇEVRİMDIŞI KUYRUĞUN göstergeleridir ve kuyruk bu dilimde yok (21.13 hattı). Fixture'la
     doldurmak, olmayan bir makinenin ekranını çizmek olurdu; yerine dürüst davranış kondu —
     bağlantı yokken işaret gönderilemez ve teslimat ekranı bunu hata olarak söyler.
  3. **"±" (kısmi) durak dairesi hiç doğmaz** (v2:852). Sözleşmenin durak sonucu dörtlü:
     `pending · delivered · unreachable · refused` — "kısmi" ayrı bir sonuç DEĞİL, teslim edilmiş
     bir durağın kalan borcudur. O bilgi satırın alt metninde yazılıyor.
  4. **"Seferi başlat"ın sonucu için bir bildirim satırı eklendi** (v2'de yok — şablonun düğmesi
     yalnız yerel bir bayrak çeviriyor, ağa çıkmıyor). Gerçek kapı KISMİ başarı döndürebiliyor ("3
     yola çıktı, 1 hazırlanmayı bekliyor") ve o cümlenin yazılacak bir yeri olmadan cevap yutulurdu.
     Yapışkan alana, CTA'nın ÜSTÜNE kondu: kurye listenin neresinde olursa olsun görür.
*/

const t = courierCopy;
const shell = operationsCopy;

/** Durak dairesinin dört hâli — v2:851-855'in renk üçlüleri, token karşılıklarıyla. */
type CircleTone = 'delivered' | 'issue' | 'next' | 'idle';

export function CourierDayScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  const unread = useOperationsNotifications().length;

  const stops = day.stops;
  const doneCount = stops.filter((stop) => stop.outcome === 'delivered').length;
  const issueCount = stops.filter((stop) => stop.outcome === 'unreachable' || stop.outcome === 'refused').length;
  const openCount = stops.length - doneCount - issueCount;
  const doorStops = stops.filter((stop) => stop.outcome === 'pending' && stop.payment.dueAmountCents !== null);
  const doorTotal = doorStops.reduce((total, stop) => total + (stop.payment.dueAmountCents ?? 0), 0);
  /** Sıradaki durak — v2:848: ilk sonuçlanmamış durak, koyu daireyle işaretlenir. */
  const nextOrderId = stops.find((stop) => stop.outcome === 'pending')?.orderId ?? null;

  /** Seçili rota — CTA'nın adını taşıdığı rota; yoksa kurye henüz seçmemiş demektir. */
  const selectedRoute = day.routes.find((route) => route.zoneId === day.selectedZoneId) ?? null;
  /** Bugün açılabilecek rota var mı — hepsi başlatılmışsa seçilecek bir şey de yok (K3). */
  const anyFreeRoute = day.routes.some(isRouteFree);
  /** Başlatma havadayken düğme kendi hâlini söyler — basılamaz olduğu ayrıca `disabled`la duyulur. */
  const ctaStartLabel = day.starting
    ? t.day.starting
    : selectedRoute === null
      ? t.day.startCtaPick
      : fillCopy(t.day.startCta, { route: selectedRoute.zoneName });

  const eyebrow = [t.day.eyebrow, day.date === null ? null : dayLabel(day.date), turkishUpper(shortName(userName))]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  const header = (
    <OperationsSectionHeader
      section="courier"
      eyebrow={eyebrow}
      title={t.day.title}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={
            unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })
          }
          count={unread}
          testID="operations-bell"
        />
      }
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.day.loading} label={t.day.loading} testID="courier-day-loading" />
        </View>
      </View>
    );
  }

  if (day.status === 'error') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.day.error.title}
            description={t.day.error.body}
            retry={{ label: t.day.error.retry, onPress: day.reload }}
            testID="courier-day-error"
          />
        </View>
      </View>
    );
  }

  const run = day.run;
  /* SEÇİM GÖVDESİ iki hâlde açılır: sefer hiç alınmadı ya da sürülen sefer KAPANDI (kullanıcı
     akışı: kapat → yeni sefer; kurye günün ikinci ROTASINA çıkar, aynı rotaya ikinci tur veride
     yasak). Kapanan seferin künyesi üstte bilgi şeridi olarak kalır — "neyi bitirdim" sorusu
     ekrandan silinmez. */
  const selecting = run === null || run.closed;

  /* CTA'nın hâli GÖVDEYİ izler: açık sefer varsa "kapat", seçim gövdesinde "başlat". Seçilecek rota
     kalmamışsa (hepsi başlatılmış) düğme hiç çizilmez — basılamayacak bir düğme, kuryeye olmayan
     bir yol vaat etmektir. Rota VAR ama seçilmemişse düğme çizilir ve PASİF durur: "önce seç"
     görünen bir adımdır, gizlenen bir düğmeden anlaşılmaz. */
  const ctaMode: 'start' | 'close' | null = selecting ? (anyFreeRoute ? 'start' : null) : 'close';

  /* Seçim gövdesinin TEK açıklama satırı — hangi cümlenin hak edildiği burada, tek yerde
     kararlaşır. İki kutuyu üst üste koymak (hem "sefer kapandı" hem "rotanı seç") aynı anda iki
     şey söylemek olurdu; kapanmış seferde ne olduğunu söylemek önceliklidir, ne yapılacağını
     zaten "ROTANI SEÇ" başlığı ve kartlar söylüyor. Rota hiç yoksa cümle boş blokta yazılı. */
  const selectionHint =
    run !== null
      ? t.day.runClosedHint
      : day.routes.length === 0
        ? null
        : anyFreeRoute
          ? t.day.routes.hint
          : t.day.routes.allTaken;

  return (
    <View style={styles.screen} testID="operations-section-courier">
      {header}

      {selecting ? (
        <ScrollView contentContainerStyle={styles.list} testID="courier-day-routes">
          {/* Kapanan seferin künyesi: "neyi bitirdim" sorusu ekrandan silinmez. */}
          {run === null ? null : (
            <Text style={styles.runStrip} testID="courier-day-run">
              {fillCopy(t.day.runStripClosed, { label: runLabel(run) })}
            </Text>
          )}
          {selectionHint === null ? null : (
            <View style={styles.hintBox} testID="courier-day-hint">
              <Text style={styles.hintText}>{selectionHint}</Text>
            </View>
          )}

          {day.routes.length === 0 ? (
            // Kapanan seferden sonra açılacak rota kalmamış olabilir: gün bitti, bu bir arıza değil.
            // Boş listenin İKİ sebebi var ve uç ikisini ayırmıyor (21.08 depo kapsamı süzgeci —
            // `listCourierRoutes(scope)` fail-closed): ya o gün rota yazılmamıştır, ya kuryenin
            // depo kapsamı boştur. Bu yüzden cümle tek sebep SÖYLEMEZ — "sevkiyat yazmadı" demek,
            // kapsamı unutulmuş kuryeye yanlış sebep okutup arızayı görünmez kılardı.
            <View style={styles.emptyInline}>
              <OperationsNoticeBlock
                variant="empty"
                title={t.day.empty.title}
                description={t.day.empty.body}
                testID="courier-day-empty"
              />
            </View>
          ) : (
            <>
              <Text style={styles.routesHeading}>{t.day.routes.heading}</Text>

              {day.routes.map((route) => (
                <RouteCard
                  key={route.zoneId}
                  route={route}
                  selected={route.zoneId === day.selectedZoneId}
                  onPress={() => day.selectRoute(route.zoneId)}
                />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list} testID="courier-day-list">
          {/* Buraya yalnız AÇIK seferle gelinir; künye sade hâliyle yazılır. */}
          <Text style={styles.runStrip} testID="courier-day-run">
            {runLabel(run)}
          </Text>

          {stops.length === 0 ? (
            <OperationsNoticeBlock
              variant="empty"
              title={t.day.runEmpty.title}
              description={t.day.runEmpty.body}
              testID="courier-day-empty"
            />
          ) : (
            <>
              <View style={styles.progressRow}>
                <Text style={styles.progressCount}>
                  {doneCount}
                  <Text style={styles.progressTotal}>{`/${stops.length}`}</Text>
                </Text>
                <View style={styles.progressTrack} testID="courier-day-progress">
                  <View style={[styles.progressFill, { width: `${Math.round((doneCount / stops.length) * 100)}%` }]} />
                </View>
                {/* Ölçülemeyen değer SIFIR DEĞİLDİR: taslak düştüyse "bilinmiyor" yazılır (CLAUDE §1). */}
                <Text style={styles.pocket}>
                  {day.collectedCents === null
                    ? t.day.pocketUnknown
                    : fillCopy(t.day.pocket, { amount: money(day.collectedCents) })}
                </Text>
              </View>

              {doorStops.length === 0 ? null : (
                <Text style={styles.doorLeft} testID="courier-day-door-left">
                  {fillCopy(t.day.doorLeft, { n: String(doorStops.length), amount: money(doorTotal) })}
                </Text>
              )}

              {stops.map((stop, index) => (
                <StopRow
                  key={stop.orderId}
                  stop={stop}
                  order={index + 1}
                  tone={circleTone(stop, stop.orderId === nextOrderId, day.started)}
                  started={day.started}
                  onPress={() =>
                    router.navigate({ pathname: '/delivery/[orderId]', params: { orderId: stop.orderId } })
                  }
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (v2:89). Bildirim de
          buradadır: başlatma sonucu, düğme çizilmese bile (rota kalmadı) görünmek zorunda. */}
      {ctaMode === null && day.startNotice === null ? null : (
        <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
          {day.startNotice === null ? null : (
            <View style={styles.startNoticeBlock}>
              <Text
                style={[styles.startNotice, styles[`startNotice_${day.startNotice.tone}`]]}
                accessibilityRole="alert"
                testID="courier-day-start-notice"
              >
                {day.startNotice.text}
              </Text>
              {/* Sefer açıldıktan sonra birincil düğme "Seferi kapat"a döner; hazırlığı geciken
                  durak için İKİNCİ bir başlatma yolu olmasaydı o durak uygulamadan yola
                  çıkarılamazdı. Uç bu ikinci basışta catch-up claim yapıyor (18.08). */}
              {day.startNotice.canRetry ? (
                <TextAction
                  label={t.day.start.retry}
                  onPress={day.start}
                  disabled={day.starting}
                  testID="courier-day-start-retry"
                />
              ) : null}
            </View>
          )}
          {ctaMode === null ? null : (
            <PressableSurface
              onPress={ctaMode === 'close' ? () => router.navigate('/day-close') : day.start}
              // Rota seçilmeden başlatma isteği gönderilmez: hangi rotanın açıldığı belirsiz kalırdı.
              disabled={day.starting || (ctaMode === 'start' && day.selectedZoneId === null)}
              feedback="shadow"
              style={[
                styles.cta,
                ctaMode === 'close' ? styles.ctaClose : day.selectedZoneId === null ? styles.ctaIdle : styles.ctaStart,
              ]}
              accessibilityLabel={ctaMode === 'close' ? t.day.close : ctaStartLabel}
              testID="courier-day-cta"
            >
              <Text
                style={[
                  styles.ctaLabel,
                  ctaMode === 'close'
                    ? styles.ctaLabelClose
                    : day.selectedZoneId === null
                      ? styles.ctaLabelIdle
                      : styles.ctaLabelStart,
                ]}
              >
                {ctaMode === 'close' ? t.day.close : ctaStartLabel}
              </Text>
              {ctaMode === 'close' && openCount > 0 ? (
                <Text style={styles.ctaBadge}>{fillCopy(t.day.openBadge, { n: String(openCount) })}</Text>
              ) : null}
            </PressableSurface>
          )}
        </LinearGradient>
      )}
    </View>
  );
}

interface RouteCardProps {
  route: CourierRoute;
  selected: boolean;
  onPress: () => void;
}

/**
 * ROTA KARTI — durak satırının sadeleşmiş hâli: aynı daire + iki satır + kesikli ayraç, yalnız
 * kapıya ait alanlar (tahsilat rozeti, sonuç tonu) yok.
 *
 * Seferi açılmış rota PASİFTİR ve sebebini kendi satırında söyler ("bugün Musa sürüyor · SF-…") —
 * dokunulabilir bırakıp reddi başlatma cevabında göstermek, kuryeyi bilerek boş bir yola sokardı.
 */
function RouteCard({ route, selected, onPress }: RouteCardProps) {
  const free = isRouteFree(route);
  const meta =
    route.warehouseName === null
      ? fillCopy(t.day.routes.metaNoWarehouse, { n: String(route.stopCount) })
      : fillCopy(t.day.routes.meta, { warehouse: route.warehouseName, n: String(route.stopCount) });
  const taken =
    route.run === null
      ? null
      : route.run.courierName === null
        ? fillCopy(t.day.routes.takenUnknown, { ref: route.run.referenceNo })
        : fillCopy(t.day.routes.taken, { courier: route.run.courierName, ref: route.run.referenceNo });

  return (
    <PressableSurface
      onPress={onPress}
      disabled={!free}
      feedback="scale"
      style={[styles.stopRow, free ? undefined : styles.stopLocked]}
      /* Pasif kartın adı "seç" DEMEZ: ekran okuyucu kullanan kurye, dokunamayacağı bir karta
         davet edilmemeli — sebebi (kimin sürdüğü) adın kendisidir. */
      accessibilityLabel={
        free ? fillCopy(t.day.routes.pickLabel, { route: route.zoneName, meta }) : `${route.zoneName} — ${taken ?? meta}`
      }
      selected={selected}
      testID={`courier-route-${route.zoneId}`}
    >
      <View style={[styles.circle, selected ? styles.circle_next : styles.circle_idle]}>
        <Text style={[styles.circleText, selected ? styles.circleText_next : styles.circleText_idle]}>
          {selected ? '✓' : '·'}
        </Text>
      </View>
      <View style={styles.stopBody}>
        <Text style={styles.stopAddress}>{route.zoneName}</Text>
        <Text style={[styles.stopSub, taken === null ? styles.stopSub_muted : styles.stopSub_terracotta]}>
          {taken ?? meta}
        </Text>
      </View>
      {free ? <Text style={styles.chevron}>›</Text> : null}
    </PressableSurface>
  );
}

/** v2:851-855 — sonuç dairesinin tonu. "Sıradaki" yalnız YOLA ÇIKILMIŞSA koyulur. */
function circleTone(stop: CourierStopContract, isNext: boolean, started: boolean): CircleTone {
  if (stop.outcome === 'delivered') return 'delivered';
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') return 'issue';
  return isNext && started ? 'next' : 'idle';
}

/** Durağın alt satırı (v2:856-861) — sonuç ne söylüyorsa o; iç durum adı ekrana sızmaz. */
function stopSubtitle(stop: CourierStopContract): { text: string; tone: 'muted' | 'error' | 'terracotta' } {
  const channel = t.channel[stop.channel];
  if (stop.outcome === 'delivered') {
    const due = stop.payment.dueAmountCents;
    return due === null
      ? { text: `${stop.customerName} · ${t.day.stop.delivered}`, tone: 'muted' }
      : {
          text: `${stop.customerName} · ${t.day.stop.delivered} · ${fillCopy(t.day.stop.deliveredDebt, { amount: money(due) })}`,
          tone: 'terracotta',
        };
  }
  if (stop.outcome === 'unreachable') return { text: `${stop.customerName} · ${t.day.stop.unreachable}`, tone: 'error' };
  if (stop.outcome === 'refused') return { text: `${stop.customerName} · ${t.day.stop.refused}`, tone: 'error' };

  const parts = [stop.customerName, channel, fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
  if (stop.attempts > 0) parts.push(fillCopy(t.day.stop.attempt, { n: String(stop.attempts + 1) }));
  if (stop.payment.dueAmountCents === null) parts.push(t.day.stop.noDebt);
  return { text: parts.join(' · '), tone: 'muted' };
}

interface StopRowProps {
  stop: CourierStopContract;
  /** Rota sırası (1'den) — daire boş hâlde bu sayıyı taşır. */
  order: number;
  tone: CircleTone;
  started: boolean;
  onPress: () => void;
}

function StopRow({ stop, order, tone, started, onPress }: StopRowProps) {
  const subtitle = stopSubtitle(stop);
  const address = stop.address ?? t.day.stop.noAddress;
  const due = stop.payment.dueAmountCents;
  const method = stop.payment.expectedMethod;
  const badge =
    stop.outcome === 'pending' && due !== null
      ? method === null
        ? fillCopy(t.day.stop.door, { amount: money(due) })
        : fillCopy(t.day.stop.doorWithMethod, { amount: money(due), method: turkishUpper(t.method[method]) })
      : null;

  return (
    <PressableSurface
      onPress={onPress}
      /* KAPI SIRASI: yola çıkılmadan durak açılmaz (v2:867 `if (!S.basladi) return`). Engel
         `disabled` ile veriliyor, sessiz bir `return` ile değil — ekran okuyucu da kapalı olduğunu
         duysun ve dokunuş görünürde işe yaramamış gibi durmasın. */
      disabled={!started}
      feedback="scale"
      style={[styles.stopRow, stop.outcome === 'delivered' ? styles.stopDone : started ? undefined : styles.stopLocked]}
      accessibilityLabel={fillCopy(t.day.stop.openLabel, { address, sub: subtitle.text })}
      accessibilityHint={started ? undefined : t.day.stop.lockedHint}
      testID={`courier-stop-${stop.orderId}`}
    >
      <View style={[styles.circle, styles[`circle_${tone}`]]}>
        <Text style={[styles.circleText, styles[`circleText_${tone}`]]}>{tone === 'delivered' ? '✓' : order}</Text>
      </View>
      <View style={styles.stopBody}>
        <Text style={[styles.stopAddress, stop.outcome === 'delivered' ? styles.stopAddressDone : undefined]}>
          {address}
        </Text>
        <Text style={[styles.stopSub, styles[`stopSub_${subtitle.tone}`]]}>{subtitle.text}</Text>
        {badge === null ? null : (
          <Text style={styles.stopBadge} testID={`courier-stop-door-${stop.orderId}`}>
            {badge}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableSurface>
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
  /** Kaydırma alanının İÇİNDEKİ boş blok — yatay dolgu kaptan gelir, yalnız üst nefes eklenir. */
  emptyInline: {
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    // Yapışkan CTA listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın (52 + nefes).
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingTop: operationsTheme.space.md,
  },
  progressCount: {
    // v2: `800 20px` — Karla'nın 800'ü YÜKLENMİYOR (fonts.ts üç ağırlık taşır) ve sahte kalın
    // Android'de çirkin durur; en yakın gerçek kesit 700.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  progressTotal: {
    fontFamily: operationsTheme.font.body[400],
    color: operationsTheme.colors.muted,
  },
  progressTrack: {
    flex: 1,
    height: operationsTheme.space.sm,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.olive,
  },
  pocket: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  doorLeft: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
    paddingTop: operationsTheme.space.sm,
  },
  /** Gövdenin açıklama kutusu — rota seçiminde "nasıl seçilir", kapanmış seferde "neden kilitli". */
  hintBox: {
    marginTop: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  hintText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** Rota listesinin üstbaşlığı — kapanış ekranının bölüm başlıklarıyla aynı kesit. */
  routesHeading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  /** Seferin künyesi — "Kuzey rotası · SF-26-…"; ilerleme satırının üstünde, sessiz. */
  runStrip: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  /** v2:864 — teslim edilen durak soluk, yola çıkılmamış liste de bir tık soluk. */
  stopDone: { opacity: 0.55 },
  stopLocked: { opacity: 0.75 },
  circle: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.pill,
    borderWidth: operationsTheme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle_delivered: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-bg'],
  },
  circle_issue: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-bg'],
  },
  circle_next: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  circle_idle: {
    backgroundColor: 'transparent',
    borderColor: operationsTheme.colors['sand-500'],
  },
  circleText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
  },
  circleText_delivered: { color: operationsTheme.colors['olive-dark'] },
  circleText_issue: { color: operationsTheme.colors.error },
  circleText_next: { color: operationsTheme.colors['on-image'] },
  circleText_idle: { color: operationsTheme.colors.muted },
  stopBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  stopAddress: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  stopAddressDone: {
    color: operationsTheme.colors.muted,
    textDecorationLine: 'line-through',
  },
  stopSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
  },
  stopSub_muted: { color: operationsTheme.colors.muted },
  stopSub_error: { color: operationsTheme.colors.error },
  stopSub_terracotta: { color: operationsTheme.colors.terracotta },
  stopBadge: {
    alignSelf: 'flex-start',
    marginTop: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  startNoticeBlock: {
    alignItems: 'flex-start',
    gap: operationsTheme.space.xs,
    marginBottom: operationsTheme.space.md,
  },
  startNotice: {
    alignSelf: 'stretch',
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  startNotice_ok: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  startNotice_warn: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  startNotice_error: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
  },
  ctaStart: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  /** Koyu CTA'nın gölgesi mürekkep OLAMAZ (görünmez) — kum gölge (`hard-on-ink`). */
  ctaClose: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
  },
  /** Rota seçilmemişken düğme PASİF durur (kapanış ekranının "zaten kapalı" çiftiyle aynı token). */
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabelStart: { color: operationsTheme.colors.card },
  ctaLabelClose: { color: operationsTheme.colors['on-image'] },
  ctaLabelIdle: { color: operationsTheme.colors['disabled-text'] },
  ctaBadge: {
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['ink-inset'],
    color: operationsTheme.colors['sand-150'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
});
