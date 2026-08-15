'use client';

import { useState } from 'react';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { PurchaseOrderFormBody } from '@/components/operation/form/purchase-order-form/body';
import { purchaseOrderBlock, type PurchaseOrderFormValues } from '@/components/operation/form/purchase-order-form/schema';
import { createManualDraftAction, searchVariantsForMappingAction } from './actions';
import type { SupplierOption, WarehouseOption } from './procurement-types';

// **Elle sipariş** (sayfa sözleşmesi §3) — öneriden bağımsız tedarik siparişi.
//
// Öneri yalnız eşik altına düşeni yakalar; gerçek hayatta sipariş bundan ibaret değil: kampanya için
// fazladan mal, yeni ürün denemesi, tedarikçinin "bu hafta şu var" demesi. Öneriyi bekleyen bir ekran
// üçünü de imkânsız kılardı.
//
// ── FORM ORTAK ALANDA (22.33) ────────────────────────────────────────────────
// Gövde `purchase-order-form/`e taşındı: asistan kuyruğunun `purchase_order` önerisi de aynı formu
// açıyor ve ikinci bir satır editörü yazmak, kullanıcının 22.23'te reddettiği şeyin ta kendisi
// olurdu. Burada kalan tek şey KABUK: pencere, kaydeden kapı ve düğmenin adı.
//
// **RHF ÇIKTI** ve bu geçişin şartıydı: ortak gövde kontrollü bir liste (`IntakeFormBody`'nin aynı
// kararı — gerçeğin sahibi çağıran). İki yüzey aynı gövdeyi ancak aynı sözleşmeyle paylaşabilir;
// `useFieldArray` + `Controller` burada tek yaptığı şey aynı diziyi ileri geri kopyalamak olurdu.
// Doğrulama da ortak: `purchaseOrderBlock` hem bu pencerenin hem kuyruğun engel cümlesini yazıyor.

const FORM_ID = 'manual-order-form';

const EMPTY: PurchaseOrderFormValues = { supplierId: '', targetWarehouseId: '', note: '', lines: [] };

interface ManualOrderDialogProps {
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  onClose: () => void;
  onCreated: (orderId: string) => void;
}

export function ManualOrderDialog({ suppliers, warehouses, onClose, onCreated }: ManualOrderDialogProps) {
  const [values, setValues] = useState<PurchaseOrderFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { data, error: actionError } = await createManualDraftAction({
      supplierId: values.supplierId,
      note: values.note,
      lines: values.lines.map((line) => ({
        variantId: line.variantId,
        qty: line.qty,
        // Hedef depo SİPARİŞİN tamamına verilir, kalem kalem değil: elle sipariş çoğu zaman tek
        // adrese gelir ve satır başına depo sormak, cevabı hep aynı olan bir soruyu N kez sormaktı.
        // Boş bırakılabilir — o zaman hedefi kabul eden depo söyler (K6: niyet beyanı, kısıt değil).
        targetWarehouseId: values.targetWarehouseId || null,
      })),
    });
    setSubmitting(false);
    if (actionError || !data) {
      setError(actionError ?? 'Sipariş oluşturulamadı.');
      return;
    }
    onCreated(data.orderId);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni tedarik siparişi"
      subtitle="Öneriden bağımsız — kalemleri siz seçersiniz"
      maxWidth={640}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={submitting}
          error={error}
          submitLabel="Taslağı oluştur"
          blockedReason={purchaseOrderBlock(values)}
        />
      }
    >
      {/* Form elementi KALIYOR (RHF gitse de): alt bardaki düğme `formId` ile buraya submit ediyor
          ve Enter tuşu da aynı yolu kullanıyor — kabuğun sözleşmesi bu. */}
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <PurchaseOrderFormBody
          values={values}
          onChange={setValues}
          onSearch={(term) =>
            searchVariantsForMappingAction(term).then(({ data }) =>
              (data ?? []).map((o) => ({ variantId: o.variantId, label: o.title })),
            )
          }
          suppliers={suppliers}
          warehouses={warehouses.map((w) => ({ id: w.id, name: `${w.code} — ${w.name}` }))}
          disabled={submitting}
        />
      </form>
    </Dialog>
  );
}
