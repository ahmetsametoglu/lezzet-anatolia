'use client';

import { suggestVatRegime } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import type { PurchaseOrderPayload } from '@lezzet/types';
import { PurchaseOrderFormBody } from '@/components/operation/form/purchase-order-form/body';
import { purchaseOrderEstimate, type PurchaseOrderFormValues } from '@/components/operation/form/purchase-order-form/schema';
import { DocumentFileField } from '@/components/operation/form/document-form/file-field';
import { InvoiceFieldsBlock } from '@/components/operation/form/document-form/invoice-fields';
import {
  invoiceBlock,
  invoiceFieldsOf,
  invoiceTotalCents,
  invoiceVatCents,
  type InvoiceFields,
} from '@/components/operation/form/document-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money, num } from '@/components/operation/ui/format';
import { searchIntakeVariantsAction } from '@/lib/warehouse/intake-actions';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * Tedarik siparişi önerisi kuyrukta düzenlenebilir kalemleriyle durur: adetleri motor eşikten hesaplar ama kasayı bilmez, son
 * karar patronundur; tedarikçisiz dilekçeyi kapı reddettiği için tedarikçi burada sorulur. Fatura mal gelmeden kesildiyse öneri
 * faturadan kurulur, onayda sipariş gönderilmiş açılır ve fatura siparişe bağlı belge olarak doğar.
 */

/** Sipariş önerisinin taslağı — satırlar, faturadan siparişte faturanın para künyesi ve dosyası. */
export interface PurchaseOrderDraft {
  order: PurchaseOrderFormValues;
  /** Faturadan siparişte faturanın para künyesi; eşik altı önerisinde `null`. */
  invoice: InvoiceFields | null;
  file: File | null;
}

/** Dilekçe → formun açılış değerleri. */
export function purchaseOrderValuesFrom(payload: PurchaseOrderPayload): PurchaseOrderDraft {
  return {
    order: {
      // Asistan eşleştiremediyse boş gelir ve form sorar (yukarıdaki künye).
      supplierId: payload.supplierId ?? '',
      // Dilekçenin deposu ZORUNLU (`PurchaseOrderPayloadSchema`) — öneri "şu deponun eksiği"
      // sinyalinden ya da faturanın gideceği depodan doğuyor, boş gelmez ve boşaltılmamalı.
      targetWarehouseId: payload.warehouseId,
      note: '',
      lines: payload.lines.map((line) => ({
        variantId: line.variantId,
        // Tedarikçinin yazdığı ad başlıkta: onay, kalem eşlemesinin de onayıdır.
        title: line.supplierItemName ? `${line.productName} · tedarikçide: ${line.supplierItemName}` : line.productName,
        qty: line.qty,
        lastPurchasePriceCents: line.lastPurchasePriceCents,
        unitPriceCents: line.unitPriceCents,
      })),
    },
    invoice: payload.invoice ? invoiceFieldsOf({ ...payload.invoice, amountCents: payload.invoice.totalAmountCents }) : null,
    file: null,
  };
}

/** Faturanın engeli — yalnız faturadan siparişte; toplam, KDV, rejim ve vade kuralları (`invoiceBlock`). */
export function purchaseOrderInvoiceBlock(draft: PurchaseOrderDraft, payload: PurchaseOrderPayload): string | null {
  if (!draft.invoice) return null;
  return invoiceBlock(draft.invoice, payload.invoice?.issuedOn ?? parisDateOf(new Date()));
}

interface PurchaseOrderBodyProps {
  payload: PurchaseOrderPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: PurchaseOrderDraft;
  onChange: (next: PurchaseOrderDraft) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function PurchaseOrderBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: PurchaseOrderBodyProps) {
  const locked = disabled || readOnly;
  const invoice = values.invoice;
  const supplier = options.suppliers.find((option) => option.id === values.order.supplierId);
  const suggested = invoice && supplier ? suggestVatRegime({ supplierCountry: supplier.country, vatAmountCents: invoiceVatCents(invoice) }) : null;

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[30rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <PurchaseOrderFormBody
          values={values.order}
          onChange={(order) => onChange({ ...values, order })}
          onSearch={(term) =>
            searchIntakeVariantsAction(term).then(({ data }) => (data ?? []).map((o) => ({ variantId: o.variantId, label: o.label })))
          }
          suppliers={options.suppliers}
          warehouses={options.warehouses}
          disabled={locked}
        />

        {invoice ? (
          <div className="flex flex-col gap-3 border-t border-ops-line-soft pt-3">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
              Fatura {payload.invoice?.number ? `${payload.invoice.number} ` : ''}— siparişe bağlı belge olarak kaydedilir
            </span>
            <InvoiceFieldsBlock
              value={invoice}
              onChange={(next) => onChange({ ...values, invoice: next })}
              suggestedRegime={suggested}
              amountLabel="Faturanın toplamı"
              disabled={locked}
            />
            {readOnly ? null : (
              <DocumentFileField
                file={values.file}
                onChange={(file) => onChange({ ...values, file })}
                label="Faturanın dosyası (isteğe bağlı)"
                disabled={disabled}
              />
            )}
          </div>
        ) : null}
      </div>

      <ProposalAside subject={subject} fallbackTitle="Tedarik siparişi" facts={factsOf(payload, values)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: PurchaseOrderPayload, values: PurchaseOrderDraft): ProposalFact[] {
  const proposedUnits = payload.lines.reduce((sum, line) => sum + line.qty, 0);
  const nowUnits = values.order.lines.reduce((sum, line) => sum + line.qty, 0);
  const estimate = purchaseOrderEstimate(values.order);
  const mappingProposals = payload.lines.filter((line) => line.mappingProposed).length;
  return [
    ...(payload.source === 'invoice' ? [{ label: 'Kaynak', value: 'Tedarikçinin faturası · sipariş gönderilmiş açılır' }] : []),
    { label: 'Kalem', value: String(payload.lines.length), now: String(values.order.lines.length) },
    { label: 'Toplam adet', value: num(proposedUnits), now: num(nowUnits) },
    ...(mappingProposals > 0 ? [{ label: 'Eşleme önerisi', value: `${mappingProposals} kalem · onayda kaydedilir` }] : []),
    // Faturalı siparişte tutar FATURANIN yazdığıdır; tahmin satırı yine durur (satırların KDV hariç toplamı).
    ...(payload.invoice && values.invoice
      ? [
          {
            label: 'Fatura toplamı',
            value: money(payload.invoice.totalAmountCents),
            now: money(invoiceTotalCents(values.invoice)),
          },
        ]
      : []),
    // Tahmini tutar SAPMA GÖSTERMEZ: dilekçenin kendi toplamı yok, sayı formdan türüyor. Bir kalemin
    // bile fiyatı eksikse hiç yazılmaz (`purchaseOrderEstimate` künyesi).
    ...(estimate.totalCents === null
      ? [{ label: 'Tahmini tutar', value: `${num(estimate.unpricedCount)} kalemde fiyat yok` }]
      : [{ label: 'Tahmini tutar', value: `~${money(estimate.totalCents)}` }]),
  ];
}
