import { toCents } from '@lezzet/helper';
import { parseCsv } from '../bank/file';

/**
 * Revolut aktarım raporu (`payout_statement_report`): aktarıma giren her işlem bir satırdır ve aktarım tutarı satırların
 * `settlement_amount` toplamıdır. Tutarlar raporda ana birimdedir (avro), burada cent'e çevrilir.
 */

/** Raporun bir satırı; tutarlar **cent**. */
export interface PayoutStatementRow {
  type: string;
  state: string;
  /** İşlemin sağlayıcı siparişi; iade satırında iadenin kendi siparişidir. */
  orderId: string | null;
  /** İade ve ters ibrazda geri alınan ödemenin siparişi; ödeme satırında `orderId` ile aynıdır. */
  originalOrderId: string | null;
  transactionCents: number;
  feeCents: number;
  feeCurrency: string | null;
  settlementCents: number;
}

/** Defterin para birimi; başka birimdeki komisyon cent'e çevrilip yazılmaz. */
const LEDGER_CURRENCY = 'EUR';

/** Geçici tutma: ardışık iki aktarımda biri tutar, öteki bırakır ve deftere girmez. */
const BALANCE_HOLD = 'Irreducible balance hold';

const COLUMNS = {
  type: 'type',
  state: 'state',
  orderId: 'order_id',
  originalOrderId: 'original_order_id',
  transaction: 'transaction_amount',
  fee: 'fee_amount',
  feeCurrency: 'fee_currency',
  settlement: 'settlement_amount',
} as const;

export function parsePayoutStatement(csv: string): PayoutStatementRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, name]) => {
      const at = header.indexOf(name);
      // Sütun yoksa rapor biçimi değişmiştir; tahminle okumak yanlış komisyon yazardı.
      if (at < 0) throw new Error(`aktarım raporunda "${name}" sütunu yok`);
      return [key, at];
    }),
  ) as Record<keyof typeof COLUMNS, number>;

  const text = (row: readonly string[], key: keyof typeof COLUMNS): string => (row[index[key]] ?? '').trim();
  const cents = (row: readonly string[], key: keyof typeof COLUMNS): number => {
    const raw = text(row, key);
    if (raw === '') return 0;
    const amount = Number(raw);
    if (!Number.isFinite(amount)) throw new Error(`aktarım raporunda okunamayan tutar: ${COLUMNS[key]}="${raw}"`);
    return toCents(amount);
  };

  return rows.map((row) => ({
    type: text(row, 'type'),
    state: text(row, 'state'),
    orderId: text(row, 'orderId') || null,
    originalOrderId: text(row, 'originalOrderId') || null,
    transactionCents: cents(row, 'transaction'),
    feeCents: cents(row, 'fee'),
    feeCurrency: text(row, 'feeCurrency') || null,
    settlementCents: cents(row, 'settlement'),
  }));
}

const isLedgerFee = (row: PayoutStatementRow): boolean => row.feeCurrency === null || row.feeCurrency === LEDGER_CURRENCY;

/** Ödeme başına komisyon: tamamlanmış ödeme satırlarından; aynı ödemenin satırları toplanır, komisyonsuz ödeme yazılmaz. */
export function payoutPaymentFees(rows: readonly PayoutStatementRow[]): Array<{ paymentRef: string; feeCents: number }> {
  const fees = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== 'Settlement' || row.state !== 'COMPLETED' || !row.orderId || row.feeCents <= 0 || !isLedgerFee(row)) continue;
    fees.set(row.orderId, (fees.get(row.orderId) ?? 0) + row.feeCents);
  }
  return [...fees].map(([paymentRef, feeCents]) => ({ paymentRef, feeCents }));
}

/**
 * Defterin açıklayamadığı satırlar: bilinmeyen ödeme, bilinmeyen ödemenin iadesi, defter biriminde olmayan komisyon ve deftere
 * karşılığı yazılmayan her tür (ters ibraz, ücret, yükleme). Geçici tutma sayılmaz, çünkü ardışık aktarımlarda kendini kapatır.
 */
export function unexplainedPayoutRows(rows: readonly PayoutStatementRow[], knownPaymentRefs: ReadonlySet<string>): PayoutStatementRow[] {
  return rows.filter((row) => {
    if (row.type === BALANCE_HOLD) return false;
    if (!isLedgerFee(row)) return true;
    if (row.type === 'Settlement') return !row.orderId || !knownPaymentRefs.has(row.orderId);
    if (row.type === 'Refund') return !row.originalOrderId || !knownPaymentRefs.has(row.originalOrderId);
    return true;
  });
}
