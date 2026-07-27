/**
 * K4 · Arama Alanı — site başlığındaki ürün araması. Bugün yalnız GİRİŞ NOKTASI: görünüm tam,
 * arama işlevi 08.3'te (katalog arama/filtre) bağlanacak. STUB(08.10 → 08.3)
 *
 * Masaüstünde sabit genişlikli hap, mobilde başlığın altında tam genişlik — aynı komponent, iki
 * yerleşim (`fullWidth`). İki yerde ayrı ayrı yazılmaz.
 */
interface SearchFieldProps {
  placeholder: string;
  fullWidth?: boolean;
}

export function SearchField({ placeholder, fullWidth = false }: SearchFieldProps) {
  return (
    <div
      className={[
        'flex cursor-pointer items-center gap-2 rounded-pill border border-sand-300 bg-card font-sans text-body-sm text-sand-600 transition-colors hover:border-olive-line',
        fullWidth ? 'w-full px-4 py-2.25' : 'w-[250px] px-4.5 py-2.25',
      ].join(' ')}
    >
      <span aria-hidden>🔍</span>
      {placeholder}
    </div>
  );
}
