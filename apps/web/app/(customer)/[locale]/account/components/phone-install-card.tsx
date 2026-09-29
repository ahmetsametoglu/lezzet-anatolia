'use client';

import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useAppInstall } from '@/components/customer/pwa/use-app-install.hook';
import type { Messages } from '../account-types';

interface PhoneInstallCardProps {
  t: Messages;
}

/** iPhone'da site kurulumu tetikleyemez; müşterinin bilmediği menü yolu iki adımla gösterilir. */
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
          <li className="flex items-center gap-1.5">
            1. {t.installStepShare}
            <MobileIcon name="share" size={17} className="text-muted" />
          </li>
          <li>2. {t.installStepAdd}</li>
        </ol>
      )}
    </SettingsCard>
  );
}

