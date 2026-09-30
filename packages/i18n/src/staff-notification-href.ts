import type { MeNotification } from '@lezzet/types';

/**
 * Personel satırının operasyon web'indeki yeri: zil satırı ve masaüstü tarayıcı bildirimi aynı yere açılır, bu yüzden gönderen sunucu
 * da okur. Hedef adresten okunur; hedef nesnesi ekranlaşmamış tür işin yapıldığı ekrana gider, hedefsiz satırda `null`.
 */
export function opsNotificationHref(row: Pick<MeNotification, 'kind' | 'targetType' | 'targetId' | 'payload'>): string | null {
  if (row.targetType === 'order' && row.targetId) return `/operations/orders/${row.targetId}`;
  if (row.targetType === 'ticket' && row.targetId) return `/operations/tickets?t=${row.targetId}`;
  if (row.kind === 'stock_low') return '/operations/procurement';
  if (row.kind === 'run_close_mismatch') return '/operations/deliveries';
  if (row.kind === 'b2b_application_received') return '/operations/customers';
  // Ölçü ürün kartında düzeltilir; ürünsüz eksik (kutu, adres) depo ekranındadır.
  if (row.kind === 'shipping_data_missing') {
    return typeof row.payload.productId === 'string' ? `/operations/products?productId=${row.payload.productId}` : '/operations/warehouses';
  }
  return null;
}
