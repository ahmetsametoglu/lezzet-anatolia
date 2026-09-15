'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SupplierCreatePayload } from '@lezzet/types';
import { SupplierFormBody } from '@/components/operation/form/supplier-form/body';
import { SupplierFormValuesSchema, type SupplierFormValues } from '@/components/operation/form/supplier-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * TEDARİKÇİ ÖNERİSİ — kuyruğun içinde, Tedarik ekranının GERÇEK kart formuyla (22.44).
 *
 * Faturanın başlığı yeni bir tedarikçi için gereken her şeyi taşır: ad, vergi no, telefon, e-posta,
 * adres, ülke, vade. Asistan okur; patron burada düzeltir ve kaydeder. Kaydeden kapı Tedarik ekranının
 * kendi eylemi (`saveSupplierAction` + `withProposal`) ve yeni kayıtta NOKTA ATIŞI mükerrer yoklaması
 * yapar — aynı vergi no, telefon ya da tam adla ikinci kart açılmaz.
 */

/** Dilekçe → formun açılış değerleri. Yeni kart ÇALIŞILAN tedarikçi olarak doğar. */
export function supplierValuesFrom(payload: SupplierCreatePayload): SupplierFormValues {
  return {
    name: payload.name,
    phone: payload.phone ?? '',
    email: payload.email ?? '',
    address: payload.address ?? '',
    vatNumber: payload.vatNumber ?? '',
    country: payload.country ?? '',
    paymentTermDays: payload.paymentTermDays,
    note: payload.note ?? '',
    isActive: true,
  };
}

interface SupplierCreateBodyProps {
  payload: SupplierCreatePayload;
  subject: ProposalSubject | null;
  meta: ProposalMeta;
  values: SupplierFormValues;
  onChange: (next: SupplierFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function SupplierCreateBody({ payload, subject, meta, values, onChange, disabled, readOnly }: SupplierCreateBodyProps) {
  // RHF örneği GÖVDEDE, gerçeğin sahibi ÇERÇEVE — öteki gövdelerdeki aynı köprü.
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(SupplierFormValuesSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });
  const live = form.watch();
  useEffect(() => {
    onChange(live);
  }, [JSON.stringify(live)]);

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      {/* Salt okunur hâlin tek anahtarı alan kümesi: formun alanları kendi `disabled`ını taşımıyor. */}
      <fieldset
        disabled={disabled || readOnly}
        className="m-0 flex min-w-[24rem] flex-[2] basis-0 flex-col gap-4 rounded-ops-card border border-ops-line bg-ops-subtle p-3"
      >
        <SupplierFormBody control={form.control} />
      </fieldset>

      <ProposalAside subject={subject} fallbackTitle="Yeni tedarikçi" facts={factsOf(payload, live)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan satırları — `now` verilen satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: SupplierCreatePayload, values: SupplierFormValues): ProposalFact[] {
  const term = (days: number | null | undefined) => (days === null || days === undefined ? 'peşin' : `${days} gün`);
  return [
    { label: 'Ad', value: payload.name, now: values.name },
    { label: 'Vergi no', value: payload.vatNumber ?? '—', now: values.vatNumber || '—' },
    { label: 'Ülke', value: payload.country ?? '—', now: values.country ? values.country.toUpperCase() : '—' },
    { label: 'Vade', value: term(payload.paymentTermDays), now: term(values.paymentTermDays) },
  ];
}
