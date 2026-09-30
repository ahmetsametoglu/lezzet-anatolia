'use client';

import { useState } from 'react';
import { useWebPush } from '@/components/customer/pwa/use-web-push.hook';
import { notifyAskState, type NotifyAskState } from './notify-ask';

export function useNotifyAsk(placed: boolean): { state: NotifyAskState; busy: boolean; ask: () => void } {
  const { mode, on, toggle } = useWebPush();
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const ask = () => {
    setAsked(true);
    setFailed(false);
    setBusy(true);
    void toggle(true).then(({ errorKey }) => {
      setBusy(false);
      setFailed(errorKey !== null);
    });
  };

  return { state: notifyAskState({ placed, mode, on, asked, failed }), busy, ask };
}
