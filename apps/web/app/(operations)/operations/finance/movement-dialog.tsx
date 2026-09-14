'use client';

import { useState } from 'react';
import { toCents } from '@lezzet/helper';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { MovementFormBody } from '@/components/operation/form/movement-form/body';
import {
  MANUAL_ENTRY_SCOPE,
  ManualMovementSchema,
  movementBlock,
  movementToday,
  typePatch,
  type CounterpartyOption,
  type ManualMovementForm,
  type NatureOption,
  type TagOption,
} from '@/components/operation/form/movement-form/schema';
import { TransferFormBody } from '@/components/operation/form/transfer-form/body';
import { TransferFormSchema, transferBlock, transferToday, type TransferForm } from '@/components/operation/form/transfer-form/schema';
import { recordManualMovementAction, recordTransferAction } from '@/lib/finance/actions';
import { ENTRY_MODES, ENTRY_MODE_VIEW, carryToMovement, carryToTransfer, type EntryMode } from './entry-mode';
import type { AccountView } from './finance-types';

// **Yeni hareket** (tasarım §3, "+ Hareket" ve "⇄ Transfer") — gider, sermaye, transfer ya da henüz
// sınıflandırılmamış para: TEK pencere, dört kip (12.24 · kullanıcı isteği: "transferi de doğrudan bu
// diyaloğun içinde yapabiliriz" · seçim: "sabit yuvalar").
//
// Transfer bir tur ayrı penceredeydi ve gerekçesi yazılıydı: tek pencerede "para ne yaptı" sorusu
// transferde anlamsız kalır, hesap kutusu kip değişince ikiye bölünürdü. Sabit yuvalar ikisini de
// karşılıyor — transfer kipinde yön hiç sorulmaz (o yuvada "Nereye" durur), "Nereden" hesabın
// yuvasındadır. Gövdeler yine ayrı (şema ve kaydeden kapı ayrı; asistan kuyruğu da onları açıyor);
// birleşen şey PENCERE: kip değişince yazılan tutar, gün ve açıklama taşınır (`entry-mode.ts`).
//
// Form standardı (`catalog-form-dialog` kanonik): RHF + `zodResolver` + `Form*` adaptörleri +
// `DialogFooter(formId)`. Tutar `FormMoney` ile ve CENT taşıyor (STACK §8).

const FORM_ID = 'money-entry-form';

/** Pencerenin yüksekliği SABİT (12.18 Sözlük dersi): transfer bir satır kısa, kip değişince pencere zıplamaz. */
const DIALOG_HEIGHT = 660;

interface MovementDialogProps {
  accounts: AccountView[];
  /** Tür, cari ve etiket sözlükleri (13.09) — yalnız aktifler. */
  natureOptions: NatureOption[];
  counterpartyOptions: CounterpartyOption[];
  tagOptions: TagOption[];
  /** Etiket menüsünün "oluştur" satırı — yeni etiketin anahtarını döner. */
  onCreateTag: (label: string) => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Ön dolgu — "Ödemesini yaz" denen açık belgeden (12.12). Alanlar DOLU açılır ama hiçbiri kilitli
   * değil — kaydetmeden önce düzeltilebilmesi bu yolun bütün sebebi.
   */
  initial?: ManualMovementForm | null;
  /** Belgeden açıldıysa formun üstünde okunan künye: "FA-2026-0912 · Cabinet Muller · açık 360,00 €". */
  documentLabel?: string | null;
  /** Açılış kipi — "Eylemler → Transfer" pencereyi transfer kipinde açar (12.24). */
  initialMode?: EntryMode;
}

export function MovementDialog({
  accounts,
  natureOptions,
  counterpartyOptions,
  tagOptions,
  onCreateTag,
  onClose,
  onSaved,
  initial = null,
  documentLabel = null,
  initialMode,
}: MovementDialogProps) {
  // Belgeden gelen ödeme (12.12) bir transfer olamaz; tek açık hesapla transfer yapılamaz — kip çizilmez.
  const modes = ENTRY_MODES.filter((entry) => entry !== 'transfer' || (!initial?.documentId && accounts.length >= 2));
  const wanted = initialMode ?? initial?.type ?? 'expense';
  const [mode, setMode] = useState<EntryMode>(modes.includes(wanted) ? wanted : 'expense');
  const [error, setError] = useState<string | null>(null);
  const isTransfer = mode === 'transfer';

  const movementForm = useForm<ManualMovementForm>({
    resolver: zodResolver(ManualMovementSchema),
    defaultValues: initial
      ? { ...initial, valueDate: initial.valueDate || movementToday() }
      : {
          accountId: accounts[0]?.id ?? '',
          type: 'expense',
          amount: null,
          direction: 'out',
          nature: '',
          counterpartyId: '',
          tags: [],
          campaign: '',
          valueDate: movementToday(),
          description: '',
          documentId: null,
        },
    mode: 'onChange',
  });
  const transferForm = useForm<TransferForm>({
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
  const movement = useWatch({ control: movementForm.control }) as ManualMovementForm;
  const transfer = useWatch({ control: transferForm.control }) as TransferForm;

  /** Kip değişimi — ortak alanlar taşınır, elle hareket türünde yön ve tür kuralı uygulanır (`typePatch`). */
  const switchMode = (next: EntryMode) => {
    if (next === mode) return;
    setError(null);
    if (next === 'transfer') {
      transferForm.reset(carryToTransfer(movementForm.getValues(), transferForm.getValues(), accounts.map((account) => account.id)));
    } else {
      if (isTransfer) movementForm.reset(carryToMovement(transferForm.getValues(), movementForm.getValues()));
      const patch = typePatch(natureOptions, movementForm.getValues(), next);
      movementForm.setValue('type', patch.type);
      movementForm.setValue('direction', patch.direction);
      movementForm.setValue('nature', patch.nature, { shouldValidate: true });
    }
    setMode(next);
  };

  const saveMovement = movementForm.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await recordManualMovementAction({
      accountId: values.accountId,
      type: values.type,
      // EURO → CENT sınırda (`ManualMovementSchema` künyesi): kapı cent istiyor.
      amountCents: toCents(values.amount ?? 0),
      direction: values.direction,
      // Seçici "seçilmedi"yi boş dizeyle söyler; kapı `null` bekler.
      nature: values.nature || null,
      counterpartyId: values.counterpartyId || null,
      tags: values.tags,
      campaign: values.campaign,
      valueDate: values.valueDate,
      description: values.description,
      documentId: values.documentId,
    });
    if (actionError) {
      setError(actionError);
      return;
    }
    onSaved();
  });

  const saveTransfer = transferForm.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await recordTransferAction({
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
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
      title="Yeni hareket"
      subtitle={MANUAL_ENTRY_SCOPE}
      maxWidth={560}
      height={DIALOG_HEIGHT}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={isTransfer ? transferForm.formState.isSubmitting : movementForm.formState.isSubmitting}
          error={error}
          submitLabel={isTransfer ? 'Transferi kaydet' : 'Hareketi kaydet'}
          blockedReason={isTransfer ? transferBlock(transfer) : movementBlock(movement)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={isTransfer ? saveTransfer : saveMovement} className="flex flex-col gap-4">
        {/* BELGEDEN GELİNDİYSE künye üstte (12.12): ödemenin hangi faturayı kapattığı formu
            doldururken görünür olmalı; kaydedilince belgenin açık kalanı düşer. */}
        {documentLabel ? (
          <p className="rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-olive-dark">
            Belge: {documentLabel}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          {/* Seçici pencerenin genişliğini DOLDURUR (`w-full`, 12.24 eki · kullanıcı bildirimi: rayın sağında
              boş alan kalıyordu); düğmeler fazlayı paylaşır, hap seçili düğmeyi ölçerek izler. */}
          <MultiToggle
            value={mode}
            onChange={switchMode}
            options={modes.map((entry) => ({ key: entry, label: ENTRY_MODE_VIEW[entry].label }))}
            label="Hareketin kipi"
            className="w-full"
          />
          <span className="font-ops-body text-ops-xs text-ops-faint">{ENTRY_MODE_VIEW[mode].hint}</span>
        </div>
        {/* Gövdeler ORTAK (22.18 · 22.22): asistan kuyruğu da aynı formları açıyor; yuvaları aynı (12.24). */}
        {isTransfer ? (
          <TransferFormBody control={transferForm.control} values={transfer} accounts={accounts} />
        ) : (
          <MovementFormBody
            control={movementForm.control}
            setValue={movementForm.setValue}
            values={movement}
            accounts={accounts}
            natureOptions={natureOptions}
            counterpartyOptions={counterpartyOptions}
            tagOptions={tagOptions}
            onCreateTag={onCreateTag}
            showTypeToggle={false}
          />
        )}
      </form>
    </Dialog>
  );
}
