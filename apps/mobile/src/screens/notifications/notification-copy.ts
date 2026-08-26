import type { NotificationRow } from '@/lib/api/notifications';

/*
  BİLDİRİM CÜMLESİ EKRANDA KURULUR (14.12 kararı) — satır metin taşımaz: `kind` bir ANAHTAR,
  `payload` dil-bağımsız küçük veri (referenceNo, postalCode).

  SÖZLÜĞÜN KENDİSİ ARTIK `@lezzet/i18n`DE (14.15): web hesap akışı aynı müşteriye aynı satırı
  gösteriyor ve 11 tür × 3 dilin iki kopyası ilk düzeltmede ayrışırdı (CLAUDE §1) — cümleler tek
  kaynağa terfi etti, buradan yalnız yeniden yayılıyor ki ekranlar import yolunu değiştirmesin.
  YÜZEYE ÖZGÜ olan hedef eşlemesidir (aşağıda): mobil rota sözleşmesi webinkinden farklı.
*/
export { notificationSentence } from '@lezzet/i18n';

/**
 * Dokununca NEREYE — hedef adresten, İÇERİKTEN DEĞİL: sipariş rotası REFERANS ister (rota
 * künyesi) ve referans payload'da; talep rotası kimlik ister ve o `targetId`da. Gidilecek yeri
 * olmayan satır (davet: jetonu payload'da yok — bilinçli, jeton kimlik yerine geçer) `null` döner
 * ve dokunuş yalnız okundu işaretler.
 */
export function notificationHref(row: Pick<NotificationRow, 'kind' | 'targetType' | 'targetId' | 'payload'>): string | null {
  if (row.targetType === 'order' && typeof row.payload.referenceNo === 'string' && row.payload.referenceNo !== '—') {
    return `/order/${row.payload.referenceNo}`;
  }
  if (row.targetType === 'ticket' && row.targetId) return `/support/${row.targetId}`;
  if (row.kind === 'zone_available') return '/catalog';
  if (row.kind === 'b2b_application_result') return '/account';
  return null;
}
