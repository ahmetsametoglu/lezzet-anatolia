import { ICON_PATHS, ICON_STROKE, type IconName } from '@lezzet/design-tokens/icons';

/**
 * Telefon görünümünün ikonu, native kitin `Icon`unun web ikizi: geometri ve çizgi durakları `@lezzet/design-tokens/icons`ta,
 * burada yalnız çizim. Renk `currentColor`, çünkü web'de ikon rengini yanındaki metin verir; ikon sessizdir, yanındaki metin konuşur.
 */

/** Sözlük girdisinin geniş şekli: sabit sözlüğün birleşiminde isteğe bağlı alanlar doğrudan okunabilsin. */
interface Geometry {
  paths: readonly string[];
  circles?: readonly (readonly [cx: number, cy: number, r: number])[];
  rects?: readonly (readonly [x: number, y: number, width: number, height: number, rx: number])[];
  viewBox?: string;
  large?: true;
}

/** Native'in varsayılan çizim kutusu — sözlükteki ikonların çoğu 24×24. */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/** `"0 0 24 19"` → `24/19`. Kare olmayan kutuda genişliği yükseklikten türetir. */
function viewBoxRatio(viewBox: string): number {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return width === undefined || height === undefined || height === 0 ? 1 : width / height;
}

interface MobileIconProps {
  name: IconName;
  /** Kenar (px) — kare olmayan ikonda YÜKSEKLİK. */
  size: number;
  /** Vurgulu durak: ikon bir eylemin kendisi (native `Icon`un `bold`u); boy kuralını ezer. */
  bold?: boolean;
  className?: string;
}

export function MobileIcon({ name, size, bold = false, className }: MobileIconProps) {
  const geometry: Geometry = ICON_PATHS[name];
  const viewBox = geometry.viewBox ?? DEFAULT_VIEW_BOX;
  const strokeWidth = bold ? ICON_STROKE.bold : geometry.large ? ICON_STROKE.large : ICON_STROKE.base;
  return (
    <svg
      width={size * viewBoxRatio(viewBox)}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['flex-none', className].filter(Boolean).join(' ')}
      aria-hidden
    >
      {geometry.paths.map((d) => <path key={d} d={d} />)}
      {geometry.circles?.map(([cx, cy, r]) => <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)}
      {geometry.rects?.map(([x, y, width, height, rx]) => (
        <rect key={`${x}-${y}-${width}-${height}`} x={x} y={y} width={width} height={height} rx={rx} />
      ))}
    </svg>
  );
}
