import 'server-only';
import { readTransferDetail } from '@lezzet/application';
import {
  serviceDb,
  SettingsService,
  UserProfileService,
  WarehouseTransferLineService,
  WarehouseTransferService,
} from '@lezzet/database';
import { daysBetween } from '@lezzet/helper';
import type { KeysetCursor, WarehouseTransfer, WarehouseTransferLine } from '@lezzet/types';
import { TRANSFER_TRANSIT_DAYS_KEY } from '@/lib/settings-keys';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import type {
  HistoryPageView,
  HistoryRowView,
  TransferDetailView,
  TransfersPageView,
  TransitRowView,
} from './transfer-types';

/**
 * Transfer ekranının okuma katmanı (19.6).
 *
 * İki küme iki kurala tabi (tasarımın omurgası): YOLDAKİLER fiziksel gerçekle sınırlı — aynı anda
 * yolda olan sevkiyat kadar, sayfalanmaz ve TAM olmak zorunda (bir sevkiyatı kaçırmak iki depoda da
 * görünmeyen mal demektir). GEÇMİŞ veriyle büyür — keyset, imleç URL'e yazılmaz (runs emsali).
 *
 * Kapsam SÜZGEÇ değil GÖRÜŞ ALANIDIR: depocu yalnız kendi depolarının dahil olduğu hareketi görür
 * (kaynak YA DA hedef kapsamında); depo-üstü bakış her şeyi görür. Üst bardaki depo seçicisi bu
 * sayfayı DARALTMAZ — transfer iki deponun arasındaki gerçektir, tek deponun süzgecine sıkışmaz;
 * seçicinin buradaki tek işi sevk penceresinin varsayılan kaynağını söylemek.
 */

const HISTORY_PAGE_SIZE = 30;

/**
 * Sekme ROZETİ için hafif sayım — "bugün ne bekliyorum bir bakışta" (tasarım §7, intake rozetinin
 * emsali). Her sekmede okunur; tam sayfa okuması (`readTransfersPage`) yalnız sekme açıkken.
 * Küme fiziksel olarak küçük: liste çekip saymak, ayrı bir count RPC'si açmaktan ucuz.
 */
export async function readTransitCount(): Promise<number> {
  const context = await readWarehouseContext();
  const rows = await new WarehouseTransferService(serviceDb()).listInTransit();
  if (context.scope.kind !== 'limited') return rows.length;
  const scopeIds = new Set(context.scope.warehouseIds);
  return rows.filter((t) => scopeIds.has(t.fromWarehouseId) || scopeIds.has(t.toWarehouseId)).length;
}

/** Sayfanın açılış yükü — yoldakiler + geçmişin ilk sayfası + sevk penceresi seçenekleri. */
export async function readTransfersPage(): Promise<TransfersPageView> {
  const db = serviceDb();
  const [context, labels, transitDays] = await Promise.all([
    readWarehouseContext(),
    readWarehouseLabels(),
    new SettingsService(db).getNumber(TRANSFER_TRANSIT_DAYS_KEY, 1),
  ]);

  const scopeIds = context.scope.kind === 'limited' ? new Set(context.scope.warehouseIds) : null;

  // Yoldakiler HEPSİ okunur, kapsam TS'te süzülür: küme fiziksel olarak küçük (tasarım sözü) ve
  // "from VEYA to kapsamda" süzgeci için servise ikinci bir or-kapısı açmaya değmez (19.5'in
  // "seviye satırı in-memory daraltılır" emsali).
  const inTransitAll = await new WarehouseTransferService(db).listInTransit();
  const inTransit = scopeIds
    ? inTransitAll.filter((t) => scopeIds.has(t.fromWarehouseId) || scopeIds.has(t.toWarehouseId))
    : inTransitAll;

  const [transitRows, history] = await Promise.all([
    enrichTransit(db, inTransit, { labels, transitDays, scopeIds }),
    readHistoryPage(null),
  ]);

  return {
    context: { scope: context.scope, activeWarehouseId: context.activeWarehouseId },
    // Sevk penceresinin seçenekleri: AKTİF depolar, operatör sırasıyla — kapalı depo hiçbir
    // seçicide görünmez (tasarım kuralı). Geçmiş satırların kodu `labels`tan gelir; o kapalıyı
    // da bilir, çünkü eski kayıt eski tesisini söylemek zorundadır.
    warehouses: [...labels.values()]
      .filter((w) => w.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((w) => ({ id: w.id, code: w.code, name: w.name })),
    transit: transitRows,
    lateCount: transitRows.filter((r) => r.ageTone === 'late').length,
    history,
    transitDays,
  };
}

/** Geçmişin bir sayfası — ilk yük ve "daha eski" action'ı aynı kapıyı kullanır. */
export async function readHistoryPage(after: KeysetCursor | null): Promise<HistoryPageView> {
  const db = serviceDb();
  const [context, labels] = await Promise.all([readWarehouseContext(), readWarehouseLabels()]);
  const transfers = new WarehouseTransferService(db);

  const opts = { cursor: after ?? undefined, limit: HISTORY_PAGE_SIZE };
  const page =
    context.scope.kind === 'limited'
      ? await transfers.listForWarehouses(context.scope.warehouseIds, opts)
      : await transfers.listRecent(opts);

  // Yoldakiler geçmişe girmez — onların evi üstteki sekme. Sayfa İÇİNDE süzmek keyset'i bozmaz:
  // imleç servisten ham listenin sonuna göre gelir, süzgeç yalnız gösterimi daraltır.
  const closed = page.rows.filter((t) => t.status !== 'in_transit');
  const lines = await new WarehouseTransferLineService(db).listByTransfers(closed.map((t) => t.id));
  const byTransfer = groupLines(lines);

  return {
    rows: closed.map((t) => toHistoryRow(t, byTransfer.get(t.id) ?? [], labels)),
    nextCursor: page.nextCursor,
  };
}

/**
 * İçerik penceresinin verisi — satırlar parti künyesiyle (ad · lot · tarih), okuma
 * `@lezzet/application.readTransferDetail`den (mobil rampayla AYNI künye çözümü; ikinci bir ad/lot
 * çözümü web'de yaşamaz). DURUM SÜZGECİ YOK (19.08): kapanmış kayıt da açılır — geçmişte "hangi
 * kalem eksik geldi" bu pencereden okunur. Okuma zararsızdır; kabul FORMU yalnız `canReceive` ile
 * çizilir ve yazma kapısı hedef eşleşmesini zaten arar (dört göz oradan bozulmaz).
 */
export async function readTransferDetailView(transferId: string): Promise<TransferDetailView | null> {
  const db = serviceDb();
  const [detail, context, labels] = await Promise.all([
    readTransferDetail(db, { transferId }),
    readWarehouseContext(),
    readWarehouseLabels(),
  ]);
  if (!detail) return null;

  const scopeIds = context.scope.kind === 'limited' ? new Set(context.scope.warehouseIds) : null;
  const sentQty = detail.lines.reduce((sum, l) => sum + l.dispatchedQty, 0);
  const receivedQty = detail.lines.reduce((sum, l) => sum + (l.receivedQty ?? 0), 0);
  return {
    transferId: detail.transferId,
    referenceNo: detail.referenceNo,
    fromCode: labels.get(detail.fromWarehouseId)?.code ?? '?',
    toCode: labels.get(detail.toWarehouseId)?.code ?? '?',
    status: detail.status,
    dispatchedAt: detail.dispatchedAt,
    ageDays: daysBetween(detail.dispatchedAt, new Date()),
    canReceive:
      detail.status === 'in_transit' &&
      (context.scope.kind !== 'limited' || (scopeIds?.has(detail.toWarehouseId) ?? false)),
    outcome: detail.status === 'in_transit' ? null : outcomeOf(detail.status, sentQty, receivedQty),
    lines: detail.lines.map((line) => ({
      lineId: line.lineId,
      name: line.name,
      lotNumber: line.lotNumber,
      expiryDate: line.expiryDate,
      sentQty: line.dispatchedQty,
      receivedQty: line.receivedQty,
    })),
  };
}

// ── iç yardımcılar ──────────────────────────────────────────────────────────

async function enrichTransit(
  db: ReturnType<typeof serviceDb>,
  rows: WarehouseTransfer[],
  ctx: {
    labels: Awaited<ReturnType<typeof readWarehouseLabels>>;
    transitDays: number;
    scopeIds: Set<string> | null;
  },
): Promise<TransitRowView[]> {
  if (rows.length === 0) return [];

  const [lines, profiles] = await Promise.all([
    new WarehouseTransferLineService(db).listByTransfers(rows.map((t) => t.id)),
    new UserProfileService(db).listByIds([
      ...new Set(rows.map((t) => t.dispatchedBy).filter((id): id is string => id !== null)),
    ]),
  ]);
  const byTransfer = groupLines(lines);
  const nameOf = new Map(profiles.map((p) => [p.id, p.name]));

  return rows.map((t) => {
    const own = byTransfer.get(t.id) ?? [];
    const ageDays = daysBetween(t.dispatchedAt, new Date());
    return {
      id: t.id,
      referenceNo: t.referenceNo,
      fromCode: ctx.labels.get(t.fromWarehouseId)?.code ?? '?',
      toCode: ctx.labels.get(t.toWarehouseId)?.code ?? '?',
      dispatchedAt: t.dispatchedAt,
      dispatchedByName: t.dispatchedBy ? (nameOf.get(t.dispatchedBy) ?? null) : null,
      lineCount: own.length,
      totalQty: own.reduce((sum, l) => sum + l.qty, 0),
      ageDays,
      // Ton eşiği: süre içinde sakin; bir gün taşma "bak" (kamyon gecikmiş olabilir); daha
      // fazlası "ara" — mal iki depoda da satılamaz hâlde bekliyor demektir.
      ageTone: ageDays <= ctx.transitDays ? 'ok' : ageDays <= ctx.transitDays + 1 ? 'warn' : 'late',
      canReceive: ctx.scopeIds === null || ctx.scopeIds.has(t.toWarehouseId),
    };
  });
}

function groupLines(lines: WarehouseTransferLine[]): Map<string, WarehouseTransferLine[]> {
  const map = new Map<string, WarehouseTransferLine[]>();
  for (const line of lines) {
    const list = map.get(line.transferId);
    if (list) list.push(line);
    else map.set(line.transferId, [line]);
  }
  return map;
}

/** Kapanmış kaydın sonucu — geçmiş satırı ve içerik penceresi AYNI hesabı okur (tek yer). */
function outcomeOf(
  status: WarehouseTransfer['status'],
  sentQty: number,
  receivedQty: number | null,
): HistoryRowView['outcome'] {
  if (status === 'cancelled') return 'cancelled';
  const got = receivedQty ?? 0;
  return got === 0 ? 'zero' : got === sentQty ? 'full' : 'partial';
}

function toHistoryRow(
  t: WarehouseTransfer,
  lines: WarehouseTransferLine[],
  labels: Awaited<ReturnType<typeof readWarehouseLabels>>,
): HistoryRowView {
  const sentQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const receivedQty = t.status === 'cancelled' ? null : lines.reduce((sum, l) => sum + (l.receivedQty ?? 0), 0);
  return {
    id: t.id,
    referenceNo: t.referenceNo,
    fromCode: labels.get(t.fromWarehouseId)?.code ?? '?',
    toCode: labels.get(t.toWarehouseId)?.code ?? '?',
    dispatchedAt: t.dispatchedAt,
    lineCount: lines.length,
    sentQty,
    receivedQty,
    outcome: outcomeOf(t.status, sentQty, receivedQty),
  };
}
