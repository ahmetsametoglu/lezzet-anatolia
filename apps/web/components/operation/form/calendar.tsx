'use client';

import { WEEKDAYS, monthGrid, monthLabel, shiftMonth, type CalendarCell } from './calendar-math';

/**
 * Ay ızgarası — tarih ve tarih-aralığı seçicilerinin ORTAK gövdesi (envanter O8).
 *
 * Tek başına kullanılmaz; `DateField`/`DateRangeField` onu bir açılır kutunun içinde gösterir.
 * İki kip aynı bileşende, çünkü ızgara, gezinme ve hücre biçimi aynı: fark yalnız hangi hücrenin
 * "seçili" sayıldığı. İki ayrı takvim yazmak, ay taşmasını ve hafta başlangıcını iki kez
 * çözmek olurdu.
 *
 * Hücre 42 sabittir (bkz. `monthGrid`): ay değişince kutu zıplamaz.
 */

interface CalendarProps {
  /** Görünen ay — dışarıdan yönetilir ki aralık kipinde iki ay yan yana durabilsin. */
  year: number;
  month: number;
  /** Tek gün seçimi (`YYYY-MM-DD`) — aralık kipinde kullanılmaz. */
  selected?: string | null;
  /** Aralık kipi: seçili aralığın uçları. */
  from?: string | null;
  to?: string | null;
  /** Fare aralığın ikinci ucunu ararken üzerinde gezinilen gün — ön izleme boyaması. */
  hovered?: string | null;
  onHover?: (day: string | null) => void;
  onPick: (day: string) => void;
  /** Gezinme okları — yalnız birinci ayda gösterilir (iki aylı görünümde tek kontrol seti). */
  onPrev?: () => void;
  onNext?: () => void;
  /** Bugünün günü — dışarıdan verilir (test edilebilirlik + tek "şimdi"). */
  today: string;
}

export function Calendar({ year, month, selected, from, to, hovered, onHover, onPick, onPrev, onNext, today }: CalendarProps) {
  const cells = monthGrid(year, month);
  // Aralık henüz kapanmadıysa fare nereye gelirse orası geçici ikinci uçtur.
  const end = to || (from && hovered && hovered > from ? hovered : null);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        {onPrev ? <NavButton dir="prev" onClick={onPrev} /> : <span className="w-5" />}
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">{monthLabel(year, month)}</span>
        {onNext ? <NavButton dir="next" onClick={onNext} /> : <span className="w-5" />}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-0.5 text-center font-ops-display text-ops-micro font-medium text-ops-faint">
            {d}
          </span>
        ))}
        {cells.map((cell) => (
          <DayCell
            key={cell.day}
            cell={cell}
            state={stateOf(cell.day, { selected, from, end })}
            isToday={cell.day === today}
            onPick={() => onPick(cell.day)}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}

type CellState = 'none' | 'single' | 'start' | 'middle' | 'end';

/** Hücrenin aralık içindeki yeri — uçlar yuvarlak, ortası düz (tasarım). */
function stateOf(day: string, ctx: { selected?: string | null; from?: string | null; end?: string | null }): CellState {
  if (ctx.selected) return day === ctx.selected ? 'single' : 'none';
  const { from, end } = ctx;
  if (!from) return 'none';
  if (!end) return day === from ? 'single' : 'none';
  if (day === from && day === end) return 'single';
  if (day === from) return 'start';
  if (day === end) return 'end';
  return day > from && day < end ? 'middle' : 'none';
}

const STATE_CLASS: Record<CellState, string> = {
  none: 'text-ops-body hover:bg-ops-line-soft rounded-[6px]',
  single: 'bg-ops-olive text-white rounded-[6px]',
  start: 'bg-ops-olive text-white rounded-l-[6px]',
  end: 'bg-ops-olive text-white rounded-r-[6px]',
  middle: 'bg-ops-olive-bg text-ops-olive-dark',
};

interface DayCellProps {
  cell: CalendarCell;
  state: CellState;
  isToday: boolean;
  onPick: () => void;
  onHover?: (day: string | null) => void;
}

function DayCell({ cell, state, isToday, onPick, onHover }: DayCellProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={onHover ? () => onHover(cell.day) : undefined}
      className={[
        'cursor-pointer py-[5px] text-center font-ops-mono text-ops-xs font-medium transition-colors',
        STATE_CLASS[state],
        // Komşu ayın günü seçilebilir ama SOLGUN: ayın sonundan başına geçmek tek tıklama olsun,
        // ama hangi ayda olduğunuz da görünsün.
        cell.outside && state === 'none' ? 'text-ops-faint' : '',
        // Bugün, seçili değilse çerçeveyle işaretlenir — "hangi gündeyiz" sorusu takvimde durur.
        isToday && state === 'none' ? 'ring-1 ring-inset ring-ops-line-strong' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {cell.label}
    </button>
  );
}

function NavButton({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Önceki ay' : 'Sonraki ay'}
      className="grid h-5 w-5 cursor-pointer place-items-center rounded-[5px] font-ops-display text-ops-base text-ops-faint transition-colors hover:bg-ops-line-soft hover:text-ops-body"
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

/** Açılışta gösterilecek ay: seçili gün varsa onun ayı, yoksa bugün. */
export function initialMonth(anchor: string | null | undefined, today: Date): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(anchor ?? '');
  if (match) return { year: Number(match[1]), month: Number(match[2]) - 1 };
  return { year: today.getFullYear(), month: today.getMonth() };
}

export { shiftMonth };
