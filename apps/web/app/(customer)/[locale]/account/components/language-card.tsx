'use client';

import { LOCALES, type Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { Chip } from '@/components/customer/phone-kit/chip';
import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import type { AccountCopy } from '../account-types';
import { useLanguageChoice } from './use-language-choice.hook';

/**
 * Dil kartı — native hesabın dil kartı (14.09): çipler `LOCALES`ten türer; seçim karta yazar ve sayfayı o dile götürür
 * (`useLanguageChoice` — masaüstü hapıyla aynı kapı). Seçili çip aktif sayfa dilidir.
 *
 * Misafirde de çizilir (web'e özgü): native'de dil cihazın ayarından gelir, web'de adresin kendisidir ve telefon
 * görünümünde footer olmadığı için misafirin dili değiştirebildiği tek yer burası. Misafirin kayıtlı dili yoktur —
 * `stored` olarak aktif dil verilir, hizalama yazımı hiç tetiklenmez.
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
