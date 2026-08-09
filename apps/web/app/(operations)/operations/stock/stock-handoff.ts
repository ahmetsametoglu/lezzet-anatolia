import 'server-only';
import { BatchOfferPayloadSchema } from '@lezzet/types';
import { readHandoffProposal } from '@/lib/assistant/handoff';

/**
 * Asistan önerisi → teklif diyaloğunun ön dolgusu (22.5 · dördüncü devir hedefi).
 *
 * ── NEDEN KUYRUKTAN UYGULANMIYOR ────────────────────────────────────────────
 * `batch_offer` ilk yazımda "tek sayı, düzenlenecek bir şey yok" diye `apply` modundaydı; denetim
 * taraması bunu düzeltti ve gerekçe ekranın kendi künyesinde zaten yazılıydı: **teklif fiyatının
 * ÜÇ YÜZÜ var** — tutar (€) · liste fiyatına göre indirim (%) · ALIŞ fiyatına göre marj (%).
 * Kuyrukta tek sayı onaylamak, marjı görmeden fiyat onaylamaktır; zararına satışı fark etmenin tek
 * yeri `offer-dialog`un kâr satırıdır. Üstelik patron rakamı değiştirmek isteyebilir ve
 * "onayla/reddet" ona bu yolu hiç vermiyordu.
 *
 * ── PARTİ ELDE DURUYOR MU, BURADA SORULMAZ ──────────────────────────────────
 * Bu dosya yalnız öneriyi çözer; partinin hâlâ var olup olmadığına ekranın kendi verisi karar
 * verir (`stock-client`: kimlik listede yoksa diyalog açılmaz, künye sebebini yazar). İkinci bir
 * `getBatchDetails` çağrısı aynı soruyu iki kaynağa sormak olurdu ve ikisi bir gün ayrışırdı —
 * kuyruk "parti duruyor" derken tabloda satır olmazdı.
 */
export interface OfferHandoff {
  proposalId: string;
  summary: string;
  reason: string | null;
  /** Teklif açılacak parti (`stock.id`) — ekran bunu kendi listesinde arar. */
  batchId: string;
  /** Önerilen fiyat (**cent**, KDV dahil · b2c tabanı). Diyalog bunu dolu açar, kilitlemez. */
  offerPriceCents: number;
  /** Önizlemedeki ad — parti listede bulunamazsa künye neyin kaybolduğunu söyleyebilsin diye. */
  productName: string;
  expiryDate: string;
  warehouseCode: string;
}

export async function readOfferHandoff(proposalId: string | null): Promise<OfferHandoff | null> {
  if (!proposalId) return null;
  const proposal = await readHandoffProposal(proposalId);
  if (!proposal || proposal.kind !== 'batch_offer') return null;

  const parsed = BatchOfferPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) return null;
  const payload = parsed.data;

  return {
    proposalId: proposal.id,
    summary: proposal.summary,
    reason: proposal.reason,
    batchId: payload.batchId,
    offerPriceCents: payload.offerPriceCents,
    productName: payload.productName,
    expiryDate: payload.expiryDate,
    warehouseCode: payload.warehouseCode,
  };
}
