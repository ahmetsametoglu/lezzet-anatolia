'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import type { BoxPrinterContract } from '@lezzet/types';
import { saveLabelPrinterAction } from './actions';
import { LABEL_SIZE_OPTIONS } from './warehouses-labels';
import { LabelPrinterFormSchema, type LabelPrinterFormInput } from './warehouses-types';

/**
 * **Etiket yazıcısı** (23.7) — deponun kutu etiketini basan Brother QL'in kimliği. Ayar
 * `settings`in warehouse kapsamında yaşar (yeni tablo yok); telefon kutu kapanışında bu üçlüyü
 * etiket cevabının içinde alır ve basar.
 *
 * Boy KAPALI listedir (`LABEL_SIZE_OPTIONS` künyesi): takılı kâğıt SDK'dan okunamıyor, yanlış boy
 * basım anında `SetLabelSizeError` (23.5 ölçümü). Üç alanı boşaltıp kaydetmek yazıcıyı kaldırır —
 * form şeması yarım ayarı reddeder.
 */
const FORM_ID = 'label-printer-form';

interface PrinterDialogProps {
  warehouseId: string;
  printer: BoxPrinterContract | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PrinterDialog({ warehouseId, printer, onClose, onSaved }: PrinterDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LabelPrinterFormInput>({
    resolver: zodResolver(LabelPrinterFormSchema),
    defaultValues: {
      address: printer?.address ?? '',
      model: printer?.model ?? '',
      // Boy varsayılanı 4×6 (karar §1.6'nın etiketi) — ama yalnız YENİ kayıtta: kayıtlı boyu ezmek
      // operatörün kararını sessizce değiştirmek olurdu.
      labelSize: printer?.labelSize ?? (printer ? '' : 'DieCutW103H164'),
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: failed } = await saveLabelPrinterAction({ ...values, warehouseId });
    if (failed) {
      setError(failed);
      return;
    }
    onSaved();
  });

  return (
    <Dialog
      open
      title="Etiket yazıcısı"
      subtitle="Kutu kapanınca 4×6 etiket bu yazıcıdan çıkar. Üç alanı boşaltıp kaydetmek yazıcıyı kaldırır."
      maxWidth={520}
      onClose={onClose}
      footer={<DialogFooter formId={FORM_ID} onCancel={onClose} error={error} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <FormInput control={form.control} name="address" label="Ağ adresi (IP)" placeholder="192.168.1.90" />
        <FormInput control={form.control} name="model" label="Model" placeholder="QL-1110NWB" />
        <FormSelect
          control={form.control}
          name="labelSize"
          label="Takılı kâğıt"
          options={[{ value: '', label: '— seçilmedi —' }, ...LABEL_SIZE_OPTIONS]}
        />
        {/* Boyun NEDEN sorulduğu yazılı: ayar bir tercih değil fiziksel gerçeğin beyanı. */}
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
          Takılı kâğıt yazıcıdan okunamıyor — boy yanlışsa yazıcı basmayı reddeder. Ruloyu değiştirince burayı da
          güncelleyin.
        </p>
      </form>
    </Dialog>
  );
}
