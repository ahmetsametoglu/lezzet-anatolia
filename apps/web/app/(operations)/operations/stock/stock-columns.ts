import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Stok tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
export const STOCK_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Boy', width: 'minmax(180px,1fr)' },
  { key: 'available', header: 'Kullanılabilir', width: '112px', align: 'right' },
  { key: 'reserved', header: 'Ayrılmış', width: '88px', align: 'right' },
  { key: 'physical', header: 'Fiili', width: '78px', align: 'right' },
  { key: 'nearest', header: 'En yakın', width: '142px', align: 'right' },
];
