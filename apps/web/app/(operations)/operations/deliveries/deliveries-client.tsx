'use client';

import type { CourierStop } from '@/lib/courier/day';
import { CourierDayDesktop } from './deliveries.desktop';

// Kurye günü client kökü. Operasyon web'i masaüstü-yalnız (06.08); kuryenin sahadaki (telefon)
// deneyimi native uygulamaya taşınıyor — `docs/uygulama`. Web'deki bu ekran sevkiyatçının omuz
// üstünden bakması ve geliştirme içindir.
//
// URL durumu YOK ve bu bilinçli: ekranın tek bir görünümü var (bugünün durakları) ve süzgeci de
// yok — "sonuçlananları gizle" gibi bir daraltma, kuryenin gün ortasında "ne yaptım" sorusunun
// cevabını elinden alırdı (tasarım §2: sonuçlanmış duraklar listede KALIR).

interface DeliveriesClientProps {
  stops: CourierStop[];
}

export function DeliveriesClient({ stops }: DeliveriesClientProps) {
  return <CourierDayDesktop stops={stops} />;
}
