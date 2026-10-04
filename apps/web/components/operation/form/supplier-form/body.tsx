'use client';

import { Controller, type Control } from 'react-hook-form';
import { DefaultBusinessToggle } from '@/components/operation/form/business-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput, FormNumber } from '@/components/operation/form/form-input';
import type { SupplierFormValues } from './schema';

/*
  Tedarikçi kartının alanları (DOMAIN §16): ad · iletişim · vergi no · ülke · bize tanıdığı vade · not; borç burada yoktur, çünkü
  türetilir. Ülke vergi numarasının yanındadır, faturanın KDV rejimi ondan önerilir.
*/

interface SupplierFormBodyProps {
  control: Control<SupplierFormValues>;
}

export function SupplierFormBody({ control }: SupplierFormBodyProps) {
  return (
    <>
      <FormInput control={control} name="name" label="Tedarikçi adı" required placeholder="Metro Cash&Carry" />

      <div className="grid grid-cols-2 gap-3">
        <FormInput
          control={control}
          name="phone"
          label="Telefon"
          // Telefon yalnız bir iletişim bilgisi değil: sipariş listesini WhatsApp'tan göndermenin
          // anahtarı. Boşsa o düğme hiç çizilmez ve pencere sebebini söyler.
          labelAside="WhatsApp gönderimi için"
          placeholder="+33 3 88 …"
        />
        <FormInput control={control} name="email" label="E-posta" placeholder="siparis@tedarikci.fr" />
      </div>

      <FormInput control={control} name="address" label="Adres" placeholder="İrsaliye ve yazışma adresi" />

      <div className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] gap-3">
        <FormInput control={control} name="vatNumber" label="Vergi no" mono />
        <FormInput control={control} name="country" label="Ülke" placeholder="FR" mono />
        <FormNumber control={control} name="paymentTermDays" label="Bize tanıdığı vade" labelAside="boş = peşin" integer placeholder="30" />
      </div>

      <Controller
        control={control}
        name="defaultBusiness"
        render={({ field }) => (
          <FieldShell label="Varsayılan iş" labelAside="belge girişinde önerilir">
            <DefaultBusinessToggle value={field.value} onChange={field.onChange} label="Tedarikçinin varsayılan işi" />
          </FieldShell>
        )}
      />

      <FormInput control={control} name="note" label="Not" placeholder="Teslimat günü, iletişim kişisi…" />
    </>
  );
}
