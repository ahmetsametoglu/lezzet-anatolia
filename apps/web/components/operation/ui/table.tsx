import type { ReactNode } from 'react';

/**
 * Operasyon veri tablosu — Komponent Envanteri O4. Ortak desen (Ürünler/Siparişler/Para/Fiyatlar/
 * Müşteriler…): büyük-harf Space Grotesk sütun başlığı (sabit), kaydırılır gövde, sağa hizalı
 * IBM Plex Mono tutarlar. Kolonlar `width` (CSS grid track) + `align` ile tanımlanır; hücre içeriği
 * `cell(row)` render eder. Salt gösterim — satır tıklama/seçim tüketici tarafından eklenir.
 * Sona-yaklaşınca yükleme (infinite scroll) `footer` slotuna spinner konarak bağlanır.
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
}

const SELF = { left: 'justify-self-start', center: 'justify-self-center', right: 'justify-self-end' } as const;

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
}: TableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const template = columns.map((c) => c.width).join(' ');
  const clickable = Boolean(onRowClick || onRowDoubleClick);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sütun başlığı (sabit) */}
      <div
        style={{ gridTemplateColumns: template }}
        className="grid gap-x-2.5 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-[10.5px] font-medium uppercase tracking-[0.06em] text-ops-muted"
      >
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
        {rows.map((row) => {
          const active = isRowActive?.(row) ?? false;
          return (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              style={{ gridTemplateColumns: template }}
              className={[
                'grid items-center gap-x-2.5 border-b border-ops-line-soft px-5 py-3 last:border-b-0',
                active ? 'bg-ops-olive-bg' : clickable ? 'hover:bg-ops-subtle' : '',
                clickable ? 'cursor-pointer' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {columns.map((c) => (
                <div key={c.key} className={c.align && c.align !== 'left' ? SELF[c.align] : 'min-w-0'}>
                  {c.cell(row)}
                </div>
              ))}
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}
