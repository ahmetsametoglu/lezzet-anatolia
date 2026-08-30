import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { money } from '@/lib/operations/money';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { agoOf } from '@/screens/operations/notification-map';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { ManagementHub, ManagementQueue } from '@lezzet/types';
import { managementCopy } from './copy';
import { useManagementHub } from './use-management-hub.hook';

/*
  YÖNETİM KÖKÜ · KARAR KUTUSU (Operasyon Mobil v3:2069-2139) — bölümün kökü, altı işin kapısı.

  ── v3 KUYRUĞU DÜZ LİSTE DEĞİL, ÜÇ AĞIRLIK (30.08) ──────────────────────────
  v2 beş karar alanını eşit ağırlıkta, kesikli ayraçlı satırlara diziyordu; hepsi aynı sesle
  konuşuyordu. v3 aynı beş alanı KARARIN AĞIRLIĞINA göre ayırdı ve mesele bir süsleme değil,
  yöneticinin ekrana bakınca hangi işe önce dokunacağını bilmesi:

    1. KOYU KART (şikâyet) — cevap bekleyen müşteri. Ekranın tek koyu yüzeyi; bakan gözün ilk
       durduğu yer burasıdır ve orada bekleyen şey bir insandır.
    2. ÇERÇEVELİ KART (eksik toplama) — bugünün siparişini bozan karar. Koyu değil ama sessiz de
       değil: terracotta çerçeve "buraya bak" der.
    3. SESSİZ SATIR KARTLARI (yakın-SKT teklifi · tedarik taslağı) — gün içinde sırası gelen
       işler. Üstbaşlık + tek satır + ok; kart olduklarını çerçeveden anlarsın, sesten değil.
    4. GÜNÜN NABZI ızgarası — karar DEĞİL, iki sayı ve iki kapı (sosyal kutu · gün özeti).

  ── AĞIRLIK SIRALAMASI VERİDEN GELMEZ, ALANDAN GELİR ────────────────────────
  Hangi kartın koyu olacağı ekranın kararıdır ve sabittir: şikâyet HER ZAMAN koyu, teklif HER
  ZAMAN sessizdir. Sıralamayı sayılara bağlamak ("en kalabalık alan en üstte") ekranın yerleşimini
  her okumada değiştirirdi — yönetici parmağını her gün başka yere uzatırdı.

  ── SIFIR SAYILI ALAN YİNE HİÇ ÇİZİLMEZ ─────────────────────────────────────
  v2'den devralınan karar (ölü satır dokununca boş ekran açan bir kapıdır) v3'te de aynen geçerli;
  değişen yalnız çizilenlerin görünümü.

  ── "GÜNÜN NABZI" DURUM DALININ DIŞINDA ─────────────────────────────────────
  Izgara kuyruk okumasından BAĞIMSIZ çizilir: kuyruk düşse de sosyal kutunun ve gün özetinin
  kapısı durur (v2'de sosyal kartı için verilmiş olan kararın aynısı, artık iki kapıya birden).
  Sayılar o hâlde "—" yazar, 0 DEĞİL — okunamayan sayıyı sıfıra düşürmek "bugün iş yok" demektir
  (CLAUDE §1).

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Zil KALDI.** v3'ün başlığında yalnız kimlik karesi var (v3:2077), zil yok. Yönetim
     bölümünün bildirim ekranına açılan TEK kapısı odur; kaldırılsaydı yalnız yönetim yetkisi olan
     personel bildirimlerine hiç ulaşamazdı. Kurye kökü de aynı kararı verdi (v3:1298 zilsiz,
     ekran zilli).
  2. **Eksik kalem kartının İKİ DÜĞMESİ ("eksik gönder" · "ikame öner") ÇİZİLMEDİ.** İkisinin de
     arkasında kapı yok: "kalanı gönder" için ayrı bir kayıt YOKTUR (sözlükteki `sendRestNote`
     bunu açıkça yazıyor — depo kısmi hazırlığı sürdürür), "ikame öner" ise sözleşmenin hiçbir
     yerinde geçmiyor. Kartın tamamı kararın verildiği ekrana açılıyor; orada motorun önerisi
     (`advice`) ve gerçek "Müşteriye sor" kapısı var.
  3. **Kartların içindeki cümleler sözleşmenin taşıdığı kadar.** v3 şikâyet kartına şikâyetin
     KENDİ metnini ("iki tepsi su böreği koku şüphesiyle reddedildi") ve karar seçeneklerini
     ("jest · iade · yeniden gönderim") yazıyor; kuyruk sözleşmesinde ikisi de yok. Kart müşterinin
     adını, sipariş referansını ve son mesaj damgasını yazar — uydurulmuş bir özet, yöneticiye
     okumadığı bir şikâyeti okumuş gibi hissettirirdi.

  ── SATIRIN AÇTIĞI ADRESİ EKRAN BİLİR ───────────────────────────────────────
  Sözleşme hedefi ADLANDIRIR (alan anahtarı), adresi (`/complaint`) yazmaz: rota adresleri
  navigasyonun bilgisidir, verinin değil (aynı karar: `(sections)/_layout.tsx`in ikon haritası).
*/

const t = managementCopy;
const shell = operationsCopy;

/**
 * İskelet kutularının yüksekliği KARTLARIN KENDİ ÖLÇÜSÜNDEN türer, elle yazılmaz (bildirimler
 * emsali): dolgu değişirse iskelet de değişir, yoksa yükleme→liste geçişinde sayfa zıplar — bu
 * deseni halka yerine seçmenin tek sebebi zaten o zıplamaydı.
 *
 * Karar kartı: iki dikey dolgu + rozet satırı + iki iç aralık + iki satırlık başlık + künye satırı.
 */
const SKELETON_DECISION_HEIGHT =
  operationsTheme.space['3xl'] * 2 +
  operationsTheme.text.tag * operationsTheme.text['lead--line-height'] +
  operationsTheme.space.xl * 2 +
  operationsTheme.text.body * operationsTheme.text['lead--line-height'] * 2 +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'];

/** Sessiz satır kartı: iki dikey dolgu + üç satır (üstbaşlık · başlık · alt satır) + iki iç aralık. */
const SKELETON_QUIET_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.space['2xs'] * 2 +
  operationsTheme.text.eyebrow * operationsTheme.text['lead--line-height'] +
  operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.tag * operationsTheme.text['lead--line-height'];

/*
  Kartın açtığı adres DAR bir birlik olarak yazılır, `string` olarak değil: expo-router'ın tip
  sözleşmesi rota adreslerini literal olarak doğruluyor ve `string`e genişletilen bir alan o kapıyı
  kapatır — yanlış yazılmış bir adres ancak cihazda, boş ekran olarak görünürdü.
*/
type ManagementRoute = '/offer-approval' | '/supply-suggestion' | '/social' | '/day-summary';

/** Sessiz satır kartının (teklif · tedarik) içeriği — ikisi de aynı iskeleti çiziyor (v3:2110-2126). */
interface QuietCard {
  key: 'offer' | 'supply';
  eyebrow: string;
  title: string;
  subtitle: string;
  route: ManagementRoute;
}

/** "Günün nabzı" kutucuğu — büyük sayı + ad + alt satır (v3:2129-2137). */
interface PulseTile {
  key: 'social' | 'summary';
  /** `null` = OKUNAMADI; ekran "—" yazar, sıfır DEĞİL. */
  value: string | null;
  title: string;
  subtitle: string;
  /** Alt satır dikkat rengiyle mi yazılıyor (v3: sosyal kutunun alt satırı terracotta). */
  alert: boolean;
  route: ManagementRoute;
}

/**
 * Şikâyet kartının üç satırı — koyu kartın taşıdığı her şey (v3:2087-2095).
 *
 * `head === null` ama sayı > 0 olabilir (sözleşme buna izin veriyor): o hâlde başlık yalnız sayıyı
 * söyler, damga satırı hiç doğmaz — olmayan bir müşteri adı uydurulmaz.
 */
function complaintCardOf(queue: ManagementQueue): { meta: string; title: string; footnote: string } | null {
  if (queue.complaints.count === 0) return null;
  const copy = t.hub.rows.complaint;
  const head = queue.complaints.head;

  return {
    /* KÜNYE SATIRI TÜRÜ SÖYLER, "şikâyet" DEMEZ (ölçüldü 30.08, cihazda): kuyruk dört türü birden
       taşıyor (`soru · bozuk · eksik · diğer`) ve üstteki kayıt çoğu gün bir SORU oluyordu — kart
       ona "şikâyet" diyordu. Sayı ise türden bağımsız: cevap bekleyen bütün TALEPLER. */
    meta:
      head === null
        ? fillCopy(copy.metaNoHead, { n: String(queue.complaints.count) })
        : fillCopy(copy.meta, {
            kind: t.complaint.kind[head.type].toLocaleLowerCase('tr'),
            /* ZAMAN GÖRELİ (v3:2089 "40 dk önce", görsel ajanının 30.08 ölçümü): "30.08 · 06:45"
               okuyana çıkarma yaptırıyor, oysa kartın sorduğu şey "ne kadar bekledi". Kural
               bildirimler ekranının kuralı — ikinci bir "kaç dakika oldu" hesabı yazılmadı. */
            ago: agoLabelOf(head.lastMessageAt),
          }),
    /* BAŞLIK ŞİKÂYETİN KENDİ CÜMLESİ (21.164) — tasarımın koyu kartı (v3:2091) müşterinin adını
       değil derdini yazıyor: yönetici kartın önünde "bu ne kadar acil" diye karar veriyor ve bir
       ad bunu söylemez. Önizleme okunamadıysa eski satır (ad + sipariş referansı) kalır. */
    title:
      head === null
        ? fillCopy(copy.titleNoHead, { n: String(queue.complaints.count) })
        : head.preview === null
          ? fillCopy(copy.titleNoPreview, {
              who: head.customerName,
              ref: head.orderReferenceNo === null ? '' : fillCopy(copy.refPart, { ref: head.orderReferenceNo }),
            })
          : fillCopy(copy.title, { who: head.customerName, preview: head.preview }),
    /* ALT SATIR SAYACI TAŞIYOR (v3:2094'ün yerinde). Tasarım oraya eylem ipuçlarını yazıyor
       ("jest · iade · yeniden gönderim") ama o üç eylemin arkasında bizde kapı YOK — basılmayan
       bir ipucu, kartı yalancı yapardı. Satırın yerini boş bırakmak yerine kuyruğun ağırlığını
       yazıyor: "bu karttan sonra kaç talep daha bekliyor". */
    footnote: fillCopy(copy.openCount, { n: String(queue.complaints.count) }),
  };
}

/**
 * Şikâyet künyesinin göreli zamanı — "40 dk önce" (v3:2089).
 *
 * Hesap BİLDİRİMLER ekranının hesabı (`agoOf`); ikinci bir "kaç dakika oldu" kuralı yazmadım
 * (CLAUDE §1). Cümleyi yüzey kuruyor: "şimdi" hâli "az önce" diye okunur — "şimdi önce" diye bir
 * Türkçe yok.
 */
function agoLabelOf(iso: string): string {
  const copy = t.hub.rows.complaint;
  const ago = agoOf(iso, new Date());
  return ago === 'şimdi' ? copy.agoNow : fillCopy(copy.ago, { ago });
}

/**
 * Eksik toplama kartının iki satırı (v3:2098-2108). Sıfır sayılı alanda kart hiç doğmaz.
 *
 * BAŞLIK ÜRÜNÜ SÖYLER (21.164): tasarımın cümlesi "Yoğurtlu Patlıcan 1000 g — depoda 1 adet eksik
 * bildirildi"; bizimki "1 kalem eksik toplandı" diyordu ve yönetici kararı ürünü bilmeden veremez.
 * Kalem künyesi kuyruk zarfına eklendi; künye YOKSA (okuma kalemsiz döndü) eski sayı cümlesi
 * kalır — uydurma bir ürün adı yazılmaz.
 */
function exceptionCardOf(queue: ManagementQueue): { ref: string; title: string } | null {
  if (queue.exceptions.count === 0) return null;
  const copy = t.hub.rows.exception;
  const head = queue.exceptions.head;
  /* Aynı sipariş içinde başka eksik kalemler ve kuyrukta başka siparişler ayrı iki sayıdır:
     birincisi başlığın kuyruğuna, ikincisi künye satırına yazılır. Tek cümlede toplansalardı
     "3 kalem" mi "3 sipariş" mi olduğu okunmazdı. */
  const moreOrders = queue.exceptions.count - 1;

  return {
    ref:
      (head?.referenceNo ?? copy.noRef) +
      (moreOrders > 0 ? fillCopy(copy.metaMoreOrders, { more: String(moreOrders) }) : ''),
    title:
      head === null
        ? fillCopy(copy.titleNoHead, { lines: '1' })
        : head.shortLineCount > 1
          ? fillCopy(copy.titleMoreLines, {
              item: head.lineTitle,
              qty: String(head.missingQty),
              more: String(head.shortLineCount - 1),
            })
          : fillCopy(copy.title, { item: head.lineTitle, qty: String(head.missingQty) }),
  };
}

/**
 * Yakın-SKT künyesinin ömür cümlesi — üç hâl, üç cümle.
 *
 * NEGATİF GÜN "SÜRESİ GEÇTİ" DEĞİLDİR: kuyruğa yalnız `can_offer` partiler giriyor ve motorun
 * kuralında tarihi geçmiş ama SATILABİLİR olan tek küme DDM'si (tavsiye edilen tüketim tarihi)
 * geçmiş partilerdir — DLC'si geçen parti imhalıktır ve zaten aday sayılmaz (`offerDecisionOf`).
 * "Süresi geçti" demek, satılabilir malı yasak malla aynı cümleye koymak olurdu.
 */
function offerLifeOf(daysLeft: number): string {
  const copy = t.hub.rows.offer;
  if (daysLeft < 0) return copy.lifePast;
  if (daysLeft === 0) return copy.lifeToday;
  return fillCopy(copy.lifeDays, { n: String(daysLeft) });
}

/** Sessiz kartlar — sırası v3'ün sırası (teklif → tedarik), sayıdan bağımsız. */
function quietCardsOf(queue: ManagementQueue): QuietCard[] {
  const cards: QuietCard[] = [];

  /* KART ADEDİ DEĞİL İŞİ SÖYLER (21.164): "49 aday parti" bir sayaçtır, yönetici ona bakıp karar
     veremez; tasarımın kartı (v3:2113) partinin adını, adedini ve önerilen oranı yazıyor. Künye
     kuyruk zarfına eklendi — okunamadığı hâlde eski sayaç cümlesi kalır (uydurma yok). */
  if (queue.offers.candidateCount > 0) {
    const head = queue.offers.head;
    const more = queue.offers.candidateCount - 1;
    cards.push({
      key: 'offer',
      eyebrow: t.hub.rows.offer.eyebrow,
      title:
        head === null
          ? fillCopy(t.hub.rows.offer.titleNoHead, { n: String(queue.offers.candidateCount) })
          : fillCopy(t.hub.rows.offer.title, {
              item: head.title,
              qty: String(head.qty),
              percent: String(head.discountPercent),
            }),
      subtitle:
        head === null
          ? fillCopy(t.hub.rows.offer.subtitle, { life: '' }).trim()
          : more > 0
            ? fillCopy(t.hub.rows.offer.subtitleMore, { life: offerLifeOf(head.daysLeft), more: String(more) })
            : fillCopy(t.hub.rows.offer.subtitle, { life: offerLifeOf(head.daysLeft) }),
      route: '/offer-approval',
    });
  }

  if (queue.supply.groupCount > 0 || queue.supply.unmappedVariantCount > 0) {
    const head = queue.supply.head;
    const more = queue.supply.groupCount - 1;
    cards.push({
      key: 'supply',
      eyebrow: t.hub.rows.supply.eyebrow,
      title:
        head === null
          ? fillCopy(t.hub.rows.supply.titleNoHead, { groups: String(queue.supply.groupCount) })
          : fillCopy(t.hub.rows.supply.title, { supplier: head.supplierName, lines: String(head.lineCount) }),
      /* Eşlenmemiş varyant varsa ALT SATIR onu söyler: o gruptan sipariş açılamıyor ve sebebini
         ekranı açmadan bilmek, boşuna bir dokunuşu önler. */
      subtitle:
        queue.supply.unmappedVariantCount > 0
          ? fillCopy(t.hub.rows.supply.subtitleUnmapped, { unmapped: String(queue.supply.unmappedVariantCount) })
          : more > 0
            ? fillCopy(t.hub.rows.supply.subtitleMore, { more: String(more) })
            : t.hub.rows.supply.subtitle,
      route: '/supply-suggestion',
    });
  }

  return cards;
}

/**
 * Günün nabzı — iki kutucuk, ikisi de bir KAPI.
 *
 * `hub === null` (yükleniyor ya da okuma düştü) hâlinde kutucuklar yine çizilir ama sayıları
 * "—"dir: kapı açık kalır, sayı yalan söylemez.
 */
function pulseTilesOf(hub: ManagementHub | null): PulseTile[] {
  const copy = t.hub.tiles;
  const intents = hub === null ? null : hub.queue.intents.count;

  return [
    {
      key: 'social',
      value: intents === null ? null : String(intents),
      title: copy.social.title,
      subtitle: copy.social.subtitle,
      /* Bekleyen konuşma varsa alt satır dikkat rengine geçer (v3'ün terracotta alt satırı):
         sıfırken aynı renk kalsaydı "bekleyen var" ile "bekleyen yok" aynı sesle konuşurdu. */
      alert: intents !== null && intents > 0,
      route: '/social',
    },
    {
      key: 'summary',
      value: hub === null ? null : money(hub.summary.revenueCents),
      title: copy.summary.title,
      subtitle: fillCopy(copy.summary.subtitle, { orders: hub === null ? t.hub.unknown : String(hub.summary.orderCount) }),
      alert: false,
      route: '/day-summary',
    },
  ];
}

export function ManagementHubScreen() {
  const router = useRouter();
  const unread = useOperationsNotifications().unread;
  const { state, retry, refresh, reloading } = useManagementHub();
  const { width } = useWindowDimensions();

  /* IZGARANIN SÜTUN GENİŞLİĞİ HESAPLANIR, YÜZDEYLE VERİLMEZ — depo hub'ında cihazda ölçülmüş
     karar (`warehouse-hub-screen` künyesi: yüzde beklenmedik bir tabana çözülüp kutucukları
     ekranın beşte birine düşürmüştü). İki hub aynı ızgarayı çiziyor, aynı hesapla. */
  const tileWidth = (width - 2 * operationsTheme.space['6xl'] - operationsTheme.space.lg) / 2;

  const hub = state.status === 'ready' ? state.hub : null;
  const complaint = hub === null ? null : complaintCardOf(hub.queue);
  const exception = hub === null ? null : exceptionCardOf(hub.queue);
  const quiet = hub === null ? [] : quietCardsOf(hub.queue);
  const decisionCount = (complaint === null ? 0 : 1) + (exception === null ? 0 : 1) + quiet.length;

  return (
    <View style={styles.screen} testID="operations-section-management">
      <OperationsSectionHeader
        section="management"
        eyebrow={t.hub.eyebrow}
        title={t.hub.title}
        /* BAĞLAM SATIRI (v3:2076) — "4 karar · 2 tanesi gün içinde". İkinci yarısı ÇİZİLMEDİ:
           kararların hangisinin gün içinde kapanması gerektiğini söyleyen bir alan (son tarih,
           öncelik) kuyruk sözleşmesinde yok. Okuma tamamlanmadan satır hiç doğmaz — yüklenirken
           "0 karar" yazmak, dolu bir kutuyu boş göstermek olurdu. */
        context={
          hub === null
            ? undefined
            : decisionCount === 0
              ? t.hub.contextEmpty
              : fillCopy(t.hub.context, { n: String(decisionCount) })
        }
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
        /* Avatarın BİÇİMİ tek duraktan (kitin squircle'ı), RENGİ bölümden — ortak defterin kararı
           30.08. Yönetim tasarımında avatar koyu (v3:25), depo ve kuryede zeytin; ton verilmezse
           zeytin gelir, yani yalnız bu hub kendi rengini söyler. */
        identity={<OperationsStaffMenu tone="ink" testID="operations-staff-menu" />}
      />

      {/* AŞAĞI ÇEKİNCE YENİLE (kullanıcı isteği 30.08, depo hub'ıyla aynı karar): karar kutusu
          günün kuyruğunu gösteriyor ve tazelemenin tek yolu ekrandan çıkıp girmekti. */}
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={reloading} onRefresh={refresh} {...pullRefreshColors(operationsTheme.colors.olive)} />
        }
        testID="management-hub-body"
      >
        {state.status === 'loading' ? (
          /* İLK YÜK: HALKA DEĞİL İSKELET (v3'ün ilk-yük dili — `OperationsSkeletonList` künyesi).
             Halka yerleşim tutmaz: söndüğü an kartlar birden doğar ve sayfa zıplar. Üç kutu
             kuyruğun kendi sırasını tutuyor: iki karar kartı + bir sessiz satır. */
          <View style={styles.skeleton}>
            <OperationsSkeletonList
              heights={[SKELETON_DECISION_HEIGHT, SKELETON_DECISION_HEIGHT, SKELETON_QUIET_HEIGHT]}
              label={t.hub.loading}
              testID="management-hub-loading"
            />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.noticeBlock}>
            <OperationsNoticeBlock
              variant="error"
              title={t.hub.error.title}
              description={t.hub.error.body}
              retry={{ label: t.hub.error.retry, onPress: retry }}
              testID="management-hub-error"
            />
          </View>
        ) : decisionCount === 0 ? (
          <View style={styles.noticeBlock}>
            <OperationsNoticeBlock
              variant="empty"
              title={t.hub.empty.title}
              description={t.hub.empty.body}
              testID="management-hub-empty"
            />
          </View>
        ) : (
          <View style={styles.cards}>
            {/* ── 1. KOYU KART · ŞİKÂYET ──────────────────────────────────── */}
            {complaint === null ? null : (
              <PressableSurface
                onPress={() =>
                  hub?.queue.complaints.head === null || hub?.queue.complaints.head === undefined
                    ? router.navigate('/complaint')
                    : router.navigate({ pathname: '/complaint', params: { id: hub.queue.complaints.head.ticketId } })
                }
                feedback="scale"
                style={styles.urgent}
                accessibilityLabel={`${complaint.meta} — ${complaint.title}`}
                testID="management-decision-complaint"
              >
                <View style={styles.urgentHead}>
                  <Text style={styles.urgentBadge}>{t.hub.rows.complaint.badge}</Text>
                  <Text style={styles.urgentMeta}>{complaint.meta}</Text>
                </View>
                {/* İKİ SATIRDA KIRPILIR: önizleme 120 karaktere kadar gelebiliyor (`previewOf`)
                    ve tasarımın koyu kartı iki satırlık bir blok — uzun bir şikâyet kartı ekranın
                    yarısına yayılsaydı altındaki üç karar görünmez olurdu. */}
                <Text style={styles.urgentTitle} numberOfLines={2}>
                  {complaint.title}
                </Text>
                <View style={styles.urgentFoot}>
                  {/* Damga AMBER: bekleyen bir cevap hata değil, bitirilmesi gereken bir iştir
                      (token künyesi `on-ink-warn`). Kırmızı olsaydı ekran her açık şikâyette
                      "bir şey bozuldu" derdi. */}
                  <Text style={styles.urgentStamp}>{complaint.footnote}</Text>
                  <Text style={styles.urgentChevron}>›</Text>
                </View>
              </PressableSurface>
            )}

            {/* ── 2. ÇERÇEVELİ KART · EKSİK TOPLAMA ───────────────────────── */}
            {exception === null ? null : (
              <PressableSurface
                onPress={() => router.navigate('/order-exception')}
                feedback="scale"
                style={styles.attention}
                accessibilityLabel={`${t.hub.rows.exception.badge} — ${exception.title}`}
                testID="management-decision-exception"
              >
                <View style={styles.attentionHead}>
                  <Text style={styles.attentionBadge}>{t.hub.rows.exception.badge}</Text>
                  <Text style={styles.attentionRef}>{exception.ref}</Text>
                </View>
                {/* Ürün adı + eksik adet iki satıra sığar; tasarımın kartı da iki satırlık. */}
                <Text style={styles.attentionTitle} numberOfLines={2}>
                  {exception.title}
                </Text>
                <View style={styles.attentionFoot}>
                  <Text style={styles.attentionAction}>{t.hub.rows.exception.action}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </PressableSurface>
            )}

            {/* ── 3. SESSİZ SATIR KARTLARI ────────────────────────────────── */}
            {/* Kitin `panel` tonu + `chevron`: kart deseni (zemin · kenar · yarıçap · yön oku)
                artık tek yerden geliyor, ekran yalnız içeriği yazıyor. */}
            {quiet.map((card) => (
              <OperationsSurface
                key={card.key}
                tone="panel"
                padding="md"
                chevron
                onPress={() => router.navigate(card.route)}
                accessibilityLabel={`${card.eyebrow} — ${card.title}`}
                testID={`management-decision-${card.key}`}
              >
                <View style={styles.quietText}>
                  <Text style={styles.quietEyebrow}>{card.eyebrow}</Text>
                  <Text style={styles.quietTitle}>{card.title}</Text>
                  <Text style={styles.quietSubtitle}>{card.subtitle}</Text>
                </View>
              </OperationsSurface>
            ))}
          </View>
        )}

        {/* ── 4. GÜNÜN NABZI — durum dalının DIŞINDA (künye) ──────────────── */}
        <Text style={styles.pulseLabel}>{t.hub.pulse}</Text>
        <View style={styles.grid}>
          {pulseTilesOf(hub).map((tile) => (
            <OperationsSurface
              key={tile.key}
              tone="panel"
              padding="md"
              onPress={() => router.navigate(tile.route)}
              style={[styles.tile, { width: tileWidth }]}
              accessibilityLabel={`${tile.title} — ${tile.subtitle}`}
              testID={`management-pulse-${tile.key}`}
            >
              <Text style={styles.tileValue} testID={`management-pulse-${tile.key}-value`}>
                {tile.value ?? t.hub.unknown}
              </Text>
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={[styles.tileSubtitle, tile.alert ? styles.tileSubtitleAlert : null]}>{tile.subtitle}</Text>
            </OperationsSurface>
          ))}
        </View>

        <Text style={styles.footnote}>{t.hub.footnote}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
  },
  /* İskelet kartların DURDUĞU YERDE durur (aynı üst boşluk): yükleme bitince liste yukarı
     kaymaz, kutular yerini kartlara bırakır. */
  skeleton: {
    paddingTop: operationsTheme.space['3xl'],
  },
  noticeBlock: {
    paddingTop: operationsTheme.space['7xl'],
  },
  cards: {
    paddingTop: operationsTheme.space['3xl'],
    gap: operationsTheme.space.lg,
  },

  /* ── 1. Koyu kart (v3:2085) ─────────────────────────────────────────────
     Ekranın TEK koyu yüzeyi. Yarıçap `pill` (22) — v3 burada kartın kendisinden (20) bir tık
     yuvarlak bir kutu çiziyor ve fark okunuyor: koyu blok daha yumuşak bir kenarla duruyor. */
  urgent: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.pill,
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space.xl,
  },
  urgentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** "CEVAP BEKLİYOR" — dolu terracotta rozet; koyu zeminde tek renkli vurgu. */
  urgentBadge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.terracotta,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.card,
  },
  urgentMeta: {
    flex: 1,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-ink-muted'],
  },
  urgentTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    lineHeight: operationsTheme.text.body * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-image'],
  },
  urgentFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  urgentStamp: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  urgentChevron: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['on-ink-muted'],
  },

  /* ── 2. Çerçeveli kart (v3:2098) ────────────────────────────────────────
     Zemin `panel` (v3 #fdf8f3 ile Δ2/2/1 — gözle aynı), çerçeve TERRACOTTA. Tasarımın açık
     terracotta çizgisi (#d9a97f) hiçbir durağa 8 kanaldan yakın değil; ikinci bir ton açmak
     yerine ailenin kendi rengi kullanıldı — kart bir tık daha yüksek sesle "buraya bak" diyor. */
  attention: {
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    gap: operationsTheme.space.lg,
  },
  attentionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  attentionBadge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.terracotta,
  },
  attentionRef: {
    flex: 1,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  attentionTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    lineHeight: operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  attentionFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  attentionAction: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },

  /* ── 3. Sessiz satır kartı (v3:2110) ────────────────────────────────────── */
  /* Kartın kabuğu (zemin · kenar · yarıçap · dolgu · yön oku) KİTTEN geliyor — burada yalnız
     içeriğin dizilimi kaldı. */
  quietText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  quietEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  quietTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  quietSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  chevron: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },

  /* ── 4. Günün nabzı ─────────────────────────────────────────────────────── */
  pulseLabel: {
    paddingTop: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  /* Kutucuk TASARIMIN ölçüsünde (96), depo hub'ının 132'sinde değil — `pulseTile` künyesi.
     `justifyContent: 'space-between'` de SÖKÜLDÜ: başlığın `marginTop:'auto'`u zaten onu dibe
     itiyor, ikisi birlikte sayının altındaki boşluğu iki kez açıyordu (görsel ajanı ölçtü). */
  /* Kutucuğun kabuğu kitten; ekranda kalan yalnız ÖLÇÜ ve iç aralık — genişlik hesaplanıyor
     (yüzde beklenmedik bir tabana çözülüyordu), yükseklik tasarımın kendi durağı. */
  tile: {
    minHeight: operationsTheme.size.pulseTile,
    gap: operationsTheme.space.sm,
  },
  /** Büyük sayı Lora. Başlıktan (24) bir kademe küçük: kutucuk ekranın konusu değil, nabzı. */
  tileValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  tileTitle: {
    marginTop: 'auto',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  tileSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  tileSubtitleAlert: {
    color: operationsTheme.colors.terracotta,
  },
  footnote: {
    paddingTop: operationsTheme.space['2xl'],
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
