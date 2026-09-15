import { fromCents } from '@lezzet/helper';
import type { DocumentKind, MoneyDocument, MoneyMovement, MovementDirection, MovementSource, MovementType } from '@lezzet/types';

/**
 * Hareket dökümü (12.15) — DOMAIN §9. Satış dosyasının (12.7) yanına dönemin HER para hareketi:
 * alım, gider, maaş, transfer, sermaye — muhasebeci "bu 1.180 € ne" diye sorduğunda cevap satırın
 * üstünde durur: hesabı, TÜRÜ ve hesap kodu, carisi, belgeleri (tür / no / tarih / KDV), etiketleri.
 *
 * Saf: okuma yok, yazma yok. Girdi zaten döneme süzülmüş hareketler ve onların adlandırılmış
 * bağlarıdır (hesap adı, tür, cari, belge, sipariş referansı, tedarikçi adı); burada yalnız satır
 * kurulur ve özet çıkar. Tutarlar CENT'te toplanır, dosyaya EURO yazılır (12.7 ile aynı kural).
 *
 * **Transfer TEK satırdır** (gönderenin gözünden, karşı hesap ayrı sütunda): defter görünümünün iki
 * satırı dökümde iki kez sayılırdı. Muhasebeci "kasadan bankaya 600 €" satırını bir kez görür.
 *
 * ── TÜR VE HESAP KODU (13.09 · ikinci karar) ────────────────────────────────
 * Sınıflandırma bir tur çoklu etiketti ve dosyada "Kira, Ortak A" diye tek hücreye yazılıyordu:
 * muhasebeci hangisinin gider türü olduğunu bilemiyordu. Tür artık tektir ve Fransız hesap planındaki
 * kodunu (varsa) taşır; etiketler serbest işarettir, ayrı sütunda.
 */

/** Dökümün gördüğü belge — hareketin BAĞLI olduğu belgelerden biri (bir havale birkaç faturayı kapatabilir). */
export type MovementExportDocument = Pick<MoneyDocument, 'kind' | 'number' | 'issuedOn' | 'amountCents' | 'vatAmountCents' | 'vatRegime'> & {
  /** Belgenin karşı tarafının ADI (cari ya da tedarikçi); yoksa `null`. */
  counterpartyName: string | null;
};

export interface MovementExportInput {
  movement: MoneyMovement;
  accountName: string;
  /** Transferde karşı hesabın adı; öteki tiplerde `null`. */
  counterAccountName: string | null;
  /** Türün okunur adı; tür konmamışsa `null`. */
  natureLabel: string | null;
  /** Türün hesap planı kodu; türde yoksa `null` (uydurulmaz). */
  accountCode: string | null;
  /** Serbest etiketlerin OKUNUR adları (sözlükten); slug dosyaya girmez. */
  tagLabels: readonly string[];
  /** Bağlı belgeler — belge tarihine göre; çoğu satırda bir ya da hiç. */
  documents: readonly MovementExportDocument[];
  /** Sipariş bağıysa referans numarası (tahsilat / iade). */
  orderReference: string | null;
  supplierName: string | null;
  /** Carinin adı (13.09) — karşı tarafın en doğrudan kaydı. */
  counterpartyName: string | null;
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
  /** Tür — "Sosyal güvenlik"; konmamışsa `null`. */
  nature: string | null;
  /** Türün hesap planı kodu — "645"; muhasebecinin kendi yazılımına aktarımı buna bakar. */
  accountCode: string | null;
  /** "Ortak A aracı, Bayram" — serbest etiketlerin okunur adları, virgülle. */
  tags: string;
  /** İlk belgenin türü (belge tarihine göre). */
  documentKind: DocumentKind | null;
  /** Bütün belgelerin numaraları — "FA-1; FA-2"; numarasız belge atlanır. */
  documentNo: string | null;
  /** İlk belgenin tarihi. */
  documentDate: string | null;
  /** Belgelerin toplamı (euro) — kısmi ödemede hareket tutarından büyüktür; muhasebeci ikisini görür. */
  documentTotal: number | null;
  /** Belgelerde yazan KDV toplamı (euro); `null` = hiçbir belgede KDV yok ya da belge yok. */
  documentVat: number | null;
  /**
   * İlk belgenin KDV rejimi (12.26) — ters yüklemeli alımda belgede KDV yoktur ama muhasebeci onu
   * beyanda hesaplar; "KDV 0" ile ayırt edebilmesi bu sütunun bütün sebebi. Belge yoksa `null`.
   */
  documentVatRegime: MoneyDocument['vatRegime'] | null;
  /**
   * Karşı taraf — SIRAYLA: cari → belgenin karşı tarafı → tedarikçi → sipariş referansı → transferin
   * karşı hesabı. İlk dolu olan yazılır; sıra kaydın doğrudanlığıdır (cari satırın kendi bağı).
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

/** Belgelerin KDV toplamı — hiçbirinde KDV yazmıyorsa `null` (sıfır "KDV yok" demek olurdu). */
function vatOf(documents: readonly MovementExportDocument[]): number | null {
  const known = documents.flatMap((document) => (document.vatAmountCents === null ? [] : [document.vatAmountCents]));
  return known.length === 0 ? null : fromCents(known.reduce((sum, cents) => sum + cents, 0));
}

export function buildMovementRow(input: MovementExportInput): MovementExportRow {
  const { movement } = input;
  const documents = [...input.documents].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn));
  const first = documents[0] ?? null;
  const numbers = documents.flatMap((document) => (document.number ? [document.number] : []));
  const signed = movement.direction === 'in' ? movement.amountCents : -movement.amountCents;
  return {
    movementId: movement.id,
    valueDate: movement.valueDate,
    account: input.accountName,
    counterAccount: input.counterAccountName,
    direction: movement.direction,
    amount: fromCents(signed),
    type: movement.type,
    nature: input.natureLabel,
    accountCode: input.accountCode,
    tags: input.tagLabels.join(', '),
    documentKind: first?.kind ?? null,
    documentNo: numbers.length > 0 ? numbers.join('; ') : null,
    documentDate: first?.issuedOn ?? null,
    documentTotal: first ? fromCents(documents.reduce((sum, document) => sum + document.amountCents, 0)) : null,
    documentVat: vatOf(documents),
    documentVatRegime: first?.vatRegime ?? null,
    counterparty:
      input.counterpartyName ??
      documents.find((document) => document.counterpartyName !== null)?.counterpartyName ??
      input.supplierName ??
      (input.orderReference ? `Sipariş ${input.orderReference}` : null) ??
      input.counterAccountName,
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
