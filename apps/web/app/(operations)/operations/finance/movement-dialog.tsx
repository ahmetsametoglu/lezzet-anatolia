'use client';

import { useState } from 'react';
import { toCents } from '@lezzet/helper';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
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
  /** Etiket sözlüğü (13.09) — gider çipleri buradan; yalnız aktif etiketler. */
  tagOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Ön dolgu — asistan önerisinden (22.5) ya da "Ödemesini yaz" denen açık belgeden (12.12). Alanlar
   * DOLU açılır ama hiçbiri kilitli değil — onaydan önce düzeltilebilmesi bu devrin bütün sebebi.
   */
  initial?: ManualMovementForm | null;
  /** Belgeden açıldıysa formun üstünde okunan künye: "FA-2026-0912 · Cabinet Muller · açık 360,00 €". */
  documentLabel?: string | null;
  /** Öneri kimliği; verilirse kayıt kuyruk satırını da kapatır. */
  /**
   * Devir künyesi — pencerenin İÇİNDE durur, sayfada değil (22.5).
   *
   * Bu pencere öneriden gelindiğinde kendiliğinden açılıyor ve örtüsü sayfayı kaplıyor: künye
   * arkada kalsaydı operatör tutarın neden dolu geldiğini ancak pencereyi kapattıktan sonra
   * görürdü — yani kararı verdikten sonra.
   */
}

export function MovementDialog({
  accounts,
  tagOptions,
  onClose,
  onSaved,
  initial = null,
  documentLabel = null,
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
          tags: [],
          campaign: '',
          valueDate: movementToday(),
          description: '',
          documentId: null,
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
      tags: values.tags,
      campaign: values.campaign,
      valueDate: values.valueDate,
      description: values.description,
      documentId: values.documentId,
      // Öneriden gelindiyse kuyruk satırı bu kayıtla kapanır (`withProposal`).
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
        {/* BELGEDEN GELİNDİYSE künye üstte (12.12): ödemenin hangi faturayı kapattığı formu
            doldururken görünür olmalı; kaydedilince belgenin açık kalanı düşer. */}
        {documentLabel ? (
          <p className="rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-olive-dark">
            Belge: {documentLabel}
          </p>
        ) : null}
        {/* Gövde ORTAK (22.18): asistan kuyruğu da aynı formu kendi içinde açıyor. */}
        <MovementFormBody
          control={form.control}
          setValue={form.setValue}
          values={watched}
          accounts={accounts}
          tagOptions={tagOptions}
        />

      </form>
    </Dialog>
  );
}
