'use client';

import { useRouter } from 'next/navigation';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import type { DeliveryTab } from './deliveries-url';

/**
 * Sayfanın iki yüzü arasındaki geçiş (tasarım: tek sayfa, iki sekme).
 *
 * **Tek bileşen, iki ekran.** Çubuğu her ekrana elden yazmak, bir gün etiketlerin ya da sıranın
 * ayrışması demekti — sekme çubuğu bir gezinme sözleşmesidir, süs değil.
 *
 * Sekme ADRESE yazılır: "rotalar" bağlantısı paylaşılabilmeli ve Depolar'dan gelen köprü doğrudan
 * oraya düşebilmeli.
 */
export function DeliveryTabs({ value }: { value: DeliveryTab }) {
  const router = useRouter();
  return (
    <UnderlineTabs
      value={value}
      items={[
        { key: 'plan', label: 'Gün planı' },
        { key: 'routes', label: 'Rotalar' },
      ]}
      onChange={(key) => router.push(`/operations/deliveries${key === 'routes' ? '?tab=routes' : ''}`)}
    />
  );
}
