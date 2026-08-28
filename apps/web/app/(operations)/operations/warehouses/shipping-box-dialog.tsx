'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ShippingBox } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormInput, FormNumber } from '@/components/operation/form/form-input';
import { saveShippingBoxAction } from './actions';
import { ShippingBoxFormSchema, type ShippingBoxFormInput } from './warehouses-types';

/**
 * **Kargo kutusu** (07.12) — taşıyıcıya verilen dış kutunun künyesi.
 *
 * Varyantın kendi ambalajıyla karıştırılmasın diye alt satırda ayrım YAZILI: biri "ürün paketiyle
 * ne kadar yer kaplar", bu "onu içine koyduğumuz kutu ne". Gönderi ağırlığı ikisinden toplanıyor.
 *
 * Ölçüler MİLİMETRE ve gerekçesi varyant alanlarınınkiyle aynı: ondalık santimetre tam sayıda
 * sessizce yuvarlanır, sağlayıcı `mm`yi doğrudan kabul ediyor.
 */
const FORM_ID = 'shipping-box-form';

interface ShippingBoxDialogProps {
  warehouseId: string;
  box: ShippingBox | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ShippingBoxDialog({ warehouseId, box, onClose, onSaved }: ShippingBoxDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ShippingBoxFormInput>({
    resolver: zodResolver(ShippingBoxFormSchema),
    defaultValues: {
      name: box?.name ?? '',
      lengthMm: box?.lengthMm ?? undefined,
      widthMm: box?.widthMm ?? undefined,
      heightMm: box?.heightMm ?? undefined,
      tareG: box?.tareG ?? 0,
      maxContentG: box?.maxContentG ?? null,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: failed } = await saveShippingBoxAction({ ...values, warehouseId, id: box?.id });
    if (failed) {
      setError(failed);
      return;
    }
    onSaved();
  });

  return (
    <Dialog
      open
      title={box ? 'Kargo kutusunu düzenle' : 'Yeni kargo kutusu'}
      subtitle="Taşıyıcıya verilen dış kutu. Gönderi ağırlığı, içindeki ürünlerin ambalajlı ağırlığı + bu kutunun darasıdır."
      maxWidth={560}
      onClose={onClose}
      footer={<DialogFooter formId={FORM_ID} onCancel={onClose} error={error} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <FormInput control={form.control} name="name" label="Ad" placeholder="Orta kutu 30×20×15" />
        <div className="grid grid-cols-3 gap-3">
          <FormNumber control={form.control} name="lengthMm" label="Uzunluk (mm)" integer />
          <FormNumber control={form.control} name="widthMm" label="Genişlik (mm)" integer />
          <FormNumber control={form.control} name="heightMm" label="Yükseklik (mm)" integer />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormNumber control={form.control} name="tareG" label="Dara (g)" integer />
          <FormNumber control={form.control} name="maxContentG" label="Azami içerik (g)" integer placeholder="sınır yok" />
        </div>
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
          Dara boş kutunun ağırlığıdır — taşıyıcıya bildirilen ağırlığa eklenir; eksik bildirilen ağırlığı taşıyıcı
          faturada düzeltir. Azami içerik boş bırakılabilir: “sınır bilinmiyor” demektir, “sınırsız” değil.
        </p>
      </form>
    </Dialog>
  );
}
