import { useMemo } from 'react';

import { visibleNotifications } from '@/lib/operations/sections';
import { NOTIFICATION_FIXTURE, type OperationsNotification } from './notifications-fixture';
import { useOperationsSections } from './sections-context';

/*
  BİLDİRİM AKIŞI — kabuğun TEK bildirim kaynağı.

  İki tüketicisi var ve ikisi de AYNI listeyi görmek zorunda: bildirim ekranının satırları ve bölüm
  köklerindeki zil sayacı. Süzmeyi iki yerde ayrı ayrı yapmak, rozetin "3" deyip listenin iki satır
  göstermesine giden en kısa yoldu.

  BUGÜN FİXTURE, YARIN UÇ: gerçek akış (ve okundu işareti) push altyapısıyla gelir — o gün
  DEĞİŞECEK TEK YER burasıdır, iki ekran da olduğu gibi kalır.
  BEKLEYEN(21.13): fixture yerine gerçek bildirim akışı + okundu durumu.

  SÜZME KURALI BURADA HESAPLANMAZ, SORULUR: kural saf fonksiyonda (`lib/operations/sections.ts`)
  ve kendi birim testinde yaşıyor — hook yalnız kaynağı ona bağlar (CLAUDE §1: karar motorda).
*/
export function useOperationsNotifications(): OperationsNotification[] {
  const sections = useOperationsSections();
  return useMemo(() => visibleNotifications(NOTIFICATION_FIXTURE, sections), [sections]);
}
