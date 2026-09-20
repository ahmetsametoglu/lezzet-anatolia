import type { ReactNode } from 'react';

/**
 * ETİKET DİZİSİ KUTUSU — çok değerli bir alanın TEK çerçevesi (tasarım kaydı: "Etiket dizisi").
 *
 * ── NEDEN TEK ÇERÇEVE ───────────────────────────────────────────────────────
 * Eklenmiş değerler çip, kalan boşluk yazma alanıdır. Bir tur çipler ile yazma kutusu ayrı ayrı
 * duruyordu ve kutu "bunlarla ilgisiz üçüncü bir alan" gibi okunuyordu; hangi listeye yazdığı
 * ancak denenince anlaşılıyordu.
 *
 * Odak halkası DIŞTA (`focus-within`): içerideki girdi `bare` çizilir, yoksa kutunun içinde ikinci
 * bir çerçeve belirirdi.
 *
 * **Ayrı bir "ekle" düğmesi YOK** ve olmamalı: Enter ekler, ✕ çıkarır. Düğme, kutunun içindeki
 * boşluğu yer ve satırı taşırırdı — üstelik iki farklı ekleme yolu iki farklı doğrulama anı demek.
 */
export function TagBox({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 rounded-md border border-ops-line-strong bg-ops-white px-2 py-1.5 transition-colors focus-within:border-ops-olive ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
