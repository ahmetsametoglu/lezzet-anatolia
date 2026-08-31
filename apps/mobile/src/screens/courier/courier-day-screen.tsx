import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierRoute, CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon-paths';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayLabel, money, runLabel, turkishUpper } from './courier-format';
import { timeOf } from '@/lib/operations/stamp';
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

/*
  İLK YÜK İSKELETİ — ölçüler bu ekranın KENDİ bloklarından (kit ölçüyü çağırandan alır,
  `skeleton-list.tsx` künyesi).

  Kutular sırayla: koyu özet kartı (dolgu 14×2 + baş 33 + çubuk 6 + kapı şeridi 34 + iki aralık),
  kapı satırı (dolgu 10×2 + ikon kutusu 46) ve ilk durak kartı (dolgu 10×2 + iki metin satırı).

  İKİ GÖVDE VAR, İSKELET BİR: sefer açıkken ekran özet kartıyla, seçim hâlindeyken satış kapısıyla
  başlıyor. Yer tutucu AÇIK SEFERİ tutuyor çünkü zıplamayı yaratan blok odur — seçim hâli gelirse
  yer tutucu bir tık cömert kalır, tersi olsaydı sayfa iskelet sönünce aşağı kayardı.
*/
const DAY_SKELETON = { summary: 120, gate: 66, stop: 58 } as const;

/**
 * Durak dairesinin BEŞ hâli — v3:14'ün renk üçlüleri, token karşılıklarıyla.
 *
 * `partial` 30.08'de AÇILDI ve bu bir karar dönüşüdür: v2 döneminde "kısmi ayrı bir sonuç değil"
 * diye kapatılmıştı, oysa veri onu zaten üretiyor (`fulfilledQty < qty`) ve v3 ayrı bir kartla
 * çiziyor. Sözleşmedeki `StopOutcome` yine DÖRTLÜ — kısmi bir geçiş değil, teslim edilmiş durağın
 * niteliği; ayrım yalnız BURADA, çizimde yaşıyor.
 */
type CircleTone = 'delivered' | 'partial' | 'issue' | 'next' | 'idle';

export function CourierDayScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  const unread = useOperationsNotifications().unread;

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

  /* ÜSTBAŞLIK "KURYE · 28 AĞUSTOS" (v3:1298) — kuryenin ADI buradan ÇIKTI ve bağlam satırına
     indi. Gerekçe: üstbaşlık "neredeyim"i söyler (bölüm + gün), bağlam satırı "kim ve hangi
     sefer"i. İkisi tek satıra sıkışınca sefer referansına yer kalmıyordu. */
  const eyebrow = [t.day.eyebrow, day.date === null ? null : dayLabel(day.date)]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  /* Bağlam satırı: ad + sefer künyesi. Sefer yoksa yalnız ad — olmayan bir referans uydurulmaz. */
  const context = day.run === null ? userName : `${userName} · ${runLabel(day.run)}`;

  const header = (
    <OperationsSectionHeader
      section="courier"
      eyebrow={eyebrow}
      title={t.day.title}
      /* BAĞLAM SATIRI (v3:1300) — "Marc Lemoine · SF-26-YRNWV9". Sefer referansı her ekranda
         AYNI yerde durmalı: künye özet kartının içinde olsaydı durak listesine inince kaybolur ve
         kurye "hangi seferdeyim" sorusunu ancak yukarı kaydırarak cevaplardı. */
      context={context}
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
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz ve söndüğü
            an sayfa zıplar; iskelet gelecek blokların ölçüsünü tutar. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[DAY_SKELETON.summary, DAY_SKELETON.gate, DAY_SKELETON.stop]}
            label={t.day.loading}
            testID="courier-day-loading"
          />
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
          {/* Satış kapısı BURADA DA var: şartı sefer değil ARAÇ. Sefer açılmadan da yoldan gelen
              müşteriye satış yapılabilir (21.119) — eski satırın kuralı korundu, biçimi değişti. */}
          <GateRow
            icon="sale"
            title={t.day.sale.label}
            meta={t.day.sale.meta}
            tone="invite"
            onPress={() => router.navigate('/sale')}
            testID="courier-day-sale"
          />

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
          {stops.length === 0 ? (
            <>
              {/* Künye burada AYRI kalıyor: özet kartı duraklardan doğuyor ve durak yokken kart
                  da yok — sefer yine açık, kapatılabilir. */}
              <Text style={styles.runStrip} testID="courier-day-run">
                {runLabel(run)}
              </Text>
              <OperationsNoticeBlock
                variant="empty"
                title={t.day.runEmpty.title}
                description={t.day.runEmpty.body}
                testID="courier-day-empty"
              />
            </>
          ) : (
            <>
              {/*
                GÜNÜN ÖZETİ TEK KART (v3:1310) — üç sayı bir arada: kaç durak bitti, cepte ne var,
                kapıda ne kaldı. v2'de üçü ayrı satırlardı ve kurye "günüm nasıl gidiyor"
                sorusunu ancak üç yere bakarak cevaplayabiliyordu.

                Künye kartın İÇİNDE değil BAŞLIKTA (aşağıdaki `context`): sefer referansı her
                ekranda aynı yerde durmalı, kartın içinde olsaydı durak listesine inince kaybolurdu.
              */}
              <View style={styles.summary} testID="courier-day-summary">
                <View style={styles.summaryHead}>
                  {/* TAMAMLANAN SAYI KAHRAMAN (v3:14): tasarımda "3" büyük, "/5 durak" küçük.
                      Tek puntoda yazıldığında kuryenin gözü hangi sayının kendi ilerlemesi
                      olduğunu ayırt edemiyordu — ikisi de aynı ağırlıktaydı. */}
                  <Text style={styles.summaryCount}>
                    {fillCopy(t.day.progressDone, { done: String(doneCount) })}
                    <Text style={styles.summaryCountRest}>
                      {fillCopy(t.day.progressRest, { total: String(stops.length) })}
                    </Text>
                  </Text>
                  <View style={styles.pocketBox}>
                    <Text style={styles.pocketLabel}>{t.day.pocketLabel}</Text>
                    {/* Ölçülemeyen değer SIFIR DEĞİLDİR: taslak düştüyse "bilinmiyor" (CLAUDE §1). */}
                    <Text style={styles.pocketValue}>
                      {day.collectedCents === null ? t.day.pocketUnknown : money(day.collectedCents)}
                    </Text>
                  </View>
                </View>

                {/* Çubuk PAYLAŞILAN (30.08): aynı geometri depo toplama kuyruğunun her satırında
                    da var; iki kopya birinin bir gün ötekinden ayrılması demekti (CLAUDE §1). */}
                {/* İZ KOYU (30.08): kart koyu ama çubuğun izi açık zeminin iziydi ve çubuk
                    boşken bile DOLU görünüyordu — üç durağın biri bitmişken göz "neredeyse
                    tamam" okuyordu. Kit prop'u, iki koyu çağıran da kuryede. */}
                {/* İKİNCİ PAY TAKILI DURAKLAR (v3:14 · 30.08): tek paylı çubuk günü olduğundan
                    iyi gösteriyordu — ulaşılamayan durak çubukta hiç görünmüyor, kalan boşlukta
                    "sırası gelmemiş" gibi duruyordu. */}
                <OperationsProgressBar
                  value={doneCount / stops.length}
                  secondary={{ value: issueCount / stops.length, tone: operationsTheme.colors.error }}
                  onInk
                  testID="courier-day-progress"
                />

                {doorStops.length === 0 ? null : (
                  <View style={styles.doorLeftBox} testID="courier-day-door-left">
                    <Text style={styles.doorLeftDot}>●</Text>
                    <Text style={styles.doorLeft}>
                      {fillCopy(t.day.doorLeft, { n: String(doorStops.length), amount: money(doorTotal) })}
                    </Text>
                  </View>
                )}
              </View>

              {/*
                SEFER KÜNYESİ VE YÜKLEME — KENDİ EKRANINDA (v3:1330, 30.08).

                Yükleme burada tek satırlık bir sayaçtı ("3/7 kutu araçta" + okut düğmesi). O satır
                "kaç kutu bindi"yi söylüyordu ama kuryenin rampada sorduğu asıl soruyu — HANGİ
                durağın kutusu eksik — cevaplamıyordu. Kırılım kendi ekranına taşındı; buradaki
                satır artık oraya açılan kapı ve sayacı da taşıyor: kapıyı açmadan "işim var mı"
                sorusu cevaplanabilmeli.

                Sayaç `null` ise (kutusuz akış — eski yol) satır HİÇ çizilmez: olmayan bir adımı
                kapı olarak göstermek, kuryeyi boş bir ekrana gönderirdi.
              */}
              {day.boxCounter === null ? null : (
                <GateRow
                  icon="courier"
                  title={t.day.tripRow.title}
                  meta={fillCopy(t.day.tripRow.meta, {
                    loaded: String(day.boxCounter.loaded),
                    total: String(day.boxCounter.total),
                  })}
                  tone="plain"
                  onPress={() => router.navigate('/trip')}
                  testID="courier-day-trip"
                />
              )}

              {/* YERİNDE SATIŞ (21.119) — araçtan yoldan gelen müşteriye elden satış. Tasarımda
                  sefer satırının HEMEN ALTINDA ve onun eşi bir kart satırı (v3:14); eskiden
                  başlığın altında başlık+düğme olarak duruyordu ve akışın parçası görünmüyordu.
                  Şartı sefer değil ARAÇTIR — bu yüzden rota seçimi gövdesinde de çiziliyor. */}
              <GateRow
                icon="sale"
                title={t.day.sale.label}
                meta={t.day.sale.meta}
                tone="invite"
                onPress={() => router.navigate('/sale')}
                testID="courier-day-sale"
              />

              {/* BAŞLIK SAYIYI VE TAKILIYI TAŞIR (v3:14) — "DURAKLAR · 5" solda, "1 takılı" sağda.
                  Eskiden yalnız "DURAKLAR" yazıyordu: kaç durak olduğu ancak sayılarak, takılı
                  olup olmadığı ancak listeyi tarayarak bulunuyordu. Takılı YOKSA sağ taraf hiç
                  çizilmez — sıfırı yazmak, olmayan bir sorunu duyurmaktır. */}
              <View style={styles.stopsHeadingRow}>
                <Text style={styles.stopsHeading}>
                  {fillCopy(t.day.stopsHeading, { n: String(stops.length) })}
                </Text>
                {issueCount === 0 ? null : (
                  <Text style={styles.stuckCount} testID="courier-day-stuck">
                    {fillCopy(t.day.stuckCount, { n: String(issueCount) })}
                  </Text>
                )}
              </View>

              {stops.map((stop, index) => (
                <StopRow
                  key={stop.orderId}
                  stop={stop}
                  order={index + 1}
                  tone={circleTone(stop, stop.orderId === nextOrderId, day.started)}
                  started={day.started}
                  last={index === stops.length - 1}
                  onPress={() =>
                    router.navigate({ pathname: '/delivery/[orderId]', params: { orderId: stop.orderId } })
                  }
                />
              ))}

              {/* Kapanışın kuralı listenin SONUNDA (v3:1352): kurye "şu durak takıldı, günü
                  kapatamam" diye beklemesin — takılı durak kapanışta çözülür, engel değildir. */}
              <Text style={styles.stopsFootnote}>{t.day.stopsFootnote}</Text>
            </>
          )}
        </ScrollView>
      )}

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (v2:89). Bildirim de
          buradadır: başlatma sonucu, düğme çizilmese bile (rota kalmadı) görünmek zorunda. */}
      {ctaMode === null && day.startNotice === null ? null : (
        /* YAPIŞKAN ÇUBUK KİTTEN (`OperationsStickyBar`, 30.08): gradyan + mutlak konum + üç dolgu
           burada elle yazılıydı ve kitin bloğuyla BİREBİR aynıydı — kit zaten bu ekranın
           ölçüsünden çıkarılmıştı, ekran ona dönmemişti. `glow` VERİLMEDİ: ışıma bir OKUTMA
           işaretidir (kitin künyesi), başlat/kapat düğmesinin değil. */
        <OperationsStickyBar>
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
              /* KÜÇÜLME, KAYMA DEĞİL (v3:14:73 · `style-active="transform:scale(.98)"`). Kayma
                 sert gölgenin geri bildirimidir — gölge gidince altında kaymayı açıklayan bir şey
                 kalmaz ve hareket titreme gibi okunur (kitin `PrimaryButton` künyesindeki aynı
                 kural). */
              feedback="scale"
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
              {/* ROZET TAKILIYI DA SÖYLER (v3:14 — "2 açık · 1 takılı"). Kurye kapatmadan önce
                  neyin çözülmemiş olduğunu düğmenin üstünde görmeli; yalnız "açık" sayısı,
                  sonuçlanmayan durakları kapanışın sürprizine bırakıyordu. */}
              {ctaMode === 'close' && openCount + issueCount > 0 ? (
                <Text style={styles.ctaBadge}>
                  {issueCount === 0
                    ? fillCopy(t.day.openBadge, { n: String(openCount) })
                    : fillCopy(t.day.openBadgeStuck, { n: String(openCount), m: String(issueCount) })}
                </Text>
              ) : null}
            </PressableSurface>
          )}
        </OperationsStickyBar>
      )}

      <ScanSheet
        open={day.boxScanOpen}
        title={t.day.boxes.scanTitle}
        hint={t.day.boxes.scanHint}
        onClose={() => day.setBoxScanOpen(false)}
        onScan={day.handleLoadScan}
        // Kutu QR'ı üretilmiş kayıttır — çipler günün YÜKLENMEMİŞ kutularından kurulur.
        devCodes={stops.flatMap((stop) =>
          stop.boxes
            .filter((box) => box.loadedAt === null)
            .map((box) => ({ label: `${stop.referenceNo ?? '—'} · K${box.boxNo}`, code: box.code })),
        )}
        testID="courier-day-box-scan-sheet"
      />
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

/**
 * **KISMİ TESLİM** — teslim edilmiş ama bir adedi eksik durak.
 *
 * Sözleşmede ayrı bir `outcome` YOK ve olmayacak: sipariş `delivered`, kalemin `fulfilledQty`si
 * `qty`den küçük. Kural tek yerde çünkü üç yer soruyor — daire tonu, etiket ve alt satır.
 */
function isPartial(stop: CourierStopContract): boolean {
  return stop.outcome === 'delivered' && stop.items.some((line) => line.fulfilledQty < line.qty);
}

/** Kısmi durağın adet dökümü — sipariş edilen ve fiilen bırakılan toplam. */
function partialCounts(stop: CourierStopContract): { total: number; done: number } {
  return stop.items.reduce(
    (sum, line) => ({ total: sum.total + line.qty, done: sum.done + line.fulfilledQty }),
    { total: 0, done: 0 },
  );
}

/** v3:14 — sonuç dairesinin tonu. "Sıradaki" yalnız YOLA ÇIKILMIŞSA koyulur. */
function circleTone(stop: CourierStopContract, isNext: boolean, started: boolean): CircleTone {
  if (stop.outcome === 'delivered') return isPartial(stop) ? 'partial' : 'delivered';
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') return 'issue';
  return isNext && started ? 'next' : 'idle';
}

/**
 * **SONUÇLANMIŞ DURAĞIN ETİKETİ** — "TESLİM EDİLDİ · 14:12" (v3:14, 30.08).
 *
 * Sonuç eskiden alt satıra gömülüydü ("Ahmet · teslim edildi") ve SAAT hiç yazılmıyordu: kurye
 * hangi durağın ne zaman kapandığını okuyamıyordu. Rota bir sıradır; saat o sıranın tek işareti.
 *
 * Damga YOKSA etiket saatsiz yazılır — uydurma bir saat, en tehlikeli yalandır (CLAUDE §1).
 * Sonuçlanmamış durakta `null`: etiketi olan şey bitmiş iştir.
 */
function stopTag(stop: CourierStopContract): string | null {
  const tag =
    stop.outcome === 'delivered'
      ? isPartial(stop)
        ? t.day.stop.tagPartial
        : t.day.stop.tagDelivered
      : stop.outcome === 'unreachable'
        ? t.day.stop.tagUnreachable
        : stop.outcome === 'refused'
          ? t.day.stop.tagRefused
          : null;
  if (tag === null) return null;
  return stop.settledAt === null ? tag : fillCopy(t.day.stop.tagAt, { tag, time: timeOf(stop.settledAt) });
}

/**
 * Durağın alt satırı (v3:14) — sonuç ne söylüyorsa o; iç durum adı ekrana sızmaz.
 *
 * Sonuç ETİKETE çıktığı için burası artık sonucu TEKRAR ETMİYOR: teslim edilmiş durakta cümle
 * "ne oldu"yu değil "ne bıraktım, ne aldım"ı anlatıyor — kuryenin listeye dönüp sorduğu soru bu.
 */
function stopSubtitle(stop: CourierStopContract): { text: string; tone: 'muted' | 'error' | 'terracotta' } {
  const channel = t.channel[stop.channel];
  if (stop.outcome === 'delivered') {
    /* KISMİ: adet dökümü + araçta kalan. Kalan borç burada YAZILMAZ — kısmi durağın borcu zaten
       düzeltmeyle düşmüştür (07.8) ve iki sayı yan yana kuryeye hangisinin geçerli olduğunu
       sordururdu. */
    if (isPartial(stop)) {
      const { total, done } = partialCounts(stop);
      return {
        text: [
          fillCopy(t.day.stop.partialLine, { total: String(total), done: String(done) }),
          fillCopy(t.day.stop.leftInVanQty, { n: String(total - done) }),
        ].join(' · '),
        tone: 'terracotta',
      };
    }
    const parts = [fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
    /* KAPIDA ALINAN PARA (30.08): yöntem ve tutar birlikte — "nakit 85,00 € alındı". İkisi de
       gerekiyor, çünkü kurye akşam kasayı yöntem yöntem sayacak. Yöntem okunamadıysa satır hiç
       yazılmaz: tutarı yöntemsiz yazmak, o parayı hangi kasaya koyacağını söylemez. */
    const collected = stop.payment.collectedAtDoorCents;
    const method = stop.payment.expectedMethod;
    if (collected !== null && method !== null) {
      parts.push(fillCopy(t.day.stop.collected, { method: t.method[method], amount: money(collected) }));
    }
    if (stop.hasProof) parts.push(t.day.stop.proof);
    const due = stop.payment.dueAmountCents;
    if (due !== null) {
      parts.push(fillCopy(t.day.stop.deliveredDebt, { amount: money(due) }));
      return { text: parts.join(' · '), tone: 'terracotta' };
    }
    return { text: parts.join(' · '), tone: 'muted' };
  }
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') {
    /* KURYENİN KENDİ NOTU ÖNCE (30.08): "zil bozuk — kimse yok". Not `MarkUndeliveredRequest`le
       gönderiliyordu ama hiçbir okuma geri getirmiyordu — kurye kendi yazdığını okuyamıyordu.
       Not yoksa cümle sonucun kendi metniyle başlar; boş bir satır bırakmak sebebi soru işareti
       yapardı. */
    const note = stop.outcomeNote;
    /* MALIN AKIBETİ İKİ SONUÇTA FARKLI ve cümle de öyle olmalı (cihaz turu 30.08 — ilk hâlde
       ikisine de "araçta kaldı" yazılıyordu, reddedilen durakta bu YANLIŞTI). Sözleşmenin kendi
       kuralı: `unreachable` malı araçta bırakır (`ready`) ve kapanışta karara düşer; `refused`
       depoya döndürür (`returned`) — orada bekleyen bir karar yok, iade akışı başlamıştır. */
    const parts =
      stop.outcome === 'unreachable'
        ? [
            note ?? t.day.stop.unreachable,
            fillCopy(t.day.stop.leftInVanItems, { n: String(stop.itemCount) }),
            t.day.stop.closeDecides,
          ]
        : [note ?? t.day.stop.refused, fillCopy(t.day.stop.backToWarehouse, { n: String(stop.itemCount) })];
    return { text: parts.join(' · '), tone: 'error' };
  }

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
  /** Listenin SON durağı mı — zaman çizgisi burada bitirilir, bağlanacak bir sonraki yok. */
  last: boolean;
  onPress: () => void;
}

/**
 * **İKONLU KAPI SATIRI** (v3:14) — sefer künyesi ve yerinde satış aynı anatomiyi paylaşıyor:
 * kare ikon kutusu · başlık · alt metin · yön oku. Tasarımda ikisi arka arkaya duruyor ve
 * birbirinin eşi; ayrı yazsaydık biri bir gün ötekinden ayrılırdı (CLAUDE §1).
 *
 * `tone` yalnız ZEMİN ve İKON rengini değiştiriyor: satış satırı tasarımda zeytin zeminli
 * (bir davet), sefer satırı krem (günün akışının bir adımı).
 */
interface GateRowProps {
  icon: IconName;
  title: string;
  meta: string;
  tone: 'plain' | 'invite';
  onPress: () => void;
  testID: string;
}

function GateRow({ icon, title, meta, tone, onPress, testID }: GateRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.gateRow, tone === 'invite' ? styles.gateRow_invite : styles.gateRow_plain]}
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.gateIcon, tone === 'invite' ? styles.gateIcon_invite : styles.gateIcon_plain]}>
        <Icon
          name={icon}
          size={operationsTheme.size.stripIcon}
          color={tone === 'invite' ? operationsTheme.colors.olive : operationsTheme.colors.ink}
        />
      </View>
      <View style={styles.gateBody}>
        <Text style={[styles.gateTitle, tone === 'invite' ? styles.gateTitle_invite : null]}>{title}</Text>
        <Text style={styles.gateMeta}>{meta}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableSurface>
  );
}

function StopRow({ stop, order, tone, started, last, onPress }: StopRowProps) {
  const subtitle = stopSubtitle(stop);
  const tag = stopTag(stop);
  /** Durak hâlâ AÇIK mı — yön oku ve "yapılacak iş" görüntüsü yalnız buna bağlı. */
  const open = stop.outcome === 'pending';
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
      style={[
        styles.stopRow,
        styles.stopRowRail,
        stop.outcome === 'delivered' ? styles.stopDone : started ? undefined : styles.stopLocked,
      ]}
      accessibilityLabel={fillCopy(t.day.stop.openLabel, { address, sub: subtitle.text })}
      accessibilityHint={started ? undefined : t.day.stop.lockedHint}
      testID={`courier-stop-${stop.orderId}`}
    >
      {/* ZAMAN ÇİZGİSİ (v3:14 · 30.08) — daireler dikey bir çizgiyle bağlanıyor.
          Daireler bağsız dururken liste bir "kartlar yığını" gibi okunuyordu; rota ise bir
          SIRADIR ve çizgi o sırayı görünür kılan tek öğe. Son durakta çizilmez: bağlanacak bir
          sonraki durak yok, oraya çizgi koymak yolun devam ettiğini söylerdi. */}
      <View style={styles.rail}>
        <View style={[styles.circle, styles[`circle_${tone}`]]}>
          <Text style={[styles.circleText, styles[`circleText_${tone}`]]}>
            {tone === 'delivered' ? '✓' : tone === 'partial' ? '½' : tone === 'issue' ? '!' : order}
          </Text>
        </View>
        {last ? null : <View style={styles.railLine} />}
      </View>
      {/* DURAK KENDİ KARTINDA (v3:14 · 30.08) — numara dairesi kartın DIŞINDA kalıyor.
          Kesikli çizgiyle ayrılmış düz satırlar listeyi bir döküme çeviriyordu; kart her durağı
          "dokunulacak bir iş" olarak çerçeveliyor.

          ── SONUÇ KARTIN ZEMİNİNDE (30.08) ────────────────────────────────────────────────
          Kart eskiden TEK zeminliydi (`panel` + `sand-300`) ve sonuç yalnız daire renginden
          okunuyordu; teslim edilen durakta ise kart hiç çizilmiyordu. v3 dört zemin veriyor ve
          gerekçesi listenin kendisinde: kurye ekrana bakıp "hangileri kaldı"yı kartların RENGİNDEN
          tarıyor, 32 piksellik bir daireden değil. Teslim edilmiş kart da çizilir — soluk, ama
          çizilir: iş bitti, kayıt duruyor. */}
      <View style={[styles.stopBody, styles.stopCard, styles[`stopCard_${tone}`]]}>
        {/* SIRADAKİ DURAĞIN BAŞLIĞI (v3:14) — kart zaten ayrışıyor ama "sıradaki" bir SÖZ, renk
            değil: kurye listeye döndüğünde nereden devam edeceğini okumalı. */}
        {tone === 'next' ? <Text style={styles.stopNextLabel}>{t.day.stop.nextLabel}</Text> : null}
        {tag === null ? null : (
          <Text style={[styles.stopTag, styles[`stopTag_${tone}`]]} testID={`courier-stop-tag-${stop.orderId}`}>
            {tag}
          </Text>
        )}
        <Text style={[styles.stopAddress, stop.outcome === 'delivered' ? styles.stopAddressDone : undefined]}>
          {address}
        </Text>
        <Text style={[styles.stopSub, styles[`stopSub_${subtitle.tone}`]]}>{subtitle.text}</Text>
        {/*
          ALT ŞERİT: rozet solda, yön oku sağda (v3:14 — `justify-content:space-between`).

          ── OK YALNIZ SONUÇLANMAMIŞ DURAKTA (kullanıcı bulgusu 30.08) ──────────────────────
          Ölçüldü: tasarımın beş durak kartından yalnız İKİSİNDE ok var — sıradaki ve bekleyen.
          Teslim, kısmi ve ulaşılamadı kartlarında YOK, çünkü ok bir DAVETTİR ("burada yapılacak
          iş var") ve sonuçlanmış durakta yapılacak iş kalmamıştır. Kart hâlâ dokunulabilir
          (kayda bakılabilir) ama kendini iş gibi sunmaz.

          Ok kartın İÇİNDE ve alt şeritte: eskiden kartın dışında, dikey ortada duruyordu ve
          hangi karta ait olduğu — özellikle iki satırlık adreslerde — belirsizdi.
        */}
        {badge === null && !open ? null : (
          <View style={styles.stopFoot}>
            {badge === null ? null : (
              <Text style={styles.stopBadge} testID={`courier-stop-door-${stop.orderId}`}>
                {badge}
              </Text>
            )}
            {open ? <Text style={styles.chevron}>›</Text> : null}
          </View>
        )}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet listenin İÇİNDE değil, listenin YERİNDE duruyor: yatay dolgu gövdeyle aynı (`list`),
     üst nefes başlıktan sonra bir satır. Ortalanmıyor — yer tutucu sayfanın ortasında değil,
     gerçek blokların başlayacağı yerde başlar. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
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
    /*
      KARTLAR ARASI ARALIK (kullanıcı bulgusu 30.08 — "kartlar birbirine bitişik").

      Burada `gap` HİÇ YOKTU: özet kartı ile kapı satırı, kapı satırı ile satış daveti sıfır
      boşlukla yan yanaydı; yalnız durak satırlarının kendi `paddingVertical`ı dolaylı bir aralık
      üretiyordu ve o da listenin geri kalanıyla tutmuyordu.

      Değer TASARIMDAN ve tahmin değil: bu ekranda ardışık her kart `margin:10px 20px 0` ile
      geliyor (v3:14 — özet → kapı satırı → satış daveti). Durak listesinin sarmalayıcısında
      `gap` gerçekten yazılmamış ama o bir kural yokluğu değil, TEK DURAK çizilmiş olmasının
      sonucu; aynı ekranın kendi ritmi 10 diyor.
    */
    gap: operationsTheme.space.lg,
    // Yapışkan CTA listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın (52 + nefes).
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  /* GÜNÜN ÖZETİ TEK KART (v3:1310) — üç sayı bir arada; v2'de ayrı satırlardı ve kurye "günüm
     nasıl gidiyor" sorusunu ancak üç yere bakarak cevaplayabiliyordu. */
  /*
    ÖZET KARTI KOYU (v3:14 · 30.08) — ekranın tek koyu bloğu ve bu bir hiyerarşi kararı.

    Açık kartla çizilmişti ve o hâlde sayfadaki her kutuyla aynı ağırlıktaydı: günün ilerlemesi,
    sefer kapısı ve satış daveti eşit sesle konuşuyordu. Tasarım kuryenin ilk bakışını buraya
    çekiyor — "kaç durak bitti, cebimde ne var" günün tek özeti.

    Çerçeve YOK: koyu yüzey kendi kenarıdır (kitin `ink` tonunun da kuralı).
  */
  summary: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.xl,
  },
  summaryCount: {
    // v2: `800 20px` — Karla'nın 800'ü YÜKLENMİYOR (fonts.ts üç ağırlık taşır) ve sahte kalın
    // Android'de çirkin durur; en yakın gerçek kesit 700.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.cream,
  },
  /** Sayının kuyruğu — "/5 durak": aynı satırda ama bir kademe küçük ve daha sessiz. */
  summaryCountRest: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['on-ink-label'],
  },
  /** "CEPTE" + tutar — kartın sağ ucunda, iki satır; para bir sayı değil bir DURUM. */
  pocketBox: {
    alignItems: 'flex-end',
    gap: operationsTheme.space['2xs'],
  },
  pocketLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['on-ink-label'],
  },
  pocketValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.cream,
  },
  /** Başlık satırı — sayaç solda, "takılı" sağda (v3:14). */
  stopsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: operationsTheme.space.lg,
  },
  stopsHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** "1 takılı" — başlığın sağ ucu; sayı değil UYARI olduğu için hata tonunda. */
  stuckCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.error,
  },
  stopsFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.md,
  },
  /*
    "Kapıda tahsilat kaldı" KOYU KARTIN İÇİNDE KENDİ ŞERİDİNDE (v3:14). Düz metin olarak
    yazıldığında kartın alt kenarına yapışık bir dipnot gibi okunuyordu; oysa cümle bir BORÇ
    bildiriyor. `ink-inset` (beyazın %14'ü) onu zeminden ayırıyor, nokta imi de listeye ait
    olduğunu söylüyor.
  */
  doorLeftBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    backgroundColor: operationsTheme.colors['ink-inset'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  doorLeftDot: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  doorLeft: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  /** Sefer künyesi ve yüklemeye açılan kapı — sayacı da taşır (v3:1330). */
  /*
    KAPI SATIRI (v3:14) — sefer künyesi ve yerinde satış aynı anatomi: kare ikon · gövde · yön oku.
    Tasarım ikisini arka arkaya, aynı ölçülerde çiziyor; ayıran tek şey ZEMİN ve o bir anlam
    taşıyor — krem "günün akışının bir adımı", zeytin "burada bir davet var".
  */
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  gateRow_plain: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  gateRow_invite: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-line'],
  },
  /** Kare ikon kutusu — tasarımda ikon serbest durmuyor, kendi zeminine oturuyor. */
  gateIcon: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlSm,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateIcon_plain: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  gateIcon_invite: { backgroundColor: operationsTheme.colors.cream },
  gateBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  gateTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  gateTitle_invite: { color: operationsTheme.colors['olive-dark'] },
  gateMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  boxLoadCounter: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  boxLoadButton: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
    borderColor: operationsTheme.colors['olive-line'],
  },
  boxLoadButtonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
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
  /* Dikey dolgu KALDIRILDI: aralık artık listenin `gap`i — iki kaynak olduğunda durak satırları
     listenin geri kalanından farklı bir ritimde duruyordu (kullanıcı bulgusu 30.08). */
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /* DURAK SATIRI GERİLİR (`stretch`), rota kartı ORTALANIR. Ayrı stil çünkü ikisi aynı iskeleti
     paylaşıyor ama farklı şey çiziyor: durakta zaman çizgisi kartın boyunca uzamalı, rota
     seçiminde çizgi YOK (bir sıra değil, bir liste) ve daire dikey ortada durmalı. */
  stopRowRail: { alignItems: 'stretch' },
  /** Daire + zaman çizgisi sütunu — genişliği daireden, uzunluğu karttan gelir. */
  rail: {
    alignItems: 'center',
    gap: operationsTheme.space['2xs'],
  },
  /** Durakları bağlayan dikey çizgi — kartın alt kenarına kadar iner. */
  railLine: {
    flex: 1,
    width: operationsTheme.border.ring,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  /** Kartın alt şeridi — rozet solda, yön oku sağda; ikisi de yoksa şerit hiç çizilmez. */
  stopFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: operationsTheme.space['2xs'],
  },
  /** Durağın gövdesi — kendi kartı; numara dairesi dışarıda, yön oku kartın sağ kenarında. */
  stopCard: {
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  /*
    KARTIN DÖRT ZEMİNİ (v3:14 · 30.08) — sonuç kartın rengidir, dairenin değil.

    Değerler tasarımdan token karşılıklarıyla: teslim `#f4f2ea/#e7e2d2` → sayfa kremi + nötr kenar
    (kart sayfayla aynı zemindedir, onu yalnız kenarı ayırır — "bitmiş iş" tam olarak budur);
    kısmi `#fbf3e8/#e6cfae` → uyarı ailesi; ulaşılamadı `#f4e3e0/#e0b9b2` → hata ailesi (`error-line`
    tasarımın değeriyle BİREBİR); sıradaki `#fff/#5f7a2c` → girdi beyazı + zeytin.

    HAM HEX YOK, hiçbiri yeni token istemedi (CLAUDE §3): dördü de envanterde duran ailelerin
    üyeleri. Bulunmayan tek şey teslim kartının zemini gibi görünüyordu — o da `cream`in kendisi
    çıktı (Δ2/2/2, gözle aynı).
  */
  stopCard_delivered: {
    backgroundColor: operationsTheme.colors.cream,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  stopCard_partial: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  stopCard_issue: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
  },
  /* SIRADAKİ KART BEYAZ VE KALIN ZEYTİN KENARLI — listenin tek "şimdi" öğesi. Gölge YOK: sert
     gölge v3'te bırakıldı (21.161) ve ayrımı zaten kenarın kalınlığı taşıyor. */
  stopCard_next: {
    backgroundColor: operationsTheme.colors.card,
    borderColor: operationsTheme.colors.olive,
    /* Tasarım 2px diyor; operasyon setinin o basamağı `ring` (2,5). `base`in (1,5) üstünde bir
       kademe gerekiyor çünkü ayrımı taşıyan tek şey bu kenar — gölge v3'te bırakıldı (21.161). */
    borderWidth: operationsTheme.border.ring,
  },
  stopCard_idle: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  /* Teslim edilen durak SOLUK ama artık kartlı: zemin ayrımı yapılmışken opaklık da düşürülünce
     kart görünmez oluyordu — ölçü 0,55'ten 0,8'e çekildi, ayrımı zemin taşıyor. */
  stopDone: { opacity: 0.8 },
  stopLocked: { opacity: 0.75 },
  /** "SIRADAKİ DURAK" — kartın içindeki küçük zeytin başlık (v3:14). */
  stopNextLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    /* `emToDp` ŞART: token em cinsinden, RN `letterSpacing`i dp bekler — ham değer yazılsaydı
       harfler arası boşluk 9,5 kat açılırdı (ekranın kendi kuralı, `stopsHeading` emsali). */
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.olive,
  },
  /** Sonuç etiketi — "TESLİM EDİLDİ · 14:12"; tonu kartın ailesinden gelir. */
  stopTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
  },
  stopTag_delivered: { color: operationsTheme.colors['olive-dark'] },
  stopTag_partial: { color: operationsTheme.colors.warehouse },
  stopTag_issue: { color: operationsTheme.colors.error },
  stopTag_next: { color: operationsTheme.colors.olive },
  stopTag_idle: { color: operationsTheme.colors.muted },
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
  /* SORUNLU DAİRE DOLU KIRMIZI (v3:14) — içinde beyaz "!". Açık `error-bg` zeminiyle çizilince
     daire kartın kendi zeminine karışıyordu; listeyi tararken takılı durak görünmüyordu. */
  circle_issue: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  /** Kısmi teslim — "½" işaretli amber daire (v3:14). */
  circle_partial: {
    backgroundColor: operationsTheme.colors['warning-line'],
    borderColor: operationsTheme.colors['warning-line'],
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
  circleText_issue: { color: operationsTheme.colors['on-image'] },
  circleText_partial: { color: operationsTheme.colors.warehouse },
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
  /* ÜSTÜ ÇİZİLİ METİN YOK (kullanıcı bulgusu 30.08 · tasarımda `line-through` HİÇ geçmiyor —
     ölçüldü, 14. ekranda sıfır kullanım). Çizgi "iptal edildi" der; teslim edilmiş durak iptal
     değil TAMAMLANMIŞ bir iştir. Ayrımı zaten kartın zemini ve sonuç etiketi taşıyor; adresin
     rengi sessizleşir, üstü çizilmez. */
  stopAddressDone: {
    color: operationsTheme.colors.muted,
  },
  stopSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
  },
  stopSub_muted: { color: operationsTheme.colors.muted },
  stopSub_error: { color: operationsTheme.colors.error },
  stopSub_terracotta: { color: operationsTheme.colors.terracotta },
  /* Rozet artık alt şeridin İÇİNDE: kendi `alignSelf`i ve üst boşluğu şeride devredildi, yoksa
     ok ile aynı satırda dururken iki kez boşluk alıyordu. */
  stopBadge: {
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
  /*
    SERT GÖLGE SÖKÜLDÜ (kullanıcı bulgusu 30.08). `3px 3px 0` müşteri evreninin imzası ve v2'den
    kalmıştı; v3'te sert gölge YOK — tasarımın 6 gölgesinin altısı da yumuşak ve dördü yapışkan
    çubuktaki OKUTMA düğmesinin zeytin ışıması (kitin `sticky-bar` künyesi). Kural kitte zaten
    yazılıydı (`PrimaryButton elevation="flat"`); bu ekran kite hiç sormamıştı.
  */
  ctaStart: {
    backgroundColor: operationsTheme.colors.olive,
  },
  ctaClose: {
    backgroundColor: operationsTheme.colors.ink,
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
