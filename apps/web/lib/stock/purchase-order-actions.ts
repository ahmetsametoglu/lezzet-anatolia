'use server';

import { revalidatePath } from 'next/cache';
import { PurchaseOrderService, serviceDb } from '@lezzet/database';
import { requireFinance } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { withProposal } from '@/lib/assistant/handoff';

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
  lines: Array<{ variantId: string; qty: number }>;
  proposalId: string;
}): Promise<ActionResult<{ orderId: string }>> {
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
      () =>
        new PurchaseOrderService(serviceDb()).createDraft(
          input.supplierId,
          // Hedef depo kalem başına yazılır (C7): hedefsiz sipariş hiçbir deponun eksiğini kapatmaz
          // ve "yolda" hesabı tam da bu akışta sessizce 0 kalırdı.
          input.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, targetWarehouseId: input.targetWarehouseId })),
          input.note?.trim() || undefined,
        ),
      ({ order }) => ({ purchaseOrderId: order.id }),
    );

    revalidatePath(PROCUREMENT_PATH);
    return { data: { orderId: created.order.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
