'use client';

import { LOCALES, type Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { Chip } from '@/components/customer/phone-kit/chip';
import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import type { AccountCopy } from '../account-types';
import { useLanguageChoice } from './use-language-choice.hook';

/**
 * Dil kartı, native hesabın dil kartı: seçim karta yazar ve sayfayı o dile götürür (`useLanguageChoice`). Misafirde de çizilir,
 * çünkü telefon görünümünde altbilgi yok ve misafirin dili değiştirebildiği tek yer burası; misafirde `stored` aktif dildir.
 */
interface LanguageCardProps {
  copy: AccountCopy['language'];
  locale: Locale;
  stored: PreferredLanguage;
}

export function LanguageCard({ copy, locale, stored }: LanguageCardProps) {
  const { choose } = useLanguageChoice(locale, stored);
  return (
    <SettingsCard title={copy.title}>
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((option) => (
          <Chip key={option} label={copy[option]} selected={locale === option} onClick={() => choose(option)} />
        ))}
      </div>
    </SettingsCard>
  );
}
