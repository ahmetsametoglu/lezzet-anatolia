import { analyticsInsightTask, runTask, type AiModel, type AnalyticsInsightInput } from '@lezzet/ai';
import {
  AnalyticsDailyService,
  AnalyticsProductDailyService,
  AnalyticsReportService,
  AnalyticsSearchDailyService,
  AnalyticsSourceDailyService,
  ProductService,
  SettingsService,
  serviceDb,
} from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { ANALYTICS_FUNNEL_STEPS, ANALYTICS_INSIGHT_SETTING, resolveLocalizedText, type AnalyticsDaily } from '@lezzet/types';

export const ANALYTICS_INSIGHT = 'analytics_insight';

/**
 * **HAFTALIK AI İÇGÖRÜ** (13.7) — özetten anlatı üretir, sonucu saklar.
 *
 * ── NEDEN BİR İŞ, İSTEK ANINDA DEĞİL ────────────────────────────────────────
 * Ekran her açıldığında modeli çağırmak hem parayı ziyaret sayısıyla çarpardı hem aynı haftanın
 * anlatısını her açılışta biraz farklı yazardı — yönetici sayfayı yenileyince fikir değiştiren bir
 * rapor okurdu. İş haftada bir koşar, sonuç `settings`'te durur, ekran onu OKUR.
 *
 * ── MODELE HAM SATIR GİTMEZ (`ANALYTICS §5`, sözleşme maddesi) ──────────────
 * Bu dosya defterden hiç okumuyor; girdisinin tamamı ÖZET tablolarından geliyor. Görevin girdi tipi
 * de bunu yapısal olarak zorluyor (`AnalyticsInsightInput` bir satır taşıyamaz).
 *
 * ── SAKLANAN ŞEY BİR CEVAP DEĞİL, BİR ÖLÇÜM ─────────────────────────────────
 * Kayıtta dönem ve üretim zamanı da var: ekran "bu anlatı hangi haftanın" sorusunu cevaplayabilsin.
 * Zamansız saklansaydı iş bir hafta koşmadığında ekran eski anlatıyı BU haftanınmış gibi gösterirdi
 * ve kimse fark etmezdi.
 */

/** Pencere PARAMETRİK: bir hafta varsayılan, ama dönem uzatılabilir. */
const WINDOW_DAYS = 7;
const TOP_N = 5;

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Özet satırlarından bir olay tipinin toplamı. Toplanabilir tek sayı `eventCount` (şema künyesi). */
function sumOf(rows: readonly AnalyticsDaily[], type: string): number {
  return rows.reduce((acc, r) => (r.type === type ? acc + r.eventCount : acc), 0);
}

/**
 * `opts.model` — sağlayıcıyı atlayan enjeksiyon (emsal: `translateUserTextJob`). Test gerçek uca
 * gitmemeli: hem para hem tekrarlanmayan bir çıktı demek olurdu.
 */
export async function analyticsInsightJob(opts: { model?: AiModel } = {}): Promise<Record<string, unknown>> {
  const db = serviceDb();
  // Dün dahil, bugün HARİÇ: bugünün özeti henüz üretilmedi (rollup dünü işliyor). Bugünü katsaydık
  // her hafta son gün boş görünür ve model onu "sert düşüş" diye yorumlardı.
  const to = isoDay(-1);
  const from = isoDay(-WINDOW_DAYS);
  const prevTo = isoDay(-WINDOW_DAYS - 1);
  const prevFrom = isoDay(-WINDOW_DAYS * 2);

  const daily = new AnalyticsDailyService(db);
  const [rows, prevRows, sources, zeroSearches, productSignals, segments] = await Promise.all([
    daily.list({ from, to }),
    daily.list({ from: prevFrom, to: prevTo }),
    new AnalyticsSourceDailyService(db).list(from, to),
    new AnalyticsSearchDailyService(db).signals(from, to, TOP_N, true),
    new AnalyticsProductDailyService(db).signals(from, to, TOP_N),
    new AnalyticsReportService(db).customerSegments(),
  ]);

  // Ölçüm HİÇ YOKSA model çağrılmaz. Boş bir haftadan anlatı istemek, modeli bir şey uydurmaya
  // davet etmektir — ve o uydurma bir aksiyona dönüşür (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
  if (rows.length === 0) {
    logger.info({ job: ANALYTICS_INSIGHT, from, to }, 'içgörü atlandı — dönemde özet satırı yok');
    return { status: 'skipped', reason: 'no_data', from, to };
  }

  const products = await new ProductService(db).listByIds(productSignals.map((s) => s.productId));
  const adlar = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name, 'tr')]));

  // Terk sebepleri: özetin `blockedReason` boyutundan. Bu kırılım 04.08'de eklendi; öncesinde
  // huninin en değerli kolonu yalnız ham defterde duruyordu ve hiçbir okuyucuya ulaşmıyordu.
  const sebepler = new Map<string, number>();
  for (const r of rows) {
    if (!r.blockedReason) continue;
    sebepler.set(r.blockedReason, (sebepler.get(r.blockedReason) ?? 0) + r.eventCount);
  }

  const kaynaklar = new Map<string | null, { sessions: number; orders: number }>();
  for (const r of sources) {
    const current = kaynaklar.get(r.source) ?? { sessions: 0, orders: 0 };
    current.sessions += r.sessionCount;
    current.orders += r.orderSessionCount;
    kaynaklar.set(r.source, current);
  }

  const input: AnalyticsInsightInput = {
    period: { from, to, days: WINDOW_DAYS },
    funnel: ANALYTICS_FUNNEL_STEPS.map((step) => ({ step, count: sumOf(rows, step) })),
    blockedReasons: [...sebepler.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    sources: [...kaynaklar.entries()]
      .map(([source, v]) => ({ source, sessions: v.sessions, conversion: v.sessions > 0 ? v.orders / v.sessions : null }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, TOP_N),
    zeroSearches: zeroSearches.map((s) => ({ query: s.query, kind: s.zeroResultKind, count: s.searchCount })),
    products: productSignals.map((s) => ({
      name: adlar.get(s.productId) ?? `#${s.productId.slice(0, 8)}`,
      views: s.viewCount,
      cartRate: s.cartRate,
    })),
    segments: segments.map((s) => ({ segment: s.segment, customers: s.customerCount })),
    previous: {
      sessions: prevRows.length > 0 ? sumOf(prevRows, 'page_view') : null,
      orders: prevRows.length > 0 ? sumOf(prevRows, 'order_placed') : null,
    },
  };

  const result = await runTask(analyticsInsightTask, input, { model: opts.model });
  if (!result.ok) {
    // Fırlatılmıyor: içgörü bir süstür, iş kaydı değil. Düşerse ekran eski anlatıyı (tarihiyle
    // birlikte) göstermeye devam eder — sessizce boşalmaz.
    logger.warn({ job: ANALYTICS_INSIGHT, reason: result.reason, message: result.message }, 'içgörü üretilemedi');
    return { status: 'failed', reason: result.reason };
  }

  await new SettingsService(db).set(
    ANALYTICS_INSIGHT_SETTING,
    { generatedAt: new Date().toISOString(), period: { from, to, days: WINDOW_DAYS }, ...result.data },
    { description: 'Haftalık analitik anlatısı (13.7) — özetten üretilir, ham defter modele gitmez.' },
  );

  logger.info(
    { job: ANALYTICS_INSIGHT, from, to, findings: result.data.findings.length, modelId: result.modelId, ...result.usage },
    'haftalık içgörü üretildi',
  );
  return { status: 'ok', from, to, findings: result.data.findings.length };
}
