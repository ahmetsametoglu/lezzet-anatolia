'use client';

import type { PurchaseOrderPayload } from '@lezzet/types';
import { PurchaseOrderFormBody } from '@/components/operation/form/purchase-order-form/body';
import { purchaseOrderEstimate, type PurchaseOrderFormValues } from '@/components/operation/form/purchase-order-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money, num } from '@/components/operation/ui/format';
import { searchIntakeVariantsAction } from '@/lib/warehouse/intake-actions';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * TEDARİK SİPARİŞİ ÖNERİSİ — kuyruğun içinde, DÜZENLENEBİLİR kalemleriyle (22.33).
 *
 * ── NEDEN GEREKTİ ───────────────────────────────────────────────────────────
 * Tip gövdesizdi: kartta adetler görünüyordu ama karar iki uçluydu — onayla ya da reddet. Onay
 * `applyPurchaseOrder`'a gidiyor ve **dilekçede ne yazıyorsa o** taslağa dönüşüyordu. Oysa adetleri
 * MOTOR hesapladı (`ReorderService`) ve motor eşiği bilir, kasayı bilmez: *"bu hafta bu kadarını
 * alalım"* ya da *"şunu şimdilik geçelim"* kararı patronundur. Reddetmek de çözüm değildi — öneriyi
 * reddedip aynı siparişi elle kurmak, kuyruğun var oluş sebebini siliyordu.
 *
 * ── FORM ORTAK, YENİDEN YAZILMADI (`CLAUDE §1`) ─────────────────────────────
 * Tedarik ekranının "elle sipariş" penceresi aynı formu zaten açıyordu. İkinci bir satır editörü
 * yazmak, kullanıcının 22.23'te reddettiği şeyin ta kendisi olurdu (*"komponentler ortak komponent
 * havuzundan kullanılmamış, yeniden tasarlanmış"*). Gövde ortak alana çıktı
 * (`purchase-order-form/`), iki yüzey onu paylaşıyor — `intake-form`un aynı deseni.
 *
 * ── TEDARİKÇİ BURADA SORULUR ────────────────────────────────────────────────
 * `applyPurchaseOrder` tedarikçisiz dilekçeyi reddediyordu ve bu, onay anında öğrenilen bir kuraldı:
 * "Onayla"ya basıp hata okumak. Asistan eşleşme bulamadan da öneri üretebilir — artık form sorar ve
 * engel cümlesi alt barda durur (`purchaseOrderBlock`).
 */

/** Dilekçe → formun açılış değerleri. */
export function purchaseOrderValuesFrom(payload: PurchaseOrderPayload): PurchaseOrderFormValues {
  return {
    // Asistan eşleştiremediyse boş gelir ve form sorar (yukarıdaki künye).
    supplierId: payload.supplierId ?? '',
    // Dilekçenin deposu ZORUNLU (`PurchaseOrderPayloadSchema`) — öneri "şu deponun eksiği"
    // sinyalinden doğuyor, boş gelmez ve boşaltılmamalı.
    targetWarehouseId: payload.warehouseId,
    note: '',
    lines: payload.lines.map((line) => ({
      variantId: line.variantId,
      title: line.productName,
      qty: line.qty,
      lastPurchasePriceCents: line.lastPurchasePriceCents,
    })),
  };
}

interface PurchaseOrderBodyProps {
  payload: PurchaseOrderPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: PurchaseOrderFormValues;
  onChange: (next: PurchaseOrderFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function PurchaseOrderBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: PurchaseOrderBodyProps) {
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[30rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <PurchaseOrderFormBody
          values={values}
          onChange={onChange}
          onSearch={(term) =>
            searchIntakeVariantsAction(term).then(({ data }) => (data ?? []).map((o) => ({ variantId: o.variantId, label: o.label })))
          }
          suppliers={options.suppliers}
          warehouses={options.warehouses}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside subject={subject} fallbackTitle="Tedarik siparişi" facts={factsOf(payload, values)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: PurchaseOrderPayload, values: PurchaseOrderFormValues): ProposalFact[] {
  const proposedUnits = payload.lines.reduce((sum, line) => sum + line.qty, 0);
  const nowUnits = values.lines.reduce((sum, line) => sum + line.qty, 0);
  const estimate = purchaseOrderEstimate(values);
  return [
    { label: 'Kalem', value: String(payload.lines.length), now: String(values.lines.length) },
    { label: 'Toplam adet', value: num(proposedUnits), now: num(nowUnits) },
    // Tahmini tutar SAPMA GÖSTERMEZ: dilekçenin kendi toplamı yok, sayı formdan türüyor. Bir kalemin
    // bile fiyatı eksikse hiç yazılmaz (`purchaseOrderEstimate` künyesi).
    ...(estimate.totalCents === null
      ? [{ label: 'Tahmini tutar', value: `${num(estimate.unpricedCount)} kalemde fiyat yok` }]
      : [{ label: 'Tahmini tutar', value: `~${money(estimate.totalCents)}` }]),
  ];
}
