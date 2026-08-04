'use client';

import { useState } from 'react';
import { AccountTypeEnum, type AccountType } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { createAccountAction } from './actions';
import { ACCOUNT_TYPE_LABEL, NO_ACCOUNTS } from './finance-labels';

// **İlk hesap** — hesabı olmayan kurulumun tek eylemi.
//
// Ekranın boş hâli *"ilkini ekleyerek başlayın"* diyor; o cümlenin karşılığı burada olmasaydı
// operatör ekrandan çıkıp aramak zorunda kalırdı — ve arayacağı yer de yok (Ayarlar 09.16 henüz
// yazılmadı). Bir yüzey kendi verdiği sözü kendi tutmalı.
//
// **Diyalog DEĞİL, boş ekranın içinde:** açılışta gösterilecek başka hiçbir şey yok; bir pencerenin
// arkasına koymak, boş bir ekranı bir tıklama daha uzağa itmek olurdu.

export function AccountSetup({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
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
    setName('');
    onCreated();
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-[460px] flex-col gap-4 rounded-ops-card border border-ops-line bg-ops-surface p-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-section font-semibold text-ops-ink">Para burada izlenir</span>
          <p className="font-ops-body text-ops-sm text-ops-muted">{NO_ACCOUNTS}</p>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-name" className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
              Hesap adı
            </label>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kasa · Crédit Mutuel · Stripe"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
              Ne tür
            </span>
            <MultiToggle
              value={type}
              onChange={setType}
              label="Hesap türü"
              options={AccountTypeEnum.options.map((option) => ({ key: option, label: ACCOUNT_TYPE_LABEL[option] }))}
            />
          </div>

          {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}

          <Button type="submit" disabled={saving || name.trim().length === 0}>
            {saving ? 'Ekleniyor…' : 'Hesabı ekle'}
          </Button>
        </form>
      </div>
    </div>
  );
}
