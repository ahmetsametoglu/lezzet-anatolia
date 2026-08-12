'use client';

import { useState } from 'react';
import { toCents } from '@lezzet/helper';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { HandoffNote } from '@/components/operation/ui/handoff-note';
import { MovementFormBody } from '@/components/operation/form/movement-form/body';
import {
  ManualMovementSchema,
  movementBlock,
  movementToday,
  type ManualMovementForm,
} from '@/components/operation/form/movement-form/schema';
import { recordManualMovementAction } from '@/lib/finance/actions';
import type { AccountView } from './finance-types';

// **Elle hareket** (tasarım §3, "+ Hareket") — gider, sermaye ya da sınıflandırılmamış.
//
// Form standardı (`catalog-form-dialog` kanonik): RHF + `zodResolver` + `Form*` adaptörleri +
// `DialogFooter(formId)`. Tutar `FormMoney` ile ve CENT taşıyor (STACK §8).

const FORM_ID = 'manual-movement-form';

// `today()` ve `blockedReasonOf()` FORMUN kendi dosyasına taşındı (`movement-form/schema`):
// asistan kuyruğu da aynı varsayılanı ve aynı engeli kullanıyor. Ayrı kalsalardı hareket bir
// ekranda kaydedilir ötekinde reddedilirdi.

interface MovementDialogProps {
  accounts: AccountView[];
  onClose: () => void;
  onSaved: () => void;
  /**
   * Asistan önerisinden gelen ön dolgu (22.5). Alanlar DOLU açılır ama hiçbiri kilitli değil —
   * onaydan önce düzeltilebilmesi bu devrin bütün sebebi.
   */
  initial?: ManualMovementForm | null;
  /** Öneri kimliği; verilirse kayıt kuyruk satırını da kapatır. */
  proposalId?: string | null;
  /**
   * Devir künyesi — pencerenin İÇİNDE durur, sayfada değil (22.5).
   *
   * Bu pencere öneriden gelindiğinde kendiliğinden açılıyor ve örtüsü sayfayı kaplıyor: künye
   * arkada kalsaydı operatör tutarın neden dolu geldiğini ancak pencereyi kapattıktan sonra
   * görürdü — yani kararı verdikten sonra.
   */
  note?: { summary: string; reason: string | null } | null;
}

export function MovementDialog({
  accounts,
  onClose,
  onSaved,
  initial = null,
  proposalId = null,
  note = null,
}: MovementDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ManualMovementForm>({
    resolver: zodResolver(ManualMovementSchema),
    defaultValues: initial
      ? { ...initial, valueDate: initial.valueDate || movementToday() }
      : {
          accountId: accounts[0]?.id ?? '',
          type: 'expense',
          amount: null,
          direction: 'out',
          category: '',
          campaign: '',
          valueDate: movementToday(),
          description: '',
        },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as ManualMovementForm;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await recordManualMovementAction({
      accountId: values.accountId,
      type: values.type,
      // EURO → CENT sınırda (`ManualMovementSchema` künyesi): kapı cent istiyor.
      amountCents: toCents(values.amount ?? 0),
      direction: values.direction,
      category: values.category,
      campaign: values.campaign,
      valueDate: values.valueDate,
      description: values.description,
      // Öneriden gelindiyse kuyruk satırı bu kayıtla kapanır (`withProposal`).
      proposalId,
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
      title="Yeni hareket"
      subtitle="Gider, sermaye ya da henüz sınıflandırılmamış para"
      maxWidth={560}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel="Hareketi kaydet"
          blockedReason={movementBlock(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Devir künyesi EN ÜSTTE: alanların neden dolu geldiğini, alana bakmadan önce söyler.
            22.11'den sonra bu yol nadir — para önerisi artık kuyruğun içinde karar veriliyor; künye
            yine duruyor çünkü devir kapısı (`?movement=` ön dolgusu) kalkmadı. */}
        {note ? (
          <HandoffNote dense summary={note.summary} reason={note.reason}>
            Alanlar önerideki gibi dolduruldu ama <strong className="font-semibold">hiçbiri kilitli değil</strong> —
            kaydetmeden önce tutarı ve hesabı doğrulayın. Kaydedince öneri kuyruktan düşer.
          </HandoffNote>
        ) : null}

        {/* Gövde ORTAK (22.18): asistan kuyruğu da aynı formu kendi içinde açıyor. */}
        <MovementFormBody control={form.control} setValue={form.setValue} values={watched} accounts={accounts} />

      </form>
    </Dialog>
  );
}
