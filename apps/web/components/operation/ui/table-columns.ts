import type { ReactNode } from 'react';

/**
 * Tablo KOLON ŞERİTLERİ — yerleşim sözleşmesi; hücre içeriği YOK.
 *
 * Ayrı ve bağımsız bir modül çünkü İKİ tüketeni var ve ikisi birbirini import ediyor: gerçek tablo
 * (`table.tsx`) ve yükleme iskeleti (`skeleton.tsx` → `SkeletonTable`). Tipler tablonun içinde
 * dururken `skeleton → table → skeleton` DÖNGÜSÜ oluştu (`no-circular` hatası). Yerleşim sözleşmesi
 * ikisinin de altında, ikisinden de bağımsız duruyor.
 *
 * Ölçünün tek kaynakta olması şart: bir tur iskeletler kolon genişliklerini ELLE yazmıştı ve beşin
 * dördü tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu (CLAUDE.md §1).
 */
export interface ColumnTrack {
  key: string;
  header: ReactNode;
  /** CSS grid track: '60px' | '1fr' | 'minmax(120px,1fr)' */
  width: string;
  align?: 'left' | 'center' | 'right';
}

/** Şerit + hücre içeriği. Yerleşim `ColumnTrack`ten gelir, burada yalnız "ne yazacağı" eklenir. */
export type Column<Row> = ColumnTrack & { cell: (row: Row) => ReactNode };

/** Şeritleri hücre üreticileriyle birleştirir — sıra ŞERİTLERDEN gelir, kayıt yalnız içerik taşır. */
export function withCells<Row>(
  tracks: readonly ColumnTrack[],
  cells: Record<string, (row: Row) => ReactNode>,
): Column<Row>[] {
  return tracks.map((t) => ({ ...t, cell: cells[t.key] ?? (() => null) }));
}

/** Şeritlerden grid şablonu — tablo başlığı, tablo satırı ve iskelet AYNI dizeyi kullanır. */
export function templateOf(tracks: readonly ColumnTrack[]): string {
  return tracks.map((t) => t.width).join(' ');
}

/** Hizalama sınıfları — tablo ve iskelet AYNI sözlüğü kullanır (birebir hizalanmalılar). */
export const COLUMN_SELF = {
  left: 'justify-self-start',
  center: 'justify-self-center',
  right: 'justify-self-end',
} as const;
