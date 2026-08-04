import type { AnalyticsDaily, AnalyticsEventType } from '@lezzet/types';
import type { FunnelStepView, HeatRowView, MetricView, SeriesPointView } from './analytics-types';

// `analytics_daily` satırları → blok görünümleri. SAF mantık (DB yok) → birim testli.
//
// Neden burada: aynı özet satır kümesi üç bloğa üç farklı toplamayla giriyor (huni: tipe göre
// toplam · ısı: saat dizilerinin günlere göre toplamı · seri: güne göre toplam). Toplamayı
// istemcide yapmak, aynı verinin üç yerde ayrışması demekti — ve ayrıştığında hata vermezdi.

/**
 * **Toplanabilir tek sayı `eventCount`.** `sessionCount` satır satır YAKLAŞIKTIR (aynı oturum
 * birden çok boyut satırına düşer) ve şemanın künyesi bunu açıkça söylüyor. Toplarsak "ziyaretçi"
 * diye gerçekte olmayan bir sayı üretiriz — bu ekranda en kolay yapılacak yalan tam olarak budur.
 */
export function sumEvents(rows: readonly AnalyticsDaily[], type: AnalyticsEventType): number {
  return rows.reduce((acc, r) => (r.type === type ? acc + r.eventCount : acc), 0);
}

/** Değişim yüzdesi. Önceki dönem SIFIRSA oran tanımsızdır (`null`) — "%∞ arttı" bir bilgi değildir. */
export function changeRatio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Kıyas rozeti. Yön RENGİ taşır ama **yönün iyi/kötü olduğu ölçüye göre değişir** — bu yüzden
 * `higherIsBetter` dışarıdan gelir: ziyaret artışı iyidir, terk oranı artışı değildir.
 */
export function deltaView(ratio: number | null, higherIsBetter = true): MetricView['delta'] {
  if (ratio === null) return null;
  const pct = Math.abs(ratio * 100);
  const up = ratio > 0;
  const good = up === higherIsBetter;
  const text = `${up ? '↑' : ratio < 0 ? '↓' : ''} %${pct.toFixed(pct < 10 ? 1 : 0)}`;
  return { text: ratio === 0 ? 'değişmedi' : text, tone: ratio === 0 ? 'neutral' : good ? 'olive' : 'red' };
}

/** Huninin adım sırası — çizimin kendi sırası; kaynağı olay tipi. */
const FUNNEL_STEPS: Array<{ label: string; type: AnalyticsEventType }> = [
  { label: 'Ziyaret', type: 'page_view' },
  { label: 'Ürün görüntüleme', type: 'product_view' },
  { label: 'Sepete ekleme', type: 'add_to_cart' },
  { label: 'Checkout başlangıcı', type: 'checkout_start' },
  { label: 'Sipariş', type: 'order_placed' },
];

/**
 * Huni adımları + en büyük sızıntının işaretlenmesi.
 *
 * **`order_placed` adımı defterden okunur ama SİPARİŞ SAYISI DEĞİLDİR** (`ANALYTICS §4`: sipariş
 * sayısında `order` tablosu yetkili). Buradaki sayı "oturum siparişle bitti" diyen olayların
 * sayısıdır ve tablodan az olabilir — bu arıza değil, tasarım. Huninin sorusu "kaç sipariş" değil,
 * "aynı akış içinde kaçı tamamladı".
 */
export function toFunnel(rows: readonly AnalyticsDaily[]): FunnelStepView[] {
  const counts = FUNNEL_STEPS.map((s) => ({ ...s, count: sumEvents(rows, s.type) }));
  const first = counts[0]?.count ?? 0;

  const drops = counts.map((s, i) => {
    const prev = i === 0 ? null : counts[i - 1]!.count;
    // Önceki adım sıfırsa kayıp ORANI yoktur: sıfırdan sıfıra düşüş bir kayıp değil, veri yokluğu.
    return prev === null || prev === 0 ? null : (prev - s.count) / prev;
  });
  const worstDrop = Math.max(...drops.map((d) => d ?? -1));

  return counts.map((s, i) => ({
    label: s.label,
    count: s.count,
    /**
     * Çubuk oranı **1'i AŞAMAZ** ve bu bir kozmetik değil, ölçünün kendi gerçeği: adımlar iç içe
     * geçmiş kümeler DEĞİL. Tek bir ziyaret sayfada altı ürün kartı görebilir, yani
     * `product_view` `page_view`'dan büyük çıkabilir. Kırpmasaydık ikinci adımın çubuğu kutudan
     * taşardı ve huni "büyüyerek daralıyor" gibi okunurdu.
     */
    share: first === 0 ? 0 : Math.min(1, s.count / first),
    /**
     * Negatif "kayıp" bir kayıp değildir — adım BÜYÜMÜŞTÜR (yukarıdaki iç-içe-değil gerçeği).
     * Ham oranı olduğu gibi taşıyoruz ve işareti ekran okuyor; burada sıfıra kırpsaydık büyümeyi
     * "kayıp yok" diye gizlerdik, oysa büyüme okunması gereken bir bilgidir.
     */
    drop: drops[i] ?? null,
    // Sıfır ya da negatif kayıplı adım "en büyük sızıntı" diye işaretlenmez — hepsi sıfırken
    // hiçbiri en kötü değildir, büyüyen adım ise zaten sızıntı değil.
    worst: worstDrop > 0 && drops[i] === worstDrop,
  }));
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/**
 * Isı haritası: haftanın günü × saat. Özet satırının 24'lük `hourly` dizisi günlere göre toplanır.
 *
 * Ayrı bir saatlik tablo YOK (`ANALYTICS §5`) — türetilebilen ikinci kez yazılmaz. Bedeli burada
 * görünüyor: saat kırılımını başka bir boyutla (kanal/depo) ÇAPRAZLAYAMIYORUZ, çünkü özet satırı
 * saat dizisini kendi boyut bileşimi için taşıyor ve biz onu günlere toplarken o bileşimi kaybediyoruz.
 * Bu bilinçli sınır; çapraz kırılım 25 ay içinde ham defterden sorulur.
 */
export function toHeat(rows: readonly AnalyticsDaily[], types: readonly AnalyticsEventType[]): HeatRowView[] {
  const grid = WEEKDAYS.map(() => new Array<number>(24).fill(0));
  for (const row of rows) {
    if (!types.includes(row.type)) continue;
    // `getUTCDay()` 0=Pazar; haftayı Pazartesi'den başlatıyoruz (operatörün takvimi).
    const weekday = (new Date(`${row.day}T00:00:00Z`).getUTCDay() + 6) % 7;
    const target = grid[weekday]!;
    row.hourly.forEach((v, h) => {
      target[h] = (target[h] ?? 0) + v;
    });
  }
  return WEEKDAYS.map((day, i) => ({ day, hours: grid[i]! }));
}

/**
 * Günlük seri + önceki dönemin hayaleti.
 *
 * İki pencere SIRAYA göre eşlenir (ilk gün ilk günle), tarihe göre değil: kıyasın sorusu "aynı
 * uzunlukta bir önceki pencerede kaçtı", "geçen ay bugün kaçtı" değil. Tarihe göre eşleseydik
 * 31 günlük ay ile 30 günlük ay arasında bir gün sessizce eşsiz kalırdı.
 */
export function toSeries(
  rows: readonly AnalyticsDaily[],
  prevRows: readonly AnalyticsDaily[],
  types: readonly AnalyticsEventType[],
): SeriesPointView[] {
  const byDay = (source: readonly AnalyticsDaily[]) => {
    const map = new Map<string, number>();
    for (const r of source) {
      if (!types.includes(r.type)) continue;
      map.set(r.day, (map.get(r.day) ?? 0) + r.eventCount);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const current = byDay(rows);
  const previous = byDay(prevRows);
  return current.map(([day, value], i) => ({ day, value, prev: previous[i]?.[1] ?? null }));
}

/**
 * Ciro serisi + önceki dönemin hayaleti — Ticaret modunun grafiği.
 *
 * `toSeries`'in kardeşi ve eşleme kuralı AYNI (sıraya göre, tarihe göre değil) ama girdisi başka
 * bir kaynak: burada satırlar `order` tablosundan geliyor. **Ciro olmayan gün listede YOKTUR**
 * (kapının kendi kararı: sıfır satırı üretilmiyor) — yani eksen takvim değil, satış olan günlerdir.
 * Grafiğe sıfır günleri uydurmuyoruz: uydurulmuş bir sıfır, olmayan bir düşüşü çizerdi.
 */
export function toRevenueSeries(
  daily: ReadonlyArray<{ day: string; revenueCents: number }>,
  prevDaily: ReadonlyArray<{ day: string; revenueCents: number }>,
): SeriesPointView[] {
  return daily.map((d, i) => ({ day: d.day, value: d.revenueCents, prev: prevDaily[i]?.revenueCents ?? null }));
}

// ── `toCampaignRows` SİLİNDİ (04.08) ─────────────────────────────────────────
// Ekran gideri kendi toplayıp ciroyu `null` bırakıyordu; 13.2 inince o iş kapının kendisine geçti
// (`readCampaignRoi`: gider + ciro + ilk-temas atfı tek yerde). Ekranda bırakmak, aynı birleştirmeyi
// iki yerde tutmak olurdu — ve ikisi bir gün ayrıştığında hangisinin doğru olduğunu kimse bilemezdi.
