'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { SupplierFormBody } from '@/components/operation/form/supplier-form/body';
import { SupplierFormValuesSchema, type SupplierFormValues } from '@/components/operation/form/supplier-form/schema';
import { saveSupplierAction } from '@/lib/stock/supplier-actions';
import { SupplierCatalogPane } from './supplier-catalog-pane';
import type { SupplierCardView } from './procurement-types';

// Tedarikçi kartı formu (09.14). Kart olmadan sipariş de olmaz — bu form ekranın süsü değil,
// sıfırdan kurulumun ilk adımı.
//
// Alanlar ve şema ORTAK bileşende (`components/operation/form/supplier-form/`, 22.44): asistan
// kuyruğunun faturadan tedarikçi önerisi aynı formu açıyor. Şema VARLIK ŞEMASINDAN türetilmiş: action
// ile form aynı sözleşmeyi paylaşır — ayrı yazılsalardı biri değişip öteki eskirdi.

const FORM_ID = 'supplier-form';

interface SupplierDialogProps {
  /** null = yeni kayıt. */
  editing: SupplierCardView | null;
  onClose: () => void;
}

export function SupplierDialog({ editing, onClose }: SupplierDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(SupplierFormValuesSchema),
    defaultValues: {
      name: editing?.name ?? '',
      phone: editing?.phone ?? '',
      email: editing?.email ?? '',
      address: editing?.address ?? '',
      vatNumber: editing?.vatNumber ?? '',
      country: editing?.country ?? '',
      // null = peşin çalışıyoruz (şemanın kendi sözleşmesi); 0 gün "vade var ama sıfır" olurdu.
      paymentTermDays: editing?.paymentTermDays ?? null,
      note: editing?.note ?? '',
      isActive: editing?.isActive ?? true,
    },
    mode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await saveSupplierAction({ id: editing?.id, ...values });
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Tedarikçi kartı' : 'Yeni tedarikçi'}
      subtitle="Sipariş bu kartla yazılır; borç ve vade buradan izlenir"
      // Kayıtlı tedarikçide iki bölme (künye + tedarikçinin kataloğu) → geniş panel; yeni kayıtta
      // yalnız künye (eşleme satırı `supplier_id` istiyor, kart kaydedilmeden o kimlik yok).
      maxWidth={editing ? 900 : 520}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          // Silme YOK, pasifleştirme var: geçmiş alım ve borç kaydı tedarikçisiz kalamaz. Alt barda
          // duruyor çünkü kayda EŞLİK EDEN bir karar, ayrı bir alan değil (katalog formunun deseni).
          actions={<FormSwitch control={form.control} name="isActive" label="Çalışmaya devam ediyoruz" bare />}
        />
      }
    >
      <div className={editing ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6' : ''}>
        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
          <SupplierFormBody control={form.control} />
        </form>

        {/* İkinci bölme: tedarikçinin kendi kataloğu. Yeni kayıtta yok — eşleme satırı kartın
            kimliğini istiyor ve o kimlik ancak kaydedince doğar. */}
        {editing ? <SupplierCatalogPane supplierId={editing.id} /> : null}
      </div>
    </Dialog>
  );
}
