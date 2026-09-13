import { fromCents } from '@lezzet/helper';
import type { DocumentKind, MoneyDocument, MoneyMovement, MovementDirection, MovementSource, MovementType } from '@lezzet/types';

/**
 * Hareket dökümü (12.15) — DOMAIN §9. Satış dosyasının (12.7) yanına dönemin HER para hareketi:
 * alım, gider, maaş, transfer, sermaye — muhasebeci "bu 1.180 € ne" diye sorduğunda cevap satırın
 * üstünde durur: hesabı, etiketi, belgesi (tür / no / tarih / KDV), karşı tarafı.
 *
 * Saf: okuma yok, yazma yok. Girdi zaten döneme süzülmüş hareketler ve onların adlandırılmış
 * bağlarıdır (hesap adı, etiket adı, belge, sipariş referansı, tedarikçi adı); burada yalnız satır
 * kurulur ve özet çıkar. Tutarlar CENT'te toplanır, dosyaya EURO yazılır (12.7 ile aynı kural).
 *
 * **Transfer TEK satırdır** (gönderenin gözünden, karşı hesap ayrı sütunda): defter görünümünün iki
 * satırı dökümde iki kez sayılırdı. Muhasebeci "kasadan bankaya 600 €" satırını bir kez görür.
 */

export interface MovementExportInput {
  movement: MoneyMovement;
  accountName: string;
  /** Transferde karşı hesabın adı; öteki tiplerde `null`. */
  counterAccountName: string | null;
  /** Etiketlerin OKUNUR adları (sözlükten); slug dosyaya girmez. */
  tagLabels: readonly string[];
  document: Pick<MoneyDocument, 'kind' | 'number' | 'issuedOn' | 'counterparty' | 'amountCents' | 'vatAmountCents'> | null;
  /** Sipariş bağıysa referans numarası (tahsilat / iade). */
  orderReference: string | null;
  supplierName: string | null;
}

export interface MovementExportRow {
  movementId: string;
  /** Paranın hareket ettiği gün — kayıt günü değil. */
  valueDate: string;
  account: string;
  counterAccount: string | null;
  direction: MovementDirection;
  /** **Euro**, işaretli: giriş artı, çıkış eksi — muhasebeci tek sütunu toplayabilsin. */
  amount: number;
  type: MovementType;
  /** "Kira, Ortak A" — okunur adlar, virgülle. */
  tags: string;
  documentKind: DocumentKind | null;
  documentNo: string | null;
  documentDate: string | null;
  /** Belgenin toplamı (euro) — kısmi ödemede hareket tutarından büyüktür; muhasebeci ikisini görür. */
  documentTotal: number | null;
  /** Belgede yazan KDV (euro); `null` = belgede KDV yok ya da belge yok. */
  documentVat: number | null;
  /**
   * Karşı taraf — SIRAYLA: belgenin karşı tarafı → tedarikçi → sipariş referansı → transferin karşı
   * hesabı. İlk dolu olan yazılır; sıra kanıt gücüdür (belge en resmîsi).
   */
  counterparty: string | null;
  description: string | null;
  source: MovementSource;
  /** İzahsız satır dosyaya GİRER ama işaretlenir: muhasebeci eksiği görsün, sessiz boşluk kalmasın. */
  explained: boolean;
}

export interface MovementExportTypeTotal {
  type: MovementType;
  count: number;
  in: number;
  out: number;
}

export interface MovementExportSummary {
  from: string;
  to: string;
  movementCount: number;
  in: number;
  out: number;
  byType: MovementExportTypeTotal[];
  /** İzah edilmemiş satır sayısı — dosyanın son satırında, gizlenmez. */
  unexplainedCount: number;
}

export interface MovementExport {
  summary: MovementExportSummary;
  rows: MovementExportRow[];
}

export function buildMovementRow(input: MovementExportInput): MovementExportRow {
  const { movement, document } = input;
  const signed = movement.direction === 'in' ? movement.amountCents : -movement.amountCents;
  return {
    movementId: movement.id,
    valueDate: movement.valueDate,
    account: input.accountName,
    counterAccount: input.counterAccountName,
    direction: movement.direction,
    amount: fromCents(signed),
    type: movement.type,
    tags: input.tagLabels.join(', '),
    documentKind: document?.kind ?? null,
    documentNo: document?.number ?? null,
    documentDate: document?.issuedOn ?? null,
    documentTotal: document ? fromCents(document.amountCents) : null,
    documentVat: document && document.vatAmountCents !== null ? fromCents(document.vatAmountCents) : null,
    counterparty: document?.counterparty ?? input.supplierName ?? (input.orderReference ? `Sipariş ${input.orderReference}` : null) ?? input.counterAccountName,
    description: movement.description,
    source: movement.source,
    explained: movement.explained,
  };
}

/**
 * Dönemin dökümü — satırlar tarih sırasında (eşit günde kayıt sırası), özet satırlardan TÜRETİLİR
 * (ayrı sorgulansaydı iki toplam bir gün ayrışırdı — 12.7'nin kuralı).
 */
export function buildMovementExport(period: { from: string; to: string }, inputs: readonly MovementExportInput[]): MovementExport {
  const ordered = [...inputs].sort(
    (a, b) => a.movement.valueDate.localeCompare(b.movement.valueDate) || a.movement.createdAt.localeCompare(b.movement.createdAt),
  );
  const rows = ordered.map(buildMovementRow);

  let inCents = 0;
  let outCents = 0;
  const byType = new Map<MovementType, { count: number; in: number; out: number }>();
  for (const { movement } of ordered) {
    const bucket = byType.get(movement.type) ?? { count: 0, in: 0, out: 0 };
    bucket.count += 1;
    if (movement.direction === 'in') {
      bucket.in += movement.amountCents;
      inCents += movement.amountCents;
    } else {
      bucket.out += movement.amountCents;
      outCents += movement.amountCents;
    }
    byType.set(movement.type, bucket);
  }

  return {
    summary: {
      from: period.from,
      to: period.to,
      movementCount: rows.length,
      in: fromCents(inCents),
      out: fromCents(outCents),
      byType: [...byType.entries()].map(([type, t]) => ({ type, count: t.count, in: fromCents(t.in), out: fromCents(t.out) })),
      unexplainedCount: rows.filter((row) => !row.explained).length,
    },
    rows,
  };
}
