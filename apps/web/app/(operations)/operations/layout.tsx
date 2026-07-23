import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { RootShell } from '@/components/root-shell';

// Operasyon yüzeyi kökü — yalnız Türkçe (personel). Locale yönlendirmesinin dışında.
// Kendi tasarım dili (Veri Masası) ve fontları ilgili dilimde eklenecek.
export const metadata: Metadata = {
  title: 'Operasyon — Lezzet Anatolia',
};

interface OperationsLayoutProps {
  children: ReactNode;
}

export default function OperationsLayout({ children }: OperationsLayoutProps) {
  return <RootShell lang="tr">{children}</RootShell>;
}
