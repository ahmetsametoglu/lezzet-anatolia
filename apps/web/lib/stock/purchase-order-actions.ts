'use server';

import { revalidatePath } from 'next/cache';
import { createMoneyDocument } from '@lezzet/application';
import { PurchaseOrderService, SupplierProductService, serviceDb } from '@lezzet/database';
import type { DocumentVatRegime } from '@lezzet/types';
import { requireFinance } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { withProposal } from '@/lib/assistant/handoff';
import { sendPurchaseOrder } from '@/lib/stock/purchase-order-send';
import { DOCUMENT_REASON } from '@/app/(operations)/operations/finance/finance-labels';

/** Tedarik ekranının yolu — kayıt sonrası liste tazelensin (sayfa kendi sabitini de tutuyor). */
const PROCUREMENT_PATH = '/operations/procurement';

/**
 * **ÖNERİDEN TEDARİK SİPARİŞİ** — asistan kuyruğunun kendi kapısı (22.33).
 *
 * ── NEDEN `lib/` ALTINDA ────────────────────────────────────────────────────
 * Kolokasyon kuralı server action'ları sayfa klasöründe tutar, ama bu eylemin İKİ sayfası var:
 * kuyruk çağırır, tedarik ekranı tazelenir. Kardeş sayfadan import yasak (`STACK §7` — `docs:check`
 * zorluyor) ve doğrusu paylaşılan yardımcı: `receiveIntakeFromProposalAction` da aynı sebeple
 * `lib/warehouse/` altında duruyor.
 *
 * ── NEDEN AYRI BİR EYLEM ────────────────────────────────────────────────────
 * `createManualDraftAction` ile aynı işi yapar ama bir öneriyi KAPATIR (`withProposal`): satır ve
 * kayıt birlikte yazılır, ikinci bir yazma yolu açılmaz. Ekranın kendi kapısında böyle bir öneri
 * yok ve o yol hiç değişmemeli.
 *
 * ── KALEMLER DİLEKÇEDEN DEĞİL FORMDAN GELİR ─────────────────────────────────
 * Bugüne kadar bu tip gövdesizdi: onay `applyPurchaseOrder` üzerinden koşuyor ve **dilekçede ne
 * yazıyorsa o gidiyordu**. Oysa öneri bir başlangıçtır, son söz değil — adet değişir, vazgeçilen
 * kalem çıkarılır, asistanın bulamadığı tedarikçi seçilir. Düzenlenemeyen bir taslak, "sipariş
 * taslağı" değil bir dayatmadır.
 *
 * Yetki `requireFinance` — elle siparişle AYNI kapı. Kuyruktan gelmek yetkiyi atlatmaz.
 */
export async function createDraftFromProposalAction(input: {
  supplierId: string;
  targetWarehouseId: string | null;
  note: string | null;
  /** `unitPriceCents` yalnız faturadan siparişte (22.44): tedarikçinin kestiği fiyat, eşlemedeki son alışın önüne geçer. */
  lines: Array<{ variantId: string; qty: number; unitPriceCents?: number | null }>;
  /**
   * FATURADAN SİPARİŞ (22.44 · kullanıcı kararı 14.09) — verildiyse sipariş GÖNDERİLMİŞ açılır ve fatura
   * siparişe bağlı bir BELGE olarak doğar: tedarikçi borcu o belgeden türer, mal gelince rampa sayar.
   */
  invoice?: {
    number: string | null;
    issuedOn: string | null;
    amountCents: number;
    vatAmountCents: number | null;
    vatRegime: DocumentVatRegime;
    dueOn: string | null;
  } | null;
  /** Eşleme önerileri (22.43 · 22.44) — onay, tedarikçinin kalem eşlemesinin de onayıdır. */
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
        // Tedarikçi faturayı kesti — sipariş VERİLMİŞ demektir. "Gönderildi" işareti numarayı üretir ve
        // siparişi rampanın "kabul bekliyor" listesine sokar; tedarikçiye mesaj GİTMEZ (`sendPurchaseOrder`
        // yalnız işaretler). Taslak bırakmak, olmayan bir "gönder" adımını bekletmek olurdu.
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
        issuedOn: input.invoice.issuedOn ?? new Date().toISOString().slice(0, 10),
        dueOn: input.invoice.dueOn,
        supplierId: input.supplierId,
        purchaseOrderId: created.order.id,
        direction: 'out',
        amountCents: input.invoice.amountCents,
        vatAmountCents: input.invoice.vatAmountCents,
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
