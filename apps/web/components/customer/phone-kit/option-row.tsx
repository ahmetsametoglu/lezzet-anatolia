import type { ReactNode } from 'react';

/*
  SEÇENEK SATIRI — native müşteri kitinin `OptionRow`unun (`apps/mobile/src/screens/customer-kit/option-row.tsx`) web
  telefon ikizi (14.09): başlık + alt satır; seçiliyken kum zemin (`sand-150`) ve mürekkep çerçeve, boştayken kart kumu
  (`sand-250`) ve kum çerçeve. Ödeme ekranının listeleri (teslimat yolu · ödeme yolu · kargo servisi) aynı satırı çizer.

  KAPALI SEÇENEK SOLDURULUR ama GİZLENMEZ (native'in kalıbı): kapalı yolun SEBEBİ alt satırda, hata kırmızısıyla
  (`descriptionTone="danger"`) — soluk gri bir cümleyi müşteri fark etmiyordu (native 10.08).

  Eylemsiz satır DÜĞME DEĞİLDİR: teslimat yolu adresin cevabıdır ve ona dokunmak bir şey değiştirmez (native'de dokunuş
  boş bir işleve bağlı). Web'de basılabilir görünen ama bir şey yapmayan öğe yazılmaz — `onClick` verilmezse satır düz
  kutu çizilir. Seçililik ekran okuyucuya `aria-pressed` ile gider; renk ve çerçeve farkı ulaşmaz. Native'in uzun
  basmayla düzenleme yolu (21.215) web'de yok: adres burada seçilmiyor, sepette seçiliyor (13.09).
*/

interface OptionRowProps {
  label: string;
  /** Alt satır — açıklama, ücret notu ya da kapalı yolun sebebi. */
  description?: string;
  selected: boolean;
  /** Seçim eylemi; verilmezse satır bilgi kutusudur (bkz. künye). */
  onClick?: () => void;
  disabled?: boolean;
  /** Alt satır bir SEBEP mi bildiriyor — kapalı yolda hata kırmızısı. */
  descriptionTone?: 'muted' | 'danger';
  /** Başlığın sağındaki öğe ("varsayılan" rozeti, taşıyıcı ücreti). */
  trailing?: ReactNode;
}

export function OptionRow({ label, description, selected, onClick, disabled = false, descriptionTone = 'muted', trailing }: OptionRowProps) {
  const className = [
    'flex w-full flex-col gap-0.5 rounded-control border-[1.5px] px-4 py-3 text-left',
    selected ? 'border-ink bg-sand-150' : 'border-sand-400 bg-sand-250',
    // Native `soldOutOpacity` (0,45) — tükenen ürünün de soluklaşma ölçüsü.
    disabled ? 'opacity-45' : '',
    onClick !== undefined && !disabled
      ? 'cursor-pointer transition-[scale,border-color] hover:border-ink active:scale-[0.98]'
      : onClick !== undefined
        ? 'cursor-not-allowed'
        : '',
  ].join(' ');

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 font-sans text-control text-ink">{label}</span>
        {trailing}
      </span>
      {description !== undefined && (
        <span className={['font-sans text-body-sm leading-[1.6]', descriptionTone === 'danger' ? 'text-error' : 'text-muted'].join(' ')}>
          {description}
        </span>
      )}
    </>
  );

  if (onClick === undefined) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={className}>
      {body}
    </button>
  );
}
