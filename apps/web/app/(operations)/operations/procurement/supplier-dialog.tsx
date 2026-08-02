'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormInput, FormNumber } from '@/components/operation/form/form-input';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { saveSupplierAction } from './actions';
import { SupplierFormSchema, type SupplierCardView } from './procurement-types';

// Tedarikçi kartı formu (09.14). Kart olmadan sipariş de olmaz — bu form ekranın süsü değil,
// sıfırdan kurulumun ilk adımı.
//
// Alanlar `DOMAIN §16`'nın kart tanımı: ad · iletişim · vergi no · BİZE tanıdığı vade · not.
// Borç burada YOK ve olmayacak: türetilir (Σ girişler − Σ ödemeler), elle yazılan bir bakiye
// ilk günden yanlış olurdu.

// Form şeması ve tipi `procurement-types` içinde, VARLIK ŞEMASINDAN türetilmiş (`SupplierFormSchema`):
// action ile form aynı sözleşmeyi paylaşır — ayrı yazılsalardı biri değişip öteki eskirdi.
// `id` formda düzenlenen bir alan değil, kaydın kimliği → şemadan çıkarılır.
const FormSchema = SupplierFormSchema.omit({ id: true });
type FormValues = z.infer<typeof FormSchema>;

const FORM_ID = 'supplier-form';

interface SupplierDialogProps {
  /** null = yeni kayıt. */
  editing: SupplierCardView | null;
  onClose: () => void;
}

export function SupplierDialog({ editing, onClose }: SupplierDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: editing?.name ?? '',
      phone: editing?.phone ?? '',
      email: editing?.email ?? '',
      address: editing?.address ?? '',
      vatNumber: editing?.vatNumber ?? '',
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
      maxWidth={520}
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
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormInput control={form.control} name="name" label="Tedarikçi adı" required placeholder="Metro Cash&Carry" />

        <div className="grid grid-cols-2 gap-3">
          <FormInput
            control={form.control}
            name="phone"
            label="Telefon"
            // Telefon yalnız bir iletişim bilgisi değil: sipariş listesini WhatsApp'tan göndermenin
            // anahtarı. Boşsa o düğme hiç çizilmez ve pencere sebebini söyler.
            labelAside="WhatsApp gönderimi için"
            placeholder="+33 3 88 …"
          />
          <FormInput control={form.control} name="email" label="E-posta" placeholder="siparis@tedarikci.fr" />
        </div>

        <FormInput control={form.control} name="address" label="Adres" placeholder="İrsaliye ve yazışma adresi" />

        <div className="grid grid-cols-2 gap-3">
          <FormInput control={form.control} name="vatNumber" label="Vergi no" mono />
          <FormNumber
            control={form.control}
            name="paymentTermDays"
            label="Bize tanıdığı vade"
            labelAside="boş = peşin"
            integer
            placeholder="30"
          />
        </div>

        <FormInput control={form.control} name="note" label="Not" placeholder="Teslimat günü, iletişim kişisi…" />
      </form>
    </Dialog>
  );
}
