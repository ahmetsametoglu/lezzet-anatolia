import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Müşteriler tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
export const CUSTOMERS_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Müşteri', width: 'minmax(120px,1fr)' },
  { key: 'type', header: 'Tip', width: '70px', align: 'center' },
  { key: 'status', header: 'Durum', width: '96px', align: 'right' },
];
