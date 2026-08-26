import type { MeNotification } from '@lezzet/types';

/*
  DOKUNUNCA NEREYE (14.15) — hedef adresten, İÇERİKTEN DEĞİL. Mobilin `notificationHref`
  kararlarının web rotalarına çevirisi; eşleme yüzeyde kalır çünkü rota sözleşmeleri farklı:
  webin sipariş sayfası KİMLİK ister (`/orders/[reference]` param'ı `order.id` taşır — sipariş
  listesi/onay sayfası emsali), mobil rota REFERANS ister. Gidilecek yeri olmayan satır (davet:
  jetonu payload'da yok — bilinçli, jeton kimlik yerine geçer) `null` döner ve tık yalnız okundu
  işaretler.
*/

/** next-intl `Link`in beklediği şekiller — param'lı rota nesne, düz rota dize. */
type NotificationTarget =
  | { pathname: '/orders/[reference]'; params: { reference: string } }
  | { pathname: '/support/[ticket]'; params: { ticket: string } }
  | '/catalog'
  | '/account'
  | null;

export function notificationTarget(row: Pick<MeNotification, 'kind' | 'targetType' | 'targetId'>): NotificationTarget {
  if (row.targetType === 'order' && row.targetId) {
    return { pathname: '/orders/[reference]', params: { reference: row.targetId } };
  }
  if (row.targetType === 'ticket' && row.targetId) {
    return { pathname: '/support/[ticket]', params: { ticket: row.targetId } };
  }
  if (row.kind === 'zone_available') return '/catalog';
  if (row.kind === 'b2b_application_result') return '/account';
  return null;
}
