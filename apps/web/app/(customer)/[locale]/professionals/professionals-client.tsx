'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { ProfessionalsDesktop } from './professionals.desktop';
import { ProfessionalsMobile } from './professionals.mobile';
import type { ProfessionalsViewProps } from './professionals-types';

/**
 * Professionnels sayfasının cihaz çatalı. Bu katman YALNIZ `useDevice` içindir: sunucu ipucu (UA)
 * yanlışsa mount sonrası düzeltilir. Başvurunun kendi durumu formun içinde yaşıyor — buraya
 * taşınsaydı cihaz değişimi (tablet → masaüstü düzeltmesi) yarım doldurulmuş formu sıfırlardı.
 */
interface ProfessionalsClientProps extends ProfessionalsViewProps {
  device: Device;
}

export function ProfessionalsClient({ device, ...view }: ProfessionalsClientProps) {
  return useDevice(device) === 'mobile' ? <ProfessionalsMobile {...view} /> : <ProfessionalsDesktop {...view} />;
}
