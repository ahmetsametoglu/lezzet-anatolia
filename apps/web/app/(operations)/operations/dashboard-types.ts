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
  /** Gün akışı — satır başına bir ROTA; eski "Rota nabzı" bloğu rotanın altına indi (18.08). */
  flow: RouteFlowView[];
  queue: QueueGroupView[];
  /** Asistan kuyruğu ayrı durur: bekleyen iş değil, ONAY bekleyen öneri (22.3). */
  proposals: ProposalTeaserView | null;
  routes: DeliveryRouteView[];
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
 * Gün akışının bir eşiği — **kart**. Görünüm değişmedi: aynı dört kart, aynı dizilim.
 *
 * `state` saatten türer; geçmiş adım SONUCUYLA, gelecek adım beklentiyle durur. Eşiğin hangi rotaya
 * ait olduğu artık adımda değil, onu kapsayan `RouteFlowView` satırında yazılı — eskiden `routeLabel`
 * diye küçük bir nottu ve yalnız saatler AYRIŞTIĞINDA görünüyordu, yani tek rotalı kurulumda akışın
 * kime ait olduğu hiç okunamıyordu (kullanıcı gözlemi 18.08).
 */
export interface FlowStepView {
  key: 'orderCutoff' | 'prepCutoff' | 'routeDeparture' | 'courierClose' | 'nextCutoff';
  time: string;
  title: string;
  note: string;
  state: 'done' | 'now' | 'later';
  /** "20 dk kaldı" — yalnız `now` adımında. */
  countdown: string | null;
  tone: OpsTone;
  /**
   * Bu saat TESLİM gününe değil bir ÖNCEKİ güne ait — yalnız sipariş kesiminde olabilir (17.08
   * kuralı: kesim hazırlık kapanışından sonraysa önceki günün saatidir).
   *
   * **Sıralamayı da bu belirliyor** (kullanıcı bildirdi 18.08): önceki güne ait eşik bugünün saatine
   * göre sıralanınca en SONA düşüyor ve "sırada" görünüyordu — oysa bugünün listesini kapatan olay
   * dün akşam OLDU. Sıralama değeri `saat − 1440` olunca kendiliğinden en başa geçiyor ve `tamam`
   * oluyor.
   */
  prevDay: boolean;
}

/**
 * Gün akışının bir SATIRI: bir rota + kendi kart şeridi + altında tek satırlık nabzı.
 *
 * ── NEDEN ROTA SATIRI (kullanıcı kararı 18.08) ──────────────────────────────
 * Akış eskiden eşik TÜRÜ ekseninde tekti ve her kart bütün rotaların EN ERKENİNİ yazıyordu: ikinci
 * rotanın saati hiç görünmüyordu. Artık her rota kendi kart şeridini alıyor — kartların tasarımı
 * DEĞİŞMEDİ, yalnız rota sayısı kadar tekrarlanıyor.
 *
 * **Nabız ayrı blok olmaktan çıktı** ve rotanın altına indi (tek satır: hazır sayacı · çubuk · durum).
 * Ayrı dururken aynı rota panelde iki yerde iki satır oluyordu.
 *
 * **Satırlar ROTADAN gelir, siparişten değil:** eski nabız siparişleri bölgeye göre gruplayarak satır
 * üretiyordu, siparişi olmayan rota hiç görünmüyordu — oysa boş bir rotanın da çıkış saati vardır.
 */
export interface RouteFlowView {
  zoneId: string;
  zoneName: string;
  warehouseCode: string | null;
  /**
   * Bugün koşuyor mu — rotanın `weekdays` alanından. `false` ise satır SÖNÜK çizilir ve saatleri
   * hiçbir hesaba girmez (kullanıcı kararı 18.08: *"bugün olmadığı tasarımdan belli olsun"*).
   * Gizlemek yerine sönük göstermek bilinçli: operatör hangi rotaların var olduğunu da bilmeli.
   */
  runsToday: boolean;
  /** Koşmayan rotanın günleri — "Cum · Cts". Bugün koşuyorsa `null`. */
  weekdayLabel: string | null;
  /** Bugünün eşikleri, KRONOLOJİK sırada. Kesim önceki güne aitse beşinci kart da gelir. */
  steps: FlowStepView[];
  readyCount: number;
  totalCount: number;
  /** Ölçülen olgu — yorum değil ("11:00 kesimine 40 dk · 3 sipariş hazırlanmadı"). */
  note: string;
  /** "yetişiyor" · "kesim riski" · "kesim kaçtı" · "hazır" · "boş gün" · "bugün koşmuyor". */
  statusLabel: string;
  tone: OpsTone;
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
