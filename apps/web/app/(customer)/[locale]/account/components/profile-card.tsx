'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { errorText } from '@/lib/customer-error-text';
import type { AccountView } from '@/lib/account/read';
import { updateProfileAction } from '../actions';
import { Card } from '@/components/customer/ui/card';
import { CardHead, Row } from './account-cards';
import { useLanguageChoice } from './use-language-choice.hook';
import type { Messages } from '../account-types';

/**
 * Profil satır içinde düzenlenir, çünkü değişen üç alanı başka yere taşımak bağlamı da taşır. E-posta düzenlenmez, çünkü kimliğin
 * anahtarıdır ve değişimi doğrulama ile birleştirme sorularını açar.
 */
interface ProfileCardProps {
  t: Messages;
  locale: Locale;
  profile: AccountView['profile'];
  compact: boolean;
}

const LANGUAGE_LABEL: Record<PreferredLanguage, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/**
 * Ham `<select>`, çünkü kitin alanı etiketli ve tam genişlikte; burada satır içi kompakt hap gerekiyor ve seçim düzenleme kipini
 * beklemeden etkili. Ok ayrı düğüm, çünkü yerel ok üç tarayıcıda üç farklı çizilir.
 */
function LanguagePill({ locale, value, compact }: { locale: Locale; value: PreferredLanguage; compact: boolean }) {
  // Gösterilen değer AKTİF SAYFA DİLİDİR, kart farklıysa sessizce hizalanır — gerekçesi hook'un künyesinde.
  const { choose, pending } = useLanguageChoice(locale, value);

  return (
    <span className="relative inline-flex items-center">
      <select
        value={locale}
        disabled={pending}
        aria-label={LANGUAGE_LABEL[locale]}
        onChange={(e) => choose(e.target.value as PreferredLanguage)}
        className={[
          'cursor-pointer appearance-none rounded-pill border-[1.5px] border-sand-400 bg-card font-sans font-bold text-ink transition-colors hover:border-olive disabled:cursor-progress',
          compact ? 'py-1 pr-7 pl-3 text-micro' : 'py-1.5 pr-8 pl-3.5 text-note',
        ].join(' ')}
      >
        {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className={['pointer-events-none absolute text-micro text-ink', compact ? 'right-2.5' : 'right-3'].join(' ')}>
        ▾
      </span>
    </span>
  );
}

/** Her açılışta yeniden kurulur ve sunucudaki değerle doğar, çünkü vazgeçilen düzenlemenin artığı kaydedilmiş sanılır. */
interface ProfileEditFormProps {
  t: Messages;
  profile: AccountView['profile'];
  /** Kayıttan ya da vazgeçişten sonra kart okuma hâline döner. */
  onDone: () => void;
}

function ProfileEditForm({ t, profile, onDone }: ProfileEditFormProps) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const { errorKey } = await updateProfileAction({ name, phone });
    setBusy(false);
    // Sunucu anahtar döner, cümle burada kurulur; bilinmeyen anahtar genel cümleye düşer.
    if (errorKey) return setError(errorText(t.errors, errorKey));
    onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      <FormInputField label={t.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      {/* Numara WhatsApp kimliği kurmaz, adres formuna öneri olur; bunu altında söylemek yanlış söz vermeyi önler. */}
      <div className="flex flex-col gap-1">
        <FormInputField
          label={t.phoneWhatsapp}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33 6 12 34 56 78"
        />
        <span className="font-sans text-micro leading-relaxed text-muted">{t.phoneHint}</span>
      </div>

      {/* Sebep alanın yanında yazılı: sebepsiz pasif alan müşteriyi kendi hatasını arar hâlde bırakır. */}
      <div className="flex flex-col gap-1">
        <span className="font-sans text-micro text-muted">{t.email}</span>
        <span className="font-sans text-body-sm font-bold text-ink">{profile.email ?? '—'}</span>
        <span className="font-sans text-micro leading-relaxed text-muted">{t.emailLocked}</span>
      </div>

      {/* Dil formda yok: iki yerde olsa hangisinin geçerli olduğu sorulurdu. */}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? t.saving : t.save}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDone}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}

export function ProfileCard({ t, locale, profile, compact }: ProfileCardProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Card compact={compact}>
        <CardHead
          title={t.profileTitle}
          compact={compact}
          action={
            <button type="button" onClick={() => setEditing(true)} className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
              {t.edit}
            </button>
          }
        />
        <Row label={t.name} value={profile.name || '—'} />
        <Row label={t.email} value={profile.email ?? '—'} />
        {/* İletişim numarası ile WhatsApp kimliği ayrı satır: tek satırda müşteri kuryenin arayacağı numarayı kimliğiyle aynı sanıyor. */}
        <Row label={t.phone} value={profile.phone ?? t.noPhone} />
        {/* Dil düzenleme kipinin arkasında değil: seçim anında etkili ve kip onu iki tıklama uzatırdı. */}
        <Row label={t.language} value={<LanguagePill locale={locale} value={profile.preferredLanguage} compact={compact} />} />
      </Card>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead title={t.profileTitle} compact={compact} />
      <ProfileEditForm t={t} profile={profile} onDone={() => setEditing(false)} />
    </Card>
  );
}
