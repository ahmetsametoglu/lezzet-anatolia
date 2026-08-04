'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { AnalyticsDesktop } from './analytics.desktop';
import { AnalyticsMobile } from './analytics.mobile';
import { analyticsUrl, type AnalyticsUrlState } from './analytics-url';
import type { AnalyticsData } from './analytics-types';

// Analitik client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil çatallanır.
//
// Mod/dönem/kanal GERÇEK GEZİNMEDİR (`?mode=…&period=…&ch=…`) çünkü veriyi sunucu okuyor ve
// "şu döneme bak" bağlantısı paylaşılabilir olmalı — analitikte bir bulguyu göstermenin tek yolu
// budur. İstemci durumunda tutulsaydı her seçim bir istemci turu olur, bağlantı hep varsayılanı
// açardı.

interface AnalyticsClientProps {
  data: AnalyticsData;
  device: Device;
  urlState: AnalyticsUrlState;
}

export function AnalyticsClient({ data, device, urlState }: AnalyticsClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  // `replace` (push değil): süzgeç değiştirmek bir GEZİNME değil, aynı ekranın başka bir görünümü.
  // `push` olsaydı beş çip denemesinden sonra geri tuşu ekrandan çıkmak için beş kez basmak isterdi.
  const go = (next: Partial<AnalyticsUrlState>) => {
    startNav(() => router.replace(analyticsUrl({ ...urlState, ...next }), { scroll: false }));
  };

  const view = {
    data,
    urlState,
    navPending,
    onMode: (mode: AnalyticsUrlState['mode']) => go({ mode }),
    onPeriod: (period: AnalyticsUrlState['period']) => go({ period }),
    onChannel: (channel: AnalyticsUrlState['channel']) => go({ channel }),
  };

  return resolvedDevice === 'mobile' ? <AnalyticsMobile {...view} /> : <AnalyticsDesktop {...view} />;
}
