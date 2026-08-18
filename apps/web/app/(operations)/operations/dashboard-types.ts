import type { OrderStatus, PaymentMethod } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';

// Panel (09.3) görünüm tipleri — `design/pages/admin-dashboard.md` envanterinin birebir karşılığı.
//
// **Bu dosyada karar YOK, sunum var.** Sayılar sayfada okunur, eşikler motorlarda hesaplanır; buradaki
// tipler yalnız "ekranın gördüğü" hâli taşır. Ton (`OpsTone`) da bir karardır ve `dashboard-read`te
// veriden türetilir — bileşen kendi rengini seçmez, yoksa aynı olgu iki ekranda iki renkte görünür.

/** Panelin tek okuma sonucu — sayfa bunu üretir, istemci yalnız çizer. */
export interface DashboardData {
  /** Başlıktaki an — sunucuda üretilir ki "şimdi" tek bir değer olsun (akış + şerit aynı ana bakar). */
  now: { iso: string; label: string; time: string };
  /** Depo bağlamının insan okur adı: "Tüm depolar" ya da tek tesisin adı. */
  scopeLabel: string;
  band: AlertBandView;
  kpis: KpiCardView[];
  flow: FlowStepView[];
  queue: QueueGroupView[];
  /** Asistan kuyruğu ayrı durur: bekleyen iş değil, ONAY bekleyen öneri (22.3). */
  proposals: ProposalTeaserView | null;
  routes: DeliveryRouteView[];
  pulse: RoutePulseView[];
}

/**
 * Üst şerit — günün TEK en yakın eşiği ve oraya köprü.
 *
 * Cümle elle yazılmaz, saat + kuyruk durumundan üretilir (tezgâh sözleşmesi). `tone` sakin günde
 * `olive`: boş kuyruk kutlanır, uyarılmaz.
 */
export interface AlertBandView {
  /** "ŞİMDİ · KESİME 20 DK" — eşiğin kendisi, üstte küçük. */
  eyebrow: string;
  headline: string;
  detail: string | null;
  tone: OpsTone;
  primary: { label: string; href: string } | null;
  /** Kuyruğa iniş — sayı sıfırsa `null` (boş kuyruğa düğme koymak davetsiz bir yolculuktur). */
  secondary: { label: string; href: string } | null;
}

/**
 * Gösterge kartı — sayı + değişim + kırılım + 7 günlük seyir + köprü.
 *
 * `series` boş olabilir: seri okunamadıysa çubuklar hiç çizilmez. **Sıfırla doldurulmaz** — düşen bir
 * ölçüm "hiç satış olmadı" gibi okunurdu (`CLAUDE §1`).
 */
export interface KpiCardView {
  key: 'orders' | 'revenue' | 'receivable' | 'undelivered' | 'belowMargin';
  label: string;
  value: string;
  /** İkinci satır: "↑ 6 dün" / "kapıda 504 € · vade 614 €". */
  delta: string | null;
  deltaTone: OpsTone;
  /** Üçüncü satır: depo kırılımı ya da açıklayıcı alt bilgi. */
  split: string | null;
  series: number[];
  link: { label: string; href: string };
}

/**
 * Gün akışının bir eşiği. `state` saatten türer; geçmiş adım SONUCUYLA, gelecek adım beklentiyle durur.
 *
 * **Saat ROTAYA bağlı** (kullanıcı kararı 17.08) ve rotalar farklı saat taşıyabildiği için kutu **en
 * erken** olanı gösterir: en sıkı kısıt odur, ona yetişen ötekilere de yetişir. `routeLabel` o saati
 * kimin taşıdığını söyler — yoksa operatör hangi araca koşacağını bilemez.
 */
export interface FlowStepView {
  key: 'orderCutoff' | 'prepCutoff' | 'routeDeparture' | 'courierClose';
  time: string;
  title: string;
  note: string;
  /** En erken saati taşıyan rota; tüm rotalar aynı saatteyse ya da tek rota varsa `null`. */
  routeLabel: string | null;
  state: 'done' | 'now' | 'later';
  /** "20 dk kaldı" — yalnız `now` adımında. */
  countdown: string | null;
  /** Kesime yetişmeyen rota varsa `now` adımı amber döner. */
  tone: OpsTone;
  /**
   * Bu saat TESLİM gününe değil bir ÖNCEKİ güne ait — bugün yalnız sipariş kesiminde olabilir
   * (17.08 kuralı: kesim hazırlık kapanışından sonraysa önceki günün saatidir).
   *
   * Ekran bunu damgalamak zorunda: damgasız bir `21:00` satırı, bugünün akışının son adımı gibi
   * okunuyor ve o saatte bugünün kapandığını sanıyorsunuz — oysa kapanan sonraki sefer.
   */
  prevDay: boolean;
}

/** Aciliyet kümesi — üç küme sabit, boş küme çizilmez. */
export interface QueueGroupView {
  key: 'now' | 'today' | 'week';
  title: string;
  /** Başlığın tonu — KÜMENİN aciliyeti, içindeki satırların değil (ikisi ayrışabilir). */
  tone: OpsTone;
  /** "5 kalem · 2 satır" — kalem sayısı satır sayısından farklıdır, ikisi de söylenir. */
  summary: string;
  items: QueueItemView[];
}

/** Kuyruk satırı — sayı + tek cümle + var olan bir karar ekranına köprü. Karar burada verilmez. */
export interface QueueItemView {
  key: string;
  count: number;
  title: string;
  /** "12 gün gecikti" gibi yaş/aciliyet damgası. */
  stamp: string | null;
  detail: string;
  tone: OpsTone;
  link: { label: string; href: string };
}

/** Asistan önerileri — kuyruğun altında ayrı blok, mavi tonda (öneri ≠ iş). */
export interface ProposalTeaserView {
  count: number;
  detail: string;
  href: string;
}

/** Günün bir rotası: kurye + bölge + depo + ilerleme + duraklar. */
export interface DeliveryRouteView {
  key: string;
  courierName: string;
  zoneLabel: string | null;
  warehouseCode: string | null;
  deliveredCount: number;
  totalCount: number;
  stops: DeliveryStopView[];
}

/**
 * Durak satırı.
 *
 * **`time` yalnız OLMUŞ olanda dolu** — teslim edilmiş durağın gerçek saati durum kaydından gelir;
 * gelecek durak için tahmin YOK (`design/KARARLAR.md` › Panel 17.08). **Sıra numarası taşımaz:**
 * satırlar duruma göre gruplanır, "rota sırası" diye bir veri yok.
 */
export interface DeliveryStopView {
  orderId: string;
  reference: string | null;
  customerName: string;
  /** "3 kalem" — koli sayısı DEĞİL; kutu kavramı gelene kadar kalem sayılır (`23-barkod-kutu`). */
  itemsLabel: string;
  channelLabel: string;
  /** Kapıda ödenecek tutar; `null` = borç yok, para konuşulmaz. */
  dueLabel: string | null;
  status: OrderStatus;
  statusLabel: string;
  tone: OpsTone;
  time: string | null;
  paymentMethod: PaymentMethod | null;
}

/**
 * Nabız — YALNIZ hazırlık ilerlemesi. Çalışan/verim ölçmez (tezgâh sözleşmesi); alt cümle ölçülen
 * olgudur, yorum değil.
 *
 * **Satır DEPO değil ROTA** (kullanıcı kararı 17.08): kesim rotaya bağlandığı an nabzın ölçüsü de
 * rota olmak zorunda. Depo bazlı kalsaydı iki rotalı bir depoda erken alarm verirdi — 09:00
 * rotasına göre "riskli" derken 11:00 rotasının malı henüz beklemede olurdu. Depo kodu çip olarak
 * durur, yani "hangi tesisten çıkıyor" bilgisi kaybolmaz.
 */
export interface RoutePulseView {
  zoneId: string;
  zoneName: string;
  /** Rotanın çıktığı deponun kodu — bağlam çipi; `null` = ad çözülemedi. */
  warehouseCode: string | null;
  readyCount: number;
  totalCount: number;
  /** O rotanın hazırlık kesimi — üst şeridin cümlesi de bunu söyler, global saati değil. */
  prepCutoff: string;
  note: string;
  /** "yetişiyor" · "kesim riski" · "kesim kaçtı" — ilerleme + o rotanın kesimine kalan süreden türer. */
  statusLabel: string;
  tone: OpsTone;
}
