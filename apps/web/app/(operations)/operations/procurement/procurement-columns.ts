import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Siparişler tablosunun KOLON ŞERİTLERİ — gerçek tablo ve yükleme iskeleti aynı dizeyi okur
 * (09.2 dersi: elle yazılan iskelet ölçüsü dördün dördünde kaymıştı).
 *
 * Ölçüler `.dc`'nin kendi tablosundan: Tedarikçi 1fr · Kalem 66 · Tutar 84 · Kabul 104 ·
 * Tarih 84 · Durum 104.
 */
export const PROCUREMENT_ORDER_TRACKS: readonly ColumnTrack[] = [
  { key: 'supplier', header: 'Tedarikçi', width: 'minmax(120px,1fr)' },
  { key: 'items', header: 'Kalem', width: '66px', align: 'center' },
  { key: 'total', header: 'Tutar', width: '84px', align: 'right' },
  { key: 'received', header: 'Kabul', width: '104px' },
  { key: 'date', header: 'Tarih', width: '84px', align: 'center' },
  { key: 'status', header: 'Durum', width: '104px', align: 'right' },
];
