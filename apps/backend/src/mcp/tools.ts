import {
  AiUsageDailyService,
  ErrorLogService,
  OrderService,
  ProductService,
  ProductVariantService,
  ReorderService,
  SupplierService,
  SystemHealthService,
  TicketService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { formatPrice } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * MCP deneme diliminin ÜÇ salt-okuma aracı (22.1) — Faz A'nın yerel provası.
 *
 * Katman kuralı: burası uygulama katmanıdır — servislerden OKUR, özet KURAR; iş kuralı yok
 * (karar gerektiren hiçbir soru yok, hepsi sayım/özet). `apps/web/lib` okumaları `server-only`
 * olduğu için buradan import edilemez ve edilmemeli: asistanın okuma yüzeyi kendi seçtiği
 * alanlarla sınırlı kalmalı ki maskeleme tek yerde denetlensin.
 *
 * MASKELEME (AI_ADMIN_ASSISTANT §6) burada uygulanır ve testle korunur:
 * - Müşteri kimliği taşıyan HİÇBİR alan seçilmez — sayılar ve durum kırılımları döner.
 * - `ReorderLine.lastPurchasePriceCents` (tedarikçi alışı) BİLİNÇLİ süzülür — finans sınırı
 *   "toplanmış marj"dır, tekil alış fiyatı asistan yüzeyine çıkmaz.
 * - `error_log.message` zaten `scrubMessage`den geçmiş yazılır (OBSERVABILITY §5); `context`
 *   gövdesi yine de dökülmez — kimlik meşru olsa da ham gövde araç yüzeyine taşınmaz.
 */

/** Paris günü (YYYY-AA-GG) — teslim günü süzgeci bu takvimle kurulur; operasyonun günü teslim günüdür. */
function parisToday(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/** Paris gününden n gün geri — aralık ucu (dahil). Öğlen çıpası gün-kayması riskini keser. */
function parisDaysAgo(days: number): string {
  const anchor = new Date(`${parisToday()}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}

/** `OrderCounts`in JSON'a çevrilebilir özeti — `byStatus` Map'tir, olduğu gibi serileşmez. */
function orderCountsView(counts: Awaited<ReturnType<OrderService['counts']>>) {
  return {
    total: counts.total,
    byStatus: Object.fromEntries(counts.byStatus),
    revenueCents: counts.sum.totalCents,
    collectedCents: counts.sum.collectedCents,
    refundedCents: counts.sum.refundedCents,
    cashOnDelivery: counts.cod,
  };
}

/**
 * Sabah brifingi — "bugün ne var" sorusunun tek cevabı. Beş kaynak tek turda; sonda kurallı
 * bir `attention` listesi (asistan uydurmaz, eşiği kod söyler).
 */
export async function morningBriefing() {
  const db = serviceDb();
  const today = parisToday();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [todayCounts, openErrors, errorsLast24h, health, tickets, reorder] = await Promise.all([
    new OrderService(db).counts({ deliveryFrom: today, deliveryTo: today }),
    new ErrorLogService(db).countOpen(),
    new ErrorLogService(db).countSince(dayAgo),
    new SystemHealthService(db).latest(),
    new TicketService(db).countByStatus(),
    reorderOverview(),
  ]);

  const attention: string[] = [];
  if (openErrors > 0) attention.push(`${openErrors} açık hata kaydı var — system_errors aracıyla bak`);
  if (reorder.totalLines > 0) attention.push(`${reorder.totalLines} varyant stok eşiğinin altında — tedarik önerisi hazır`);
  if (tickets.open > 0) attention.push(`${tickets.open} açık müşteri talebi bekliyor`);
  if (todayCounts.cod.count > 0) {
    attention.push(`bugün kapıda tahsilat: ${todayCounts.cod.count} sipariş · ${formatPrice(todayCounts.cod.totalCents, 'tr')}`);
  }

  return {
    date: today,
    todayDeliveries: orderCountsView(todayCounts),
    systemHealth: health ? { status: health.status } : null,
    errors: { open: openErrors, last24h: errorsLast24h },
    tickets,
    reorder,
    attention,
  };
}

/**
 * Satış özeti — TESLİM GÜNÜNE göre son N gün (sipariş tarihi süzgeci kapıda yok; aracın adı ve
 * açıklaması bu gerçeği söyler, gizlemez). Toplamlar kimliksizdir.
 */
export async function salesSummary(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const to = parisToday();
  const from = parisDaysAgo(clamped - 1);
  const counts = await new OrderService(db).counts({ deliveryFrom: from, deliveryTo: to });
  return { from, to, days: clamped, ...orderCountsView(counts) };
}

/** Açık hata özeti — sayı + son görülme sırasıyla seçilmiş alanlar (satır olduğu gibi dökülmez). */
export async function systemErrors(limit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const db = serviceDb();
  const errors = new ErrorLogService(db);
  const [openCount, recent] = await Promise.all([errors.countOpen(), errors.listRecent({ resolved: false, limit: clamped })]);
  return {
    openCount,
    rows: recent.rows.map((row) => ({
      source: row.source,
      message: row.message,
      path: row.path ?? null,
      count: row.count,
      lastSeenAt: row.lastSeenAt,
    })),
  };
}

/**
 * AI harcaması (15.27) — son N günün `ai_usage_daily` özeti, DOLAR: görev×model kırılımı ("hangi özellik
 * harcıyor") ve gün serisi ("artıyor mu"). Tarifesiz koşu AYRI sayılır ve tutara GİRMEZ — sıfır sayılsaydı
 * harcama olduğundan az görünürdü; hiç tarifeli koşu yoksa tutar `null`dur (`CLAUDE §1`).
 */
export async function aiCosts(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const from = parisDaysAgo(clamped - 1);
  const rows = await new AiUsageDailyService(serviceDb()).listSince(from);

  const topla = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  // Dört hane yeter: tek koşu sentin çok altında, özet ise dolar düzeyinde okunur.
  const usd = (n: number | null) => (n === null ? null : Math.round(n * 10_000) / 10_000);

  type TaskRow = { task: string; modelId: string; calls: number; failedCalls: number; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; unpricedCalls: number };
  type DayRow = { day: string; calls: number; costUsd: number | null; unpricedCalls: number };
  const byTask = new Map<string, TaskRow>();
  const byDay = new Map<string, DayRow>();
  for (const row of rows) {
    const key = `${row.task}|${row.modelId}`;
    const t = byTask.get(key) ?? { task: row.task, modelId: row.modelId, calls: 0, failedCalls: 0, inputTokens: null, outputTokens: null, costUsd: null, unpricedCalls: 0 };
    t.calls += row.calls;
    t.failedCalls += row.failedCalls;
    t.inputTokens = topla(t.inputTokens, row.inputTokens);
    t.outputTokens = topla(t.outputTokens, row.outputTokens);
    t.costUsd = topla(t.costUsd, row.costUsd);
    t.unpricedCalls += row.unpricedCalls;
    byTask.set(key, t);

    const d = byDay.get(row.day) ?? { day: row.day, calls: 0, costUsd: null, unpricedCalls: 0 };
    d.calls += row.calls;
    d.costUsd = topla(d.costUsd, row.costUsd);
    d.unpricedCalls += row.unpricedCalls;
    byDay.set(row.day, d);
  }

  const tasks = [...byTask.values()].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
  return {
    from,
    to: parisToday(),
    days: clamped,
    currency: 'USD',
    totals: {
      calls: tasks.reduce((n, t) => n + t.calls, 0),
      failedCalls: tasks.reduce((n, t) => n + t.failedCalls, 0),
      costUsd: usd(tasks.reduce<number | null>((n, t) => topla(n, t.costUsd), null)),
      unpricedCalls: tasks.reduce((n, t) => n + t.unpricedCalls, 0),
    },
    byTask: tasks.map((t) => ({ ...t, costUsd: usd(t.costUsd) })),
    byDay: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map((d) => ({ ...d, costUsd: usd(d.costUsd) })),
  };
}

/**
 * Depo başına eşik-altı tedarik önerisi özeti. Depo dolaşılır çünkü öneri DEPO BAŞINA hesaplanır
 * (varsayılan depo yoktur — DOMAIN §17); depo başına ilk 8 satır: brifing özettir, sipariş formu değil.
 */
/** Brifingin depo başına satır tavanı — sayı ile `truncated` hesabı AYNI yerden okunur. */
const BRIEFING_LINE_LIMIT = 8;

async function reorderOverview() {
  const db = serviceDb();
  // Yalnız TESİSLER (02.09): tur her depo için eşik önerisi soruyor ve araçta eşik kavramı yok.
  const warehouses = await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' });
  const reorder = new ReorderService(db);

  const perWarehouse = await Promise.all(
    warehouses.map(async (warehouse) => {
      const groups = await reorder.suggestions(warehouse.id);
      // **TEDARİKÇİ SATIRA TAŞINIR** (MCP tur 8 raporu §3.10 · 15.08): motor eksikleri zaten
      // tedarikçiye göre grupluyordu, ama düzleştirme onu yutuyordu. Sonuç dene-yanıl bir akıştı —
      // "hangi tedarikçiden sipariş açabilirim" sorusu ancak `propose_purchase_order`ı deneyip
      // hatasından öğreniliyordu ("… için STR deposunda eşik altı kalem yok"). Hata mesajı iyi ama
      // bir okuma aracının cevaplaması gereken soruyu hataya sordurmak, akışı tersine çeviriyordu.
      const lines = groups.flatMap((group) => group.lines.map((line) => ({ ...line, supplierId: group.supplierId })));
      return { code: warehouse.code, lineCount: lines.length, lines };
    }),
  );

  // Ad çözümü TOPLU: tüm depoların varyantları tek turda (depo başına sorgu N+1 doğururdu).
  const variantIds = [...new Set(perWarehouse.flatMap((w) => w.lines.map((l) => l.variantId)))];
  const variants = variantIds.length > 0 ? await new ProductVariantService(db).listByIds(variantIds) : [];
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const products = productIds.length > 0 ? await new ProductService(db).listByIds(productIds) : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const nameByVariant = new Map(
    variants.map((v) => {
      const product = productById.get(v.productId);
      const productName = product ? resolveLocalizedText(product.name, 'tr') : '?';
      return [v.id, `${productName} · ${resolveLocalizedText(v.label, 'tr')}`];
    }),
  );

  // Tedarikçi adları (§3.10 künyesi). Küme kimlikle daraltılmıyor: tedarikçi listesi operatörün
  // elle kurduğu, doğal tavanı olan bir küme (`CLAUDE §1` sayfalama ölçütü) — tek turda okumak,
  // kimlik listesi çıkarıp süzmekten hem ucuz hem de daha az koddur.
  const supplierById = new Map((await new SupplierService(db).list({})).map((s) => [s.id, s.name]));

  return {
    totalLines: perWarehouse.reduce((sum, w) => sum + w.lineCount, 0),
    warehouses: perWarehouse.map((w) => ({
      code: w.code,
      lineCount: w.lineCount,
      /**
       * **KIRPMA SÖYLENİR** (MCP tur 8 raporu §3.5 · ölçüldü 15.08).
       *
       * `lineCount` 20 derken listede 8 satır olması sessiz bir kesmeydi ve bedeli raporun kendi
       * içinde görüldü: okuyan taraf o 8 satırı "deponun eksikleri" sanıp `propose_purchase_order`
       * çıktısıyla karşılaştırdı, kesişim az çıkınca **"depo süzgeci çalışmıyor" diye kritik bir
       * arıza bildirdi** — oysa süzgeç doğru, listeler farklı çünkü biri kırpılmış. Yanlış teşhis
       * ölçümle çürütüldü ama maliyeti bir tur oldu.
       *
       * `stock_watch` bu deseni zaten doğru uyguluyordu (`truncated` alanı); aynısı buraya geldi.
       */
      truncated: w.lineCount > BRIEFING_LINE_LIMIT,
      /**
       * **HANGİ TEDARİKÇİDEN SİPARİŞ AÇILABİLİR** — kırpmadan BAĞIMSIZ özet (§3.10 · ölçüldü 15.08).
       *
       * Satır başına tedarikçi adı tek başına yetmedi: ölçümde STR'nin ilk 8 satırında hiç eşleme
       * yokken 9-11 arasında vardı, yani listeye bakan model "bu depodan sipariş açılamaz" sanırdı
       * — oysa `propose_purchase_order(STR)` üç kalemlik bir taslak açıyor. Kırpma doğru
       * bildirilse bile yanlış çıkarım mümkündü.
       *
       * Bu özet TÜM satırları sayar ve doğrudan aracın girdisini verir: hangi adı yazarsan sipariş
       * açılır. Rapor bunu "dene-yanıl akışı" diye bildirmişti — hata mesajından öğrenilen bilgi,
       * okuma aracının cevaplaması gereken bir soruydu.
       */
      suppliersWithShortfall: [...new Map(w.lines.flatMap((l) => (l.supplierId ? [[l.supplierId, l] as const] : []))).keys()]
        .map((id) => ({
          name: supplierById.get(id) ?? '?',
          lineCount: w.lines.filter((l) => l.supplierId === id).length,
        }))
        .sort((a, b) => b.lineCount - a.lineCount),
      /** Tedarikçisi eşlenmemiş kalem sayısı — o kalemlerden sipariş AÇILAMAZ, sebebi eşleme eksiği. */
      unmappedLineCount: w.lines.filter((l) => !l.supplierId).length,
      // Alan SEÇİMİ güvenlik sınırıdır: `lastPurchasePriceCents` (tedarikçi alışı) buraya
      // GİRMEZ — AI_ADMIN_ASSISTANT §6 finans sınırı; testi bu yokluğu doğrular.
      lines: w.lines.slice(0, BRIEFING_LINE_LIMIT).map((line) => ({
        name: nameByVariant.get(line.variantId) ?? line.variantId,
        availableQty: line.availableQty,
        minStockQty: line.minStockQty,
        suggestedQty: line.suggestedQty,
        // `null` = bu varyantın tedarikçi eşlemesi yok; o kalemden sipariş AÇILAMAZ ve sebebi
        // burada görünür (`propose_purchase_order` da aynı sebeple reddeder).
        supplier: line.supplierId ? (supplierById.get(line.supplierId) ?? null) : null,
      })),
    })),
  };
}
