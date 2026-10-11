import type { ReactNode } from 'react';

/*
  Native `OptionRow`un web telefon ikizi; kapalı seçenek gizlenmez, çünkü listeden çıkarmak kapalı olmanın sebebini de görünmez yapardı.
  `onClick` verilmeyen satır düz kutudur, çünkü basılabilir görünüp iş yapmayan öğe yazılmaz.
*/

interface OptionRowProps {
  label: string;
  /** Başlığın yanındaki kısa vurgu ("En uygun fiyat"). */
  badge?: string;
  /** Alt satır — açıklama, ücret notu ya da kapalı yolun sebebi. */
  description?: string;
  /** Alt satırın altındaki ikinci satır, ör. adresin alıcısı ve telefonu. */
  detail?: string;
  selected: boolean;
  /** Seçim eylemi; verilmezse satır bilgi kutusudur (bkz. künye). */
  onClick?: () => void;
  disabled?: boolean;
  /** Alt satır kapalı yolun sebebini mi bildiriyor: sebep hata kırmızısıyla yazılır, çünkü soluk gri cümleyi müşteri fark etmiyor. */
  descriptionTone?: 'muted' | 'danger';
  /** Başlığın sağındaki öğe ("varsayılan" rozeti, taşıyıcı ücreti). */
  trailing?: ReactNode;
  /** Satırın ikinci eylemi (kayıtlı adresi düzenlemek): seçim düğmesinin dışında durur, çünkü düğme içine düğme konamaz. */
  action?: ReactNode;
  testId?: string;
}

export function OptionRow({
  label,
  badge,
  description,
  detail,
  selected,
  onClick,
  disabled = false,
  descriptionTone = 'muted',
  trailing,
  action,
  testId,
}: OptionRowProps) {
  const frame = [
    'rounded-control border-[1.5px]',
    selected ? 'border-ink bg-sand-150' : 'border-sand-400 bg-sand-250',
    // Native `soldOutOpacity` (0,45) — tükenen ürünün de soluklaşma ölçüsü.
    disabled ? 'opacity-45' : '',
  ].join(' ');
  const pressable = onClick !== undefined && !disabled;
  const surface = [
    'flex w-full flex-col gap-0.5 px-4 py-3 text-left',
    action === undefined ? frame : 'min-w-0 flex-1',
    pressable
      ? `cursor-pointer transition-[scale,border-color] active:scale-[0.98] ${action === undefined ? 'hover:border-ink' : ''}`
      : onClick !== undefined
        ? 'cursor-not-allowed'
        : '',
  ].join(' ');

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 font-sans text-control text-ink">
          {label}
          {badge !== undefined && (
            <>
              {' '}
              {/* Koyu zeytin, çünkü açık zeytin kendi zemininde okunma eşiğinin altında kalır. */}
              <span className="ml-0.5 inline-block rounded-pill bg-olive-bg px-2 py-0.5 align-[1px] font-sans text-badge-sm font-bold text-olive-dark">
                {badge}
              </span>
            </>
          )}
        </span>
        {trailing}
      </span>
      {/* Alt satırlar gövde renginde, çünkü soluk ton kart zemininde okunma eşiğinin altında kalır. */}
      {description !== undefined && (
        <span className={['font-sans text-body-sm leading-[1.6]', descriptionTone === 'danger' ? 'text-error' : 'text-body'].join(' ')}>
          {description}
        </span>
      )}
      {detail !== undefined && <span className="font-sans text-body-sm leading-[1.6] text-body">{detail}</span>}
    </>
  );

  const content =
    onClick === undefined ? (
      <div className={surface} data-testid={testId}>
        {body}
      </div>
    ) : (
      <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={surface} data-testid={testId}>
        {body}
      </button>
    );
  if (action === undefined) return content;
  // Çerçeve iki düğmeyi birlikte sarar; çerçeve yalnız seçim düğmesinin üstündeyken koyulaşır.
  return (
    <div className={`flex items-start ${frame} ${pressable ? 'has-[>button:first-child:hover]:border-ink' : ''}`}>
      {content}
      <div className="flex-none pt-3 pr-4">{action}</div>
    </div>
  );
}
