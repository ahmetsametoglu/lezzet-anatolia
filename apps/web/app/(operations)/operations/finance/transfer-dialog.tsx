'use client';

import { useState } from 'react';
import { toCents } from '@lezzet/helper';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { TransferFormBody } from '@/components/operation/form/transfer-form/body';
import { TransferFormSchema, transferBlock, transferToday, type TransferForm } from '@/components/operation/form/transfer-form/schema';
import { recordTransferAction } from '@/lib/finance/actions';
import type { AccountView } from './finance-types';

// **Transfer** (tasarım §3, "⇄ Transfer") — nakit→banka, Stripe→banka payout.
//
// Ayrı bir diyalog olmasının sebebi elle girişten farklı SORU sorması: orada tek hesap ve bir yön
// var, burada iki hesap ve yön yok. Tek diyalogda birleştirilseydi "para ne yaptı" sorusu transferde
// anlamsız kalır, hesap kutusu da bir kip değişince ikiye bölünürdü.
//
// Alanlar 22.22'de ortak alana ayrıldı (`transfer-form/body`): asistan kuyruğu da aynı formu açıyor.
// Burada kalan yalnız kabuk — Dialog, alt bar ve kaydeden çağrı.

const FORM_ID = 'transfer-form';

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
      valueDate: transferToday(),
      description: '',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as TransferForm;

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
          blockedReason={transferBlock(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit}>
        <TransferFormBody control={form.control} values={watched} accounts={accounts} />
      </form>
    </Dialog>
  );
}
