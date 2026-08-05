'use client';

import type { CourierStop } from '@/lib/courier/day';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { CourierDayDesktop } from './deliveries.desktop';
import { CourierDayMobile } from './deliveries.mobile';

// Kurye günü client kökü (Sapma 3). **Telefon birincil yüzey** — kurye sahada, ayaküstü; masaüstü
// hâli sevkiyatçının omuz üstünden bakması ve geliştirme içindir.
//
// URL durumu YOK ve bu bilinçli: ekranın tek bir görünümü var (bugünün durakları) ve süzgeci de
// yok — "sonuçlananları gizle" gibi bir daraltma, kuryenin gün ortasında "ne yaptım" sorusunun
// cevabını elinden alırdı (tasarım §2: sonuçlanmış duraklar listede KALIR).

interface DeliveriesClientProps {
  stops: CourierStop[];
  device: Device;
}

export function DeliveriesClient({ stops, device }: DeliveriesClientProps) {
  const resolvedDevice = useDevice(device);
  return resolvedDevice === 'mobile' ? <CourierDayMobile stops={stops} /> : <CourierDayDesktop stops={stops} />;
}
