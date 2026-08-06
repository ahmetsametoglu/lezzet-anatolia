'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ReportsDesktop } from './reports.desktop';
import { reportsUrl, type ReportsUrlState } from './reports-url';
import type { ReportsData } from './reports-types';

// Raporlar client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.
//
// Sekme ve dönem GERÇEK GEZİNMEDİR: veriyi sunucu okuyor ve "temmuzun şirket kârı" bağlantısı
// paylaşılabilir olmalı. İstemci durumunda tutulsaydı her sekme bir istemci turu olur, paylaşılan
// bağlantı hep varsayılanı açardı.

interface ReportsClientProps {
  data: ReportsData;
  urlState: ReportsUrlState;
  months: string[];
  canSeeProfit: boolean;
}

export function ReportsClient({ data, urlState, months, canSeeProfit }: ReportsClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  // `now` burada `months[0]`dan türüyor, `new Date()`ten DEĞİL: sunucu ile istemci ayrı saat
  // okusaydı ay sınırında iki taraf farklı varsayılan hesaplar ve adres gereksizce `?ym=` taşırdı.
  const now = new Date(`${months[0]}-01T00:00:00.000Z`);

  const go = (next: Partial<ReportsUrlState>) => {
    startNav(() => router.replace(reportsUrl({ ...urlState, ...next }, now), { scroll: false }));
  };

  const view = {
    data,
    urlState,
    months,
    canSeeProfit,
    navPending,
    onFilter: go,
  };

  return <ReportsDesktop {...view} />;
}
