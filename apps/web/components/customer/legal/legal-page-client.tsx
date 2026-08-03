'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { LegalPageDesktop } from './legal-page.desktop';
import { LegalPageMobile } from './legal-page.mobile';
import type { LegalViewProps } from './legal-view-types';

/**
 * Statik sayfanın cihaz çatalı (ADR Sapma 3) — beş sayfanın hepsi buradan geçer.
 *
 * Çatalın SAYFA klasöründe değil ortak bileşende durması bilinçli: beş sayfa da aynı iki dizilişi
 * kullanıyor, her birine kendi `*-client` dosyasını yazmak aynı üç satırın beş kopyası olurdu ve
 * biri bir gün ötekinden ayrılırdı. Sayfalara kalan tek iş, hangi belgeyi çizeceğini söylemek.
 */
interface LegalPageClientProps extends LegalViewProps {
  device: Device;
}

export function LegalPageClient({ device, ...view }: LegalPageClientProps) {
  return useDevice(device) === 'mobile' ? <LegalPageMobile {...view} /> : <LegalPageDesktop {...view} />;
}
