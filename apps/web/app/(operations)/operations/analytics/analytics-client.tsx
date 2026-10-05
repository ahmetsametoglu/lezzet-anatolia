'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnalyticsDesktop } from './analytics.desktop';
import { analyticsUrl, type AnalyticsUrlState } from './analytics-url';
import type { AnalyticsData } from './analytics-types';

// Analitik client kökü, operasyon web'i masaüstü yalnızdır. Mod, dönem ve kanal gerçek gezinmedir, çünkü veriyi sunucu okur ve "şu döneme
// bak" bağlantısı paylaşılabilir olmalı.

interface AnalyticsClientProps {
  data: AnalyticsData;
  urlState: AnalyticsUrlState;
}

export function AnalyticsClient({ data, urlState }: AnalyticsClientProps) {
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
    onBusiness: (business: AnalyticsUrlState['business']) => go({ business }),
  };

  return <AnalyticsDesktop {...view} />;
}
