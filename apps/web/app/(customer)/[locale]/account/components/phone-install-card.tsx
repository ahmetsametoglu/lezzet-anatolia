'use client';

import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useAppInstall } from '@/components/customer/pwa/use-app-install.hook';
import type { Messages } from '../account-types';

interface PhoneInstallCardProps {
  t: Messages;
}

/**
 * iPhone'da site kurulumu tetikleyemez; menü yolu gösterilir. Yol tarayıcıya ve sürüme göre değişir (Safari'de Paylaş ⋯ içinde
 * olabilir, iOS 26 "Ana Ekrana Ekle"yi "Daha Fazla"nın altına alır), ikisini de bilemediğimiz için adımlar koşullu yazılır.
 */
export function PhoneInstallCard({ t }: PhoneInstallCardProps) {
  const { mode, install } = useAppInstall();
  if (mode === 'hidden') return null;
  return (
    <SettingsCard title={t.installTitle}>
      <p className="font-sans text-body-sm leading-[1.6] text-body">{t.installBody}</p>
      {mode === 'prompt' ? (
        <PrimaryButton shape="block" label={t.installButton} onClick={() => void install()} />
      ) : (
        <ol className="flex flex-col gap-1 font-sans text-body-sm leading-[1.6] text-body">
          <li className="flex flex-wrap items-center gap-x-1.5">
            1. {t.installStepShare}
            <MobileIcon name="share" size={17} className="text-muted" />
            <span className="text-body">{t.installStepShareHint}</span>
          </li>
          <li>2. {t.installStepMore}</li>
          <li>3. {t.installStepAdd}</li>
        </ol>
      )}
    </SettingsCard>
  );
}

