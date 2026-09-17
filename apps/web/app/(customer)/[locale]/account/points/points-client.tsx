'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerPointsRules } from '@lezzet/application';
import type { PointsEntry } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { loadMorePointsAction } from './actions';
import { PointsDesktop } from './points.desktop';
import { PointsMobile } from './points.mobile';
import type { Messages, PointsHistoryPage } from './points-types';

/**
 * Puan geçmişinin cihaz çatalı ve sayfalamanın sahibi: telefon native puan ekranının ikizi, masaüstü tek sütun döküm. Devam
 * burada tutulur ki cihaz değişince liste baştan okunmasın.
 */
interface PointsHistoryClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  first: PointsHistoryPage;
  rules: CustomerPointsRules;
}

export function PointsHistoryClient({ t, locale, device, first, rules }: PointsHistoryClientProps) {
  const resolved = useDevice(device);
  const [extra, setExtra] = useState<PointsEntry[]>([]);
  const [cursor, setCursor] = useState(first.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = () => {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    void loadMorePointsAction(cursor).then((res) => {
      const page = res.data;
      if (page) {
        setExtra((prev) => [...prev, ...page.entries]);
        setCursor(page.nextCursor);
      } else {
        setFailed(true);
      }
      setLoading(false);
    });
  };

  const view = { t, locale, rules, entries: [...first.entries, ...extra], hasMore: cursor !== null, loading, failed, loadMore };
  return resolved === 'mobile' ? <PointsMobile {...view} /> : <PointsDesktop {...view} />;
}
