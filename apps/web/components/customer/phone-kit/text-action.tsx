import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  METİN EYLEMİ — native kitin `TextAction`ının (`packages/mobile-kit/src/components/ui/text-action.tsx`) web telefon
  ikizi: zemini olmayan eylem ("Değiştir", "kaldır", "← Alışverişe devam et"). Kontrol kademesi (`control`, 700); iki
  ton — zeytin (olumlu/nötr) · terracotta (dikkat; koyu paket kartında zeytin okunmuyor). Basılı geri bildirim
  OPAKLIK — native'in kendi çözümü: zeminsiz bir metnin küçülmesi titrek okunur.

  Dokunma alanı görünmez `after` katmanıyla 44'e tamamlanır. Dikey komşusu olan kullanımda pay yalnız AŞAĞI verilir
  (`edges="down"`, native `compactEdges`): sepet satırında "kaldır"ın hemen üstünde sayaç duruyor ve iki etek
  çakışınca "+"ya dokunmak satırı siliyordu (native 20.08).

  Eylem üç türlü, biri verilir: `onClick` (sayfadaki iş) · `href` (başka sayfaya — `<a>` olarak çizilir ki tarayıcı onu
  bağ olarak okusun) · `externalHref` (sitenin DIŞINA — kargo takibi; yeni sekmede açılır, `rel="noopener"` şart:
  `_blank` ile açılan sekme `window.opener` üzerinden bu sayfaya erişebilir).
*/

interface TextActionProps {
  /** Görünen metin — çeviri çağıranda çözülür. */
  label: string;
  onClick?: () => void;
  href?: ComponentProps<typeof Link>['href'];
  /** Sitenin dışındaki adres (taşıyıcının takip sayfası) — yeni sekmede açılır. */
  externalHref?: string;
  tone?: 'olive' | 'terracotta';
  /** Görünen metinden AYRI ekran okuyucu adı — "kaldır" tek başına hangi satırı söylemez. */
  ariaLabel?: string;
  edges?: 'all' | 'down';
}

const EDGES: Record<NonNullable<TextActionProps['edges']>, string> = {
  all: 'after:-inset-x-1 after:-inset-y-3',
  down: 'after:-inset-x-1 after:top-0 after:-bottom-6',
};

export function TextAction({ label, onClick, href, externalHref, tone = 'olive', ariaLabel, edges = 'all' }: TextActionProps) {
  const className = [
    "relative cursor-pointer font-sans text-control transition-opacity after:absolute after:content-[''] hover:opacity-70 active:opacity-50",
    EDGES[edges],
    tone === 'olive' ? 'text-olive' : 'text-terracotta',
  ].join(' ');
  if (externalHref !== undefined) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} className={className}>
        {label}
      </a>
    );
  }
  if (href !== undefined) {
    return (
      <Link href={href} aria-label={ariaLabel} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      {label}
    </button>
  );
}
