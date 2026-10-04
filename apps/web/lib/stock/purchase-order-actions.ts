'use server';

import { revalidatePath } from 'next/cache';
import { createMoneyDocument } from '@lezzet/application';
import { PurchaseOrderService, SupplierProductService, serviceDb } from '@lezzet/database';
import { parisDateOf } from '@lezzet/helper';
import type { DocumentVatLine, DocumentVatRegime } from '@lezzet/types';
import { requireFinance } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { withProposal } from '@/lib/assistant/handoff';
import { sendPurchaseOrder } from '@/lib/stock/purchase-order-send';
import { DOCUMENT_REASON } from '@/app/(operations)/operations/finance/finance-labels';

/** Tedarik ekranının yolu — kayıt sonrası liste tazelensin (sayfa kendi sabitini de tutuyor). */
const PROCUREMENT_PATH = '/operations/procurement';

/**
 * Öneriden tedarik siparişi: `createManualDraftAction` ile aynı işi yapar ama öneriyi de kapatır (`withProposal`), kalemler
 * dilekçeden değil düzeltilmiş formdan gelir; yetki elle siparişle aynı kapı (`requireFinance`). Kuyruk çağırıp tedarik ekranı
 * tazelendiği için sayfa klasöründe değil `lib/` altında durur, kardeş sayfa içe aktarımı yasak (`STACK §7`).
 */
export async function createDraftFromProposalAction(input: {
  supplierId: string;
  targetWarehouseId: string | null;
  note: string | null;
  /** `unitPriceCents` yalnız faturadan siparişte: tedarikçinin kestiği fiyat, eşlemedeki son alışın önüne geçer. */
  lines: Array<{ variantId: string; qty: number; unitPriceCents?: number | null }>;
  /**
   * Faturadan sipariş: verildiyse sipariş gönderilmiş açılır ve fatura siparişe bağlı belge olarak doğar; tedarikçi borcu o
   * belgeden türer, mal gelince rampa sayar.
   */
  invoice?: {
    number: string | null;
    issuedOn: string | null;
    amountCents: number;
    vatLines: DocumentVatLine[];
    vatRegime: DocumentVatRegime;
    dueOn: string | null;
  } | null;
  /** Eşleme önerileri — onay, tedarikçinin kalem eşlemesinin de onayıdır. */
  mappings?: Array<{ variantId: string; supplierCode: string; nameAtSupplier: string | null }>;
  proposalId: string;
}): Promise<ActionResult<{ orderId: string; documentId: string | null }>> {
  try {
    const staff = await requireFinance();
    // Kapının kendi kuralı, formun engeliyle AYNI (`purchaseOrderBlock`): arayüz uyarıyor, kapı
    // doğruluyor. İkisi de olmalı — istemcinin beyanına güvenilmez.
    if (!input.supplierId) throw new Error('Tedarikçi seçin — kimden alınacağı belli olmayan sipariş açılamaz.');
    if (input.lines.length === 0) throw new Error('En az bir kalem ekleyin.');
    if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) throw new Error('Adet en az 1 olmalı.');

    const created = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        const draft = await new PurchaseOrderService(serviceDb()).createDraft(
          input.supplierId,
          // Hedef depo kalem başına yazılır (C7): hedefsiz sipariş hiçbir deponun eksiğini kapatmaz
          // ve "yolda" hesabı tam da bu akışta sessizce 0 kalırdı.
          input.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents ?? null, targetWarehouseId: input.targetWarehouseId })),
          input.note?.trim() || undefined,
        );
        // Faturası kesilen sipariş verilmiş demektir: "gönderildi" işareti numarayı üretir ve siparişi rampanın "kabul bekliyor"
        // listesine sokar; tedarikçiye mesaj gitmez (`sendPurchaseOrder` yalnız işaretler).
        if (input.invoice) await sendPurchaseOrder(draft.order.id);
        return draft;
      },
      ({ order }) => ({ purchaseOrderId: order.id }),
    );
    revalidatePath(PROCUREMENT_PATH);

    // Belge ve eşlemeler SİPARİŞTEN SONRA: sipariş açılmış bir gerçek. Biri yazılamazsa sipariş geri
    // alınmaz ve cevap bunu SÖYLER — "olmadı" deseydik operatör siparişi ikinci kez açardı.
    const problems: string[] = [];
    let documentId: string | null = null;
    if (input.invoice) {
      const outcome = await createMoneyDocument(serviceDb(), {
        kind: 'invoice',
        number: input.invoice.number?.trim() || null,
        issuedOn: input.invoice.issuedOn ?? parisDateOf(new Date()),
        dueOn: input.invoice.dueOn,
        supplierId: input.supplierId,
        purchaseOrderId: created.order.id,
        direction: 'out',
        amountCents: input.invoice.amountCents,
        vatLines: input.invoice.vatLines,
        vatRegime: input.invoice.vatRegime,
      });
      if (outcome.status === 'ok') documentId = outcome.document.id;
      else problems.push(`fatura belgesi yazılamadı (${DOCUMENT_REASON[outcome.reason]}) — Para ekranından siparişe bağlayın`);
      revalidatePath('/operations/finance');
    }
    const mappings = new SupplierProductService(serviceDb());
    for (const mapping of input.mappings ?? []) {
      try {
        await mappings.setMapping({ supplierId: input.supplierId, variantId: mapping.variantId, supplierCode: mapping.supplierCode, nameAtSupplier: mapping.nameAtSupplier });
      } catch (err) {
        problems.push(`eşleme yazılamadı: ${mapping.nameAtSupplier ?? mapping.supplierCode} (${getErrorMessage(err)})`);
      }
    }
    if (problems.length > 0) return { data: null, error: `Sipariş açıldı ama ${problems.join(' · ')}.` };
    return { data: { orderId: created.order.id, documentId }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
