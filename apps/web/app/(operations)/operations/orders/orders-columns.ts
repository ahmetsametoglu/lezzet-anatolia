import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Siparişler tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
export const ORDERS_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'no', header: 'No', width: '104px' },
  { key: 'customer', header: 'Müşteri', width: 'minmax(160px,1fr)' },
  { key: 'total', header: 'Tutar', width: '84px', align: 'right' },
  { key: 'channel', header: 'Kanal', width: '54px' },
  { key: 'delivery', header: 'Teslim', width: 'minmax(110px,140px)' },
  { key: 'status', header: 'Durum', width: '116px' },
  { key: 'payment', header: 'Tahsilat', width: 'minmax(120px,150px)' },
];
