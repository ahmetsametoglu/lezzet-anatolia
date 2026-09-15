'use client';

import { suggestVatRegime } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import type { PurchaseOrderPayload } from '@lezzet/types';
import { PurchaseOrderFormBody } from '@/components/operation/form/purchase-order-form/body';
import { purchaseOrderEstimate, type PurchaseOrderFormValues } from '@/components/operation/form/purchase-order-form/schema';
import { DocumentFileField } from '@/components/operation/form/document-form/file-field';
import { InvoiceFieldsBlock } from '@/components/operation/form/document-form/invoice-fields';
import { invoiceBlock, type InvoiceFields } from '@/components/operation/form/document-form/schema';
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
 *
 * ── FATURADAN SİPARİŞ (22.44 · kullanıcı kararı 14.09) ──────────────────────
 * Tedarikçi faturayı mal gelmeden kestiyse (e-postayla gelen fatura) öneri FATURADAN kurulur: adet ve
 * fiyat faturadan, kalemler tedarikçinin adıyla eşlemeden. Onayda sipariş GÖNDERİLMİŞ açılır (tedarikçiye
 * mesaj gitmez), fatura siparişe bağlı bir belge olarak doğar — borç o belgeden türer — ve mal gelince
 * rampa bu siparişi sayar, SKT ve lotu orada girer. Faturanın para künyesi formun altındaki blokta
 * düzeltilir; dosyası burada bırakılır.
 */

/** Sipariş önerisinin taslağı — satırlar, faturadan siparişte faturanın para künyesi ve dosyası (22.44). */
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
        // Tedarikçinin yazdığı ad başlıkta (22.44): onay, kalem eşlemesinin de onayıdır.
        title: line.supplierItemName ? `${line.productName} · tedarikçide: ${line.supplierItemName}` : line.productName,
        qty: line.qty,
        lastPurchasePriceCents: line.lastPurchasePriceCents,
        unitPriceCents: line.unitPriceCents,
      })),
    },
    invoice: payload.invoice
      ? {
          // Dilekçe CENT, form EURO — çevrim sınırda.
          amount: fromCents(payload.invoice.totalAmountCents),
          vatAmount: payload.invoice.vatAmountCents === null ? null : fromCents(payload.invoice.vatAmountCents),
          vatRegime: payload.invoice.vatRegime,
          dueOn: payload.invoice.dueOn ?? '',
        }
      : null,
    file: null,
  };
}

/** Faturanın engeli — yalnız faturadan siparişte; toplam, KDV, rejim ve vade kuralları (`invoiceBlock`). */
export function purchaseOrderInvoiceBlock(draft: PurchaseOrderDraft, payload: PurchaseOrderPayload): string | null {
  if (!draft.invoice) return null;
  return invoiceBlock(draft.invoice, payload.invoice?.issuedOn ?? new Date().toISOString().slice(0, 10));
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
  const suggested =
    invoice && supplier
      ? suggestVatRegime({ supplierCountry: supplier.country, vatAmountCents: invoice.vatAmount === null ? null : toCents(invoice.vatAmount) })
      : null;

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
            now: values.invoice.amount === null ? '—' : money(toCents(values.invoice.amount)),
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
