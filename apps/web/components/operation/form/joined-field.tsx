import type { ReactNode } from 'react';

/**
 * BİRLEŞİK KUTU — sayı ile onu okunur kılan şey aynı çerçevede (tasarım kaydı: "Birleşik girdi").
 *
 * ── NEDEN TEK ÇERÇEVE ───────────────────────────────────────────────────────
 * "500" tek başına hiçbir şey demez; birimi ya da türü yanındadır. İkisi ayrı kutulara
 * bölündüğünde satır parçalanıyor, hangi sayının neye ait olduğu kayboluyordu — varyant satırında
 * beş kutu yan yana dizilince ölçüldü.
 *
 * Çerçeve ve odak halkası DIŞTA (`focus-within`): içerideki girdi ve seçici `bare` hâlde çiziliyor,
 * yoksa kutunun içinde ikinci bir çerçeve görünürdü.
 */
export function JoinedField({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-md border border-ops-line-strong bg-ops-white transition-colors focus-within:border-ops-olive ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

/**
 * Kutunun SAĞINDAKİ sabit ek — birim seçilmiyorsa yazılmaz da (brüt ağırlığın "g"si).
 *
 * Seçiciden farkı tıklanabilir olmaması: seçilecek bir şey yoksa seçici çizmek, operatöre olmayan
 * bir karar vaat etmek olurdu.
 */
export function JoinedSuffix({ children }: { children: ReactNode }) {
  return <span className="flex flex-none items-center pr-[11px] font-ops-body text-ops-xs text-ops-faint">{children}</span>;
}

/**
 * Kutunun içindeki AYRAÇ — üç ölçüyü birbirinden ayıran "×".
 *
 * Ayraç metindir, kenarlık değil: kenarlık çizilseydi tek bir ölçü üç ayrı kutu gibi okunurdu ve
 * kutunun bütün gerekçesi (üçü BİR ölçüdür) düşerdi.
 */
export function JoinedSeparator() {
  return (
    <span aria-hidden className="flex flex-none items-center font-ops-body text-ops-sm text-ops-faint">
      ×
    </span>
  );
}
