'use client';

import { useState, useSyncExternalStore } from 'react';
import { FONT_SCALES, type FontScale } from '@lezzet/design-tokens';
import { LOCALES, type Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { Chip } from '@/components/customer/phone-kit/chip';
import { DASHED_TOP, SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { currentFontScale, saveFontScale } from '@/lib/storefront/font-scale';
import type { AccountCopy } from '../account-types';
import { useLanguageChoice } from './use-language-choice.hook';

/**
 * Dil kartı, native hesabın dil kartı: seçim karta yazar ve sayfayı o dile götürür (`useLanguageChoice`). Misafirde de çizilir,
 * çünkü telefon görünümünde altbilgi yok ve misafirin dili değiştirebildiği tek yer burası; misafirde `stored` aktif dildir.
 */
interface LanguageCardProps {
  copy: AccountCopy['language'];
  fontCopy: AccountCopy['fontSize'];
  locale: Locale;
  stored: PreferredLanguage;
}

export function LanguageCard({ copy, fontCopy, locale, stored }: LanguageCardProps) {
  const { choose } = useLanguageChoice(locale, stored);
  // Seçim kökteki değişkenden okunur; sunucu karesinde `normal` çizilir, hidrasyonda güncel seçime geçer.
  const initial = useSyncExternalStore(noopSubscribe, currentFontScale, () => 'normal' as const);
  const [picked, setPicked] = useState<FontScale | null>(null);
  const fontScale = picked ?? initial;
  return (
    <SettingsCard title={copy.title}>
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((option) => (
          <Chip key={option} label={copy[option]} selected={locale === option} onClick={() => choose(option)} />
        ))}
      </div>
      <div className={`flex flex-col gap-3 pt-3.5 ${DASHED_TOP}`}>
        <h3 className="font-serif text-card-title-sm text-ink">{fontCopy.title}</h3>
        <div className="flex flex-wrap gap-2">
          {FONT_SCALES.map((option) => (
            <Chip
              key={option}
              label={fontCopy[option]}
              selected={fontScale === option}
              onClick={() => {
                setPicked(option);
                saveFontScale(option);
              }}
            />
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}

const noopSubscribe = () => () => undefined;
