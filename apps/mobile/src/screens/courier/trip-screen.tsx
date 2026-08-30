import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { OperationsSurface } from '@/components/operations/surface';
import { PrimaryButton } from '@/components/ui/primary-button';
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
        <OperationsSurface padding="lg" style={styles.card} testID="courier-trip-card">
          <View style={styles.cardHead}>
            <Text style={styles.assigned}>{t.day.trip.assigned}</Text>
            {/* BAŞLIKTA YALNIZ REFERANS — rota adı alttaki zincirde (30.08). `runLabel` ikisini
                birleştiriyor ("Kuzey rotası · SF-26-…") ve zincir gelince aynı ad kartta İKİ KEZ
                görünüyordu. `runLabel` paylaşılan bir yardımcı, öteki ekranlarda birleşik hâli
                doğru; değişen yalnız BU kartın ne söylediği. */}
            <Text style={styles.reference}>{day.run.referenceNo}</Text>
          </View>

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

          {/*
            ROTA ZİNCİRİ VE NOT TEK PARAGRAF, SAYILARDAN SONRA (v3:1381 · 30.08 ikinci tur).
            Zinciri sayıların ÜSTÜNE koymuştum; tasarım onu sayıların ALTINA ve notla AYNI cümle
            demetine koyuyor. Ayrım anlamlı: üstteki rozet+kod künyenin KİMLİĞİ, ortadaki üç sayı
            günün ÖLÇÜSÜ, alttaki paragraf da bağlam — "şu yoldan gideceksin ve bunu buradan
            değiştiremezsin". Zincir yukarıdayken kimlikle ölçünün arasına giriyordu.

            Depo adı okunamazsa uydurma bir ad yerine SEBEP yazılır ve not yine eklenir: yanlış
            rampaya gönderilen kurye, boş bir satırdan pahalıdır (CLAUDE §1).
          */}
          <Text style={styles.routeNote} testID="courier-trip-route">
            {fillCopy(t.day.trip.routeNote, {
              route:
                day.run.warehouseName === null
                  ? t.day.trip.routeUnknown
                  : fillCopy(t.day.trip.route, {
                      warehouse: day.run.warehouseName,
                      zone: day.run.zoneName ?? '—',
                    }),
            })}
          </Text>
        </OperationsSurface>

        {/*
          ARAÇ KENDİ KARTINDA, KESİKLİ ÇERÇEVEYLE (v3:1385 · 30.08 ikinci tur).

          Düz gri bir cümleydi ve künye kartının dipnotu gibi okunuyordu. Tasarım onu ayrı bir
          kutuya alıyor ve çerçevesini KESİKLİ çiziyor — kesik çerçeve v3'te "burası bilgi, senin
          dokunacağın bir şey değil" demek (aynı dil mal kabulün "siparişsiz mal geldi" kutusunda).
          Kart başlıklı: "Araç" satırı, cümleyi bir alana bağlıyor.

          İki hâl AYRI cümle: adı olmayan araç ile araçsız sefer aynı şey değil — birincisi bir
          eksik, ikincisi meşru bir kurulum (araç kaydı zorunlu değil). Kart İKİSİNDE DE çizilir;
          "araç yok" da bir cevaptır ve kuryenin sorusu ("neyle gideceğim") ortada kalmamalı.
        */}
        <OperationsSurface tone="blank" padding="lg" style={styles.vehicleCard} testID="courier-trip-vehicle">
          <Text style={styles.vehicleHeading}>{t.day.trip.vehicleHeading}</Text>
          <Text style={styles.vehicleNote}>
            {day.run.vehicleLabel === null
              ? t.day.trip.vehicleNone
              : fillCopy(t.day.trip.vehicle, { vehicle: day.run.vehicleLabel })}
          </Text>
        </OperationsSurface>
      </ScrollView>

      {/* YAPIŞKAN DİP: düğme ve onun DİPNOTU (v3:1390). Dipnot 30.08'e kadar kaydırma alanının
          içinde ve düğmenin ÜSTÜNDEYDİ — yani uzun listede düğmeyle birlikte görünmüyordu ve
          "sefer başlayınca ne olur" sorusu tam basmadan önce okunamıyordu. */}
      {/* ÇUBUK VE DÜĞME KİTTEN (30.08): ikisi de elden çiziliyordu. Çubuk kite geçince tasarımın
          GRADYANI da geldi — elle kurulmuş hâlde yoktu ve liste düğmenin altından keskin bir
          kenarla kesiliyordu. Düğme `flat`: v3'te sert gölge yok (kitin kendi kuralı). */}
      <OperationsStickyBar>
        <PrimaryButton
          label={t.day.trip.cta}
          onPress={() => router.navigate('/load')}
          tone="olive"
          elevation="flat"
          testID="courier-trip-cta"
        />
        <Text style={styles.footnote}>{t.day.trip.footnote}</Text>
      </OperationsStickyBar>
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
  /* KÜNYE KARTI KİTİN `panel` TONU (30.08) — zemin, çerçeve, yarıçap ve dolgu oradan geliyor;
     burada kalan yalnız listenin ilk kartına verilen üst nefes ve satır arası aralık. */
  card: {
    marginTop: operationsTheme.space.lg,
    gap: operationsTheme.space.xl,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /*
    "ATANMIŞ" DOLGULU HAP, ÇIPLAK METİN DEĞİL (v3:1375 · 30.08 ikinci tur).

    Dolgusuz zeytin bir yazıydı ve yanındaki gri referansla aynı ağırlıkta duruyordu; oysa bu bir
    DURUM etiketi — "bu sefer sana atandı" der, künyenin kendisi değildir. Tasarım onu kendi
    zeminine oturtuyor (`olive-bg` dolgu + `badge` yarıçapı), yani rozet ailesinden konuşuyor;
    aynı aile mal kabulün lot rozetlerinde ve durak kartının KAPIDA rozetinde de var.
  */
  assigned: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
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
  /** Rota zinciri + "yönetimde planlanır" — tek paragraf, kartın son satırı (v3:1381). */
  routeNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /*
    ARAÇ KARTI — KESİKLİ ÇERÇEVE (v3:1385). Zemin künye kartından bir ton sıcak (`neutral-bg`,
    ölçülen `#f6f4ec`), yarıçap bir kademe küçük: kart burada "ikinci sınıf" bir bilgi taşıyor ve
    hiyerarşi bunu ölçüyle de söylüyor.

    KESİK ÇERÇEVE BİLEREK RN'in kendi `dashed`i: para şeridi 30.08'de ölçtü — RN'in deseni
    tasarımınkinden %60 seyrek çıkıyor ve komponentleştirdiği çare (`OperationsDashedRule`) TEK
    KENARLI ayraçlar için; TAM ÇERÇEVE için "ölçmeden çevirmeyin" dedi (ortak defter). Ölçüm
    gelene kadar buranın çerçevesi RN'in kendi deseniyle kalıyor.
  */
  /*
    ARAÇ KARTI ARTIK KİTİN `blank` TONU (30.08). Dün burada kesikli kum çerçeveyi ELDEN çizmiştim;
    kitin `blank` tonu tam olarak o ve künyesi anlamını da söylüyor: *"henüz yapılmamış iş;
    `invite`ten ayrı durur çünkü biri DAVET, öteki EKSİK."* Araç ataması da bir eksiktir — masada
    yapılır, kuryenin dokunacağı bir şey değil.

    Geriye kalan tek şey aralık: kit dolguyu ve çerçeveyi veriyor, iki satır arası boşluk çağıranın.

    BEKLEYEN(BACKLOG §1) — kesik deseni: görsel ajanı 30.08'de ölçtü, RN'in `dashed`i cihazda
    **1:10** (2–3 px çizgi · 22–33 px boşluk) çıkıyor; tasarımın CSS deseni 1:1. Uzaktan çerçeve
    kesikli değil NOKTALI görünüyor. Sorun bu kartın değil, kitin `invite`/`blank` tonlarının
    tamamının — ikisi de aynı `borderStyle: 'dashed'`i kullanıyor. Kit sahibine bildirildi.
  */
  vehicleCard: {
    gap: operationsTheme.space.xs,
  },
  vehicleHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  vehicleNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
  },
  /** Düğmenin DİPNOTU — ortalı ve düğmenin altında (v3:1392). */
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
  },
  /*
    BİRİNCİL DÜĞME ZEYTİN, KOYU DEĞİL (v3:1391 · 30.08 ikinci tur).

    Koyu (`ink`) çizilmişti. v3'te ikisi de var ve ayrım anlamlı: KOYU düğme bir mutabakatı
    KAPATIR (seferi kapat, günü kapat — geri dönüşü olmayan), ZEYTİN düğme akışı İLERLETİR (sefer
    başlat, yüklemeye geç). Kurye bu iki eylemi renkten ayırt ediyor; ikisi de koyuysa ayrım
    kayboluyor ve "başlat" ile "kapat" aynı ağırlıkta duruyordu.
  */
});
