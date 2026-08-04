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
  type CustomerSegment,
  type StoredAnalyticsInsight,
} from '@lezzet/types';

/**
 * **ANALİTİK OKUMA KAPILARI** (13.2 · 13.4 · 13.5) — ekranların çağırdığı bileşik okumalar.
 *
 * Servisler ham satır verir; ekranın sorduğu sorular birden çok kaynağı birleştirir (kampanya
 * gideri + ciro, ürün sinyali + ürün adı). O birleştirmeyi ekranda yapmak, aynı kuralın iki cihaz
 * görünümünde iki kez yazılması demekti — ve `ANALYTICS §1`'in kendi cümlesi bunu söylüyor:
 * *analitik bir tablo değil bir sorudur.*
 *
 * **Hepsi ÖZETTEN okur, ham deftere hiç dokunmaz** (`ANALYTICS §5`).
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
   * Sepete dönüşüm. `null` "hiç satılabilir hâlde görünmedi" demek — SIFIR DEĞİL. Sıfır yazsaydık
   * stoksuz duran ürün listenin en tepesine oturur ve yönetici onu "kimse almıyor" diye okurdu;
   * oysa doğru aksiyon tedariktir (`CLAUDE §1`).
   */
  cartRate: number | null;
}

/**
 * Dönemin ürün ilgisi (13.4) — adıyla birlikte.
 *
 * Ürün adı **tek turda** çözülür (`listByIds`): satır başına bir sorgu N+1 olurdu ve liste zaten
 * sınırlı (ilk N). Silinmiş ürün de listede kalır — geçmiş sayılar geriye dönük değişmemeli
 * (`0035`'in FK'siz olma gerekçesi) — ve adı yerine kimliğinin kısası görünür.
 */
export async function readProductInterest(from: string, to: string, limit = 20): Promise<ProductInterestRow[]> {
  const db = serviceDb();
  const signals = await new AnalyticsProductDailyService(db).signals(from, to, limit);
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
 * Aranıp BULUNAMAYAN terimler (13.4) — çeşit/talep sinyalinin kendisi.
 *
 * Kova gruplamada kalır: `filter` boşluğu bir ARAYÜZ sinyalidir (süzgeç kombinasyonu boş küme
 * verdi), `search` boşluğu bir ÇEŞİT sinyalidir (bizde olmayan ürün arandı). İkincisi seyrektir ve
 * tek listede birincinin altında kalırdı (`ANALYTICS §4`).
 */
export function readZeroResultSearches(from: string, to: string, limit = 20): Promise<AnalyticsSearchSignal[]> {
  return new AnalyticsSearchDailyService(serviceDb()).signals(from, to, limit, true);
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
 * Dönemin trafik kaynakları (13.2).
 *
 * Gün satırları kaynak+kampanya kovalarında toplanır. **Toplama uygulamada ve bu bilinçli:** küme
 * doğal tavanlı (gün × kaynak bileşimi), yani `STACK §13`'ün RPC eşiğini karşılamıyor — ürün ve
 * arama okumalarının aksine burada sıralama ölçütü de türetilmiş bir oran değil, düz bir sayı.
 *
 * **`medium` kovada YOK ve düşürülmüyor:** aynı kaynağın iki ortamı (cpc/organic) tek satırda
 * toplanır. Ortam kırılımı istenirse anahtar büyür; bugün ekranın sorduğu soru "nereden geldi".
 */
export async function readTrafficSources(from: string, to: string, limit = 10): Promise<TrafficSourceRow[]> {
  const rows = await new AnalyticsSourceDailyService(serviceDb()).list(from, to);

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

/** Kampanya ROI satırı — gider ve ciro yan yana (13.2 · 12.5). */
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
 * **Kampanya ROI tablosu** (13.2) — 12.5'in gideri ile bu modülün cirosunu birleştirir.
 *
 * ── İKİ SÜTUN AYNI ŞEYİ ÖLÇMÜYOR VE OKUYAN BUNU BİLMELİ ─────────────────────
 * Gider DÖNEMİN gideridir. Ciro ise **ilk temas atfıyla** gelir: o kampanyanın kazandırdığı
 * müşterilerin bu dönemdeki siparişleri — tekrar siparişler dâhil. Yani yeni bir kampanyada ciro
 * geç görünür, kapatılmış bir kampanyada gider bittiği hâlde ciro sürer. `newCustomerCount` tam
 * olarak bu farkı okutmak için satırda duruyor.
 *
 * Başka türlüsü oturum anahtarını siparişe yazmayı gerektirirdi ve o tek `join` anonim defterin
 * tamamını geriye dönük kimliklendirirdi (`ANALYTICS §2`). Kısıt mahremiyet kararının bedeli.
 *
 * ── ETİKETSİZ KOVA DÜŞÜRÜLMEZ ───────────────────────────────────────────────
 * `campaign: null` hem "etiketsiz reklam gideri" hem "kaynağı ölçülmemiş ciro" taşır. Düşürülseydi
 * satırların toplamı ne dönemin gerçek reklam giderini ne gerçek ciroyu tutardı — ve ROI
 * kendiliğinden şişerdi (`campaignSpend`'in kendi kuralı).
 */
export async function readCampaignRoi(from: string, to: string): Promise<CampaignRoiRow[]> {
  const db = serviceDb();
  const [spend, revenue] = await Promise.all([
    new MoneyMovementService(db).campaignSpend(from, to),
    new AnalyticsReportService(db).campaignRevenue(from, to),
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
 * Dönem cirosu — hero şeridi ve Ticaret modunun zaman serisi (13.2).
 *
 * Dışa AÇILMADI: tipi adıyla anan bir çağıran yok, dönüş tipi zaten çıkarsanıyor. Adı gerekince
 * (ör. ekran bir yardımcıya geçirmek isterse) `export` tek kelime.
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
 * **Dönem cirosu** (13.2) — ekranın Ticaret modunun kaynağı.
 *
 * **Yetki `order` tablosundadır, defter değil** (`ANALYTICS §4`): defterdeki `order_placed` "bu
 * oturum siparişle bitti" der ve tabloya göre AZ olması tasarımdır. Ciroyu defterden okumak, ödeme
 * dalına ve oturuma bağlı bir sayıyı para sayısı gibi göstermek olurdu.
 *
 * **Süzgeç SİPARİŞ tarihinde**, teslim gününde değil — teslim gününe göre okunan bir dönem cirosu
 * kampanya giderinin dönemiyle hizalanmaz ve ROI tablosunun iki sütunu farklı dönemleri anlatırdı.
 */
export async function readOrderRevenue(from: string, to: string): Promise<RevenueView> {
  const rows = await new AnalyticsReportService(serviceDb()).orderRevenue(from, to);

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
 * Müşteri segmentleri (13.5) — sayılar.
 *
 * **Boş segment de dönülür** (`customerCount: 0`): "uyuyan müşteri yok" ile "uyuyan müşteri
 * hesaplanmıyor" farklı cümlelerdir ve satırı hiç göndermeseydik ekran ikisini ayıramazdı.
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
 * **Segment ÜYELERİ için burada bir kapı YOK** ve sebebi kayda geçsin: dışa alma ile Müşteriler
 * köprüsü henüz çizilmedi, yani buraya yazılacak sarmalayıcının bugün çağıranı olmazdı — bu
 * oturumda defalarca adını koyduğum arıza sınıfının ta kendisi ("motor yazılmış, çağrılmamış").
 *
 * Servis tarafı hazır ve tek satır uzakta:
 * `new AnalyticsReportService(serviceDb()).segmentMembers(segment, limit, offset, options)`.
 * Ekran o listeyi okumaya başladığı gün kapı buraya, sayacın yanına iner — köprünün iki ucu aynı
 * dosyadan okunsun diye.
 */

/**
 * Haftalık AI anlatısı (13.7) — **üretilmiş olanı okur, üretmez.**
 *
 * Model burada çağrılmaz: ekran her açıldığında çağırmak parayı ziyaret sayısıyla çarpardı ve aynı
 * haftanın anlatısını her yenilemede biraz farklı yazardı. Üreten taraf haftalık iştir
 * (`analytics-insight`).
 *
 * `null` = "henüz üretilmedi". Ekran bunu `warming` hâlinde göstermeli, `absent` değil — kapı var,
 * yalnız ilk tur koşmamış. Dönemi de dönüyoruz ki ekran "hangi haftanın anlatısı" diyebilsin:
 * tarihsiz gösterilen bir anlatı, iş bir hafta koşmadığında bu haftanınmış gibi okunur.
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
