import { AnalyticsDailyService, UserProfileService, serviceDb } from '@lezzet/database';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import {
  readCampaignRoi,
  readCustomerSegments,
  readOrderRevenue,
  readProductInterest,
  readTrafficSources,
  readWeeklyInsight,
  readZeroResultSearches,
} from '@/lib/analytics/read';
import { money, num, percent } from '@/components/operation/ui/format';
import { guarded, requireAdmin } from '@/lib/guard';
import { customersUrl } from '../customers/customers-url';
import { AnalyticsClient } from './analytics-client';
import { CONVERSION_MIN_SAMPLE, HERO_NOTES, NOTES, toChannelFilter } from './analytics-labels';
import { changeRatio, deltaView, sumEvents, toFunnel, toHeat, toRevenueSeries, toSeries } from './analytics-read';
import { PERIOD_DAYS, parseAnalyticsUrl, periodRange } from './analytics-url';
import type { AnalyticsData, BlockView } from './analytics-types';

// Analitik (13) — yalnız YÖNETİCİ. Tasarım §1: "site nasıl gidiyor, reklam çalışıyor mu, müşteri ne
// istiyor". Ekran OKUMA-AĞIRLIKLIDIR: hiçbir yazma kapısı yok.
//
// ── EKRAN BUGÜN ÇOĞUNLUKLA "VERİ BİRİKİYOR" GÖSTERİR VE BU BİR ARIZA DEĞİL ───
// Olay defteri ve günlük özet bu turda indi (13.1), ama müşteri yüzeyindeki ATICILAR henüz
// bağlanmadı (08.9) — yani okuma yolu gerçek, veri yok. Çizim bunu zaten bir DURUM olarak
// tanımlıyor ("ilk-gün hali birinci sınıf: uydurma rakam göstermez"), bu yüzden ekran boş bir
// iskelet değil, dürüst bir ekran.
//
// ── ÜÇ HÂL AYRI YAZILIR ─────────────────────────────────────────────────────
// `ready` (sayı var) · `warming` (kapı var, veri yok) · `absent` (bu sayı hiç hesaplanmıyor).
// Son ikisini birleştirmek, hiç dolmayacak bir bloğun dolmasını bekletmek olurdu.

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Analitik"
        reason="Ziyaret, kaynak ve kampanya ölçümleri yönetime açıktır. Bir sayının anlamını sormak gerekiyorsa yöneticinize iletin."
      />
    );
  }

  const urlState = parseAnalyticsUrl(await searchParams);

  // TEK an, tüm bloklar: dönem sınırları bir kez hesaplanır. İki blok kendi `now`'unu okusaydı
  // gece yarısını geçen bir istekte biri dünü, öteki bugünü sayardı (`ANALYTICS §5` kıyas omurgası).
  const range = periodRange(urlState.period, new Date());
  const channel = toChannelFilter(urlState.channel);

  const db = serviceDb();
  const daily = new AnalyticsDailyService(db);
  const profiles = new UserProfileService(db);

  const from = range.from.slice(0, 10);
  const to = range.to.slice(0, 10);

  const prevFrom = range.prevFrom.slice(0, 10);
  const prevTo = range.prevTo.slice(0, 10);

  const [rows, prevRows, revenue, prevRevenue, campaigns, sources, zeroSearch, interest, segments, insight, consentAny, consentEmail, consentWhatsapp] =
    await Promise.all([
      daily.list({ from, to, channel }),
      daily.list({ from: prevFrom, to: prevTo, channel }),
      // Ciro SİPARİŞ tablosundan (`ANALYTICS §4`: defter değil tablo yetkili) ve sipariş tarihine
      // göre — teslim gününe göre okunsaydı kampanya giderinin dönemiyle hizalanmazdı.
      readOrderRevenue(from, to),
      readOrderRevenue(prevFrom, prevTo),
      readCampaignRoi(from, to),
      readTrafficSources(from, to),
      readZeroResultSearches(from, to),
      readProductInterest(from, to),
      // Segmentler DÖNEMSİZ: "uyuyan müşteri" bugüne göre tanımlı bir hâldir, seçili pencereye göre
      // değil. Dönem çipini buraya bağlamak "son 7 günde kaç uyuyan vardı" gibi anlamsız bir soru
      // üretirdi — uyuyanlık zaten geçmişe bakarak tanımlanıyor.
      readCustomerSegments(),
      readWeeklyInsight(),
      profiles.countByMarketingConsent('any'),
      profiles.countByMarketingConsent('email'),
      profiles.countByMarketingConsent('whatsapp'),
    ]);

  const hasLedger = rows.length > 0;
  const trafik = urlState.mode === 'trafik';

  /** Defterden okuyan blokların ortak hâli: kapı var, veri yoksa "birikiyor" der. */
  const ledgerBlock = <T,>(data: T): BlockView<T> => ({
    state: hasLedger ? 'ready' : 'warming',
    data,
    note: NOTES.warmingLedger,
  });

  const pageViews = sumEvents(rows, 'page_view');
  const prevPageViews = sumEvents(prevRows, 'page_view');
  const orders = sumEvents(rows, 'order_placed');
  const prevOrders = sumEvents(prevRows, 'order_placed');

  const data: AnalyticsData = {
    period: { from: range.from, to: range.to, days: PERIOD_DAYS[urlState.period] },

    // İçgörü `warming`, `absent` DEĞİL: kapı var, yalnız haftalık iş henüz koşmamış (kapının kendi
    // künyesi bunu şart koşuyor). `absent` yazsaydık hiç gelmeyecek gibi okunurdu.
    insight: { state: insight ? 'ready' : 'warming', data: insight, note: NOTES.absentInsight },

    hero: trafik
      ? {
          main: {
            label: 'Sayfa görüntüleme',
            value: hasLedger ? String(pageViews) : null,
            delta: hasLedger ? deltaView(changeRatio(pageViews, prevPageViews)) : null,
            reason: hasLedger ? undefined : HERO_NOTES.warmingLedger,
          },
          rest: [
            // Ziyaretçi/oturum BİLEREK boş: özet satırlarının `sessionCount`'u toplanabilir bir sayı
            // değil (şema künyesi söylüyor) ve toplasaydık gerçekte olmayan bir "ziyaretçi" üretirdik.
            { label: 'Ziyaretçi', value: null, delta: null, reason: HERO_NOTES.absentVisitors },
            { label: 'Ürün görüntüleme', value: hasLedger ? String(sumEvents(rows, 'product_view')) : null, delta: null },
            { label: 'Sepete ekleme', value: hasLedger ? String(sumEvents(rows, 'add_to_cart')) : null, delta: null },
          ],
          split: null,
        }
      : {
          main: {
            label: 'Ciro',
            value: money(revenue.totalCents),
            delta: deltaView(changeRatio(revenue.totalCents, prevRevenue.totalCents)),
          },
          rest: [
            {
              label: 'Sipariş',
              value: num(revenue.orderCount),
              delta: deltaView(changeRatio(revenue.orderCount, prevRevenue.orderCount)),
            },
            {
              // Ortalama sepet SİPARİŞ YOKKEN `—`, sıfır değil: sıfır "ortalama sepet 0 €" diye
              // okunur ve o cümle yanlış — ortalaması alınacak bir şey yok (CLAUDE §1).
              label: 'Ort. sepet',
              value: revenue.orderCount > 0 ? money(Math.round(revenue.totalCents / revenue.orderCount)) : null,
              delta: null,
            },
            {
              /**
               * Dönüşüm — **payı da paydası da DEFTERDEN.** Sipariş sayısını tablodan alıp ziyareti
               * defterden alsaydık iki ayrı yetkiyi bölmüş olurduk (`ANALYTICS §4`) ve oran, tablo
               * ile defter arasındaki tasarımsal farkı bir "dönüşüm artışı" gibi gösterirdi.
               * Buradaki sayı defterin kendi hunisidir ve yandaki `Sipariş` ile birebir tutmaz.
               */
              label: 'Dönüşüm',
              value: pageViews > 0 ? percent((orders / pageViews) * 100, 1) : null,
              // Örneklem küçükken KIYAS ROZETİ de çizilmiyor: güvenilmez bir oranın değişimi iki
              // kat güvenilmezdir ve rozet ona bir yön iddiası ekler.
              delta:
                pageViews >= CONVERSION_MIN_SAMPLE && prevPageViews >= CONVERSION_MIN_SAMPLE
                  ? deltaView(changeRatio(orders / pageViews, prevOrders / prevPageViews))
                  : null,
              reason:
                pageViews === 0
                  ? HERO_NOTES.warmingLedger
                  : pageViews < CONVERSION_MIN_SAMPLE
                    ? HERO_NOTES.smallSample(pageViews)
                    : undefined,
            },
          ],
          // B2C/B2B şeridi çizimde hero'nun ilk hücresinde; ciro artık ölçüldüğü için çizilebiliyor.
          split: { b2cCents: revenue.split.b2cCents, b2bCents: revenue.split.b2bCents },
        },

    /**
     * Zaman serisi MODA GÖRE BAŞKA KAYNAKTAN okunur ve bu ayrım mimaridir, kolaylık değil:
     * Trafik defterin kendi izidir, Ticaret ise para — ve parada `order` tablosu yetkilidir
     * (`ANALYTICS §4`). İkisini tek kaynaktan çizmek, kesin bir ciroyu örneklemli bir izle aynı
     * güvende göstermek olurdu.
     */
    series: trafik
      ? ledgerBlock(toSeries(rows, prevRows, ['page_view']))
      : {
          state: revenue.daily.length > 0 ? 'ready' : 'warming',
          data: toRevenueSeries(revenue.daily, prevRevenue.daily),
          note: 'Bu dönemde sipariş yok. İlk siparişlerle birlikte ciro eğrisi çizilmeye başlar.',
        },
    funnel: ledgerBlock(toFunnel(rows)),
    heat: ledgerBlock(toHeat(rows, trafik ? ['page_view'] : ['order_placed'])),

    /**
     * Defterden okuyan blokların hepsi artık kapıya BAĞLI — hiçbiri `absent` değil.
     *
     * Bir tur bu satırlar "bu sayı hiç hesaplanmıyor" diyordu ve o gün DOĞRUYDU: özet satırı
     * kaynağı, arama terimini ve ürün kırılımını taşımıyordu. Kapılar indi (13.2 · 13.4 · 13.5),
     * yani cümle artık yanlış olurdu. `warming` ile `absent` ayrımının bütün değeri burada:
     * ekranın hangi bloğunun ne beklediği tek yerden değişiyor.
     */
    sources: { state: sources.length > 0 ? 'ready' : 'warming', data: sources, note: NOTES.warmingLedger },
    zeroSearch: {
      // Boş arama listesi bir SONUÇTUR, eksiklik değil (tasarım §4: "iyi haber hâli de tasarlanır")
      // — ama defterde hiç arama olayı yoksa gösterilecek bir sonuç da yok, o hâl `warming`.
      state: hasLedger ? 'ready' : 'warming',
      data: zeroSearch,
      note: NOTES.warmingLedger,
    },
    interest: { state: interest.length > 0 ? 'ready' : 'warming', data: interest, note: NOTES.warmingLedger },

    // Segmentler SİPARİŞTEN türer, defteri hiç beklemez — kapı boş segmenti de döndürdüğü için
    // "grup yok" ile "hesaplanmıyor" ekranda ayrışıyor ve blok her zaman `ready`.
    segments: { state: 'ready', data: segments, note: '' },

    campaigns: {
      state: campaigns.length > 0 ? 'ready' : 'warming',
      data: campaigns,
      note: 'Bu dönemde ne kampanya etiketli reklam gideri ne de kaynağı ölçülmüş sipariş var. Gider Para ekranında kampanya etiketiyle girilince ve etiketli bir bağlantıdan sipariş gelince tablo dolar.',
    },

    /**
     * Kaynağa göre tekrar sipariş — kampanya tablosuyla AYNI kapıdan, farklı soruyla.
     *
     * Tabloda okunan "ne harcadım / ne kazandım", burada okunan "hangi kaynak SADIK müşteri
     * getiriyor". İkinci kapı açmak aynı atfı iki yerde hesaplamak olurdu; satırlar aynı, sıralama
     * ve vurgu farklı. Yeni müşterisi olmayan kampanya bu blokta bir şey söylemiyor, o yüzden
     * süzülüyor.
     */
    cohort: {
      state: campaigns.some((c) => c.newCustomerCount > 0) ? 'ready' : 'warming',
      data: campaigns.filter((c) => c.newCustomerCount > 0),
      note: 'Kaynağı ölçülmüş bir müşteri henüz ikinci siparişini vermedi. Kohort, ilk siparişler tekrarlandıkça anlam kazanır.',
    },

    consent: {
      state: 'ready',
      data: [
        { channel: 'any', label: 'İzinli (herhangi bir kanal)', count: consentAny, href: customersUrl({ q: '', type: 'all', scope: 'marketing', mc: 'any' }) },
        { channel: 'email', label: 'E-posta izni', count: consentEmail, href: customersUrl({ q: '', type: 'all', scope: 'marketing', mc: 'email' }) },
        { channel: 'whatsapp', label: 'WhatsApp izni', count: consentWhatsapp, href: customersUrl({ q: '', type: 'all', scope: 'marketing', mc: 'whatsapp' }) },
      ],
      note: '',
    },
  };

  return <AnalyticsClient data={data} urlState={urlState} />;
}
