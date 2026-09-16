import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { brand } from '@lezzet/brand';
import { RootShell } from '@/components/root-shell';
import { opsFontVars } from '@/components/operation/ui/fonts';

export const metadata: Metadata = {
  title: `Asistan bağlantısı — ${brand.name}`,
  // Bir hata cevabı; dizine düşmesinin hiçbir değeri yok.
  robots: { index: false, follow: false },
};

interface OauthErrorLayoutProps {
  children: ReactNode;
}

/**
 * `/oauth/error` KENDİ kökünü kurar: `app/` altında ortak bir kök layout yok, iki yüzeyin
 * layout'ları kendi ağaçlarının kökü ve bu ekran ikisinin de dışında.
 *
 * Operasyon kabuğu (sidebar) bilerek YOK: buraya düşen kişinin o yetkisi yok, gösterilecek gezinme
 * de yok — `NotStaffScreen` ile aynı karar.
 */
export default function OauthErrorLayout({ children }: OauthErrorLayoutProps) {
  return (
    <RootShell lang="tr" surface="operations" className={opsFontVars}>
      <div className="flex h-screen flex-col overflow-hidden bg-ops-bg font-ops-body text-ops-ink">{children}</div>
    </RootShell>
  );
}
