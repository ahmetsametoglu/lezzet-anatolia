import type { ReactNode } from 'react';
import type { OpsTone } from './tone';
import { CONTROL_H } from './control';

/**
 * Operasyon çipi — Komponent Envanteri O3 (filtre & arama). Filtre/etiket öğesi (kategori süzgeci,
 * alerjen, koleksiyon).
 * `active` dolu olive; pasif çerçeveli olive; `tone='amber'` dikkat çipi; `dashed` ekleme çipi ("+ …").
 * Rozetten (Badge) farkı: çip tıklanabilir/seçilebilir bir kontrol, rozet salt gösterimdir.
 */
/**
 * Çipin taşıyabildiği anlam renkleri — `OpsTone`'un ALT KÜMESİ, ayrı bir sözlük değil.
 *
 * `Extract` ile türetilir: palete bir renk eklenir ya da adı değişirse burası ya kendiliğinden
 * doğru kalır ya da derlenmez. Elle yazılmış üç dizge, sessizce ayrışabilecek ikinci bir liste
 * demekti. Çip neden hepsini almıyor: bir SÜZGEÇTİR — "kapalı/nötr" ve "ölçüm" bir süzgeç değeri
 * değil, "onay/aday" ise durumun kendisi (rozetin işi).
 */
export type ChipTone = Extract<OpsTone, 'olive' | 'amber' | 'red'>;

interface ChipProps {
  active?: boolean;
  dashed?: boolean;
  tone?: ChipTone;
  /** `cell` — tablo hücresi ölçüsü (bkz. `SIZE`); varsayılan süzgeç şeridi ölçüsü. */
  size?: ChipSize;
  onClick?: () => void;
  /** Yazısı tek işaret olan çipin ("+") adı — ekran okuyucu okur, fareyle üstüne gelince görünür. */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

type ChipSize = 'sm' | 'cell';

/**
 * Çipin ölçüsü. `sm` süzgeç şeridinin ortak yüksekliği (`CONTROL_H.sm`). `cell` TABLO HÜCRESİ içindir
 * (13.09, Para defteri: tür · cari · etiket satırın ortasında): hücrede yaşayan kontrol satırın
 * yüksekliğine uyar — `StepButton`ın (26px) gerekçesi; bar ölçüsündeki bir çip defter satırını
 * şişirirdi. Bar öğelerinin yanında KULLANILMAZ, orada hizayı bozar. `min-w-0`: hücre dar, çip
 * daralabilmeli ve adını içeride kesmeli (`MultiSelect` hücre kipi) — yoksa uzun ad yanındakini dışarı iter.
 */
const SIZE: Record<ChipSize, string> = {
  sm: `gap-1.5 px-3 text-ops-sm ${CONTROL_H.sm}`,
  cell: 'h-6 min-w-0 max-w-full gap-1 px-2 text-ops-xs',
};

const TONE: Record<ChipTone, { active: string; idle: string }> = {
  olive: {
    active: 'bg-ops-olive text-ops-card border-ops-olive',
    idle: 'text-ops-olive border-ops-olive-line hover:bg-ops-olive-bg',
  },
  amber: {
    active: 'bg-ops-amber text-ops-card border-ops-amber',
    idle: 'text-ops-amber bg-ops-amber-bg border-ops-amber-line',
  },
  red: {
    active: 'bg-ops-red text-ops-card border-ops-red',
    idle: 'text-ops-red bg-ops-red-bg border-ops-red-line',
  },
};

export function Chip({ active = false, dashed = false, tone = 'olive', size = 'sm', onClick, ariaLabel, className, children }: ChipProps) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={[
        // Yükseklik ORTAK (`CONTROL_H.sm`): süzgeç şeridinde çip ile aranabilir seçici tetikleyicisi
        // (`trigger.ts` CHIP_BASE) yan yana duruyor — ikisi ayrı ölçüde olursa şerit kırık görünür.
        `inline-flex items-center rounded-ops-chip border font-ops-display font-semibold outline-none transition-colors ${SIZE[size]}`,
        onClick ? 'cursor-pointer' : 'cursor-default',
        dashed ? 'border-dashed border-ops-gray-500 font-ops-body font-medium text-ops-body' : active ? t.active : t.idle,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
