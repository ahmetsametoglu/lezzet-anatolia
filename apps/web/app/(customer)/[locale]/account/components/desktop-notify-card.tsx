'use client';

import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { customerWebPush } from '@/components/customer/pwa/customer-web-push';
import { useWebPush } from '@/lib/push/use-web-push.hook';
import type { Messages } from '../account-types';
import { CardHead, ConsentSwitch } from './account-cards';

interface DesktopNotifyCardProps {
  t: Messages;
}

/** Engellenmiş izinde anahtar yerine yol yazılır, çünkü site tarayıcının kararını yeniden soramaz. */
export function DesktopNotifyCard({ t }: DesktopNotifyCardProps) {
  const { mode, on, toggle } = useWebPush(customerWebPush);
  if (mode === 'hidden') return null;
  return (
    <Card compact={false}>
      <CardHead title={t.notifyTitle} compact={false} />
      {mode === 'denied' ? (
        <span className="font-sans text-note leading-relaxed text-body">{t.notifyDenied}</span>
      ) : (
        <ConsentSwitch label={t.notifyLabel} icon={<Icon name="bell" size={17} />} on={on} onLabel={t.consentOn} offLabel={t.consentOff} onToggle={toggle} />
      )}
      <span className="font-sans text-micro leading-relaxed text-body">{t.notifyBody}</span>
    </Card>
  );
}
