import {
  ErrorLogService,
  OrderService,
  ProductService,
  ProductVariantService,
  ReorderService,
  SystemHealthService,
  TicketService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
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
    attention.push(`bugün kapıda tahsilat: ${todayCounts.cod.count} sipariş · ${(todayCounts.cod.totalCents / 100).toFixed(2)} €`);
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
 * Depo başına eşik-altı tedarik önerisi özeti. Depo dolaşılır çünkü öneri DEPO BAŞINA hesaplanır
 * (varsayılan depo yoktur — DOMAIN §17); depo başına ilk 8 satır: brifing özettir, sipariş formu değil.
 */
async function reorderOverview() {
  const db = serviceDb();
  const warehouses = await new WarehouseService(db).list({ activeOnly: true });
  const reorder = new ReorderService(db);

  const perWarehouse = await Promise.all(
    warehouses.map(async (warehouse) => {
      const groups = await reorder.suggestions(warehouse.id);
      const lines = groups.flatMap((group) => group.lines);
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

  return {
    totalLines: perWarehouse.reduce((sum, w) => sum + w.lineCount, 0),
    warehouses: perWarehouse.map((w) => ({
      code: w.code,
      lineCount: w.lineCount,
      // Alan SEÇİMİ güvenlik sınırıdır: `lastPurchasePriceCents` (tedarikçi alışı) buraya
      // GİRMEZ — AI_ADMIN_ASSISTANT §6 finans sınırı; testi bu yokluğu doğrular.
      lines: w.lines.slice(0, 8).map((line) => ({
        name: nameByVariant.get(line.variantId) ?? line.variantId,
        availableQty: line.availableQty,
        minStockQty: line.minStockQty,
        suggestedQty: line.suggestedQty,
      })),
    })),
  };
}
