import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Ürünler tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
export const PRODUCTS_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Ürün', width: 'minmax(120px,1fr)' },
  { key: 'variants', header: 'Varyant', width: '66px', align: 'center' },
  { key: 'langs', header: 'Diller', width: '88px', align: 'center' },
  { key: 'status', header: 'Durum', width: '80px', align: 'right' },
];
