'use client';

import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { customerWebPush } from '@/components/customer/pwa/customer-web-push';
import { useWebPush } from '@/lib/push/use-web-push.hook';
import type { Messages } from '../account-types';
import { ConsentSwitch } from './account-cards';

interface PhoneNotifyCardProps {
  t: Messages;
  failedText: string;
}

/** iPhone'da kart ancak ana ekrana kurulan uygulamada çıkar; Safari sekmesinde yerini kurulum kartı tutar. */
export function PhoneNotifyCard({ t, failedText }: PhoneNotifyCardProps) {
  const { mode, on, toggle } = useWebPush(customerWebPush);
  if (mode === 'hidden') return null;
  return (
    <SettingsCard title={t.notifyTitle}>
      {mode === 'denied' ? (
        <p className="font-sans text-body-sm leading-[1.6] text-body">{t.notifyDenied}</p>
      ) : (
        <ConsentSwitch compact label={t.notifyLabel} on={on} onLabel={t.consentOn} offLabel={t.consentOff} failedText={failedText} onToggle={toggle} />
      )}
      <p className="font-sans text-body-sm leading-[1.6] text-sand-600">{t.notifyBody}</p>
    </SettingsCard>
  );
}
