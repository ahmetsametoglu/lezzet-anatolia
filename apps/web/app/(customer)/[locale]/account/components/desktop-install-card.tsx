'use client';

import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { useAppInstall } from '@/components/customer/pwa/use-app-install.hook';
import type { Messages } from '../account-types';
import { CardHead } from './account-cards';

interface DesktopInstallCardProps {
  t: Messages;
}

/** Masaüstü görünümü iPad'e de düşer; orada kurulum yalnız menüden olduğu için rehber, Chrome ve Edge'de düğme gösterilir. */
export function DesktopInstallCard({ t }: DesktopInstallCardProps) {
  const { mode, install } = useAppInstall();
  if (mode === 'hidden') return null;
  return (
    <Card compact={false}>
      <CardHead title={t.installTitle} compact={false} />
      <span className="font-sans text-note leading-relaxed text-body">{t.installBody}</span>
      {mode === 'prompt' ? (
        <span className="self-start">
          <Button size="sm" onClick={() => void install()}>
            {t.installButton}
          </Button>
        </span>
      ) : (
        <ol className="flex flex-col gap-1 font-sans text-note leading-relaxed text-body">
          <li className="flex items-center gap-1.75">
            1. {t.installStepShare}
            <Icon name="share" size={16} />
          </li>
          <li>2. {t.installStepAdd}</li>
        </ol>
      )}
    </Card>
  );
}

