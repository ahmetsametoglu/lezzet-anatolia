import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Fiyatlar tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
export const PRICES_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Varyant', width: 'minmax(180px,1.3fr)' },
  { key: 'b2c', header: 'B2C', width: '86px', align: 'right' },
  { key: 'b2b', header: 'B2B', width: '86px', align: 'right' },
  { key: 'cost', header: 'Maliyet', width: '84px', align: 'right' },
  { key: 'margin', header: 'Marj', width: '72px', align: 'right' },
  { key: 'auto', header: 'auto', width: '48px', align: 'center' },
];
