'use client';

import type { Control } from 'react-hook-form';
import { FormInput, FormNumber } from '@/components/operation/form/form-input';
import type { SupplierFormValues } from './schema';

/*
  TEDARİKÇİ KARTININ ALANLARI (09.14 · 22.44) — Tedarik ekranının kart penceresi ve asistan kuyruğunun
  tedarikçi önerisi aynı gövdeyi çizer. Alanlar `DOMAIN §16`'nın kart tanımı: ad · iletişim · vergi no ·
  ülke · BİZE tanıdığı vade · not. Borç burada YOK ve olmayacak: türetilir, elle yazılan bir bakiye ilk
  günden yanlış olurdu.

  Ülke (12.26) vergi numarasının yanında: faturanın KDV rejimi ondan önerilir — Fransa dışındaki
  tedarikçinin KDV'siz faturası ters yüklemedir.
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

      <FormInput control={control} name="note" label="Not" placeholder="Teslimat günü, iletişim kişisi…" />
    </>
  );
}
