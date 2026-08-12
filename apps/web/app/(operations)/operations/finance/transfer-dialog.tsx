'use client';

import { useState } from 'react';
import { toCents } from '@lezzet/helper';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { DateField } from '@/components/operation/form/date-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { money } from '@/components/operation/ui/format';
import { recordTransferAction } from '@/lib/finance/actions';
import { TransferFormSchema, type AccountView, type TransferForm } from './finance-types';

// **Transfer** (tasarım §3, "⇄ Transfer") — nakit→banka, Stripe→banka payout.
//
// Ayrı bir diyalog olmasının sebebi elle girişten farklı SORU sorması: orada tek hesap ve bir yön
// var, burada iki hesap ve yön yok. Tek diyalogda birleştirilseydi "para ne yaptı" sorusu transferde
// anlamsız kalır, hesap kutusu da bir kip değişince ikiye bölünürdü.

const FORM_ID = 'transfer-form';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blockedReasonOf(values: TransferForm): string | null {
  if (!values.fromAccountId) return 'Paranın çıktığı hesabı seçin.';
  if (!values.toAccountId) return 'Paranın gittiği hesabı seçin.';
  // Motor bunu zaten reddediyor (`transfer_same_account`); engel burada da yazılı çünkü kural
  // kapıda öğrenilmemeli — kaydet düğmesine basıp hata okumak, seçerken uyarılmaktan kötüdür.
  if (values.fromAccountId === values.toAccountId) return 'Aynı hesabın içinde transfer olmaz — iki farklı hesap seçin.';
  if (!values.amount || values.amount <= 0) return 'Tutar sıfırdan büyük olmalı.';
  return null;
}

interface TransferDialogProps {
  accounts: AccountView[];
  onClose: () => void;
  onSaved: () => void;
}

export function TransferDialog({ accounts, onClose, onSaved }: TransferDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<TransferForm>({
    resolver: zodResolver(TransferFormSchema),
    defaultValues: {
      fromAccountId: accounts[0]?.id ?? '',
      toAccountId: accounts[1]?.id ?? '',
      amount: null,
      valueDate: today(),
      description: '',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as TransferForm;

  const from = accounts.find((account) => account.id === watched.fromAccountId);
  const to = accounts.find((account) => account.id === watched.toAccountId);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await recordTransferAction({
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      // EURO → CENT sınırda (`ManualMovementSchema` künyesi).
      amountCents: toCents(values.amount ?? 0),
      valueDate: values.valueDate,
      description: values.description,
    });
    if (actionError) {
      setError(actionError);
      return;
    }
    onSaved();
  });

  const options = accounts.map((account) => ({ value: account.id, label: account.name }));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Hesaplar arası transfer"
      subtitle="Tek işlem — para bir kutudan ötekine geçer"
      maxWidth={560}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel="Transferi kaydet"
          blockedReason={blockedReasonOf(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <FormSelect control={form.control} name="fromAccountId" label="Nereden" required placeholder="Hesap" options={options} />
          <span aria-hidden className="pb-2.5 font-ops-mono text-ops-base text-ops-faint">
            →
          </span>
          <FormSelect control={form.control} name="toAccountId" label="Nereye" required placeholder="Hesap" options={options} />
        </div>

        {/* Transferin en sık hatası yanlış yönü seçmek ve o hata bakiyeleri iki kat kaydırır (biri
            fazla, öteki eksik). Bu yüzden sonuç kaydetmeden ÖNCE yazılıyor: operatör okuduğu cümlenin
            niyetiyle aynı olup olmadığını görebiliyor. Bakiyeler gerçek — şeritteki sayının aynısı. */}
        {from && to && watched.amount ? (
          <p className="rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3.5 py-2.5 font-ops-body text-ops-sm text-ops-muted">
            <span className="text-ops-ink">{from.name}</span> {money(from.balanceCents)} →{' '}
            <span className="text-ops-ink">{money(from.balanceCents - toCents(watched.amount))}</span> ·{' '}
            <span className="text-ops-ink">{to.name}</span> {money(to.balanceCents)} →{' '}
            <span className="text-ops-ink">{money(to.balanceCents + toCents(watched.amount))}</span>
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormMoney control={form.control} name="amount" label="Tutar" required placeholder="0,00" />
          <Controller
            control={form.control}
            name="valueDate"
            render={({ field }) => (
              <DateField label="Değer tarihi" value={field.value} onChange={field.onChange} />
            )}
          />
        </div>

        <FormInput control={form.control} name="description" label="Açıklama" placeholder="Kasa teslimi — banka yatırma" />
      </form>
    </Dialog>
  );
}
