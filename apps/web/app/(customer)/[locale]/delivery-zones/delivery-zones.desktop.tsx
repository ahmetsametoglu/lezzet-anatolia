'use client';

import { DeliveryZonesMobile } from './delivery-zones.mobile';
import type { DeliveryZonesViewProps } from './delivery-zones-types';

/** BEKLEYEN(K.72): masaüstü tasarımı yok; sayfa bağlantısız açılırsa telefon düzeni dar sütunda çizilir. */
export function DeliveryZonesDesktop(props: DeliveryZonesViewProps) {
  return (
    <div className="mx-auto w-full max-w-120 py-10">
      <DeliveryZonesMobile {...props} />
    </div>
  );
}
