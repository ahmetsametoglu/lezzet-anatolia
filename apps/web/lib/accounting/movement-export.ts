import {
  AccountService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementTagService,
  OrderService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { buildMovementExport as buildMovementRows, type MovementExport, type MovementExportRow } from '@lezzet/domain-core';
import { toCsv } from '@lezzet/helper';
import { DOCUMENT_KIND_LABEL, MOVEMENT_TYPE_LABEL } from '@/app/(operations)/operations/finance/finance-labels';

/**
 * Hareket dökümü kapısı (12.15) — DOMAIN §9. Satış dosyasının (12.7) yanına dönemin her para
 * hareketi; muhasebeci "bu 1.180 € ne" diye sorduğunda cevap satırın üstünde: hesap, etiket, belge
 * (tür / no / tarih / KDV), karşı taraf. Karar motorun (`domain-core/accounting/movement-export`),
 * okuma servislerin; birleştiren yer burası (STACK §4).
 *
 * Her bağ TEK turda okunur (belgeler, siparişler kimlik listesiyle; hesaplar, etiketler, tedarikçiler
 * doğal tavanlı listeler): satır başına sorgu atsaydık aylık bir döküm yüzlerce sorgu ederdi.
 */

interface ExportPeriod {
  /** Dâhil — paranın hareket ettiği gün (`value_date`). */
  from: string;
  /** Dâhil. */
  to: string;
}

const unique = (values: ReadonlyArray<string | null | undefined>): string[] => [...new Set(values.filter((v): v is string => !!v))];

export async function buildMovementExport(period: ExportPeriod): Promise<MovementExport> {
  const db = serviceDb();
  const movements = await new MoneyMovementService(db).listPeriod(period.from, period.to);
  const [accounts, tags, suppliers, documents, orders] = await Promise.all([
    new AccountService(db).list(),
    new MovementTagService(db).list(),
    new SupplierService(db).list(),
    (async () => {
      const ids = unique(movements.map((movement) => movement.documentId));
      return ids.length > 0 ? new MoneyDocumentService(db).listByIds(ids) : [];
    })(),
    (async () => {
      const ids = unique(movements.map((movement) => movement.orderId));
      return ids.length > 0 ? new OrderService(db).listByIds(ids) : [];
    })(),
  ]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name] as const));
  const tagLabel = new Map(tags.map((tag) => [tag.slug, tag.label] as const));
  const supplierName = new Map(suppliers.map((supplier) => [supplier.id, supplier.name] as const));
  const documentOf = new Map(documents.map((document) => [document.id, document] as const));
  const orderRef = new Map(orders.map((order) => [order.id, order.referenceNo] as const));

  return buildMovementRows(
    period,
    movements.map((movement) => ({
      movement,
      // Adı silinmiş hesap olmaz (`restrict`), yine de kimlik düşmesin diye kısa kimlik yedek.
      accountName: accountName.get(movement.accountId) ?? `#${movement.accountId.slice(0, 8)}`,
      counterAccountName: movement.counterAccountId ? (accountName.get(movement.counterAccountId) ?? `#${movement.counterAccountId.slice(0, 8)}`) : null,
      // Sözlükten düşmüş etiket slug'ıyla kalır — dosyada boş hücre, izahlı bir satırı izahsız gösterirdi.
      tagLabels: movement.tags.map((slug) => tagLabel.get(slug) ?? slug),
      document: movement.documentId ? (documentOf.get(movement.documentId) ?? null) : null,
      orderReference: movement.orderId ? (orderRef.get(movement.orderId) ?? null) : null,
      supplierName: movement.supplierId ? (supplierName.get(movement.supplierId) ?? null) : null,
    })),
  );
}

/** Dosyanın satırı — dökümün satırı artı operatörün diliyle yazılan sütunlar (tür, belge türü, kaynak). */
type MovementCsvRow = MovementExportRow & { typeLabel: string; documentKindLabel: string | null; sourceLabel: string; explainedLabel: string };

const SOURCE_LABEL = { manual: 'elle', bank_import: 'banka ekstresi', system: 'sistem' } as const;

/** Dosyanın sütunları — sıra ve başlıklar AÇIK yazılır (12.7 ile aynı kural); alan eklenince biçim habersiz kaymasın. */
const COLUMNS: ReadonlyArray<{ key: keyof MovementCsvRow & string; label: string }> = [
  { key: 'valueDate', label: 'Tarih' },
  { key: 'account', label: 'Hesap' },
  { key: 'counterAccount', label: 'Karşı hesap' },
  { key: 'typeLabel', label: 'Tür' },
  { key: 'amount', label: 'Tutar' },
  { key: 'tags', label: 'Etiketler' },
  { key: 'documentKindLabel', label: 'Belge türü' },
  { key: 'documentNo', label: 'Belge no' },
  { key: 'documentDate', label: 'Belge tarihi' },
  { key: 'documentTotal', label: 'Belge toplamı' },
  { key: 'documentVat', label: 'Belge KDV' },
  { key: 'counterparty', label: 'Karşı taraf' },
  { key: 'description', label: 'Açıklama' },
  { key: 'sourceLabel', label: 'Kaynak' },
  { key: 'explainedLabel', label: 'İzah' },
  { key: 'movementId', label: 'Hareket kimliği' },
];

/**
 * Dökümün CSV'si. Özet dosyanın İÇİNDE (12.7'nin kuralı): muhasebeci satırların toplamını aynı dosyada
 * görmezse kendi toplamını çıkarır ve iki sayı ayrışırsa hangisinin doğru olduğu tartışılır. İzahsız
 * satır sayısı da orada — eksik olan gizlenmez.
 */
export function toMovementCsv(data: MovementExport): string {
  const rows: MovementCsvRow[] = data.rows.map((row) => ({
    ...row,
    typeLabel: MOVEMENT_TYPE_LABEL[row.type],
    documentKindLabel: row.documentKind ? DOCUMENT_KIND_LABEL[row.documentKind] : null,
    sourceLabel: SOURCE_LABEL[row.source],
    explainedLabel: row.explained ? 'izahlı' : 'İZAHSIZ',
  }));
  const body = toCsv(rows as unknown as Array<Record<string, unknown>>, COLUMNS);
  const { summary } = data;
  const summaryLines = [
    '',
    `TOPLAM;${summary.movementCount} hareket;;;giriş ${summary.in};çıkış ${summary.out}`,
    ...summary.byType.map((line) => `${MOVEMENT_TYPE_LABEL[line.type]};${line.count} hareket;;;giriş ${line.in};çıkış ${line.out}`),
    ...(summary.unexplainedCount > 0 ? [`İZAHSIZ;${summary.unexplainedCount} hareket — etiketi, belgesi ya da bağı yok`] : []),
  ].join('\n');

  return `${body}${summaryLines}\n`;
}
