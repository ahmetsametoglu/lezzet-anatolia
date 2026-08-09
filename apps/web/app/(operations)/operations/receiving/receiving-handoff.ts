import 'server-only';
import { StockIntakePayloadSchema, type StockIntakePayload } from '@lezzet/types';
import type { IntakeFormLine, PurchaseIntakeLine } from '@lezzet/application';
import { readHandoffProposal } from '@/lib/assistant/handoff';
import type { IntakeRow } from './receiving-types';

/**
 * Asistan önerisi → mal kabul masasının ön dolgusu (22.5).
 *
 * ── EKRANA GİDEN ŞEYDE FİYAT YOK ─────────────────────────────────────────────
 * `stock_intake` payload'ı **birim alış fiyatı taşıyor** (faturadan okundu), oysa bu ekranın tipi
 * fiyatı kabul etmiyor ve bu bir ekran kuralı değil TİP sınırı (`IntakeFormLine`'da `unitCostCents`
 * yok — *"depocu yolu fiyat gönderemez"*). İki kolay çözüm de yanlıştı: ekrana fiyat alanı eklemek
 * rol duvarını delerdi, fiyatı atmak ise faturanın gerçeğini kaybettirirdi (`auto_price` "son alış
 * fiyatı"nı buradan öğreniyor).
 *
 * Yapılan üçüncüsü: **fiyat istemciye HİÇ inmez, sunucuda payload'dan alınıp kayda eklenir**
 * (`costsForLines`). Depocu adet ve tarihi gözüyle doğrular, maliyet onun görmediği bir yoldan
 * (`receivePurchase`) yazılır. Rol duvarı da ayakta kalır, veri de.
 *
 * ── ADET ÖN DOLDURULMAZ ──────────────────────────────────────────────────────
 * Ekranın kendi kuralı (`receiving-client`: *"beklenen adedi 'gelen' hanesine yazmak, depocuya
 * saymadan onaylamayı teklif etmektir"*) burada DAHA da geçerli: sayıyı bir modelin okuduğu
 * fatura fotoğrafı söylüyor. SKT ve lot ise sayım değil ETİKETTEN KOPYA — onlar dolu gelir,
 * operatör etikete bakıp düzeltir. Denetimin talebi "adet de yazılsın" diyordu; bilerek sapıldı,
 * gerekçe cevapta.
 */
export interface IntakeHandoff {
  proposalId: string;
  summary: string;
  reason: string | null;
  /** Öneri hangi depoya yazıyor — bitirme diyaloğu bunu ön seçer. */
  warehouseId: string;
  warehouseCode: string;
  supplierId: string | null;
  supplierName: string | null;
  documentNo: string | null;
  purchaseOrderId: string | null;
  /** Ön dolu satırlar — adet BOŞ, SKT ve lot dolu. */
  rows: IntakeRow[];
}

export async function readIntakeHandoff(proposalId: string | null): Promise<IntakeHandoff | null> {
  if (!proposalId) return null;
  const proposal = await readHandoffProposal(proposalId);
  if (!proposal || proposal.kind !== 'stock_intake') return null;

  const parsed = StockIntakePayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) return null;
  const payload = parsed.data;

  return {
    proposalId: proposal.id,
    summary: proposal.summary,
    reason: proposal.reason,
    warehouseId: payload.warehouseId,
    warehouseCode: payload.warehouseCode,
    supplierId: payload.supplierId,
    supplierName: payload.supplierName,
    documentNo: payload.documentNo,
    purchaseOrderId: payload.purchaseOrderId,
    rows: payload.lines.map((line) => ({
      variantId: line.variantId,
      title: line.productName,
      // Siparişsiz kabulde karşılaştırılacak bir "ısmarlanan" yok; öneri bir sipariş değil.
      expectedQty: null,
      // **Adet bilerek boş** — yukarıdaki künye.
      receivedQty: null,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber ?? '',
      location: '',
      isMissing: false,
    })),
  };
}

/**
 * Operatörün onayladığı satırlara payload'daki maliyeti ekler — **yalnız sunucuda**.
 *
 * Eşleşme `variantId + SKT + lot` üçlüsüyle: maliyet SATIRIN, varyantın değil (aynı varyant farklı
 * tarihle iki satırda gelebilir ve aynı sevkiyatta farklı fiyata alınmış olabilir —
 * `PurchaseIntakeLine` künyesi). Operatör SKT'yi ya da lotu DÜZELTTİYSE üçlü tutmaz; o zaman aynı
 * varyant payload'da tek satırsa onun fiyatı kullanılır, birden çoksa fiyat `null` kalır.
 *
 * `null` burada "bilmiyorum" demek ve meşru: uydurulmuş bir maliyet, kâr hesabını sessizce
 * bozardı. Kayıt yine yazılır.
 */
export function costsForLines(
  payload: StockIntakePayload,
  lines: readonly IntakeFormLine[],
): PurchaseIntakeLine[] {
  const byVariant = new Map<string, StockIntakePayload['lines']>();
  for (const line of payload.lines) {
    const list = byVariant.get(line.variantId) ?? [];
    list.push(line);
    byVariant.set(line.variantId, list);
  }

  return lines.map((line) => {
    const candidates = byVariant.get(line.variantId) ?? [];
    const exact = candidates.find(
      (c) => c.expiryDate === line.expiryDate && (c.lotNumber ?? '') === (line.lotNumber ?? ''),
    );
    const fallback = candidates.length === 1 ? candidates[0] : undefined;
    return { ...line, unitCostCents: (exact ?? fallback)?.unitCostCents ?? null };
  });
}
