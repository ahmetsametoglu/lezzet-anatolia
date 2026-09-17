'use client';

import { useId, useState, type FormEvent } from 'react';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { Dialog } from '@/components/customer/ui/dialog';
import { useToast } from '@/components/customer/ui/toast';
import type { AccountView } from '@/lib/account/read';
import { errorText } from '@/lib/customer-error-text';
import { updateProfileAction } from '../actions';
import type { AccountCopy, Messages } from '../account-types';

/**
 * Profil düzenlemenin telefon hâli, native profil çekmecesinin ikizi. Form çekmecenin içinde ayrı bileşen, çünkü panel her yeni
 * kapatma işlevinde odağı baştan kurar ve formun durumu paneli çizende dursa her harf odağı alandan koparırdı.
 */
interface PhoneProfileSheetProps {
  t: Messages;
  copy: AccountCopy['edit'];
  profile: AccountView['profile'];
  /** Kararlı olmalı; gerekçesi künyede. */
  onClose: () => void;
}

export function PhoneProfileSheet({ t, copy, profile, onClose }: PhoneProfileSheetProps) {
  return (
    <Dialog title={copy.title} closeLabel={t.cancel} onClose={onClose} placement="sheet">
      <ProfileForm t={t} copy={copy} profile={profile} onSaved={onClose} />
    </Dialog>
  );
}

/** Native metin alanının ölçüleri; görünür etiket yok, ad ekran okuyucuya `aria-label` ile gider. */
const FIELD =
  'h-12.5 w-full rounded-control border-[1.5px] px-4 font-sans text-body-sm outline-none transition-colors placeholder:text-muted';
const EDITABLE = `${FIELD} border-sand-400 bg-card text-ink focus:border-olive`;
const READ_ONLY = `${FIELD} border-disabled-line bg-sand-50 text-disabled-text`;

interface ProfileFormProps {
  t: Messages;
  copy: AccountCopy['edit'];
  profile: AccountView['profile'];
  onSaved: () => void;
}

function ProfileForm({ t, copy, profile, onSaved }: ProfileFormProps) {
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const { errorKey } = await updateProfileAction({ name, phone: phone.trim() === '' ? null : phone });
    setSaving(false);
    if (errorKey) {
      // Alanın kendi retleri çekmecenin cümlesiyle; oturum düşmesi gibi genel retler sayfanın sözlüğünden.
      setError(errorKey === 'name_required' || errorKey === 'phone_invalid' ? copy.errors[errorKey] : errorText(t.errors, errorKey));
      return;
    }
    toast(copy.saved);
    onSaved();
  };

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-2.5">
      <input
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        aria-label={copy.nameLabel}
        placeholder={copy.namePlaceholder}
        autoComplete="name"
        className={EDITABLE}
      />
      {/* E-posta salt okunur: kimliğin kendisidir ve değişimi yeni adrese kod doğrulatan ayrı bir akış ister. */}
      <input value={profile.email ?? ''} readOnly aria-label={copy.emailLabel} placeholder={copy.emailPlaceholder} className={READ_ONLY} />
      <div className="flex flex-col gap-1.5">
        <input
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setError(null);
          }}
          type="tel"
          inputMode="tel"
          aria-label={copy.phoneLabel}
          aria-describedby={noteId}
          placeholder={copy.phonePlaceholder}
          autoComplete="tel"
          className={EDITABLE}
        />
        <span id={noteId} className="font-sans text-helper text-muted">
          {copy.phoneNote}
        </span>
      </div>
      {error !== null && <Note tone="terracotta" description={error} />}
      <PrimaryButton type="submit" shape="block" label={saving ? copy.saving : copy.save} disabled={saving} />
    </form>
  );
}
