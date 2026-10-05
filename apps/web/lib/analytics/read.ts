import 'server-only';
import {
  AnalyticsReportService,
  AnalyticsProductDailyService,
  AnalyticsSearchDailyService,
  AnalyticsSourceDailyService,
  MoneyMovementService,
  ProductService,
  SettingsService,
  serviceDb,
  type SegmentOptions,
} from '@lezzet/database';
import {
  ANALYTICS_INSIGHT_SETTING,
  StoredAnalyticsInsightSchema,
  resolveLocalizedText,
  type AnalyticsSearchSignal,
  type Business,
  type CustomerSegment,
  type StoredAnalyticsInsight,
} from '@lezzet/types';

/**
 * Analitik okuma kapıları: servisler ham satır verir, ekranın soruları birden çok kaynağı birleştirir (kampanya gideri + ciro, ürün sinyali +
 * ad) ve bu birleştirme iki cihaz görünümünde iki kez yazılmasın diye buradadır. Hepsi özetten okur, ham deftere dokunmaz.
 */

/** Operasyon yüzeyi tek dillidir; ürün adı orada Türkçe okunur. */
const OPS_LOCALE = 'tr';

/** Bir ürünün dönem sinyali — ekranın "çok bakılıp az alınan" tablosunun satırı. */
export interface ProductInterestRow {
  productId: string;
  name: string;
  viewCount: number;
  cartCount: number;
  sellableViewCount: number;
  /**
   * Sepete dönüşüm; `null` "hiç satılabilir hâlde görünmedi" demektir, sıfır değil: sıfır yazılsaydı stoksuz ürün listenin tepesine
   * oturur ve "kimse almıyor" diye okunurdu, oysa doğru aksiyon tedariktir.
   */
  cartRate: number | null;
}

/**
 * Dönemin ürün ilgisi, adıyla: ad tek turda çözülür (`listByIds`). Silinmiş ürün de listede kalır ve kimliğinin kısası görünür, çünkü geçmiş
 * sayılar geriye dönük değişmemeli.
 */
export async function readProductInterest(from: string, to: string, business?: Business, limit = 20): Promise<ProductInterestRow[]> {
  const db = serviceDb();
  const signals = await new AnalyticsProductDailyService(db).signals(from, to, limit, business);
  if (signals.length === 0) return [];

  const products = await new ProductService(db).listByIds(signals.map((s) => s.productId));
  const adlar = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name, OPS_LOCALE)]));

  return signals.map((s) => ({
    productId: s.productId,
    name: adlar.get(s.productId) ?? `#${s.productId.slice(0, 8)}`,
    viewCount: s.viewCount,
    cartCount: s.cartCount,
    sellableViewCount: s.sellableViewCount,
    cartRate: s.cartRate,
  }));
}

/**
 * Aranıp bulunamayan terimler, çeşit ve talep sinyali: `filter` boşluğu arayüz sinyalidir, `search` boşluğu çeşit sinyalidir ve ikincisi
 * seyrek olduğu için ayrı kovada kalır.
 */
export function readZeroResultSearches(from: string, to: string, business?: Business, limit = 20): Promise<AnalyticsSearchSignal[]> {
  return new AnalyticsSearchDailyService(serviceDb()).signals(from, to, limit, true, business);
}

/** Trafik kaynağı satırı — `source: null` DOĞRUDAN trafiktir. */
export interface TrafficSourceRow {
  source: string | null;
  campaign: string | null;
  sessionCount: number;
  orderSessionCount: number;
  /** Oturum başına dönüşüm; oturum yoksa `null` (payda sıfır). */
  conversion: number | null;
}

/**
 * Dönemin trafik kaynakları: gün satırları kaynak + kampanya kovalarında uygulamada toplanır, küme doğal tavanlıdır. `medium` kovada yoktur,
 * aynı kaynağın iki ortamı tek satırda toplanır; bugün ekranın sorusu "nereden geldi"dir.
 */
export async function readTrafficSources(from: string, to: string, business?: Business, limit = 10): Promise<TrafficSourceRow[]> {
  const rows = await new AnalyticsSourceDailyService(serviceDb()).list(from, to, business);

  const kovalar = new Map<string, TrafficSourceRow>();
  for (const row of rows) {
    const key = `${row.source ?? ''}|${row.campaign ?? ''}`;
    const current = kovalar.get(key) ?? {
      source: row.source,
      campaign: row.campaign,
      sessionCount: 0,
      orderSessionCount: 0,
      conversion: null,
    };
    current.sessionCount += row.sessionCount;
    current.orderSessionCount += row.orderSessionCount;
    kovalar.set(key, current);
  }

  return [...kovalar.values()]
    .map((r) => ({ ...r, conversion: r.sessionCount > 0 ? r.orderSessionCount / r.sessionCount : null }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, limit);
}

/** Kampanya ROI satırı: gider ve ciro yan yana. */
export interface CampaignRoiRow {
  campaign: string | null;
  spendCents: number;
  revenueCents: number;
  orderCount: number;
  newCustomerCount: number;
  /** Ciro / gider. Gider 0 ya da negatifse `null` — "sonsuz getiri" bir bilgi değildir. */
  roas: number | null;
}

/**
 * Kampanya ROI tablosu, dönemin giderini ilk temas atfıyla gelen ciroyla birleştirir: iki sütun aynı şeyi ölçmez, `newCustomerCount` farkı
 * okutmak için satırdadır. Etiketsiz kova (`campaign: null`) düşürülmez, yoksa toplamlar ne gideri ne ciroyu tutar ve ROI kendiliğinden şişerdi.
 */
export async function readCampaignRoi(from: string, to: string, business?: Business): Promise<CampaignRoiRow[]> {
  const db = serviceDb();
  const [spend, revenue] = await Promise.all([
    new MoneyMovementService(db).campaignSpend(from, to, business),
    new AnalyticsReportService(db).campaignRevenue(from, to, business),
  ]);

  const kovalar = new Map<string | null, CampaignRoiRow>();
  const kova = (campaign: string | null): CampaignRoiRow => {
    const current = kovalar.get(campaign) ?? { campaign, spendCents: 0, revenueCents: 0, orderCount: 0, newCustomerCount: 0, roas: null };
    kovalar.set(campaign, current);
    return current;
  };

  for (const s of spend) kova(s.campaign).spendCents += s.totalCents;
  for (const r of revenue) {
    const satir = kova(r.campaign);
    satir.revenueCents += r.revenueCents;
    satir.orderCount += r.orderCount;
    satir.newCustomerCount += r.newCustomerCount;
  }

  return [...kovalar.values()]
    .map((r) => ({ ...r, roas: r.spendCents > 0 ? r.revenueCents / r.spendCents : null }))
    .sort((a, b) => b.spendCents - a.spendCents || b.revenueCents - a.revenueCents);
}

/**
 * Dönem cirosu, hero şeridinin ve Ticaret modunun zaman serisi; tipi adıyla anan bir çağıran olmadığı için dışa açılmaz.
 */
interface RevenueView {
  totalCents: number;
  orderCount: number;
  /** Kanal ayrımı — karışık ölçüm yalan söyler (`ANALYTICS §3`). */
  split: { b2cCents: number; b2bCents: number };
  /** Günlük seri; ciro olmayan gün listede YOKTUR (sıfır satırı üretilmez, gün gerçekten boştur). */
  daily: Array<{ day: string; revenueCents: number; orderCount: number }>;
}

/**
 * Dönem cirosu, Ticaret modunun kaynağı: yetki `order` tablosundadır, defterdeki `order_placed` tasarım gereği azdır. Süzgeç sipariş
 * tarihindedir, teslim gününe göre okunan ciro kampanya giderinin dönemiyle hizalanmazdı.
 */
export async function readOrderRevenue(from: string, to: string, business?: Business): Promise<RevenueView> {
  const rows = await new AnalyticsReportService(serviceDb()).orderRevenue(from, to, business);

  const gunler = new Map<string, { revenueCents: number; orderCount: number }>();
  let b2cCents = 0;
  let b2bCents = 0;

  for (const r of rows) {
    const gun = gunler.get(r.day) ?? { revenueCents: 0, orderCount: 0 };
    gun.revenueCents += r.revenueCents;
    gun.orderCount += r.orderCount;
    gunler.set(r.day, gun);
    if (r.channel === 'b2b') b2bCents += r.revenueCents;
    else b2cCents += r.revenueCents;
  }

  return {
    totalCents: b2cCents + b2bCents,
    orderCount: rows.reduce((acc, r) => acc + r.orderCount, 0),
    split: { b2cCents, b2bCents },
    daily: [...gunler.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
  };
}

/** Segment satırı — analitik "kaç" der, Müşteriler "kim" der (`ANALYTICS §6`). */
export interface CustomerSegmentRow {
  segment: CustomerSegment;
  customerCount: number;
  orderCount: number;
  revenueCents: number;
  /** Müşteri başına ortalama ciro; müşteri yoksa `null`. */
  avgRevenueCents: number | null;
}

/** Segmentlerin ekrandaki sırası — çürümeden iyileşmeye, operatörün okuduğu yön. */
const SEGMENT_ORDER: CustomerSegment[] = ['champion', 'active', 'new', 'dormant', 'lost'];

/**
 * Müşteri segmentlerinin sayıları; boş segment de döner (`customerCount: 0`), çünkü "uyuyan yok" ile "hesaplanmıyor" farklı cümlelerdir.
 */
export async function readCustomerSegments(options: SegmentOptions = {}): Promise<CustomerSegmentRow[]> {
  const counts = await new AnalyticsReportService(serviceDb()).customerSegments(options);
  const bulunan = new Map(counts.map((c) => [c.segment, c]));

  return SEGMENT_ORDER.map((segment) => {
    const row = bulunan.get(segment);
    const customerCount = row?.customerCount ?? 0;
    return {
      segment,
      customerCount,
      orderCount: row?.orderCount ?? 0,
      revenueCents: row?.revenueCents ?? 0,
      avgRevenueCents: customerCount > 0 ? Math.round((row?.revenueCents ?? 0) / customerCount) : null,
    };
  });
}

/**
 * Segment üyeleri için burada kapı yoktur, çünkü dışa alma düğmesinin çağıranı henüz yok; servis tarafı hazırdır:
 * `new AnalyticsReportService(serviceDb()).segmentMembers(segment, limit, offset, options)`.
 */

/**
 * Haftalık yapay zekâ anlatısı: üretilmiş olanı okur, üretmez, çünkü ekran her açılışta modeli çağırsa para ziyaret sayısıyla çarpılırdı.
 * `null` henüz üretilmedi demektir; dönem de döner ki ekran hangi haftanın anlatısı olduğunu söyleyebilsin.
 */
export async function readWeeklyInsight(): Promise<StoredAnalyticsInsight | null> {
  const raw = await new SettingsService(serviceDb()).get<unknown>(ANALYTICS_INSIGHT_SETTING, null);
  if (!raw) return null;
  const parsed = StoredAnalyticsInsightSchema.safeParse(raw);
  // Şema tutmuyorsa sessizce boş: eski bir biçim saklanmış olabilir ve yarım bir anlatı
  // göstermektense hiç göstermemek doğru. Bir sonraki tur üzerine yazar.
  return parsed.success ? parsed.data : null;
}

// Sıfır-sonuç kovasının OKUNABİLİR HÂLİ burada değil, operasyon ekranının sözlüğündedir
// (`analytics-labels.ts`): Türkçe arayüz metni ekranın malıdır, veri kapısının değil. İki yerde
// tutulsaydı biri gün gelip "süzgeç boş" derken öteki "filtre sonuçsuz" derdi.
