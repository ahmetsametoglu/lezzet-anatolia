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
  RoutePulseView,
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

/**
 * Bir eşiğin **en sıkı** hâli: en erken saat + onu taşıyan rota.
 *
 * Eşikler rota ekseninde tanımlı (kullanıcı kararı 17.08) ve gün akışı tek şerit kalsın diye her
 * eşik türü için en erken saat gösterilir. Alternatifleri (rota seçici, rota başına şerit) ekrana
 * yeni bir durum sokuyordu; en sıkı kısıt hem doğru bilgiyi verir hem tekilliği korur.
 */
export interface ThresholdFact {
  time: string;
  /** En erken saati taşıyan rota adı; tek rota varsa ya da hepsi aynı saatteyse `null`. */
  routeLabel: string | null;
}

interface FlowFacts {
  /** Gün içindeki dakika — sunucuda tek kez hesaplanır, tüm bölümler aynı "şimdi"ye bakar. */
  nowMinutes: number;
  times: {
    orderCutoff: ThresholdFact;
    prepCutoff: ThresholdFact;
    routeDeparture: ThresholdFact;
    courierClose: ThresholdFact;
  };
  /** Bugün girmiş sipariş sayısı + kaç depoda. */
  orderCount: number;
  warehouseCount: number;
  /** Hazırlık: hazır olan ↔ toplam. */
  readyCount: number;
  totalCount: number;
  /** Rota çıkışı: durak sayısı + kurye adları. */
  stopCount: number;
  courierNames: string[];
  /** Kurye kapanışı: kapıda beklenen tahsilat. */
  expectedCashCents: number;
  /** Kesim riski taşıyan depo var mı — `now` adımının tonunu belirler. */
  atRisk: boolean;
}

/**
 * Gün akışı — dört eşik (`design/pages/admin-dashboard.md §2.2`).
 *
 * Durum SAATTEN türer: geçmiş adım sonucuyla, ilk gelecek adım "şimdi", kalanlar sırada. Geçmiş
 * adımın notu OLAN'ı söyler ("24 sipariş girdi"), gelecek adımın notu BEKLENEN'i.
 *
 * Ayarı okunamayan eşik **atlanır** — uydurulmuş bir saat, yanlış işe yönlendiren bir şerit demektir.
 */
export function buildFlow(facts: FlowFacts): FlowStepView[] {
  const steps: {
    key: FlowStepView['key'];
    time: string;
    routeLabel: string | null;
    title: string;
    done: string;
    soon: string;
  }[] = [
    {
      key: 'orderCutoff',
      ...facts.times.orderCutoff,
      title: 'Sipariş kesimi',
      done: `${num(facts.orderCount)} sipariş girdi · ${num(facts.warehouseCount)} depo`,
      soon: 'bugün teslim edilecekler kapanır',
    },
    {
      key: 'prepCutoff',
      ...facts.times.prepCutoff,
      title: 'Depo hazırlık kapanışı',
      done: `${num(facts.readyCount)}/${num(facts.totalCount)} hazırlandı`,
      soon:
        facts.totalCount - facts.readyCount > 0
          ? `${num(facts.readyCount)} hazır · ${num(facts.totalCount - facts.readyCount)} sipariş bekliyor`
          : 'hepsi hazır · bekleyen yok',
    },
    {
      key: 'routeDeparture',
      ...facts.times.routeDeparture,
      title: 'Rota çıkışı',
      done: facts.courierNames.length > 0 ? `${facts.courierNames.join(' · ')} yola çıktı` : 'çıkış kaydı yok',
      soon:
        facts.stopCount > 0
          ? `${num(facts.stopCount)} durak${facts.courierNames.length > 0 ? ` · ${facts.courierNames.join(' · ')}` : ''}`
          : 'bugün rota siparişi yok',
    },
    {
      key: 'courierClose',
      ...facts.times.courierClose,
      title: 'Kurye kapanışı',
      done: 'kasa teslim alındı',
      soon:
        facts.expectedCashCents > 0
          ? `kapıda tahsilat beklenen ${money(facts.expectedCashCents)}`
          : 'kapıda tahsilat beklenmiyor',
    },
  ];

  // **SIRA SAATTEN GELİR, dizi sırasından DEĞİL** (ölçüldü 17.08, ilk canlı görüntü): eşikler burada
  // anlam sırasıyla yazılı (kesim → hazırlık → rota → kapanış) ama işletmenin saatleri o sırayı takip
  // etmek zorunda değil — sipariş kesimi 16:00'da, hazırlık kapanışı 11:00'da olabilir. Sıralanmadan
  // çizilince şerit hem yanlış adımı "şimdi" işaretledi (13:06'da 16:00'yı, oysa sıradaki 14:00'tü)
  // hem de akış kronolojik okunamadı (16:00 · 11:00 · 14:00 · 18:00).
  const ordered = steps
    .map((step) => ({ step, at: toMinutes(step.time) }))
    .filter((s): s is { step: (typeof steps)[number]; at: number } => s.at !== null)
    .sort((a, b) => a.at - b.at);

  let markedNow = false;
  const out: FlowStepView[] = [];
  for (const { step, at } of ordered) {
    if (at <= facts.nowMinutes) {
      out.push({ ...step, note: step.done, state: 'done', countdown: null, tone: 'olive' });
      continue;
    }
    if (!markedNow) {
      markedNow = true;
      out.push({
        ...step,
        note: step.soon,
        state: 'now',
        countdown: countdownLabel(at - facts.nowMinutes),
        tone: facts.atRisk ? 'amber' : 'olive',
      });
      continue;
    }
    out.push({ ...step, note: step.soon, state: 'later', countdown: null, tone: 'neutral' });
  }
  return out;
}

interface BandFacts {
  flow: FlowStepView[];
  queue: QueueGroupView[];
  /**
   * Nabız satırları — şeridin kesim cümlesi saatini BURADAN alır (`prepCutoff`), sıradaki eşikten
   * DEĞİL.
   *
   * İlk yazımda cümle `flow`daki "şimdi" adımının saatini kullanıyordu ve ilk canlı istekte yanlış
   * çıktı (ölçüldü 17.08, saat 11:02): kesim 11:00'da geçmişti, sıradaki adım 14:00 rota çıkışıydı ve
   * şerit *"14:00 kesimine yetişmiyor"* diyordu. Eşikler rota bazlı olduktan sonra kaynak kesinleşti:
   * geride kalan ROTANIN kendi kesimi.
   */
  pulse: RoutePulseView[];
}

/**
 * Üst şerit — günün TEK en yakın eşiği (tezgâh sözleşmesi: *"cümle saat + kuyruk durumundan üretilir,
 * elle yazılmaz"*).
 *
 * İki hâl var ve ikisi de birinci sınıf: **kesim riski** varsa şerit onu öne çıkarır ve Hazırlık'a
 * götürür; **temiz masa** ise kutlar, uyarmaz (`design/pages/admin-dashboard.md §4`).
 */
/** Sıradaki eşiğe kalan süre — kesim cümlesinin başlığında kullanılır; eşik yoksa boş kalır. */
function countdownOf(flow: readonly FlowStepView[]): string {
  const current = flow.find((f) => f.state === 'now');
  return (current?.countdown ?? '').toLocaleUpperCase('tr-TR');
}

export function buildBand(facts: BandFacts): AlertBandView {
  const current = facts.flow.find((f) => f.state === 'now') ?? null;
  const items = facts.queue.flatMap((g) => g.items);
  const totalCount = items.reduce((sum, i) => sum + i.count, 0);
  const urgent = facts.queue.find((g) => g.key === 'now')?.items ?? [];
  const urgentCount = urgent.reduce((sum, i) => sum + i.count, 0);
  const behind = facts.pulse.filter((p) => p.tone !== 'olive');

  // **Sayıya EK getirilmez.** İlk yazımda "2'i acil" çıktı (ölçüldü 17.08): Türkçe iyelik eki sayının
  // OKUNUŞUNA bağlıdır (1'i · 2'si · 3'ü · 6'sı) ve tek kalıpla doğru yazılamaz. "tanesi" her sayıda
  // çalışır — dilbilgisini koşula bağlamak yerine ekten kurtulmak.
  const queueDetail =
    totalCount === 0
      ? null
      : `Bekleyen işler kuyruğunda ${num(totalCount)} kalem var${urgentCount > 0 ? `, ${num(urgentCount)} tanesi acil: ${urgent.map((i) => i.detail).join(' · ')}` : ''}.`;
  const secondary = totalCount > 0 ? { label: `Bekleyen İşler (${num(totalCount)})`, href: '#bekleyen-isler' } : null;

  // Kesim riski en yüksek sesle konuşur: mal rafta kalırsa gün kurtarılamaz, ötekiler gün içinde döner.
  if (behind.length > 0) {
    const late = behind.reduce((sum, p) => sum + (p.totalCount - p.readyCount), 0);
    // Kesim GEÇTİYSE bu bir risk değil olgudur ve cümle geriye doğru konuşur. İkisini ayırmayan bir
    // metin, kaçmış bir kesimi hâlâ yetişilebilir gibi gösterir.
    const missed = facts.pulse.some((p) => p.tone === 'red');
    // Saat GERİDE KALAN ROTANIN kendi kesimi. Birden çok rota geride kaldıysa en erken olan söylenir:
    // en sıkı kısıt hangisiyse şerit onu işaret eder (gün akışıyla aynı kural).
    const cutoff = behind.map((p) => p.prepCutoff).sort()[0] ?? '';
    const names = behind.map((p) => p.zoneName).join(' ve ');
    return {
      eyebrow: missed ? `KESİM KAÇTI · ${cutoff}` : `ŞİMDİ · KESİME ${countdownOf(facts.flow)}`,
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
      detail: current ? `${current.title}: ${current.note}.` : null,
      tone: 'olive',
      primary: null,
      secondary: null,
    };
  }

  return {
    eyebrow: current ? `SIRADAKİ · ${current.time} · ${current.countdown ?? ''}`.trim() : 'BEKLEYEN İŞLER',
    headline: current ? `${current.title} — ${current.note}.` : `${num(totalCount)} kalem karar bekliyor.`,
    detail: queueDetail,
    tone: urgentCount > 0 ? 'amber' : 'neutral',
    primary: urgentCount > 0 ? { label: 'Bekleyen İşler →', href: '#bekleyen-isler' } : null,
    secondary,
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
 * Bekleyen işler — üç aciliyet kümesi. **Sayısı sıfır olan satır hiç görünmez** ve boş küme çizilmez:
 * "0 açık talep" bir bilgi değil, bir gürültüdür.
 */
export function buildQueue(facts: QueueFact[]): QueueGroupView[] {
  const groups: QueueGroupView['key'][] = ['now', 'today', 'week'];
  return groups
    .map((key) => {
      const items: QueueItemView[] = facts
        .filter((f) => f.group === key && f.count > 0)
        .map(({ group: _group, ...item }) => item);
      const total = items.reduce((sum, i) => sum + i.count, 0);
      return {
        key,
        title: GROUP_TITLES[key],
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

export interface PulseFact {
  zoneId: string;
  zoneName: string;
  warehouseCode: string | null;
  readyCount: number;
  totalCount: number;
  /** **O ROTANIN kendi** hazırlık kesimi — global saat değil (kullanıcı kararı 17.08). */
  prepCutoff: string;
}

/**
 * Depo nabzı — YALNIZ hazırlık ilerlemesi (tezgâh sözleşmesi: *"çalışan/verim ölçmez"*).
 *
 * Alt cümle ÖLÇÜLEN olgudur: kalan süre + hazırlanmamış sipariş sayısı. Tasarımdaki *"tek kişi
 * vardiyada · hazırlık yavaş"* satırı budandı — vardiya verisi yok ve o cümle bu kuralı ihlal
 * ediyordu (`design/KARARLAR.md` › Panel 17.08).
 *
 * Eşik geçtikten sonra "kalan süre" diye bir şey yoktur: gecikme geriye doğru söylenir.
 */
export function buildPulse(facts: PulseFact[], input: { nowMinutes: number }): RoutePulseView[] {
  return facts.map((f) => {
    // Kesim SATIR BAŞINA okunuyor: iki rotalı bir depoda tek kesime bakmak, 11:00 rotasının malını
    // 09:00 rotasının ölçüsüyle "geç" ilan etmek olurdu (kullanıcı kararı 17.08).
    const cutoff = toMinutes(f.prepCutoff);
    const left = cutoff === null ? null : cutoff - input.nowMinutes;
    const pending = f.totalCount - f.readyCount;
    if (f.totalCount === 0) {
      return { ...f, note: 'bugüne sipariş yazılmadı', statusLabel: 'boş gün', tone: 'neutral' as OpsTone };
    }
    if (pending === 0) {
      return { ...f, note: 'tamamı hazırlandı', statusLabel: 'hazır', tone: 'olive' as OpsTone };
    }
    // Eşik geçtiyse durum artık bir risk değil, bir olgudur.
    if (left !== null && left <= 0) {
      return {
        ...f,
        note: `${f.prepCutoff} kesimi geçti · ${num(pending)} sipariş hazırlanmadı`,
        statusLabel: 'kesim kaçtı',
        tone: 'red' as OpsTone,
      };
    }
    const window = left === null ? '' : `${f.prepCutoff} kesimine ${num(left)} dk · `;
    // Kalan süre kalan işe yetiyor mu — dakika başına bir sipariş kaba ama dürüst bir ölçü; eşiği
    // parametrik tutmak yerine tek varsayımla açık yazıyoruz (`CLAUDE §4`: makul varsayılan).
    const tight = left !== null && left < pending * PREP_MINUTES_PER_ORDER;
    return {
      ...f,
      note: `${window}${num(pending)} sipariş hazırlanmadı`,
      statusLabel: tight ? 'kesim riski' : 'yetişiyor',
      tone: tight ? ('amber' as OpsTone) : ('olive' as OpsTone),
    };
  });
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
      delta: orderDelta === 0 ? 'dünle aynı' : `${orderDelta > 0 ? '↑' : '↓'} ${num(Math.abs(orderDelta))} dün`,
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
