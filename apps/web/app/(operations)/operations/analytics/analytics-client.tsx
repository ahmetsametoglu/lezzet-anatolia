'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnalyticsDesktop } from './analytics.desktop';
import { analyticsUrl, type AnalyticsUrlState } from './analytics-url';
import type { AnalyticsData } from './analytics-types';

// Analitik client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.
//
// Mod/dönem/kanal GERÇEK GEZİNMEDİR (`?mode=…&period=…&ch=…`) çünkü veriyi sunucu okuyor ve
// "şu döneme bak" bağlantısı paylaşılabilir olmalı — analitikte bir bulguyu göstermenin tek yolu
// budur. İstemci durumunda tutulsaydı her seçim bir istemci turu olur, bağlantı hep varsayılanı
// açardı.

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
  };

  return <AnalyticsDesktop {...view} />;
}
