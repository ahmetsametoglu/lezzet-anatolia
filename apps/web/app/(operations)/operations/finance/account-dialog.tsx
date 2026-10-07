'use client';

import { useState } from 'react';
import { AccountTypeEnum, type AccountType } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { createAccountAction } from '@/lib/finance/actions';
import { ACCOUNT_TYPE_LABEL } from './finance-labels';

const FORM_ID = 'account-form';

/**
 * Hesap ekleme ("Eylemler → Hesap ekle"). Kasa ve Revolut Merchant kurulumla gelir; banka hesabı burada açılır, hareketleri Pennylane'den
 * okunsun diye Ayarlar › Kurulum'da eşlenir.
 */
interface AccountDialogProps {
  onClose: () => void;
  onSaved: () => void;
}

export function AccountDialog({ onClose, onSaved }: AccountDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    const { error: actionError } = await createAccountAction({ name, type });
    setSaving(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Hesap ekle"
      subtitle="Kasa ve Revolut Merchant kurulumla gelir. Banka hesabı burada açılır, sonra Ayarlar › Kurulum'da Pennylane'deki hesabına eşlenir."
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={saving}
          error={error}
          submitLabel="Hesabı ekle"
          blockedReason={name.trim().length === 0 ? 'Hesabın adı yazılmalı' : null}
        />
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldShell fieldId="account-name" label="Hesap adı" required>
          <Input
            id="account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Revolut Business · Crédit Mutuel"
          />
        </FieldShell>
        <FieldShell label="Ne tür">
          <MultiToggle
            value={type}
            onChange={setType}
            label="Hesap türü"
            options={AccountTypeEnum.options.map((option) => ({ key: option, label: ACCOUNT_TYPE_LABEL[option] }))}
          />
        </FieldShell>
      </form>
    </Dialog>
  );
}
