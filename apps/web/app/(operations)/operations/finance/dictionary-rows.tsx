import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/operation/ui/button';

// Sözlük penceresinin SATIR parçaları (12.18) — görünüm ve yerinde düzenleme aynı ızgarayı paylaşır;
// gerekçe `dictionary-dialog.tsx` künyesinde ("SATIR FORMUN KENDİSİDİR").

/**
 * Görünümdeki metnin İÇERLEĞİ — `Input`/`Select` `sm`nin yazısıyla aynı x (1px çerçeve + `px-2`).
 * Satır düzenlemeye geçince metin yerinde kalır, yalnız kutunun çerçevesi belirir: "yerinde
 * düzenleme" hissi buradan doğuyor.
 */
const READ_INSET = 'px-[9px]';
/**
 * Satır ızgarası. Eylem sütunu SABİT (150px): görünümde bağlantılar, düzenlemede düğmeler aynı yeri
 * kaplar — genişliği içerikten gelseydi öteki sütunlar geçişte sağa sola kayardı.
 */
const TWO_COLUMNS = 'grid-cols-[minmax(0,1fr)_150px]';
/** Cari: ad/kelimeler · türü/varsayılan tür · eylemler. */
const THREE_COLUMNS = 'grid-cols-[minmax(0,1fr)_190px_150px]';

// ── Satır parçaları ────────────────────────────────────────────────────────────

interface TabBodyProps {
  /** Sekmenin tek satırlık açıklaması — eski kutunun paragrafı, listenin başında. */
  hint: string;
  error: string | null;
  children: ReactNode;
}

export function TabBody({ hint, error, children }: TabBodyProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-ops-body text-ops-xs text-ops-faint">{hint}</p>
      {error ? (
        <p role="alert" className="font-ops-body text-ops-xs text-ops-red">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

interface DictionaryListProps {
  children: ReactNode;
}

export function DictionaryList({ children }: DictionaryListProps) {
  return <ul className="flex flex-col divide-y divide-ops-line-soft overflow-hidden rounded-ops-card border border-ops-line">{children}</ul>;
}

/** Satırın hücreleri — görünüm ve düzenleme AYNI yerlere koyar (bkz. `RowCells`). */
interface RowCells {
  first: ReactNode;
  /** Üç sütunlu ızgarada ortadaki sütunun üst hücresi (cari: türü). */
  aside?: ReactNode;
  /** İkinci satır (tür: yön · kod; cari: eşleşme kelimeleri). */
  second?: ReactNode;
  /** Üç sütunlu ızgarada ortadaki sütunun alt hücresi (cari: varsayılan tür). */
  asideSecond?: ReactNode;
  actions: ReactNode;
}

interface RowGridProps {
  cells: RowCells;
  three: boolean;
}

/** Hücreleri ızgaraya AÇIK konumla yerleştirir — sıra, görünüm ile düzenleme arasında şaşmaz. */
function RowGrid({ cells, three }: RowGridProps) {
  return (
    <>
      <div className="col-start-1 row-start-1 min-w-0">{cells.first}</div>
      {three ? <div className="col-start-2 row-start-1 min-w-0">{cells.aside}</div> : null}
      <div className={`${three ? 'col-start-3' : 'col-start-2'} row-start-1 flex items-center justify-end gap-2`}>{cells.actions}</div>
      {cells.second ? <div className="col-start-1 row-start-2 min-w-0">{cells.second}</div> : null}
      {three && cells.asideSecond ? <div className="col-start-2 row-start-2 min-w-0">{cells.asideSecond}</div> : null}
    </>
  );
}

interface ViewRowProps extends RowCells {
  three?: boolean;
}

export function ViewRow({ three = false, ...cells }: ViewRowProps) {
  return (
    <li className={`grid items-center gap-x-3 gap-y-0.5 px-3 py-2 ${three ? THREE_COLUMNS : TWO_COLUMNS}`}>
      <RowGrid cells={cells} three={three} />
    </li>
  );
}

interface EditRowProps extends Omit<RowCells, 'actions'> {
  three?: boolean;
  isNew: boolean;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export function EditRow({ three = false, isNew, busy, disabled, error, onSubmit, onCancel, ...cells }: EditRowProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    // Açık bir seçici menüsü Esc'i kendisi için ister (kutunun `aria-expanded`ı) — önce o kapanır.
    if ((event.target as HTMLElement).getAttribute('aria-expanded') === 'true') return;
    // Esc önce DÜZENLEMEYİ bırakır ve bunu `preventDefault` ile SAHİPLENİR: pencere sahiplenilmiş Esc'i
    // yok sayar (`Dialog` künyesi) — ikinci Esc pencereyi kapatır. Kabarmayı kesmek yetmiyordu, pencere
    // de kapanıyordu (ölçüldü 14.09).
    event.preventDefault();
    onCancel();
  };

  return (
    <li className="bg-ops-olive-bg px-3 py-2.5">
      <form
        className={`grid items-center gap-x-3 gap-y-2 ${three ? THREE_COLUMNS : TWO_COLUMNS}`}
        onKeyDown={onKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <RowGrid
          three={three}
          cells={{
            ...cells,
            actions: (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
                  Vazgeç
                </Button>
                <Button type="submit" size="sm" disabled={disabled}>
                  {busy ? 'Kaydediliyor…' : isNew ? 'Ekle' : 'Kaydet'}
                </Button>
              </>
            ),
          }}
        />
        {error ? (
          <p role="alert" className={`col-span-full font-ops-body text-ops-xs text-ops-red ${READ_INSET}`}>
            {error}
          </p>
        ) : null}
      </form>
    </li>
  );
}

interface NewRowProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

/** Listenin başındaki "+ Yeni …" satırı — dokununca yerinde boş bir düzenleme satırı açılır. */
export function NewRow({ label, disabled, onClick }: NewRowProps) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex w-full cursor-pointer items-center px-3 py-2.5 text-left font-ops-body text-ops-sm font-semibold text-ops-olive-dark transition-colors hover:bg-ops-subtle disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={READ_INSET}>{label}</span>
      </button>
    </li>
  );
}

interface EmptyRowProps {
  text: string;
}

export function EmptyRow({ text }: EmptyRowProps) {
  return (
    <li className="px-3 py-2.5">
      <span className={`font-ops-body text-ops-xs text-ops-faint ${READ_INSET}`}>{text}</span>
    </li>
  );
}

interface ReadTextProps {
  active: boolean;
  /** Yan sütunun metni (cari: türü) — adın tonundan bir kademe sönük. */
  secondary?: boolean;
  children: ReactNode;
}

/** Görünümün ana satırındaki metin — kutunun yazısıyla aynı içerlek ve ölçüde (`READ_INSET`, `text-ops-sm`). */
export function ReadText({ active, secondary = false, children }: ReadTextProps) {
  const tone = !active ? 'text-ops-faint line-through' : secondary ? 'text-ops-body' : 'text-ops-ink';
  return <span className={`block truncate font-ops-body text-ops-sm ${READ_INSET} ${tone}`}>{children}</span>;
}

interface ReadDetailProps {
  children: ReactNode;
}

export function ReadDetail({ children }: ReadDetailProps) {
  return <span className={`block truncate font-ops-body text-ops-micro text-ops-faint ${READ_INSET}`}>{children}</span>;
}

interface RowActionsProps {
  active: boolean;
  busy: boolean;
  /** Başka bir yazım ya da düzenleme sürüyor — iki iş aynı anda gitmesin. */
  locked: boolean;
  /** Verilirse "Düzenle" görünür; satır yerinde düzenlemeye geçer. */
  onEdit?: () => void;
  onToggle: () => void;
}

export function RowActions({ active, busy, locked, onEdit, onToggle }: RowActionsProps) {
  const link =
    'cursor-pointer font-ops-body text-ops-xs text-ops-muted underline transition-colors hover:text-ops-ink disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <>
      {onEdit ? (
        <button type="button" disabled={locked} onClick={onEdit} className={link}>
          Düzenle
        </button>
      ) : null}
      <button type="button" disabled={locked} onClick={onToggle} className={link}>
        {busy ? '…' : active ? 'Pasifleştir' : 'Yeniden aç'}
      </button>
    </>
  );
}
