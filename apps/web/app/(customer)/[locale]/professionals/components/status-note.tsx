import type { B2bApplicationStatus } from '@lezzet/domain-core';
import type { Messages } from '../professionals-types';

/**
 * Başvurunun DURUM satırı — tasarımın "sonuç halleri (girişte görünür)" kutusu.
 *
 * Girişsiz ziyaretçide hiç çizilmez (`none`): olmayan bir başvurunun durumu yoktur ve boş bir
 * kutu, formun üstünde açıklanmamış bir alan bırakırdı.
 *
 * **İç ölçütler GÖRÜNMEZ** (tasarım §6): aday "inceleniyor" görür, faaliyet kodu uyumunu ya da
 * rota eşleşmesini değil. Onay kartının sinyalleri operasyona aittir.
 *
 * Tasarımın üçüncü hâli ("onaylanamadı") bugün çizilemiyor, çünkü veri onu söylemiyor —
 * `b2bStatusOf` künyesinde gerekçesi ve `BEKLEYEN(08.7)` işareti duruyor.
 */
interface StatusNoteProps {
  t: Messages;
  status: B2bApplicationStatus;
  compact?: boolean;
}

export function StatusNote({ t, status, compact = false }: StatusNoteProps) {
  if (status === 'none') return null;

  const approved = status === 'approved';
  return (
    <p
      className={[
        'rounded-soft font-sans font-semibold leading-relaxed',
        compact ? 'px-3.5 py-2.5 text-note' : 'px-4.5 py-3 text-body-sm',
        // Bekleyen hâl BAL, onaylanan ZEYTİN — ikisi de tasarımın tonu. Bekleyen için terracotta
        // (hata rengi) kullanmak, sırasını bekleyen bir başvuruyu arıza gibi gösterirdi.
        approved ? 'bg-olive-bg text-olive-dark' : 'bg-honey-bg text-honey',
      ].join(' ')}
    >
      {approved ? `✓ ${t.status.approved}` : `⏳ ${t.status.pending}`}
    </p>
  );
}
