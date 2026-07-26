import type { ReactNode } from 'react';
import { SortableList } from './sortable-list';

/**
 * Operasyon veri tablosu — Komponent Envanteri O4. Ortak desen (Ürünler/Kategoriler/Siparişler/Para/
 * Fiyatlar/Müşteriler…): büyük-harf Space Grotesk sütun başlığı (sabit), kaydırılır gövde, sağa hizalı
 * IBM Plex Mono tutarlar. Kolonlar `width` (CSS grid track) + `align` ile tanımlanır; hücre içeriği
 * `cell(row)` render eder. Salt gösterim — satır tıklama/seçim tüketici tarafından eklenir.
 * Sona-yaklaşınca yükleme (infinite scroll) `footer` slotuna spinner konarak bağlanır.
 * `onReorder` verilirse satırlar sürükle-bırakla sıralanır (opt-in yetenek; dnd tek kaynak = SortableList).
 */
export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** CSS grid track: '60px' | '1fr' | 'minmax(120px,1fr)' */
  width: string;
  align?: 'left' | 'center' | 'right';
  cell: (row: Row) => ReactNode;
}

interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Satır yokken gösterilir (O7 boş durum). */
  empty?: ReactNode;
  /** Gövde sonuna eklenir — infinite scroll "yükleniyor" satırı vb. */
  footer?: ReactNode;
  /** Satır seçimi/tıklaması — verilirse satır tıklanabilir olur. */
  onRowClick?: (row: Row) => void;
  onRowDoubleClick?: (row: Row) => void;
  /** Seçili satır vurgusu (olive zemin). */
  isRowActive?: (row: Row) => boolean;
  /** Gövde kaydırma olayı — infinite scroll için. */
  onScroll?: (e: UIEvent) => void;
  /** Verilirse satırlar sürükle-bırakla sıralanır (baştaki tutamaktan); yeni id sırası (0..n-1). */
  onReorder?: (orderedIds: string[]) => void;
}

const SELF = { left: 'justify-self-start', center: 'justify-self-center', right: 'justify-self-end' } as const;

// Sıralama modunda satır başına eklenen tutamak kolonunun genişliği.
const HANDLE_TRACK = '22px';

export function Table<Row>({
  columns,
  rows,
  rowKey,
  empty,
  footer,
  onRowClick,
  onRowDoubleClick,
  isRowActive,
  onScroll,
  onReorder,
}: TableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const sortable = Boolean(onReorder);
  const template = (sortable ? `${HANDLE_TRACK} ` : '') + columns.map((c) => c.width).join(' ');
  const clickable = Boolean(onRowClick || onRowDoubleClick);

  // Tek satır — sıralama modunda `handle` başa eklenir (SortableList sağlar). Hover/aktif/tıklama
  // her iki modda aynı; böylece elle satır yazılmaz, tüm sekmeler bu tabloyu paylaşır.
  const renderRow = (row: Row, handle?: ReactNode) => {
    const active = isRowActive?.(row) ?? false;
    return (
      <div
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
        style={{ gridTemplateColumns: template }}
        className={[
          'grid items-center gap-x-2.5 border-b border-ops-line-soft px-5 py-3',
          // Düz modda son satırın ayracı gizlenir; sıralama modunda her satır sarmalayıcının tek
          // çocuğu olduğundan `last:` gizlemesi tüm ayraçları silerdi — o yüzden yalnız düz modda.
          sortable ? '' : 'last:border-b-0',
          active ? 'bg-ops-olive-bg' : clickable ? 'hover:bg-ops-subtle' : '',
          clickable ? 'cursor-pointer' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {handle ? <div className="justify-self-center">{handle}</div> : null}
        {columns.map((c) => (
          <div key={c.key} className={c.align && c.align !== 'left' ? SELF[c.align] : 'min-w-0'}>
            {c.cell(row)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sütun başlığı (sabit) */}
      <div
        style={{ gridTemplateColumns: template }}
        className="grid gap-x-2.5 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-[10.5px] font-medium uppercase tracking-[0.06em] text-ops-muted"
      >
        {sortable ? <span aria-hidden /> : null}
        {columns.map((c) => (
          <span key={c.key} className={SELF[c.align ?? 'left']}>
            {c.header}
          </span>
        ))}
      </div>

      {/* Gövde (kaydırılır) */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={onScroll ? (e) => onScroll(e.nativeEvent) : undefined}
      >
        {sortable && onReorder ? (
          <SortableList items={rows} getId={rowKey} onReorder={onReorder} renderItem={(row, handle) => renderRow(row, handle)} />
        ) : (
          rows.map((row) => <div key={rowKey(row)}>{renderRow(row)}</div>)
        )}
        {footer}
      </div>
    </div>
  );
}
