import { cutoffBelongsToPreviousDay } from '@lezzet/domain-core';
import { ORDER_STATUS_LABELS, type OrderStatus, type PaymentMethod } from '@lezzet/types';
import { money, num } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type {
  AlertBandView,
  DeliveryRouteView,
  DeliveryStopView,
  FlowStepView,
  KpiCardView,
  ProposalTeaserView,
  QueueGroupView,
  QueueItemView,
  RouteFlowView,
} from './dashboard-types';

// Panel (09.3) — SAF dönüştürücüler. **Burada DB okuması YOK ve olmayacak:** bu dosya istemci
// paketine giriyor (istemci kökü tipleri ve etiketleri buradan alıyor); bir servis importu
// konulduğu an supabase-js de istemciye gider ve derleme `node:crypto` ile kırılır — depolar
// ekranında ölçüldü (17.08, `warehouses/page.tsx` künyesi). Okuma sayfada kalır.
//
// İkinci kural: **ton bir karardır, bileşen seçmez.** Aynı olgu iki ekranda iki renkte görünmesin
// diye `OpsTone` burada veriden türetilir.

/** Sipariş başına varsayılan hazırlık payı (dk) — nabzın "yetişir mi" sorusunun tek varsayımı. */
const PREP_MINUTES_PER_ORDER = 4;

/** "11:00" → 660. Geçersiz metin `null` döner: ayar bozuksa akış adımı hiç çizilmez, sıfır sanılmaz. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Kalan süre insan dili: 20 dk · 1 sa 30 dk · 2 sa. */
function countdownLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} dk kaldı`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${h} sa ${rest} dk kaldı` : `${h} sa kaldı`;
}

/** Bir rotanın bugünkü ham olguları: dört eşik saati + hazırlık sayacı + bugün koşup koşmadığı. */
export interface RouteFlowFact {
  zoneId: string;
  zoneName: string;
  warehouseCode: string | null;
  times: { orderCutoff: string; prepCutoff: string; routeDeparture: string; courierClose: string };
  readyCount: number;
  totalCount: number;
  runsToday: boolean;
  /** Koşmadığı günlerde günlerini söyleyen etiket ("Cum · Cts"); bugün koşuyorsa `null`. */
  weekdayLabel: string | null;
}

/** Kart başlıkları — kartın kendi metni. */
const FLOW_TITLES: Record<FlowStepView['key'], string> = {
  orderCutoff: 'Sipariş kesimi',
  prepCutoff: 'Depo hazırlık kapanışı',
  routeDeparture: 'Rota çıkışı',
  courierClose: 'Kurye kapanışı',
  nextCutoff: 'Sonraki seferin kesimi',
};

/**
 * Gün akışı — **her rota kendi kart şeridini alır** (kullanıcı kararı 18.08). Kartların tasarımı
 * DEĞİŞMEDİ; değişen, rota sayısı kadar tekrarlanmaları ve hangi rotaya ait olduklarının yazılması.
 *
 * Eskiden akış eşik TÜRÜ ekseninde tekti ve her kart bütün rotaların EN ERKENİNİ yazıyordu: ikinci
 * rotanın saati hiç görünmüyordu, tek rotalı kurulumda ise akışın kime ait olduğu okunamıyordu.
 *
 * ── GÜNÜN SAATLERİ, BİR SEFERİN DEĞİL ───────────────────────────────────────
 * Kesim hazırlıktan sonraysa (`cutoffBelongsToPreviousDay`) BUGÜNÜN teslimini kapatan kesim DÜN akşam
 * oldu — geçmiştir. Sıralama değeri bu yüzden `saat − 1440`: kart kendiliğinden en başa geçer ve
 * `tamam` olur. Eskiden bugünün saatine göre sıralanıp en SONA düşüyordu ve ekran aynı anda hem
 * "önceki gün" hem "sırada" diyordu (kullanıcı bildirdi 18.08).
 *
 * Aynı kural BUGÜN AKŞAMKİ kesimi de doğurur: o saat sonraki seferin listesini kapatır ve bugün
 * gerçekleşir, yani günün akışına aittir — ayrı kart olarak sonda durur (`nextCutoff`). Kesim önceki
 * güne ait DEĞİLSE bu kart hiç yoktur: o hâlde sonraki seferin kesimi yarındır.
 *
 * **Bugün koşmayan rota SÖNÜK gelir:** kartları çizilir ama hiçbiri `now` olmaz ve geri sayım
 * taşımaz — o rotanın saatleri bugünle ilgili bir söz vermiyor. Gizlemek yerine sönük göstermek
 * kullanıcı kararı: operatör hangi rotaların var olduğunu da bilmeli.
 *
 * Ayarı okunamayan eşik **atlanır**: uydurulmuş bir saat, yanlış işe yönlendiren bir karttır.
 */
export function buildRouteFlow(facts: readonly RouteFlowFact[], input: { nowMinutes: number }): RouteFlowView[] {
  return facts.map((route) => {
    const prevDay = cutoffBelongsToPreviousDay(route.times.orderCutoff, route.times.prepCutoff);

    const raw: { key: FlowStepView['key']; time: string; prevDay: boolean }[] = [
      { key: 'orderCutoff', time: route.times.orderCutoff, prevDay },
      { key: 'prepCutoff', time: route.times.prepCutoff, prevDay: false },
      { key: 'routeDeparture', time: route.times.routeDeparture, prevDay: false },
      { key: 'courierClose', time: route.times.courierClose, prevDay: false },
      ...(prevDay ? [{ key: 'nextCutoff' as const, time: route.times.orderCutoff, prevDay: false }] : []),
    ];

    // Sıra SAATTEN gelir, dizi sırasından değil (ölçüldü 17.08): kesim 16:00, hazırlık 11:00 olabilir.
    // `prevDay` bir gün geriye, `nextCutoff` günün sonuna çekilir — aynı saat iki kez geçtiğinde
    // ikincisi sondadır.
    const ordered = raw
      .map((s) => {
        const at = toMinutes(s.time);
        if (at === null) return null;
        return { ...s, at: s.prevDay ? at - 1440 : s.key === 'nextCutoff' ? at + 1440 : at };
      })
      .filter((s): s is { key: FlowStepView['key']; time: string; prevDay: boolean; at: number } => s !== null)
      .sort((a, b) => a.at - b.at);

    const pending = route.totalCount - route.readyCount;
    const prepAt = toMinutes(route.times.prepCutoff);
    const prepLeft = prepAt === null ? null : prepAt - input.nowMinutes;
    // Kalan süre kalan işe yetiyor mu — dakika başına bir sipariş kaba ama dürüst bir ölçü; eşiği
    // parametrik tutmak yerine tek varsayımla açık yazıyoruz (`CLAUDE §4`: makul varsayılan).
    const tight = route.runsToday && prepLeft !== null && prepLeft > 0 && prepLeft < pending * PREP_MINUTES_PER_ORDER;
    const missed = route.runsToday && prepLeft !== null && prepLeft <= 0 && pending > 0;

    /**
     * Kartın not satırı — **o rotanın** olgusu. Geçmiş kart OLAN'ı söyler, gelecek kart BEKLENEN'i.
     *
     * Eskiden notlar gün geneline aitti ("24 sipariş girdi · 3 depo"); rota bazına geçince o sayılar
     * yanlış olurdu — bir rotanın kartında bütün depoların toplamı yazardı.
     */
    const noteOf = (key: FlowStepView['key'], done: boolean): string => {
      switch (key) {
        case 'orderCutoff':
          // Kesim önceki güne aitse bugünün 22:00'ı bugünü değil SONRAKİ seferi kapatır.
          return prevDay
            ? 'bu seferin siparişleri kapandı'
            : done
              ? 'bugün teslim edilecekler kapandı'
              : 'bugün teslim edilecekler kapanır';
        case 'prepCutoff':
          if (route.totalCount === 0) return 'bugüne sipariş yazılmadı';
          return done
            ? `${num(route.readyCount)}/${num(route.totalCount)} hazırlandı`
            : pending > 0
              ? `${num(route.readyCount)} hazır · ${num(pending)} sipariş bekliyor`
              : 'hepsi hazır · bekleyen yok';
        case 'routeDeparture':
          return route.totalCount > 0 ? `${num(route.totalCount)} sipariş` : 'bugüne sipariş yazılmadı';
        case 'courierClose':
          return done ? 'kasa teslim alındı' : 'gün kapanışı bekleniyor';
        case 'nextCutoff':
          return 'sonraki seferin siparişleri kapanır';
      }
    };

    let markedNow = false;
    const steps: FlowStepView[] = ordered.map((s) => {
      const done = route.runsToday && s.at <= input.nowMinutes;
      const base = { key: s.key, time: s.time, title: FLOW_TITLES[s.key], note: noteOf(s.key, done), prevDay: s.prevDay };
      if (!route.runsToday) return { ...base, state: 'later' as const, countdown: null, tone: 'neutral' as OpsTone };
      if (s.at <= input.nowMinutes) return { ...base, state: 'done' as const, countdown: null, tone: 'olive' as OpsTone };
      if (!markedNow) {
        markedNow = true;
        return {
          ...base,
          state: 'now' as const,
          countdown: countdownLabel(s.at - input.nowMinutes),
          tone: tight || missed ? ('amber' as OpsTone) : ('olive' as OpsTone),
        };
      }
      return { ...base, state: 'later' as const, countdown: null, tone: 'neutral' as OpsTone };
    });

    const tone: OpsTone = !route.runsToday
      ? 'neutral'
      : route.totalCount === 0
        ? 'neutral'
        : pending === 0
          ? 'olive'
          : missed
            ? 'red'
            : tight
              ? 'amber'
              : 'olive';

    return {
      zoneId: route.zoneId,
      zoneName: route.zoneName,
      warehouseCode: route.warehouseCode,
      runsToday: route.runsToday,
      weekdayLabel: route.weekdayLabel,
      steps,
      readyCount: route.readyCount,
      totalCount: route.totalCount,
      note: !route.runsToday
        ? 'bugün koşmuyor'
        : route.totalCount === 0
          ? 'bugüne sipariş yazılmadı'
          : pending === 0
            ? 'tamamı hazırlandı'
            : missed
              ? `${route.times.prepCutoff} kesimi geçti · ${num(pending)} sipariş hazırlanmadı`
              : `${route.times.prepCutoff} kesimine ${num(prepLeft ?? 0)} dk · ${num(pending)} sipariş hazırlanmadı`,
      statusLabel: !route.runsToday
        ? 'bugün koşmuyor'
        : route.totalCount === 0
          ? 'boş gün'
          : pending === 0
            ? 'hazır'
            : missed
              ? 'kesim kaçtı'
              : tight
                ? 'kesim riski'
                : 'yetişiyor',
      tone,
    };
  });
}

/**
 * Şeridin baktığı eşik: BUGÜN KOŞAN rotaların içinde sıradaki olanların en erkeni.
 *
 * Satırı da döndürür çünkü şeridin cümlesi rotanın ADINI ve ölçülmüş notunu taşıyor — "Rota çıkışı"
 * tek başına hangi aracı kastettiğini söylemiyordu (kullanıcı gözlemi 18.08).
 */
function currentStepOf(rows: readonly RouteFlowView[]): { step: FlowStepView; zoneName: string; row: RouteFlowView } | null {
  const nows = rows
    .filter((r) => r.runsToday)
    .flatMap((r) => r.steps.filter((s) => s.state === 'now').map((s) => ({ step: s, zoneName: r.zoneName, row: r })));
  if (nows.length === 0) return null;
  return [...nows].sort((a, b) => a.step.time.localeCompare(b.step.time))[0] ?? null;
}

/** Bir satırın hazırlık kesimi — şerit cümlelerinin saat kaynağı. */
function prepCutoffOf(row: RouteFlowView): string {
  return row.steps.find((s) => s.key === 'prepCutoff')?.time ?? '';
}

interface BandFacts {
  /**
   * Gün akışı satırları — hem sıradaki eşik hem kesim riski BURADAN okunur; **yalnız bugün koşan
   * rotalar** hesaba girer.
   *
   * Kesim cümlesinin saati geride kalan ROTANIN kendi hazırlık kesimidir, sıradaki eşik değil. İlk
   * yazımda cümle "şimdi" adımının saatini kullanıyordu ve ilk canlı istekte yanlış çıktı (ölçüldü
   * 17.08, saat 11:02): kesim 11:00'da geçmişti, sıradaki adım 14:00 rota çıkışıydı ve şerit
   * *"14:00 kesimine yetişmiyor"* diyordu.
   */
  flow: RouteFlowView[];
  queue: QueueGroupView[];
}

/**
 * Üst şerit — günün TEK en yakın eşiği (tezgâh sözleşmesi: *"cümle saat + kuyruk durumundan üretilir,
 * elle yazılmaz"*).
 *
 * İki hâl var ve ikisi de birinci sınıf: **kesim riski** varsa şerit onu öne çıkarır ve Hazırlık'a
 * götürür; **temiz masa** ise kutlar, uyarmaz (`design/pages/admin-dashboard.md §4`).
 */
export function buildBand(facts: BandFacts): AlertBandView {
  const currentRow = currentStepOf(facts.flow);
  const current = currentRow?.step ?? null;
  const items = facts.queue.flatMap((g) => g.items);
  const totalCount = items.reduce((sum, i) => sum + i.count, 0);
  const urgent = facts.queue.find((g) => g.key === 'now')?.items ?? [];
  const urgentCount = urgent.reduce((sum, i) => sum + i.count, 0);
  // Boş gün ve koşmayan rota geride kalmış sayılmaz: hazırlanacak sipariş yoksa kesim de kaçmaz.
  const behind = facts.flow.filter((p) => p.runsToday && p.totalCount > 0 && p.tone !== 'olive');

  // **Sayıya EK getirilmez.** İlk yazımda "2'i acil" çıktı (ölçüldü 17.08): Türkçe iyelik eki sayının
  // OKUNUŞUNA bağlıdır (1'i · 2'si · 3'ü · 6'sı) ve tek kalıpla doğru yazılamaz. "tanesi" her sayıda
  // çalışır — dilbilgisini koşula bağlamak yerine ekten kurtulmak.
  const queueDetail =
    totalCount === 0
      ? null
      : `Bekleyen işler kuyruğunda ${num(totalCount)} kalem var${urgentCount > 0 ? `, ${num(urgentCount)} tanesi acil: ${urgent.map((i) => i.detail).join(' · ')}` : ''}.`;
  /**
   * **"Bekleyen İşler" düğmesi KALDIRILDI** (kullanıcı kararı 18.08).
   *
   * Sayfa içi bir çapaydı (`#bekleyen-isler`) ve götürdüğü blok zaten ekranda görünüyordu: ölçüldü,
   * kuyruk `y=592`de başlayıp `y=844`te bitiyor, görüntü alanı 900 px — tıklayınca hiçbir şey
   * olmuyordu. Kuyruğun kaç kalem olduğu şeridin GEREKÇE satırında zaten yazılı; bir de düğme
   * koymak, iş yapmayan bir düğmeyi günde onlarca kez göstermek demekti.
   */
  const secondary = null;

  // Kesim riski en yüksek sesle konuşur: mal rafta kalırsa gün kurtarılamaz, ötekiler gün içinde döner.
  if (behind.length > 0) {
    const late = behind.reduce((sum, p) => sum + (p.totalCount - p.readyCount), 0);
    // Kesim GEÇTİYSE bu bir risk değil olgudur ve cümle geriye doğru konuşur. İkisini ayırmayan bir
    // metin, kaçmış bir kesimi hâlâ yetişilebilir gibi gösterir.
    const missed = behind.some((p) => p.tone === 'red');
    // Saat GERİDE KALAN ROTANIN kendi kesimi. Birden çok rota geride kaldıysa en erken olan söylenir:
    // en sıkı kısıt hangisiyse şerit onu işaret eder (gün akışıyla aynı kural).
    const cutoff = behind.map(prepCutoffOf).sort()[0] ?? '';
    const names = behind.map((p) => p.zoneName).join(' ve ');
    return {
      eyebrow: missed ? `KESİM KAÇTI · ${cutoff}` : `ŞİMDİ · KESİME ${(current?.countdown ?? '').toLocaleUpperCase('tr-TR')}`,
      headline: missed
        ? `${names} ${cutoff} hazırlık kesimini kaçırdı — ${num(late)} sipariş hazırlanmadı.`
        : `${names} ${cutoff} kesimine yetişmiyor — ${num(late)} sipariş hâlâ hazırlanmadı.`,
      detail: queueDetail,
      tone: missed ? 'red' : 'amber',
      primary: { label: 'Depo Hazırlık →', href: '/operations/preparation' },
      secondary,
    };
  }

  if (totalCount === 0) {
    return {
      eyebrow: current ? `SIRADAKİ · ${current.time}` : 'GÜN AKIŞI',
      headline: 'Karar bekleyen iş yok — masa temiz.',
      // Kartın kendi notu kalktı; cümle SATIRIN ölçülmüş notundan ve rota adından kuruluyor.
      detail: currentRow ? `${currentRow.step.title} · ${currentRow.zoneName}: ${currentRow.row.note}.` : null,
      tone: 'olive',
      primary: null,
      secondary: null,
    };
  }

  // Bu dalda hiç düğme yok: şeridin işaret edebileceği tek yer kuyruktu, o da kaldırıldı (yukarıdaki
  // künye). Şerit burada bir cümle söylüyor ve karar kuyruk satırlarının kendi köprülerinde veriliyor.
  return {
    eyebrow: current ? `SIRADAKİ · ${current.time} · ${current.countdown ?? ''}`.trim() : 'BEKLEYEN İŞLER',
    headline: currentRow
      ? `${currentRow.step.title} · ${currentRow.zoneName} — ${currentRow.row.note}.`
      : `${num(totalCount)} kalem karar bekliyor.`,
    detail: queueDetail,
    tone: urgentCount > 0 ? 'amber' : 'neutral',
    primary: null,
    secondary: null,
  };
}

/** Kuyruk satırının ham hâli — sayfa doldurur, küme ataması burada yapılır. */
export interface QueueFact {
  key: string;
  group: QueueGroupView['key'];
  count: number;
  title: string;
  stamp: string | null;
  detail: string;
  tone: OpsTone;
  link: { label: string; href: string };
}

const GROUP_TITLES: Record<QueueGroupView['key'], string> = {
  now: 'Şimdi karar ver',
  today: 'Bugün içinde',
  week: 'Bu hafta',
};

/**
 * Küme başlığının tonu — **aciliyetin kendisinden** gelir, içindeki satırlardan değil.
 *
 * Satır tonu ayrı bir şey (bir "bu hafta" işi kırmızı olabilir); küme başlığı ise kümenin ne
 * demek olduğunu söyler. Ton burada duruyor çünkü karar okuma katmanının: bileşen kendi rengini
 * seçerse aynı olgu iki ekranda iki renge düşer (`dashboard-types` künyesi).
 */
const GROUP_TONES: Record<QueueGroupView['key'], OpsTone> = {
  now: 'red',
  today: 'amber',
  week: 'neutral',
};

/**
 * Bekleyen işler — üç aciliyet kümesi. **Sayısı sıfır olan satır hiç görünmez** ve boş küme çizilmez:
 * "0 açık talep" bir bilgi değil, bir gürültüdür.
 */
export function buildQueue(facts: QueueFact[]): QueueGroupView[] {
  const groups: QueueGroupView['key'][] = ['now', 'today', 'week'];
  return groups
    .map((key) => {
      const items: QueueItemView[] = facts.filter((f) => f.group === key && f.count > 0).map(({ group: _group, ...item }) => item);
      const total = items.reduce((sum, i) => sum + i.count, 0);
      return {
        key,
        title: GROUP_TITLES[key],
        tone: GROUP_TONES[key],
        summary: `${num(total)} kalem · ${num(items.length)} satır`,
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}

/** Asistan önerileri — kuyruğun altında ayrı blok; sıfırsa hiç çizilmez. */
export function buildProposals(count: number, kinds: string[]): ProposalTeaserView | null {
  if (count === 0) return null;
  const detail =
    kinds.length > 0
      ? `${kinds.slice(0, 3).join(', ')}${kinds.length > 3 ? ` ve ${num(kinds.length - 3)} öneri daha` : ''} — karar kuyrukta veriliyor.`
      : 'Onay bekleyen öneriler kuyrukta.';
  return { count, detail, href: '/operations/assistant' };
}

interface KpiFacts {
  orders: { today: number; yesterday: number; split: string | null; series: number[] };
  revenue: { todayCents: number; deltaPercent: number | null; split: string | null; series: number[] };
  receivable: { codCents: number; termCents: number; overdueCount: number; overdueCents: number; series: number[] };
  undelivered: { today: number; series: number[]; detail: string | null };
  /**
   * `null` = **bu tur ölçülmedi**, sıfır DEĞİL (`CLAUDE §1`). Kart o zaman hiç çizilmez; "0 marj-altı
   * ürün" yazmak, hiç sayılmamış bir kümeyi temiz göstermek olurdu.
   */
  belowMargin: { count: number; names: string[]; series: number[] } | null;
}

/**
 * Beş gösterge (`design/pages/admin-dashboard.md §2.3`).
 *
 * İkisi tasarımdan farklı ve bu KASITLI: *"zamanında teslim %94"* yerine **bugün teslim edilemeyen**
 * (yüzde analizdi, karar tetiklemiyordu; teslim penceresi kavramı da yok), *"marj-altı satış"* yerine
 * **marj-altı fiyatlı ürün** (satış düzeyi ölçüm kapısı yok, karar aynı: fiyatı düzelt). Gerekçe
 * `design/KARARLAR.md` › Panel (17.08).
 */
export function buildKpis(facts: KpiFacts): KpiCardView[] {
  const orderDelta = facts.orders.today - facts.orders.yesterday;
  const receivableTotal = facts.receivable.codCents + facts.receivable.termCents;
  const cards: (KpiCardView | null)[] = [
    {
      key: 'orders',
      label: 'Bugünkü sipariş',
      value: num(facts.orders.today),
      /**
       * Cümle TAM yazılır: eski hâli `↓ 4 dün` idi ve iki türlü okunuyordu — "dün 4" mü, "4 azaldı"
       * mı? (18.08 ekran incelemesi). Ok işareti yönü söylüyor ama neyin neye göre değiştiğini
       * söylemiyor; karşılaştırmanın hedefi ("dünden") cümlede geçmeli.
       */
      delta:
        orderDelta === 0
          ? 'dünle aynı'
          : `${orderDelta > 0 ? '↑' : '↓'} dünden ${num(Math.abs(orderDelta))} ${orderDelta > 0 ? 'fazla' : 'az'}`,
      deltaTone: orderDelta > 0 ? 'olive' : orderDelta < 0 ? 'neutral' : 'neutral',
      split: facts.orders.split,
      series: facts.orders.series,
      link: { label: 'Siparişler →', href: '/operations/orders' },
    },
    {
      key: 'revenue',
      label: 'Bugünkü ciro',
      value: money(facts.revenue.todayCents),
      // Ölçülemeyen değer sıfır değildir: dün cirosu yoksa yüzde HİÇ yazılmaz (`CLAUDE §1`).
      delta:
        facts.revenue.deltaPercent === null
          ? null
          : `${facts.revenue.deltaPercent > 0 ? '↑' : facts.revenue.deltaPercent < 0 ? '↓' : ''} %${num(Math.abs(facts.revenue.deltaPercent))}`.trim(),
      deltaTone: (facts.revenue.deltaPercent ?? 0) >= 0 ? 'olive' : 'neutral',
      split: facts.revenue.split,
      series: facts.revenue.series,
      link: { label: 'Raporlar →', href: '/operations/reports' },
    },
    {
      key: 'receivable',
      label: 'Bekleyen tahsilat',
      value: money(receivableTotal),
      // Kapıda ↔ vade TOPLANMAZ diye ayrı yazılır: ikisi ayrı iş, ayrı ekran (`§2.3`).
      delta: `kapıda ${money(facts.receivable.codCents)} · vade ${money(facts.receivable.termCents)}`,
      deltaTone: receivableTotal > 0 ? 'amber' : 'olive',
      split:
        facts.receivable.overdueCount > 0
          ? `${num(facts.receivable.overdueCount)} vade gecikmiş (${money(facts.receivable.overdueCents)})`
          : 'gecikmiş vade yok',
      series: facts.receivable.series,
      link: { label: 'Para →', href: '/operations/finance' },
    },
    {
      key: 'undelivered',
      label: 'Bugün teslim edilemeyen',
      value: num(facts.undelivered.today),
      // İki satır aynı cümleyi yazıyordu ("kapıdan dönen yok" iki kez, ölçüldü 17.08). Sıfır hâlinde
      // ikinci satır ne söyleyeceğini bilmiyorsa hiç yazılmaz — tekrar, bilgi değil gürültüdür.
      delta: facts.undelivered.today === 0 ? 'kapıdan dönen yok' : 'yeniden planlanmalı',
      deltaTone: facts.undelivered.today === 0 ? 'olive' : 'red',
      split: facts.undelivered.today === 0 ? null : facts.undelivered.detail,
      series: facts.undelivered.series,
      link: { label: 'Teslimat & Rota →', href: '/operations/deliveries' },
    },
    facts.belowMargin === null
      ? null
      : {
          key: 'belowMargin',
          label: 'Marj-altı fiyatlı ürün',
          value: num(facts.belowMargin.count),
          delta: facts.belowMargin.count === 0 ? 'temiz' : 'hedef marjın altında',
          deltaTone: facts.belowMargin.count === 0 ? 'olive' : 'red',
          split: facts.belowMargin.names.length > 0 ? facts.belowMargin.names.slice(0, 3).join(' · ') : null,
          series: facts.belowMargin.series,
          link: { label: 'Fiyatlar →', href: '/operations/prices' },
        },
  ];
  return cards.filter((c): c is KpiCardView => c !== null);
}

/** Durak tonu — durum kaydından türer; "bekliyor" nötr, yolda mavi, teslim olive, dönen kırmızı. */
function stopTone(status: OrderStatus): OpsTone {
  if (status === 'delivered' || status === 'completed') return 'olive';
  if (status === 'out_for_delivery') return 'blue';
  if (status === 'returned' || status === 'cancelled') return 'red';
  return 'neutral';
}

/** Durum sıralaması: olan bitmiş → yolda → bekleyen. Rota sırası YOK, o veri yok. */
const STATUS_ORDER: Record<string, number> = {
  delivered: 0,
  completed: 0,
  out_for_delivery: 1,
  ready: 2,
  preparing: 3,
  confirmed: 4,
  returned: 5,
  cancelled: 6,
  draft: 7,
};

export interface StopFact {
  orderId: string;
  reference: string | null;
  customerName: string;
  itemCount: number;
  channel: 'b2b' | 'b2c';
  dueCents: number | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  /** Gerçek teslim anı — yalnız teslim edilmiş durakta dolu; tahmin YOKTUR. */
  deliveredAt: string | null;
}

/**
 * Durak satırları — duruma göre gruplanır, **numara verilmez**.
 *
 * Tasarım 1…6 numaralı rota sırası çiziyordu; o sıra sistemde yok (`stop_order` kolonu yok) ve numara
 * olmayan bir kesinlik ima ediyor. Saat de yalnız OLMUŞ olanda: gelecek durak için ETA yok ve
 * olmayacak (aynı reddi kurye brief'i de taşıyor).
 */
export function toStops(facts: StopFact[]): DeliveryStopView[] {
  return [...facts]
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.customerName.localeCompare(b.customerName, 'tr'))
    .map((f) => ({
      orderId: f.orderId,
      reference: f.reference,
      customerName: f.customerName,
      itemsLabel: `${num(f.itemCount)} kalem`,
      channelLabel: f.channel === 'b2b' ? 'B2B' : 'B2C',
      // `money` değil `amount` kullanılmıştı ve ekranda "kapıda 26,80" çıkıyordu — birimsiz para,
      // kapıda tahsilat yapan kişiye söylenecek en son şeydir (ölçüldü 17.08, ilk canlı görüntü).
      dueLabel: f.dueCents !== null && f.dueCents > 0 ? `kapıda ${money(f.dueCents)}` : null,
      status: f.status,
      statusLabel: ORDER_STATUS_LABELS[f.status],
      tone: stopTone(f.status),
      time: f.deliveredAt === null ? null : timeOf(f.deliveredAt),
      paymentMethod: f.paymentMethod,
    }));
}

/** ISO an → "14:20". Operasyon yüzeyi tek dilde (tr) ve tek saat diliminde okunur. */
function timeOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** Rota kartı — ilerleme sayısı duraklardan türer, ayrı bir sayaç tutulmaz. */
export function toRoute(input: {
  key: string;
  courierName: string;
  zoneLabel: string | null;
  warehouseCode: string | null;
  stops: DeliveryStopView[];
}): DeliveryRouteView {
  const delivered = input.stops.filter((s) => s.status === 'delivered' || s.status === 'completed').length;
  return { ...input, deliveredCount: delivered, totalCount: input.stops.length };
}
